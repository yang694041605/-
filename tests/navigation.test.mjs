import test from "node:test";
import assert from "node:assert/strict";
import {
  parseRouteHash,
  routeHash
} from "../src/production-model.mjs";
import { flattenWeddingNavigation } from "../src/wedding-navigation.mjs";

test("婚礼导航包含 14 个独立故事步骤和 5 个复刻步骤", () => {
  const flat = flattenWeddingNavigation();
  for (let step = 1; step <= 14; step += 1) {
    assert.ok(
      flat.some(
        (item) => item.depth === 3 && item.node.route === `step${step}`
      )
    );
  }
  for (let step = 1; step <= 5; step += 1) {
    assert.ok(
      flat.some(
        (item) => item.node.route === `remixStep${step}`
      )
    );
  }
});

test("故事和抖音复刻入口都有可刷新恢复的哈希地址", () => {
  for (let step = 1; step <= 14; step += 1) {
    const hash = routeHash("story", { step });
    assert.deepEqual(parseRouteHash(hash), { page: "story", mode: "story", step });
  }
  for (let step = 1; step <= 5; step += 1) {
    const hash = routeHash("remix", { step });
    assert.deepEqual(parseRouteHash(hash), { page: "remix", mode: "remix", step });
  }
});
