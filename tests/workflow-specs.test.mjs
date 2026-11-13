import test from "node:test";
import assert from "node:assert/strict";
import {
  WORKFLOW_SPECS,
  buildStepNavigationChildren,
  getWorkflowStep,
  workflowStepGaps
} from "../src/workflow-specs.mjs";

test("14 步规格完整且顺序唯一", () => {
  assert.equal(WORKFLOW_SPECS.length, 14);
  assert.deepEqual(
    WORKFLOW_SPECS.map((step) => step.number),
    Array.from({ length: 14 }, (_, index) => index + 1)
  );
  assert.equal(new Set(WORKFLOW_SPECS.map((step) => step.key)).size, 14);
});

test("每一步都有输入、操作、产物和人工检查", () => {
  for (const step of WORKFLOW_SPECS) {
    assert.ok(step.goal.length > 10, `第 ${step.number} 步缺少目标`);
    assert.ok(step.requiredInputs.length > 0, `第 ${step.number} 步缺少输入`);
    assert.ok(step.actions.length > 0, `第 ${step.number} 步缺少操作`);
    assert.ok(step.outputs.length > 0, `第 ${step.number} 步缺少产物`);
    assert.ok(step.checks.length > 0, `第 ${step.number} 步缺少检查`);
  }
});

test("图片与视频提示词分属第 7-9 步", () => {
  assert.ok(getWorkflowStep(7).promptKinds.includes("image"));
  assert.ok(getWorkflowStep(8).promptKinds.includes("image"));
  assert.ok(getWorkflowStep(9).promptKinds.includes("video"));
  assert.equal(getWorkflowStep(10).promptKinds.includes("video"), false);
});

test("缺口计算会返回具体输入名称", () => {
  const step = getWorkflowStep(6);
  const gaps = workflowStepGaps(step, {
    narrationTiming: true,
    storyFacts: false,
    characterReferences: true,
    duration: false
  });
  assert.deepEqual(gaps, ["五幕事实", "目标时长"]);
});

test("每个故事步骤都是直接打开完整页面的末端入口", () => {
  for (let number = 1; number <= 14; number += 1) {
    assert.deepEqual(buildStepNavigationChildren(number), []);
  }
});
