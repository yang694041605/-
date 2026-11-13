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
  remixWorkflowReady,
  sha256File,
  sha256Text,
  stableStringify,
  storyWorkflowReady,
  validateRenderTimeline
} from "../server/production.mjs";
import { shotReviewComplete } from "../src/production-model.mjs";
import {
  bindImportedVideo,
  normalizeReplacementMap
} from "../src/replacement-map.mjs";

function approvedReview() {
  return {
    identity: "passed",
    crossFace: "passed",
    hands: "passed",
    actionMatch: "passed",
    prop: "passed",
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

test("导入新替换视频后旧审核失效，最终时间线拒绝未批准镜头", () => {
  const project = fixtureProject();
  const mapping = normalizeReplacementMap({
    groom: { target: "left", sourceAssetId: "asset-groom" },
    bride: { target: "right", sourceAssetId: "asset-bride" }
  });
  project.storyboard[0] = bindImportedVideo(
    project.storyboard[0],
    { id: "asset-imported", contentHash: "imported-hash" },
    mapping
  );
  const assets = [
    ...fixtureAssets(),
    {
      id: "asset-imported",
      projectId: "project-test",
      kind: "video",
      localPath: "imported.mp4",
      contentHash: "imported-hash",
      media: { duration: 2 }
    }
  ];
  const importedTimeline = buildProjectTimeline(project, assets);
  assert.throws(
    () => validateRenderTimeline(project, importedTimeline, assets),
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

test("质检九项全部通过才符合镜头交付条件", () => {
  assert.equal(shotReviewComplete(approvedReview()), true);
  assert.equal(shotReviewComplete({ ...approvedReview(), crossFace: "failed" }), false);
});

test("服务端放行故事第九步必须要求全部镜头完成首帧、视频和人工审核", () => {
  const project = fixtureProject();
  assert.equal(storyWorkflowReady(project, fixtureAssets(), 9), true);
  project.storyboard[0].review.hands = "pending";
  assert.equal(storyWorkflowReady(project, fixtureAssets(), 9), false);
});

test("服务端放行抖音第三步必须要求最多八个镜头全部审核通过", () => {
  const project = fixtureProject();
  project.remixWorkflow = { currentStep: 3, approvals: {} };
  const template = {
    remixExtraction: { totalFrames: 960 },
    remixAnalysis: { shots: [] }
  };
  assert.equal(remixWorkflowReady(project, template, fixtureAssets(), 3), true);
  project.storyboard[1].assets.video = null;
  assert.equal(remixWorkflowReady(project, template, fixtureAssets(), 3), false);
});

test("后续音频和字幕不应让已完成的视频镜头审批失效", () => {
  const project = fixtureProject();
  const assets = fixtureAssets();
  const step9 = approvalSnapshot(project, assets, { mode: "story", step: 9 });
  const withAudio = [
    ...assets,
    { id: "asset-voice", projectId: "project-test", kind: "voice", localPath: "v.wav", contentHash: "voice" },
    { id: "asset-music", projectId: "project-test", kind: "music", localPath: "m.wav", contentHash: "music" },
    { id: "asset-srt", projectId: "project-test", kind: "subtitle", localPath: "s.srt", contentHash: "srt" }
  ];
  const step9AfterAudio = approvalSnapshot(
    {
      ...project,
      timelineSelection: {
        voiceAssetId: "asset-voice",
        musicAssetId: "asset-music",
        subtitleAssetId: "asset-srt"
      }
    },
    withAudio,
    { mode: "story", step: 9 }
  );
  assert.equal(step9AfterAudio.fingerprint, step9.fingerprint);
});

test("新增字幕不应让第十二步混音审批失效，但会进入第十三步范围", () => {
  const project = fixtureProject();
  project.mixAssetId = "asset-mix";
  const assets = [
    ...fixtureAssets(),
    { id: "asset-mix", projectId: "project-test", kind: "mix", localPath: "mix.wav", contentHash: "mix" },
    { id: "asset-srt", projectId: "project-test", kind: "subtitle", localPath: "s.srt", contentHash: "srt" }
  ];
  const before = approvalSnapshot(project, assets, { mode: "story", step: 12 });
  const after = approvalSnapshot(
    {
      ...project,
      timelineSelection: { subtitleAssetId: "asset-srt" }
    },
    assets,
    { mode: "story", step: 12 }
  );
  const step13 = approvalSnapshot(
    {
      ...project,
      timelineSelection: { subtitleAssetId: "asset-srt" }
    },
    assets,
    { mode: "story", step: 13 }
  );
  assert.equal(after.fingerprint, before.fingerprint);
  assert.notEqual(step13.fingerprint, before.fingerprint);
});
