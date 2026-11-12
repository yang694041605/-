import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    "stream=index,codec_name,codec_type,width,height,r_frame_rate,avg_frame_rate,nb_frames",
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
  voicePath = "",
  subtitlePath = ""
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
        `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${fps}`,
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
    if (musicPath) audioInputs.push({ path: musicPath, loop: true, volume: 0.38 });
    if (voicePath) audioInputs.push({ path: voicePath, loop: false, volume: 1 });

    const args = ["-y", "-i", silentPath];
    if (subtitlePath) args.push("-i", subtitlePath);
    for (const audio of audioInputs) {
      if (audio.loop) args.push("-stream_loop", "-1");
      args.push("-i", audio.path);
    }

    if (audioInputs.length > 0) {
      const audioStartIndex = subtitlePath ? 2 : 1;
      const pictureDuration = await getDuration(silentPath);
      const filters = audioInputs.map((audio, index) => {
        const inputIndex = audioStartIndex + index;
        return `[${inputIndex}:a]volume=${audio.volume},atrim=duration=${pictureDuration}[a${index}]`;
      });
      const mixInputs = audioInputs.map((_, index) => `[a${index}]`).join("");
      filters.push(
        `${mixInputs}amix=inputs=${audioInputs.length}:duration=longest:dropout_transition=2[aout]`
      );
      args.push(
        "-filter_complex",
        filters.join(";"),
        "-map",
        "0:v:0",
        "-map",
        "[aout]",
        "-shortest"
      );
    } else {
      args.push("-map", "0:v:0", "-an");
    }

    if (subtitlePath) {
      const escaped = subtitlePath.replaceAll("\\", "/").replaceAll(":", "\\:");
      const videoFilter = `subtitles='${escaped}'`;
      const currentMapIndex = args.indexOf("0:v:0");
      if (currentMapIndex >= 0) {
        args.splice(currentMapIndex, 2);
      }
      args.push("-vf", videoFilter, "-map", "0:v:0");
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
      "-c:a",
      "aac",
      "-b:a",
      "192k",
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
