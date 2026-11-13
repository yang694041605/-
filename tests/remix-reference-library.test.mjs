import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRemixShotPromptLibrary,
  remixPromptLibraryStats
} from "../src/remix-reference-library.mjs";

test("参考片每镜生成图片、视频和替换提示词", () => {
  const items = buildRemixShotPromptLibrary(
    {
      id: "template-reference",
      recipe: {
        shots: [
          {
            start: 0,
            end: 2,
            framesAt24fps: 48,
            transition: "开场"
          },
          {
            start: 2,
            end: 4.5,
            framesAt24fps: 60,
            transition: "硬切"
          }
        ]
      },
      remixAnalysis: {
        shots: [
          { prompt: "参考片镜头一：新娘端坐，镜头缓慢推进。" },
          { prompt: "参考片镜头二：新郎进入庭院，人物并肩。" }
        ]
      }
    },
    { groom: "杨兴文", bride: "杨志会" }
  );

  assert.equal(items.length, 2);
  assert.equal(items[0].frames, 48);
  assert.match(items[0].keyFrames.first, /frame-000001\.jpg/);
  assert.match(items[0].imagePrompt, /杨兴文/);
  assert.match(items[0].imagePrompt, /新娘端坐/);
  assert.match(items[0].videoPrompt, /2\.000 秒|48 帧/);
  assert.match(items[0].replacementPrompt, /人物映射/);
  assert.deepEqual(remixPromptLibraryStats(items), {
    shots: 2,
    frames: 108,
    imagePrompts: 2,
    videoPrompts: 2,
    replacementPrompts: 2
  });
});

test("连续镜头按帧边界拆分后总帧数不漂移", () => {
  const items = buildRemixShotPromptLibrary({
    id: "template-rounding",
    recipe: {
      shots: [
        { start: 0, end: 1.3 },
        { start: 1.3, end: 2.6 }
      ]
    }
  });
  assert.equal(
    items.reduce((sum, item) => sum + item.frames, 0),
    62
  );
});
