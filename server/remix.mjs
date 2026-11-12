import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runProcess } from "./ark.mjs";
import {
  createReviewState,
  formatTimecode,
  framesToSeconds,
  secondsToFrames,
  splitSubtitleText
} from "../src/production-model.mjs";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

export const REPLACEMENT_TARGETS = [
  "left",
  "right",
  "person-1",
  "person-2",
  "person-3",
  "person-4"
];

export function buildFrameExtractionPlan(duration, fps = 24) {
  const totalFrames = secondsToFrames(duration, fps);
  const seconds = Array.from({ length: Math.ceil(totalFrames / fps) }, (_, index) => {
    const startFrame = index * fps;
    const endFrame = Math.min(totalFrames, startFrame + fps);
    return {
      second: index + 1,
      startFrame,
      endFrame,
      count: Math.max(0, endFrame - startFrame),
      startTime: framesToSeconds(startFrame, fps),
      endTime: framesToSeconds(endFrame, fps)
    };
  });
  return {
    fps,
    duration: framesToSeconds(totalFrames, fps),
    totalFrames,
    durationTimecode: formatTimecode(totalFrames, fps),
    seconds
  };
}

export function normalizeReplacementTargets(targets = {}) {
  const groom = String(targets.groom || "").trim();
  const bride = String(targets.bride || "").trim();
  if (!REPLACEMENT_TARGETS.includes(groom)) throw new Error("男主角替换目标无效");
  if (!REPLACEMENT_TARGETS.includes(bride)) throw new Error("女主角替换目标无效");
  if (groom === bride) throw new Error("男女主角的替换目标不能相同");
  return { groom, bride };
}

export function resolveRemixRange(template, project = {}) {
  const duration = Math.max(0.5, Number(template?.duration || 0));
  const requestedStart = Number(project.remixRange?.start);
  const requestedEnd = Number(project.remixRange?.end);
  const start = Math.max(
    0,
    Math.min(
      duration - 0.5,
      Number.isFinite(requestedStart) ? requestedStart : Math.max(0, duration - 40)
    )
  );
  const end = Math.max(
    start + 0.5,
    Math.min(
      duration,
      Number.isFinite(requestedEnd) ? requestedEnd : Math.min(duration, start + 40)
    )
  );
  return { start, end, duration: Number(Math.min(40, end - start).toFixed(3)) };
}

function parseSrtTimestamp(value) {
  const match = String(value).match(
    /^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/
  );
  if (!match) return null;
  return (
    Number(match[1]) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number(match[4]) / 1000
  );
}

function formatSrtTimestamp(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor(ms / 60000) % 60).padStart(2, "0");
  const s = String(Math.floor(ms / 1000) % 60).padStart(2, "0");
  return `${h}:${m}:${s},${String(ms % 1000).padStart(3, "0")}`;
}

export function sliceSrt(srtText, rangeStart, rangeEnd) {
  const startOffset = Math.max(0, Number(rangeStart) || 0);
  const endOffset = Math.max(startOffset, Number(rangeEnd) || startOffset);
  const blocks = String(srtText || "")
    .split(/\r?\n\r?\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const timeIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeIndex < 0) continue;
    const [startText, endText] = lines[timeIndex].split("-->").map((part) => part.trim());
    const start = parseSrtTimestamp(startText);
    const end = parseSrtTimestamp(endText);
    if (start == null || end == null || end <= startOffset || start >= endOffset) continue;
    const slicedStart = Math.max(0, start - startOffset);
    const slicedEnd = Math.min(endOffset - startOffset, end - startOffset);
    if (slicedEnd <= slicedStart) continue;
    cues.push({
      start: slicedStart,
      end: slicedEnd,
      text: lines.slice(timeIndex + 1).join("\n").trim()
    });
  }
  return cues
    .map(
      (cue, index) =>
        `${index + 1}\n${formatSrtTimestamp(cue.start)} --> ${formatSrtTimestamp(cue.end)}\n${cue.text}\n`
    )
    .join("\n");
}

export function transcriptToSrt(transcript, maxChars = 18) {
  const cues = [];
  for (const item of Array.isArray(transcript) ? transcript : []) {
    const start = Number(item.start);
    const end = Number(item.end);
    const text = String(item.text || "").trim();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) {
      continue;
    }
    const pieces = splitSubtitleText(text, maxChars);
    const pieceDuration = (end - start) / Math.max(1, pieces.length);
    pieces.forEach((piece, index) => {
      cues.push({
        start: start + pieceDuration * index,
        end: start + pieceDuration * (index + 1),
        text: piece
      });
    });
  }
  return cues
    .map(
      (cue, index) =>
        `${index + 1}\n${formatSrtTimestamp(cue.start)} --> ${formatSrtTimestamp(cue.end)}\n${cue.text}\n`
    )
    .join("\n");
}

export function buildRemixShotPlan(template, project = {}, maxShots = 8) {
  const targets = normalizeReplacementTargets(
    project.targets || project.remixTargets || {}
  );
  const templateShots = Array.isArray(template?.recipe?.shots)
    ? template.recipe.shots
    : [];
  const range = resolveRemixRange(template, project);
  const rangeEnd = range.start + range.duration;
  const included = templateShots.filter(
    (shot) => Number(shot.end || 0) > range.start && Number(shot.start || 0) < rangeEnd
  );
  const sourceShots = included.length
    ? included
    : [{ index: 1, start: range.start, end: rangeEnd, duration: range.duration }];
  const shotCount = Math.min(
    sourceShots.length,
    Math.max(1, Number(maxShots) || 8)
  );
  return Array.from({ length: shotCount }, (_, index) => {
    const startIndex = Math.floor((index * sourceShots.length) / shotCount);
    const nextStartIndex = Math.floor(
      ((index + 1) * sourceShots.length) / shotCount
    );
    const endIndex =
      index === shotCount - 1
        ? sourceShots.length - 1
        : Math.max(startIndex, nextStartIndex - 1);
    const first = sourceShots[startIndex];
    const last = sourceShots[endIndex];
    const start = index === 0 ? range.start : Number(first.start || range.start);
    const end = index === shotCount - 1 ? rangeEnd : Number(last.end || rangeEnd);
    const duration = Math.max(0.5, Number(end - start || 4));
    const frames = secondsToFrames(duration, 24);
    return {
      id: `remix-shot-${String(index + 1).padStart(3, "0")}`,
      order: index + 1,
      number: index + 1,
      title: `模板镜头 ${String(index + 1).padStart(3, "0")}`,
      start,
      end,
      duration,
      frames,
      source: {
        mode: "template",
        templateId: template.id,
        templateShotId: `template-shot-${template.id}-${index + 1}`,
        templateShotIndex: startIndex + 1,
        templateShotEndIndex: endIndex + 1,
        referenceStart: start,
        referenceEnd: end,
        mapping: "direct"
      },
      characters: {
        groom: {
          target: targets.groom,
          referenceAssetId: project.photoAssetIds?.groom || ""
        },
        bride: {
          target: targets.bride,
          referenceAssetId: project.photoAssetIds?.bride || ""
        }
      },
      prompt: String(first.action || first.prompt || ""),
      promptVersion: {
        version: 1,
        hash: "",
        text: String(first.action || first.prompt || "")
      },
      assets: { firstFrame: null, video: null, finalClip: null },
      review: createReviewState(),
      status: "draft"
    };
  });
}

export async function extractRemixFrames({
  videoPath,
  outputDir,
  fps = 24,
  onProgress = () => {}
}) {
  const framesDir = join(outputDir, "frames");
  await mkdir(framesDir, { recursive: true });
  onProgress(10, "提取 24 FPS 全帧");
  await runProcess(FFMPEG, [
    "-y",
    "-i",
    videoPath,
    "-vf",
    `fps=${fps}`,
    "-q:v",
    "2",
    join(framesDir, "frame-%06d.jpg")
  ]);
  const frames = (await readdir(framesDir))
    .filter((name) => /^frame-\d+\.jpg$/.test(name))
    .sort();
  onProgress(55, `已提取 ${frames.length} 帧`);
  const audioPath = join(outputDir, "original-audio.wav");
  await runProcess(FFMPEG, [
    "-y",
    "-i",
    videoPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    audioPath
  ]);
  onProgress(85, "提取原音频");
  const index = {
    fps,
    totalFrames: frames.length,
    frames: frames.map((name, frameIndex) => ({
      frameIndex,
      time: framesToSeconds(frameIndex, fps),
      file: `frames/${name}`
    })),
    audio: "original-audio.wav"
  };
  await writeFile(join(outputDir, "frame-index.json"), JSON.stringify(index, null, 2));
  onProgress(100, "帧索引完成");
  return {
    framesDir,
    frames,
    audioPath,
    indexPath: join(outputDir, "frame-index.json"),
    totalFrames: frames.length
  };
}
