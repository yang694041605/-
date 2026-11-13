import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWeddingNavigationTree,
  flattenWeddingNavigation,
  resolveWeddingNavigationAction
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
  assert.doesNotMatch(text, /VVV|Remotion/);
});

test("级联路径可以完整追踪到父亲节点", () => {
  const level6 = flattenWeddingNavigation().find((item) => item.depth === 6);
  assert.equal(level6.path.length, 6);
});

test("三级、四级和五级节点都能解析到实际页面与定位目标", () => {
  const tree = buildWeddingNavigationTree();
  const nodes = flattenWeddingNavigation(tree).filter(
    (item) => item.depth >= 3 && item.depth <= 5
  );
  assert.ok(nodes.length > 100);
  for (const { node } of nodes) {
    const action = resolveWeddingNavigationAction(node.id, tree);
    assert.ok(action?.route, `${node.id} 无法解析页面路由`);
    assert.ok(action.path.length >= 3, `${node.id} 缺少完整级联路径`);
    assert.ok(action.path.some((item) => item.id === node.id));
  }
});

test("点击故事步骤会展开祖先菜单并直接打开完整步骤页面", () => {
  const tree = buildWeddingNavigationTree();
  const action = resolveWeddingNavigationAction(
    "step-07",
    tree
  );
  assert.equal(action.route, "step7");
  assert.equal(action.target, "");
  assert.equal(action.node.children?.length || 0, 0);
  assert.ok(action.expandIds.includes("guide-14-steps"));
  assert.ok(action.expandIds.includes("step-07"));
});

test("14 步和抖音复刻步骤不再生成重复的下级子导航", () => {
  const flat = flattenWeddingNavigation();
  assert.equal(
    flat.filter((item) => /^step-\d+-level[4-6]-/.test(item.node.id)).length,
    0
  );
  assert.equal(
    flat.filter((item) => /^remix-level[45]-/.test(item.node.id)).length,
    0
  );
  const workflowSteps = flat.filter((item) =>
    /^step-\d{2}$/.test(item.node.id)
  );
  assert.equal(workflowSteps.length, 14);
  assert.ok(
    workflowSteps.every(
      (item) =>
        item.node.route?.startsWith("step") &&
        !item.node.children?.length
    )
  );
});

test("不再保留与 14 步流程重复的婚礼项目与素材导航", () => {
  const flat = flattenWeddingNavigation();
  assert.equal(
    flat.some((item) => item.node.id === "project-materials"),
    false
  );
  assert.equal(
    flat.some((item) => item.path.includes("婚礼项目与素材")),
    false
  );
});
