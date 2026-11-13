import test from "node:test";
import assert from "node:assert/strict";
import { estimateGeneration } from "../server/generation-estimate.mjs";
import {
  assertBatchConfirmed,
  buildImageBatchPlan,
  findIdempotentJob
} from "../server/image-batches.mjs";
import {
  bindImportedVideo,
  normalizeReplacementMap
} from "../src/replacement-map.mjs";
import { buildTimeline } from "../src/production-model.mjs";

test("双入口验收覆盖批量、报价、幂等、替换失效和轨道保留", () => {
  const estimate = estimateGeneration({
    category: "image",
    model: { id: "model-image", label: "图片模型" },
    count: 24
  });
  assert.equal(estimate.requiresQuote, true);
  assert.throws(() => assertBatchConfirmed(true, estimate), /报价/);

  const plan = buildImageBatchPlan({
    projectId: "project-default",
    shotIds: Array.from({ length: 8 }, (_, index) => `shot-${index + 1}`),
    versionsPerShot: 3,
    totalCount: 24
  });
  assert.equal(plan.totalCount, 24);
  assert.equal(
    plan.items.reduce((sum, item) => sum + item.count, 0),
    24
  );

  const jobs = [
    { id: "job-one", input: { idempotencyKey: "same-key" } }
  ];
  assert.equal(findIdempotentJob(jobs, "same-key").id, "job-one");
  assert.equal(findIdempotentJob(jobs, "other-key"), null);

  const mapping = normalizeReplacementMap({
    groom: { target: "left", sourceAssetId: "asset-groom" },
    bride: { target: "right", sourceAssetId: "asset-bride" }
  });
  const imported = bindImportedVideo(
    {
      id: "shot-1",
      duration: 4,
      frames: 96,
      assets: { video: { assetId: "old-video", hash: "old-hash" } },
      review: { identity: "passed", crossFace: "passed" }
    },
    { id: "new-video", contentHash: "new-hash" },
    mapping
  );
  assert.equal(imported.assets.finalClip.assetId, "new-video");
  assert.equal(imported.review.identity, "pending");

  const timeline = buildTimeline({
    mode: "remix",
    duration: 40,
    fps: 24,
    voice: [{ assetId: "voice-1", start: 0, end: 40 }],
    subtitle: [{ assetId: "srt-1", start: 0, end: 40 }]
  });
  assert.equal(timeline.totalFrames, 960);
  assert.equal(timeline.tracks.voice[0].startFrame, 0);
  assert.equal(timeline.tracks.voice[0].endFrame, 960);
  assert.equal(timeline.tracks.subtitle[0].startFrame, 0);
  assert.equal(timeline.tracks.subtitle[0].endFrame, 960);
});
