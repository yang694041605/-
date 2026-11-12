import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFrameExtractionPlan,
  buildRemixShotPlan,
  normalizeReplacementTargets
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
});
