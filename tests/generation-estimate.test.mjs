import test from "node:test";
import assert from "node:assert/strict";
import { estimateGeneration } from "../server/generation-estimate.mjs";

test("批量费用估算在缺少单价时要求报价", () => {
  const result = estimateGeneration({
    category: "image",
    model: { id: "model-image", label: "图片模型" },
    count: 24
  });

  assert.equal(result.requiresQuote, true);
  assert.equal(result.count, 24);
  assert.equal(result.unitCost, null);
  assert.equal(result.totalCost, null);
});

test("配置单价后返回总价和确认提示", () => {
  const result = estimateGeneration({
    category: "image",
    model: { id: "model-image", label: "图片模型" },
    count: 24,
    unitCost: 0.2
  });

  assert.equal(result.totalCost, 4.8);
  assert.equal(result.requiresQuote, false);
  assert.match(result.confirmationText, /24 张/);
});

test("数量与单价会被规范为安全正整数和非负金额", () => {
  const result = estimateGeneration({
    category: "image",
    model: { id: "model-image", label: "图片模型" },
    count: -8,
    unitCost: -2
  });

  assert.equal(result.count, 1);
  assert.equal(result.unitCost, 0);
  assert.equal(result.totalCost, 0);
});
