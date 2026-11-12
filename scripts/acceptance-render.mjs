import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runProcess } from "../server/ark.mjs";
import { renderOriginalBgm } from "../server/bgm.mjs";
import {
  inspectRenderedQuality,
  renderTimeline
} from "../server/media.mjs";
import { dataRoot } from "../server/paths.mjs";

const photos = process.argv.slice(2);
if (photos.length < 2) {
  throw new Error("请提供两张照片路径：node scripts/acceptance-render.mjs <photo1> <photo2>");
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = resolve(dataRoot, "media", "acceptance", stamp);
const clipsDir = resolve(outputDir, "clips");
await mkdir(clipsDir, { recursive: true });

const clips = [];
for (let index = 0; index < 8; index += 1) {
  const clipPath = resolve(clipsDir, `shot-${String(index + 1).padStart(2, "0")}.mp4`);
  const source = resolve(photos[index % photos.length]);
  await runProcess("ffmpeg", [
    "-y",
    "-loop",
    "1",
    "-i",
    source,
    "-t",
    "5",
    "-vf",
    "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,zoompan=z='min(zoom+0.0008,1.08)':d=120:s=1280x720:fps=24,format=yuv420p",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    clipPath
  ]);
  clips.push({ path: clipPath, start: 0, duration: 5, shotId: `shot-${index + 1}` });
}

const musicPath = resolve(outputDir, "music.wav");
await renderOriginalBgm(musicPath, 40, "warm-cinematic");
const subtitlePath = resolve(outputDir, "film.srt");
await writeFile(
  subtitlePath,
  "1\n00:00:00,000 --> 00:00:20,000\n从第一次相遇，到一起走过漫长岁月\n\n2\n00:00:20,000 --> 00:00:40,000\n愿余生朝朝暮暮岁岁平安\n",
  "utf8"
);
const outputPath = resolve(outputDir, "acceptance-40s.mp4");
await renderTimeline({
  clips,
  outputPath,
  width: 1280,
  height: 720,
  fps: 24,
  musicPath,
  subtitlePath
});
const technicalQc = await inspectRenderedQuality({
  filePath: outputPath,
  expectedDuration: 40,
  width: 1280,
  height: 720,
  fps: 24,
  subtitlePath
});
await writeFile(
  resolve(outputDir, "acceptance.json"),
  JSON.stringify(
    {
      kind: "local-photo-fixture",
      note: "用于验证 8 镜头、40 秒、24 FPS 时间轴和 FFmpeg 合成，不代表 Seedance 真实镜头验收",
      outputPath,
      shots: 8,
      duration: 40,
      fps: 24,
      technicalQc
    },
    null,
    2
  ),
  "utf8"
);

console.log(JSON.stringify({ outputPath, technicalQc }, null, 2));
