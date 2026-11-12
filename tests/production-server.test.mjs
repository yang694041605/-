import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  approvalSnapshot,
  approveStep,
  assertInside,
  buildProjectTimeline,
  sha256File,
  sha256Text,
  stableStringify,
  validateRenderTimeline
} from "../server/production.mjs";
import { shotReviewComplete } from "../src/production-model.mjs";

function approvedReview() {
  return {
    identity: "passed",
    crossFace: "passed",
    hands: "passed",
    actionMatch: "passed",
    backgroundDrift: "passed",
    blackBars: "passed",
    subtitleSafety: "passed",
    audioSync: "passed"
  };
}

function fixtureProject() {
  return {
    id: "project-test",
    mode: "story",
    duration: 4,
    fps: 24,
    title: "测试婚礼",
    storyboard: [
      {
        id: "shot-01",
        order: 1,
        start: 0,
        end: 2,
        frames: 48,
        prompt: "第一镜",
        promptVersion: { version: 1, hash: "p1", text: "第一镜" },
        assets: {
          firstFrame: { assetId: "asset-image-1", hash: "hash-image-1" },
          video: { assetId: "asset-video-1", hash: "hash-video-1" },
          finalClip: { assetId: "asset-video-1", hash: "hash-video-1" }
        },
        review: approvedReview(),
        status: "approved"
      },
      {
        id: "shot-02",
        order: 2,
        start: 2,
        end: 4,
        frames: 48,
        prompt: "第二镜",
        promptVersion: { version: 1, hash: "p2", text: "第二镜" },
        assets: {
          firstFrame: { assetId: "asset-image-2", hash: "hash-image-2" },
          video: { assetId: "asset-video-2", hash: "hash-video-2" },
          finalClip: { assetId: "asset-video-2", hash: "hash-video-2" }
        },
        review: approvedReview(),
        status: "approved"
      }
    ]
  };
}

function fixtureAssets() {
  return [
    { id: "asset-image-1", projectId: "project-test", kind: "first-frame", localPath: "image-1.jpg", contentHash: "hash-image-1" },
    { id: "asset-image-2", projectId: "project-test", kind: "first-frame", localPath: "image-2.jpg", contentHash: "hash-image-2" },
    { id: "asset-video-1", projectId: "project-test", kind: "video", localPath: "video-1.mp4", contentHash: "hash-video-1", media: { duration: 2 } },
    { id: "asset-video-2", projectId: "project-test", kind: "video", localPath: "video-2.mp4", contentHash: "hash-video-2", media: { duration: 2 } }
  ];
}

test("稳定哈希不依赖对象字段插入顺序", () => {
  assert.equal(stableStringify({ b: 2, a: 1 }), stableStringify({ a: 1, b: 2 }));
  assert.equal(sha256Text("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("媒体文件只允许位于指定根目录内", async () => {
  const root = await mkdtemp(join(tmpdir(), "xying-production-root-"));
  try {
    await mkdir(join(root, "safe"));
    const safe = join(root, "safe", "video.mp4");
    await writeFile(safe, "video");
    assert.equal(assertInside(root, safe), safe);
    assert.throws(() => assertInside(root, join(root, "..", "outside.mp4")), /越界/);
    assert.ok((await sha256File(safe)).length === 64);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("审批快照绑定时间轴、素材和提示词版本", () => {
  const project = fixtureProject();
  const assets = fixtureAssets();
  const first = approvalSnapshot(project, assets, { mode: "story", step: 9 });
  const approved = approveStep(project, {
    mode: "story",
    step: 9,
    snapshot: first,
    evidence: "制作方确认第 9 步"
  });
  assert.equal(approved.currentStep, 10);
  assert.equal(approved.approvals[9].fingerprint, first.fingerprint);

  const changed = fixtureProject();
  changed.storyboard[0].promptVersion.version = 2;
  const changedSnapshot = approvalSnapshot(changed, assets, { mode: "story", step: 9 });
  assert.notEqual(changedSnapshot.fingerprint, first.fingerprint);
});

test("成片时间线拒绝缺口、重叠和未批准镜头", () => {
  const project = fixtureProject();
  const timeline = buildProjectTimeline(project, fixtureAssets());
  const resolved = validateRenderTimeline(project, timeline, fixtureAssets());
  assert.equal(resolved.clips.length, 2);
  assert.equal(resolved.clips[0].asset.id, "asset-video-1");

  const gap = structuredClone(timeline);
  gap.tracks.video[1].startFrame = 60;
  assert.throws(() => validateRenderTimeline(project, gap, fixtureAssets()), /连续/);

  const unapproved = fixtureProject();
  unapproved.storyboard[0].status = "human-review";
  const unapprovedTimeline = buildProjectTimeline(unapproved, fixtureAssets());
  assert.throws(
    () => validateRenderTimeline(unapproved, unapprovedTimeline, fixtureAssets()),
    /未批准/
  );
});

test("成片时间线拒绝素材哈希变化", () => {
  const project = fixtureProject();
  const timeline = buildProjectTimeline(project, fixtureAssets());
  const changedAssets = fixtureAssets();
  changedAssets[2].contentHash = "changed";
  assert.throws(
    () => validateRenderTimeline(project, timeline, changedAssets),
    /哈希/
  );
});

test("质检八项全部通过才符合镜头交付条件", () => {
  assert.equal(shotReviewComplete(approvedReview()), true);
  assert.equal(shotReviewComplete({ ...approvedReview(), crossFace: "failed" }), false);
});
