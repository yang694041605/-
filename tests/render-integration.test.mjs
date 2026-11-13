import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProcess } from "../server/ark.mjs";
import { renderOriginalBgm } from "../server/bgm.mjs";
import {
  inspectRenderedQuality,
  renderTimeline
} from "../server/media.mjs";
import {
  approvalSnapshot,
  approveStep,
  buildProjectTimeline,
  sha256File,
  validateRenderTimeline
} from "../server/production.mjs";
import { shotReviewComplete } from "../src/production-model.mjs";

function review() {
  const values = [
    "identity",
    "crossFace",
    "hands",
    "actionMatch",
    "prop",
    "backgroundDrift",
    "blackBars",
    "subtitleSafety",
    "audioSync"
  ];
  return Object.fromEntries(values.map((key) => [key, "passed"]));
}

test("八镜头四十秒时间线可以实际合成并通过技术质检", { timeout: 120000 }, async () => {
  const temp = await mkdtemp(join(tmpdir(), "xying-render-integration-"));
  try {
    const assets = [];
    const storyboard = [];
    for (let index = 0; index < 8; index += 1) {
      const id = `shot-${String(index + 1).padStart(2, "0")}`;
      const filePath = join(temp, `${id}.mp4`);
      await runProcess("ffmpeg", [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `color=c=0x${(0x772233 + index * 0x001100).toString(16).slice(-6)}:s=320x180:d=5:r=24`,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        filePath
      ]);
      const contentHash = await sha256File(filePath);
      const assetId = `asset-${id}`;
      assets.push({
        id: assetId,
        projectId: "project-render-test",
        kind: "video",
        localPath: filePath,
        contentHash,
        media: { duration: 5 }
      });
      storyboard.push({
        id,
        order: index + 1,
        start: index * 5,
        end: (index + 1) * 5,
        frames: 120,
        prompt: `镜头 ${index + 1}`,
        promptVersion: { version: 1, hash: `prompt-${index + 1}`, text: `镜头 ${index + 1}` },
        assets: {
          firstFrame: null,
          video: { assetId, hash: contentHash },
          finalClip: { assetId, hash: contentHash }
        },
        review: review(),
        status: "approved"
      });
    }

    const project = {
      id: "project-render-test",
      mode: "story",
      duration: 40,
      fps: 24,
      storyboard,
      workflow: { currentStep: 9, approvals: {} }
    };
    const snapshot = approvalSnapshot(project, assets, { mode: "story", step: 9 });
    project.workflow = approveStep(project, {
      mode: "story",
      step: 9,
      snapshot,
      evidence: "集成验收确认"
    });

    const timeline = buildProjectTimeline(project, assets);
    const resolved = validateRenderTimeline(project, timeline, assets);
    assert.equal(resolved.clips.length, 8);
    assert.ok(storyboard.every((shot) => shotReviewComplete(shot.review)));

    const musicPath = join(temp, "music.wav");
    await renderOriginalBgm(musicPath, 40, "warm-cinematic");
    const subtitlePath = join(temp, "film.srt");
    await writeFile(
      subtitlePath,
      "1\n00:00:00,000 --> 00:00:40,000\n愿余生朝朝暮暮岁岁平安\n",
      "utf8"
    );
    const outputPath = join(temp, "timeline.mp4");
    await renderTimeline({
      clips: resolved.clips,
      outputPath,
      width: 640,
      height: 360,
      fps: 24,
      musicPath,
      subtitlePath
    });
    const quality = await inspectRenderedQuality({
      filePath: outputPath,
      expectedDuration: 40,
      width: 640,
      height: 360,
      fps: 24,
      subtitlePath
    });
    assert.equal(quality.media.duration >= 39.9 && quality.media.duration <= 40.1, true);
    assert.equal(quality.checks.duration, true);
    assert.equal(quality.checks.frameRate, true);
    assert.equal(quality.checks.subtitleLength, true);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
