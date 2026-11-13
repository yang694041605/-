import test from "node:test";
import assert from "node:assert/strict";
import {
  findAssetReferences,
  isVisualAsset
} from "../server/asset-lifecycle.mjs";

test("素材引用检查能识别项目镜头、模板与任务记录", () => {
  const asset = {
    id: "asset-groom-01",
    url: "/media/assets/asset-groom-01/photo.jpg",
    localPath: "E:\\婚礼微电影\\data\\media\\assets\\asset-groom-01\\photo.jpg"
  };
  const references = findAssetReferences(asset, [
    {
      type: "project",
      items: [
        {
          id: "project-default",
          name: "沈知远与林晚晴",
          photoAssetIds: { groom: asset.id }
        }
      ]
    },
    {
      type: "template",
      items: [{ id: "template-01", title: "古代婚礼模板", videoUrl: asset.url }]
    },
    {
      type: "job",
      items: [{ id: "job-01", kind: "video-generation", input: [asset.id] }]
    }
  ]);

  assert.deepEqual(references, [
    "项目“沈知远与林晚晴”",
    "模板“古代婚礼模板”",
    "任务“video-generation”"
  ]);
});

test("未被引用的图片和视频可进入删除流程，音频不会误删", () => {
  assert.equal(isVisualAsset({ kind: "project-photo" }), true);
  assert.equal(isVisualAsset({ kind: "character-reference" }), true);
  assert.equal(isVisualAsset({ kind: "batch-image" }), true);
  assert.equal(isVisualAsset({ kind: "preview" }), true);
  assert.equal(isVisualAsset({ kind: "music" }), false);
  assert.equal(
    findAssetReferences(
      { id: "asset-free", url: "/media/free.jpg" },
      [{ type: "project", items: [{ id: "project-other", story: "无关内容" }] }]
    ).length,
    0
  );
});
