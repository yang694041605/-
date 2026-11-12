import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStoryTreatment,
  buildStoryboard,
  getFramePlan,
  normalizeProject
} from "../src/story-engine.mjs";

const baseProject = {
  groom: "陈一",
  bride: "苏禾",
  duration: 40,
  theme: "三生三世",
  tone: "东方浪漫",
  city: "杭州",
  story: "我们在大学图书馆认识，后来一起旅行，决定在秋天结婚。"
};

test("总帧数严格按 24 帧/秒计算", () => {
  assert.deepEqual(getFramePlan(40), {
    fps: 24,
    duration: 40,
    totalFrames: 960,
    timecode: "00:00:40:00"
  });
});

test("故事大纲会写入男女主姓名与个人故事", () => {
  const treatment = buildStoryTreatment(baseProject);
  assert.match(treatment.logline, /陈一/);
  assert.match(treatment.logline, /苏禾/);
  assert.match(treatment.acts.map((act) => act.summary).join(" "), /图书馆/);
  assert.equal(treatment.acts.length, 5);
});

test("40 秒分镜覆盖完整时长且镜头总帧数一致", () => {
  const shots = buildStoryboard(baseProject);
  const seconds = shots.reduce((sum, shot) => sum + shot.duration, 0);
  const frames = shots.reduce((sum, shot) => sum + Math.round(shot.duration * 24), 0);
  assert.equal(shots.length, 17);
  assert.equal(seconds, 40);
  assert.equal(frames, 960);
  assert.ok(shots.every((shot) => shot.prompt.includes("陈一") || shot.prompt.includes("苏禾")));
});

test("空人物姓名采用中性占位，不伪造身份", () => {
  const project = normalizeProject({ ...baseProject, groom: "", bride: "" });
  assert.equal(project.groom, "男主角");
  assert.equal(project.bride, "女主角");
});

test("五幕采集内容优先进入故事大纲", () => {
  const treatment = buildStoryTreatment({
    ...baseProject,
    storyBeats: {
      origin: "在校园图书馆第一次见面。",
      knowing: "一起完成毕业旅行。",
      confirm: "毕业后决定去同一座城市。",
      companionship: "周末一起做饭和整理照片。",
      promise: "婚礼当天牵手走远。"
    }
  });
  assert.equal(treatment.acts[0].summary, "在校园图书馆第一次见面。");
  assert.equal(treatment.acts[4].summary, "婚礼当天牵手走远。");
});

test("分镜时长变化后自动回填总帧数", () => {
  const shots = buildStoryboard({ ...baseProject, duration: 30 });
  assert.equal(shots.reduce((sum, shot) => sum + shot.duration, 0), 30);
  assert.equal(shots.reduce((sum, shot) => sum + Math.round(shot.duration * 24), 0), 720);
});
