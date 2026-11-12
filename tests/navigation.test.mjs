import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseRouteHash,
  routeHash
} from "../src/production-model.mjs";

test("主导航包含 14 个独立步骤且没有重复路由节点", async () => {
  const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const start = source.indexOf("const NAV_TREE = [");
  const end = source.indexOf("\n];", start) + 3;
  const navigation = source.slice(start, end);
  const routes = [...navigation.matchAll(/route: "([^"]+)"/g)].map(
    (match) => match[1]
  );
  const counts = routes.reduce((result, route) => {
    result[route] = (result[route] || 0) + 1;
    return result;
  }, {});

  for (let step = 1; step <= 14; step += 1) {
    assert.equal(counts[`step${step}`], 1);
  }
  assert.ok(Object.values(counts).every((count) => count === 1));
});

test("故事和抖音复刻入口都有可刷新恢复的哈希地址", () => {
  for (let step = 1; step <= 14; step += 1) {
    const hash = routeHash("story", { step });
    assert.deepEqual(parseRouteHash(hash), { page: "story", mode: "story", step });
  }
  for (let step = 1; step <= 4; step += 1) {
    const hash = routeHash("remix", { step });
    assert.deepEqual(parseRouteHash(hash), { page: "remix", mode: "remix", step });
  }
});
