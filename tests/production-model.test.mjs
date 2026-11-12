import test from "node:test";
import assert from "node:assert/strict";
import {
  allocateFrameDurations,
  approvalIsCurrent,
  bindStoryboardToTemplate,
  buildTimeline,
  formatTimecode,
  parseRouteHash,
  routeHash,
  shotReviewComplete
} from "../src/production-model.mjs";

test("双入口路由可以正向生成并从地址恢复", () => {
  assert.equal(routeHash("story", { step: 8 }), "#/story/step/8");
  assert.equal(routeHash("remix", { step: 3 }), "#/remix/step/3");
  assert.deepEqual(parseRouteHash("#/story/step/8"), {
    page: "story",
    mode: "story",
    step: 8
  });
  assert.deepEqual(parseRouteHash("#/remix/step/3"), {
    page: "remix",
    mode: "remix",
    step: 3
  });
  assert.equal(parseRouteHash("#/story/step/15").step, null);
  assert.equal(parseRouteHash("#/remix/step/0").step, null);
});

test("超过一分钟的帧数会转换成标准时间码", () => {
  assert.equal(formatTimecode(0), "00:00:00:00");
  assert.equal(formatTimecode(959), "00:00:39:23");
  assert.equal(formatTimecode(960), "00:00:40:00");
  assert.equal(formatTimecode(3917), "00:02:43:05");
});

test("镜头帧数按权重分配后严格等于总帧数", () => {
  const frames = allocateFrameDurations(960, [2, 2.5, 6, 11.5, 18]);
  assert.equal(frames.reduce((sum, value) => sum + value, 0), 960);

  const longFrames = allocateFrameDurations(3917, [2, 2.5, 6, 11.5, 18]);
  assert.equal(longFrames.reduce((sum, value) => sum + value, 0), 3917);
  assert.ok(Math.max(...longFrames) < 2000);
});

test("故事分镜会映射到对应模板时间区间", () => {
  const storyboard = [
    { id: "shot-01", number: 1, duration: 2 },
    { id: "shot-02", number: 2, duration: 2 },
    { id: "shot-03", number: 3, duration: 2 }
  ];
  const template = {
    id: "template-1",
    recipe: {
      shots: [
        { index: 1, start: 0, end: 2 },
        { index: 2, start: 2, end: 4 },
        { index: 3, start: 4, end: 6 },
        { index: 4, start: 6, end: 8 }
      ]
    }
  };
  const bound = bindStoryboardToTemplate(storyboard, template);
  assert.equal(bound[0].source.referenceStart, 0);
  assert.equal(bound[2].source.referenceEnd, 8);
  assert.ok(bound.every((shot) => shot.source.templateId === "template-1"));
  assert.ok(bound.every((shot) => shot.review.identity === "pending"));
});

test("时间轴只接受 24 FPS 帧边界内的时间", () => {
  const timeline = buildTimeline({
    mode: "story",
    duration: 40,
    shots: [
      { id: "shot-01", start: 0, end: 20, status: "approved" },
      { id: "shot-02", start: 20, end: 40, status: "approved" }
    ],
    voice: [{ assetId: "asset-voice", start: 0, end: 39.5 }],
    music: [{ assetId: "asset-music", start: 0, end: 40 }],
    subtitle: [{ assetId: "asset-srt", start: 0, end: 40 }]
  });
  assert.equal(timeline.fps, 24);
  assert.equal(timeline.duration, 40);
  assert.equal(timeline.totalFrames, 960);
  assert.equal(timeline.tracks.video.length, 2);
  assert.equal(formatTimecode(timeline.totalFrames), "00:00:40:00");
});

test("审批指纹变化后旧确认立即失效", () => {
  const approval = {
    approved: true,
    step: 8,
    fingerprint: "hash-a",
    timelineHash: "timeline-a",
    assetHashes: { "asset-1": "asset-a" },
    promptVersions: { "shot-01": 1 }
  };
  assert.equal(
    approvalIsCurrent(approval, {
      fingerprint: "hash-a",
      timelineHash: "timeline-a",
      assetHashes: { "asset-1": "asset-a" },
      promptVersions: { "shot-01": 1 }
    }),
    true
  );
  assert.equal(
    approvalIsCurrent(approval, {
      fingerprint: "hash-a",
      timelineHash: "timeline-b",
      assetHashes: { "asset-1": "asset-a" },
      promptVersions: { "shot-01": 1 }
    }),
    false
  );
});

test("镜头八项人工质检全部通过后才可交付", () => {
  const review = {
    identity: "passed",
    crossFace: "passed",
    hands: "passed",
    actionMatch: "passed",
    backgroundDrift: "passed",
    blackBars: "passed",
    subtitleSafety: "passed",
    audioSync: "passed"
  };
  assert.equal(shotReviewComplete(review), true);
  assert.equal(shotReviewComplete({ ...review, hands: "pending" }), false);
});
