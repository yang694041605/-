import test from "node:test";
import assert from "node:assert/strict";
import { REMIX_PAGE_SPECS } from "../src/remix-page-specs.mjs";
import { parseRouteHash } from "../src/production-model.mjs";

test("抖音复刻五个页面都定义输入、操作、产物和检查", () => {
  assert.deepEqual(
    REMIX_PAGE_SPECS.map((step) => step.route),
    ["remixStep1", "remixStep2", "remixStep3", "remixStep4", "remixStep5"]
  );
  assert.ok(
    REMIX_PAGE_SPECS.every(
      (step) =>
        step.inputs.length > 0 &&
        step.actions.length > 0 &&
        step.outputs.length > 0 &&
        step.checks.length > 0
    )
  );
});

test("第五步抖音复刻地址可以刷新恢复", () => {
  assert.deepEqual(parseRouteHash("#/remix/step/5"), {
    page: "remix",
    mode: "remix",
    step: 5
  });
});
