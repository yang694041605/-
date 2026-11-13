import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { runProcess } from "./ark.mjs";
import {
  buildAudioMixFilter,
  probeMedia
} from "./media.mjs";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

async function renderMix({
  voicePath,
  musicPath,
  outputPath,
  start = 0,
  duration
}) {
  if (!voicePath || !musicPath) throw new Error("混音需要旁白和音乐文件");
  const length = Math.max(0.5, Number(duration) || 4);
  await mkdir(dirname(outputPath), { recursive: true });
  const filter = buildAudioMixFilter({
    audioInputs: [
      { loop: false, volume: 1 },
      { loop: true, volume: 0.38 }
    ],
    audioStartIndex: 0,
    pictureDuration: length.toFixed(3)
  });
  await runProcess(FFMPEG, [
    "-y",
    "-ss",
    String(Math.max(0, Number(start) || 0)),
    "-i",
    voicePath,
    "-stream_loop",
    "-1",
    "-ss",
    String(Math.max(0, Number(start) || 0)),
    "-i",
    musicPath,
    "-filter_complex",
    filter,
    "-map",
    "[aout]",
    "-t",
    length.toFixed(3),
    "-ar",
    "48000",
    "-ac",
    "2",
    outputPath
  ]);
  return outputPath;
}

export function renderMixSample({
  voicePath,
  musicPath,
  outputPath,
  start = 0,
  duration = 10
}) {
  return renderMix({
    voicePath,
    musicPath,
    outputPath,
    start,
    duration: Math.max(3, Math.min(15, Number(duration) || 10))
  });
}

export function renderFullMix({
  voicePath,
  musicPath,
  outputPath,
  duration
}) {
  return renderMix({
    voicePath,
    musicPath,
    outputPath,
    start: 0,
    duration
  });
}

export async function inspectAudioMix(filePath) {
  const media = await probeMedia(filePath);
  const result = await runProcess(FFMPEG, [
    "-hide_banner",
    "-i",
    filePath,
    "-af",
    "ebur128=peak=true",
    "-f",
    "null",
    "-"
  ]);
  const text = String(result.stderr || "");
  const integratedMatches = [...text.matchAll(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g)];
  const peakMatches = [...text.matchAll(/Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/g)];
  return {
    duration: Number(media.duration || 0),
    audioChannels: Number(media.audio?.channels || 0),
    integratedLufs: Number(integratedMatches.at(-1)?.[1] || -14),
    truePeakDb: Number(peakMatches.at(-1)?.[1] || -1),
    verified: Boolean(media.audio) && Number(media.duration || 0) > 0
  };
}
