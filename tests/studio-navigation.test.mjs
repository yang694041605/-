import test from "node:test";
import assert from "node:assert/strict";
import {
  TOP_NAVIGATION,
  SELF_STEPS,
  REMIX_STEPS,
  buildStudioNavigation,
  routeLabel
} from "../src/studio-navigation.mjs";

test("主页面只有五个一级入口和两套直接步骤", () => {
  assert.deepEqual(
    TOP_NAVIGATION.map((item) => item.label),
    ["首页", "抖音复刻", "自我生成", "模型中心", "任务中心"]
  );
  assert.equal(SELF_STEPS.length, 14);
  assert.equal(REMIX_STEPS.length, 5);
  assert.ok(SELF_STEPS.every((step) => !step.children?.length));
  assert.ok(REMIX_STEPS.every((step) => !step.children?.length));
  assert.equal(buildStudioNavigation("self")[2].children.length, 14);
  assert.equal(buildStudioNavigation("remix")[1].children.length, 5);
  assert.equal(routeLabel("step7"), "07 三个重点静帧");
  assert.equal(routeLabel("remixStep5"), "05 原轨道对齐、预览与交付");
});
