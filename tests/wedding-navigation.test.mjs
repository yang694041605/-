import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWeddingNavigationTree,
  flattenWeddingNavigation
} from "../src/wedding-navigation.mjs";

test("婚礼导航覆盖一级到六级且节点 ID 唯一", () => {
  const tree = buildWeddingNavigationTree();
  const flat = flattenWeddingNavigation(tree);
  assert.ok(Math.max(...flat.map((item) => item.depth)) >= 6);
  const ids = flat.map((item) => item.node.id);
  assert.equal(new Set(ids).size, ids.length);
  for (let depth = 1; depth <= 6; depth += 1) {
    assert.ok(flat.some((item) => item.depth === depth), `缺少第 ${depth} 级`);
  }
});

test("所有第六级菜单都有实际路由", () => {
  const level6 = flattenWeddingNavigation().filter((item) => item.depth === 6);
  assert.ok(level6.length >= 100);
  assert.ok(level6.every((item) => Boolean(item.node.route)));
});

test("导航属于婚礼微电影业务且不存在旧通用模块", () => {
  const text = flattenWeddingNavigation()
    .map((item) => `${item.path.join("/")}/${item.node.label}`)
    .join("\n");
  for (const keyword of ["婚服", "新人", "旁白", "字幕", "音乐", "交付", "分镜"]) {
    assert.match(text, new RegExp(keyword));
  }
  assert.doesNotMatch(text, /传统教学|成绩单|试卷/);
});

test("级联路径可以完整追踪到父亲节点", () => {
  const level6 = flattenWeddingNavigation().find((item) => item.depth === 6);
  assert.equal(level6.path.length, 6);
});
