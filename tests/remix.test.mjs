import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFrameExtractionPlan,
  buildRemixShotPlan,
  normalizeReplacementTargets,
  sliceSrt,
  transcriptToSrt
} from "../server/remix.mjs";

test("抖音复刻按每秒 24 帧建立完整帧计划", () => {
  const plan = buildFrameExtractionPlan(163.2, 24);
  assert.equal(plan.fps, 24);
  assert.equal(plan.totalFrames, 3917);
  assert.equal(plan.seconds.length, 164);
  assert.equal(plan.seconds[0].count, 24);
  assert.equal(plan.seconds.at(-1).count, 5);
});

test("替换目标必须明确且男女主不能指向同一人物", () => {
  assert.deepEqual(
    normalizeReplacementTargets({ groom: "left", bride: "right" }),
    { groom: "left", bride: "right" }
  );
  assert.throws(
    () => normalizeReplacementTargets({ groom: "left", bride: "left" }),
    /不能相同/
  );
  assert.throws(
    () => normalizeReplacementTargets({ groom: "left", bride: "person-9" }),
    /目标无效/
  );
});

test("复刻镜头计划保留模板区间和人物替换目标", () => {
  const template = {
    id: "template-1",
    title: "抖音模板",
    duration: 8,
    recipe: {
      shots: [
        { index: 1, start: 0, end: 4, duration: 4 },
        { index: 2, start: 4, end: 8, duration: 4 }
      ]
    }
  };
  const shots = buildRemixShotPlan(template, {
    groom: "陈一",
    bride: "苏禾",
    targets: { groom: "right", bride: "left" }
  });
  assert.equal(shots.length, 2);
  assert.equal(shots[1].source.referenceStart, 4);
  assert.equal(shots[1].characters.groom.target, "right");
  assert.equal(shots[1].characters.bride.target, "left");
  assert.equal(shots[1].review.identity, "pending");
});

test("长参考片会合并成最多八个连续生产镜头", () => {
  const templateShots = Array.from({ length: 65 }, (_, index) => ({
    index: index + 1,
    start: index,
    end: index + 1,
    duration: 1
  }));
  const shots = buildRemixShotPlan(
    { id: "template-long", duration: 65, recipe: { shots: templateShots } },
    { targets: { groom: "left", bride: "right" } }
  );
  assert.equal(shots.length, 8);
  assert.equal(shots[0].source.referenceStart, 25);
  assert.equal(shots.at(-1).source.referenceEnd, 65);
  assert.ok(shots.every((shot) => shot.duration <= 9));
  assert.equal(shots.reduce((sum, shot) => sum + shot.duration, 0), 40);
  for (let index = 1; index < shots.length; index += 1) {
    assert.equal(
      shots[index].source.referenceStart,
      shots[index - 1].source.referenceEnd
    );
  }
});

test("原字幕按所选参考片区间重新打轴", () => {
  const source = [
    "1",
    "00:02:03,000 --> 00:02:05,000",
    "前一句",
    "",
    "2",
    "00:02:05,000 --> 00:02:08,000",
    "后一句",
    ""
  ].join("\n");
  const sliced = sliceSrt(source, 123, 163);
  assert.match(sliced, /00:00:00,000 --> 00:00:02,000/);
  assert.match(sliced, /00:00:02,000 --> 00:00:05,000/);
  assert.match(sliced, /前一句/);
  assert.match(sliced, /后一句/);
});

test("Whisper 时间点可以转成十八字安全字幕", () => {
  const srt = transcriptToSrt([
    {
      start: 123,
      end: 127,
      text: "沈知远与林晚晴从雨天借伞开始今天他们把余生写成同一个故事"
    }
  ]);
  const textLines = srt
    .split(/\r?\n/)
    .filter((line) => line && !/^\d+$/.test(line) && !line.includes("-->"));
  assert.ok(textLines.length >= 2);
  assert.ok(textLines.every((line) => line.length <= 18));
  assert.match(srt, /00:02:03,000 --> /);
});
