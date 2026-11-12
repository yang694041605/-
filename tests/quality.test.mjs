import test from "node:test";
import assert from "node:assert/strict";
import {
  approvalIsCurrent,
  shotReviewComplete
} from "../src/production-model.mjs";
import { evaluateTechnicalQc } from "../server/media.mjs";

test("技术检查通过不等于人工审核通过", () => {
  const technical = evaluateTechnicalQc({
    media: {
      duration: 40,
      video: { width: 1280, height: 720, avg_frame_rate: "24/1", nb_frames: "960" },
      audio: { codec_type: "audio" }
    },
    expectedDuration: 40,
    width: 1280,
    height: 720,
    fps: 24,
    crop: { width: 1280, height: 720 },
    subtitleText: "1\n00:00:00,000 --> 00:00:02,000\n这是一行安全字幕\n"
  });
  assert.equal(technical.ok, true);
  assert.equal(
    shotReviewComplete({
      identity: "pending",
      crossFace: "passed",
      hands: "passed",
      actionMatch: "passed",
      backgroundDrift: "passed",
      blackBars: "passed",
      subtitleSafety: "passed",
      audioSync: "passed"
    }),
    false
  );
});

test("素材或提示词版本变化会让旧审批失效", () => {
  const approval = {
    approved: true,
    fingerprint: "shake-8",
    timelineHash: "timeline-1",
    assetHashes: { "asset-video-1": "hash-a" },
    promptVersions: { "shot-01": 2 }
  };
  assert.equal(
    approvalIsCurrent(approval, {
      fingerprint: "shake-8",
      timelineHash: "timeline-1",
      assetHashes: { "asset-video-1": "hash-a" },
      promptVersions: { "shot-01": 2 }
    }),
    true
  );
  assert.equal(
    approvalIsCurrent(approval, {
      fingerprint: "shake-8",
      timelineHash: "timeline-1",
      assetHashes: { "asset-video-1": "hash-b" },
      promptVersions: { "shot-01": 2 }
    }),
    false
  );
});
