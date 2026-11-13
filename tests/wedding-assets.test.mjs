import test from "node:test";
import assert from "node:assert/strict";
import { stat, readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("婚礼页面引用的参考图片真实存在且不是空占位", async () => {
  const manifest = JSON.parse(
    await readFile(resolve("public/wedding-assets/manifest.json"), "utf8")
  );
  assert.ok(manifest.assets.length >= 8);
  for (const asset of manifest.assets) {
    const info = await stat(resolve("public/wedding-assets", asset.file));
    assert.ok(info.size > 10_000, `${asset.file} 图片过小`);
    assert.ok(asset.title);
    assert.ok(asset.source);
  }
  assert.ok(Array.isArray(manifest.failures));
});
