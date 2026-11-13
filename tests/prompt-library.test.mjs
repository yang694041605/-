import test from "node:test";
import assert from "node:assert/strict";
import {
  buildImagePrompt,
  buildVideoPrompt,
  buildCharacterSheetPrompt,
  promptFingerprintInput
} from "../src/prompt-library.mjs";

const project = {
  groom: "陈一",
  bride: "苏禾",
  city: "杭州",
  aspect: "16:9",
  theme: "三生三世",
  tone: "东方浪漫",
  photoAssetIds: { groom: "asset-groom", bride: "asset-bride" }
};

const shot = {
  id: "shot-07",
  title: "雨中回眸",
  scene: "民国长街 · 夜雨",
  shot: "中近景",
  move: "缓慢横移",
  act: "第二幕 · 相知",
  duration: 4,
  frames: 96,
  prompt: "女主角撑伞回眸，男主角在几步之外停住",
  source: {
    referenceStart: 12,
    referenceEnd: 16
  }
};

test("图片提示词描述稳定瞬间并包含生产字段", () => {
  const prompt = buildImagePrompt(shot, project);
  for (const label of [
    "事实来源",
    "人物参考",
    "身份锁定",
    "服装造型",
    "场景",
    "光线",
    "构图",
    "动作瞬间",
    "负向约束"
  ]) {
    assert.match(prompt, new RegExp(label));
  }
  assert.match(prompt, /陈一/);
  assert.match(prompt, /苏禾/);
  assert.doesNotMatch(prompt, /镜头运动：/);
});

test("视频提示词包含首帧、动作过程和结束状态", () => {
  const prompt = buildVideoPrompt(
    {
      ...shot,
      assets: {
        firstFrame: { assetId: "asset-first-07" },
        video: null,
        finalClip: null
      },
      characters: {
        groom: { target: "left" },
        bride: { target: "right" }
      }
    },
    project
  );
  for (const label of [
    "首帧",
    "起始状态",
    "动作过程",
    "结束状态",
    "镜头运动",
    "切换规则",
    "声音参考",
    "负向约束"
  ]) {
    assert.match(prompt, new RegExp(label));
  }
  assert.match(prompt, /asset-first-07/);
  assert.match(prompt, /左侧人物/);
  assert.match(prompt, /右侧人物/);
});

test("提示词指纹输入会忽略预览文本和版本字段", () => {
  const value = promptFingerprintInput(shot, project);
  assert.equal(value.shotId, "shot-07");
  assert.equal(value.referenceStart, 12);
  assert.equal(value.groom, "陈一");
});

test("角色三视图模板包含全身三视图、局部特写和可编辑人物描述", () => {
  const prompt = buildCharacterSheetPrompt({
    characterDescription: "冷静敏锐的工程师与设备分析人员。"
  });
  for (const label of [
    "16:9横构图",
    "左侧三分之二区域",
    "正面站立视图",
    "正侧面站立视图",
    "背面站立视图",
    "右侧三分之一区域",
    "下巴特写",
    "眉眼特写",
    "额头特写"
  ]) {
    assert.match(prompt, new RegExp(label));
  }
  assert.match(prompt, /冷静敏锐的工程师与设备分析人员/);
  assert.match(prompt, /纯白背景/);
  assert.match(
    prompt,
    /眉眼特写（仅露出眉毛和眼睛区域，严禁出现完整面部、额头和鼻子）/
  );
});
