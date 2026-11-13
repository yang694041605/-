import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { runProcess } from "./ark.mjs";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

export async function probeMedia(filePath) {
  const result = await runProcess(FFPROBE, [
    "-v",
    "error",
    "-show_entries",
    "format=duration,size,bit_rate",
    "-show_entries",
    "stream=index,codec_name,codec_type,width,height,r_frame_rate,avg_frame_rate,nb_frames,sample_rate,channels",
    "-of",
    "json",
    filePath
  ]);
  const data = JSON.parse(result.stdout);
  const video = data.streams?.find((stream) => stream.codec_type === "video") || null;
  const audio = data.streams?.find((stream) => stream.codec_type === "audio") || null;
  return {
    duration: Number(data.format?.duration || 0),
    size: Number(data.format?.size || 0),
    bitRate: Number(data.format?.bit_rate || 0),
    video,
    audio,
    streams: data.streams || []
  };
}

export async function extractCover(videoPath, coverPath) {
  await runProcess(FFMPEG, [
    "-y",
    "-ss",
    "0.5",
    "-i",
    videoPath,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    coverPath
  ]);
  return coverPath;
}

export async function extractVideoSegment(videoPath, outputPath, start = 0, duration = 5) {
  await runProcess(FFMPEG, [
    "-y",
    "-ss",
    String(Math.max(0, Number(start) || 0)),
    "-i",
    videoPath,
    "-t",
    String(Math.max(1, Number(duration) || 5)),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    outputPath
  ]);
  return outputPath;
}

export async function extractContactSheets(videoPath, outputDir) {
  await mkdir(outputDir, { recursive: true });
  const pattern = join(outputDir, "contact-%02d.jpg");
  await runProcess(FFMPEG, [
    "-y",
    "-i",
    videoPath,
    "-vf",
    "fps=1/5,scale=480:-1,tile=4x4",
    "-q:v",
    "4",
    pattern
  ]);
  const files = (await readdir(outputDir))
    .filter((name) => /^contact-\d+\.jpg$/.test(name))
    .sort();
  return files.map((name) => join(outputDir, name));
}

export async function detectSceneCuts(videoPath, threshold = 0.32) {
  const result = await runProcess(FFMPEG, [
    "-hide_banner",
    "-i",
    videoPath,
    "-filter:v",
    `select='gt(scene,${threshold})',showinfo`,
    "-f",
    "null",
    "-"
  ]);
  const times = [...result.stderr.matchAll(/pts_time:([0-9.]+)/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  return [...new Set(times)].sort((a, b) => a - b);
}

export function sceneCutsToShots(cuts, duration) {
  const boundaries = [0, ...cuts.filter((time) => time > 0.25 && time < duration - 0.25), duration];
  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1];
    return {
      index: index + 1,
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
      duration: Number((end - start).toFixed(3)),
      framesAt24fps: Math.round((end - start) * 24),
      framing: "",
      action: "",
      camera: "",
      transition: index === 0 ? "开场" : "硬切"
    };
  });
}

export async function transcribeWithWhisper(videoPath, outDir) {
  const script =
    process.env.VIDEO_ANALYZER_SCRIPT ||
    "C:\\Users\\dell\\.codex\\skills\\video-copy-extractor\\scripts\\analyze_video.py";
  const python = process.env.PYTHON_PATH || "python";
  const result = await runProcess(
    python,
    [script, "--video", videoPath, "--out", outDir, "--no-ocr"],
    { cwd: outDir }
  );
  const analysis = JSON.parse(await readFile(join(outDir, "analysis.json"), "utf8"));
  return {
    transcript: analysis.transcript || [],
    captions: [],
    log: result.stderr || ""
  };
}

export async function renderTimeline({
  clips,
  outputPath,
  width = 1280,
  height = 720,
  fps = 24,
  musicPath = "",
  musicStart = 0,
  voicePath = "",
  subtitlePath = "",
  subtitleStyle = {},
  safeFill = true
}) {
  if (!Array.isArray(clips) || clips.length === 0) {
    throw new Error("没有可剪辑的视频片段");
  }
  const workDir = await mkdtemp(join(tmpdir(), "xying-render-"));
  try {
    const normalized = [];
    for (let index = 0; index < clips.length; index += 1) {
      const clip = clips[index];
      const target = join(workDir, `clip-${String(index).padStart(3, "0")}.mp4`);
      const isImage = [".jpg", ".jpeg", ".png", ".webp"].includes(
        extname(clip.path).toLowerCase()
      );
      const args = isImage
        ? ["-y", "-loop", "1", "-i", clip.path, "-t", String(clip.duration || 4)]
        : ["-y", "-ss", String(clip.start || 0), "-i", clip.path];
      if (!isImage && clip.duration) args.push("-t", String(clip.duration));
      args.push(
        "-vf",
        buildSafeFillFilter(width, height, fps, safeFill),
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        target
      );
      await runProcess(FFMPEG, args);
      normalized.push(target);
    }

    const concatFile = join(workDir, "concat.txt");
    await writeFile(
      concatFile,
      normalized.map((path) => `file '${path.replaceAll("'", "'\\''")}'`).join("\n"),
      "utf8"
    );
    const silentPath = join(workDir, "picture.mp4");
    await runProcess(FFMPEG, [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatFile,
      "-c",
      "copy",
      silentPath
    ]);

    const audioInputs = [];
    const expectedFrames = clips.reduce(
      (sum, clip) => sum + Math.max(1, Math.round(Number(clip.duration || 0) * fps)),
      0
    );
    const targetDuration = (expectedFrames / fps).toFixed(6);
    if (musicPath) {
      audioInputs.push({
        path: musicPath,
        loop: true,
        volume: 0.38,
        start: Math.max(0, Number(musicStart) || 0)
      });
    }
    if (voicePath) audioInputs.push({ path: voicePath, loop: false, volume: 1 });

    const args = ["-y", "-i", silentPath];
    if (subtitlePath) args.push("-i", subtitlePath);
    for (const audio of audioInputs) {
      if (audio.loop) args.push("-stream_loop", "-1");
      if (audio.start) args.push("-ss", String(audio.start));
      args.push("-i", audio.path);
    }

    if (audioInputs.length > 0) {
      const audioStartIndex = subtitlePath ? 2 : 1;
      const filter = buildAudioMixFilter({
        audioInputs,
        audioStartIndex,
        pictureDuration: targetDuration
      });
      args.push(
        "-filter_complex",
        filter,
        "-map",
        "0:v:0",
        "-map",
        "[aout]"
      );
    } else {
      args.push("-map", "0:v:0", "-an");
    }
    args.push("-frames:v", String(expectedFrames), "-t", targetDuration);

    if (subtitlePath) {
      const escaped = subtitlePath.replaceAll("\\", "/").replaceAll(":", "\\:");
      const style = normalizeSubtitleStyle(subtitleStyle);
      const videoFilter = `subtitles='${escaped}':force_style='FontName=${style.font},FontSize=${style.fontSize},PrimaryColour=${toAssColor(style.color)},OutlineColour=${toAssColor(style.outlineColor)},BorderStyle=1,Outline=${style.outline},Shadow=0,MarginV=${style.margin},Alignment=2'`;
      const currentMapIndex = args.indexOf("0:v:0");
      if (currentMapIndex >= 0) {
        args.splice(currentMapIndex, 2);
      }
      args.push("-vf", videoFilter, "-map", "0:v:0");
      args.push(
        "-map",
        "1:s:0",
        "-c:s",
        "mov_text",
        "-metadata:s:s:0",
        "language=chi"
      );
    }
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-colorspace",
      "bt709",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-movflags",
      "+faststart",
      outputPath
    );
    await runProcess(FFMPEG, args);
    return await probeMedia(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export function normalizeSubtitleStyle(style = {}) {
  return {
    font: String(style.font || "Microsoft YaHei").replaceAll("'", ""),
    fontSize: Math.max(16, Math.min(72, Number(style.fontSize) || 24)),
    color: /^#[0-9a-f]{6}$/i.test(style.color || "") ? style.color : "#FFFFFF",
    outlineColor: /^#[0-9a-f]{6}$/i.test(style.outlineColor || "")
      ? style.outlineColor
      : "#101010",
    outline: Math.max(0, Math.min(8, Number(style.outline ?? 2))),
    margin: Math.max(10, Math.min(120, Number(style.margin) || 30))
  };
}

export function toAssColor(hex) {
  const value = String(hex || "#FFFFFF").replace("#", "");
  return `&H00${value.slice(4, 6)}${value.slice(2, 4)}${value.slice(0, 2)}`;
}

export function buildSafeFillFilter(width, height, fps, safeFill = true) {
  if (!safeFill) {
    return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${fps}`;
  }
  return [
    `split=2[background][foreground]`,
    `[background]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},gblur=sigma=28[blurred]`,
    `[foreground]scale=${width}:${height}:force_original_aspect_ratio=decrease[subject]`,
    `[blurred][subject]overlay=(W-w)/2:(H-h)/2:format=auto,fps=${fps}`
  ].join(";");
}

export function buildAudioMixFilter({
  audioInputs,
  audioStartIndex,
  pictureDuration
}) {
  if (!Array.isArray(audioInputs) || audioInputs.length === 0) {
    return "";
  }
  const filters = [];
  const labels = [];
  audioInputs.forEach((audio, index) => {
    const inputIndex = audioStartIndex + index;
    filters.push(
      `[${inputIndex}:a]volume=${audio.volume},atrim=duration=${pictureDuration},asetpts=PTS-STARTPTS[a${index}]`
    );
    labels.push(`[a${index}]`);
  });

  if (audioInputs.length >= 2) {
    const musicIndex = audioInputs.findIndex((audio) => audio.loop);
    const voiceIndex = audioInputs.findIndex((audio) => !audio.loop);
    if (musicIndex >= 0 && voiceIndex >= 0) {
      filters.push(
        `[a${voiceIndex}]asplit=2[voiceMix][voiceKey]`
      );
      filters.push(
        `[a${musicIndex}][voiceKey]sidechaincompress=threshold=0.025:ratio=8:attack=15:release=350[musicDucked]`
      );
      filters.push(
        `[musicDucked][voiceMix]amix=inputs=2:duration=longest:dropout_transition=2,loudnorm=I=-14:TP=-1:LRA=11[aout]`
      );
      return filters.join(";");
    }
  }

  filters.push(
    `${labels.join("")}amix=inputs=${audioInputs.length}:duration=longest:dropout_transition=2,loudnorm=I=-14:TP=-1:LRA=11[aout]`
  );
  return filters.join(";");
}

export function evaluateTechnicalQc({
  media,
  expectedDuration,
  width,
  height,
  fps,
  crop,
  subtitleText = ""
}) {
  const checks = {
    videoTrack: Boolean(media?.video),
    audioTrack: Boolean(media?.audio),
    frameRate: Number(String(media?.video?.avg_frame_rate || "0/1").split("/")[0]) === Number(fps),
    duration:
      Math.abs(Number(media?.duration || 0) - Number(expectedDuration || 0)) <= 0.08,
    frameCount:
      Number(media?.video?.nb_frames || 0) ===
      Math.round(Number(expectedDuration || 0) * Number(fps || 24)),
    resolution:
      Number(media?.video?.width || 0) === Number(width) &&
      Number(media?.video?.height || 0) === Number(height),
    noBlackBars:
      !crop ||
      (Number(crop.width || width) >= Number(width) - 2 &&
        Number(crop.height || height) >= Number(height) - 2),
    subtitleLength: String(subtitleText || "")
      .split(/\r?\n/)
      .filter((line) => line && !/^\d+$/.test(line) && !line.includes("-->"))
      .every((line) => line.length <= 18)
  };
  return {
    ok: Object.values(checks).every(Boolean),
    checks,
    media
  };
}

export async function detectVisibleCrop(filePath) {
  const result = await runProcess(FFMPEG, [
    "-hide_banner",
    "-i",
    filePath,
    "-vf",
    "cropdetect=24:16:0",
    "-frames:v",
    "30",
    "-f",
    "null",
    "-"
  ]);
  const matches = [...String(result.stderr || "").matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
  const last = matches.at(-1);
  return last
    ? {
        width: Number(last[1]),
        height: Number(last[2]),
        x: Number(last[3]),
        y: Number(last[4])
      }
    : null;
}

export async function inspectRenderedQuality({
  filePath,
  expectedDuration,
  width = 1280,
  height = 720,
  fps = 24,
  subtitlePath = ""
}) {
  const media = await probeMedia(filePath);
  const [crop, subtitleText] = await Promise.all([
    detectVisibleCrop(filePath).catch(() => null),
    subtitlePath ? readFile(subtitlePath, "utf8").catch(() => "") : Promise.resolve("")
  ]);
  return evaluateTechnicalQc({
    media,
    expectedDuration,
    width,
    height,
    fps,
    crop,
    subtitleText
  });
}

async function getDuration(filePath) {
  const media = await probeMedia(filePath);
  return media.duration.toFixed(3);
}

export async function verifyMedia(filePath) {
  const media = await probeMedia(filePath);
  if (!media.video) throw new Error("输出文件没有视频轨道");
  if (media.duration <= 0) throw new Error("输出文件时长无效");
  return media;
}

export function inferExtension(contentType = "", filename = "") {
  const known = extname(filename);
  if (known) return known.toLowerCase();
  const map = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav"
  };
  return map[contentType] || ".bin";
}
