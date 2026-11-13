import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeRemixReport,
  buildAudioAnalysisPrompt,
  buildReferenceImagePrompt,
  buildReplacementVideoPrompt
} from "../src/remix-report.mjs";

test("抖音报告保留 24 FPS、音轨、字幕和替换映射", () => {
  const report = normalizeRemixReport(
    {
      title: "参考片",
      duration: 8,
      fps: 24,
      recipe: {
        shots: [
          { start: 0, end: 4, action: "牵手", scene: "中式庭院", props: ["红伞"] },
          { start: 4, end: 8, action: "回眸", scene: "灯笼长廊" }
        ]
      }
    },
    {
      audioPath: "original-audio.wav",
      transcript: [{ start: 0.2, end: 3.8, text: "今天我们结婚了" }],
      audioCues: [{ start: 0, end: 8, type: "music", description: "温暖弦乐" }],
      keyFrames: {
        "shot-001": {
          first: "frames/frame-000001.jpg",
          middle: "frames/frame-000049.jpg",
          last: "frames/frame-000096.jpg"
        }
      },
      mapping: { groom: "person-1", bride: "person-2" }
    }
  );

  assert.equal(report.totalFramesAt24, 192);
  assert.equal(report.shots[0].time.framesAt24, 96);
  assert.equal(report.shots[0].mapping.groom, "person-1");
  assert.equal(report.shots[0].subtitles[0].text, "今天我们结婚了");
  assert.equal(report.shots[0].audio.cues[0].description, "温暖弦乐");
  assert.equal(report.shots[0].keyFrames.first, "frames/frame-000001.jpg");
  assert.equal(report.shots[0].visual.props[0], "红伞");
  assert.match(buildAudioAnalysisPrompt(report), /音频/);
  assert.match(
    buildReferenceImagePrompt(report.shots[0], { groom: "陈晨", bride: "林夏" }),
    /图一/
  );
  assert.match(
    buildReplacementVideoPrompt(
      report.shots[0],
      { groom: "陈晨", bride: "林夏" },
      report.shots[0].mapping
    ),
    /101 帧|96 帧/
  );
});

test("报告中的镜头时间和帧数会按 24 FPS 规范输出", () => {
  const report = normalizeRemixReport(
    {
      duration: 4.25,
      recipe: {
        shots: [{ start: 0.5, end: 4.25, action: "走向镜头", camera: "跟拍" }]
      }
    },
    { mapping: { groom: "left", bride: "right" } }
  );

  assert.equal(report.duration, 4.25);
  assert.equal(report.totalFramesAt24, 102);
  assert.equal(report.shots[0].time.start, 0.5);
  assert.equal(report.shots[0].time.end, 4.25);
  assert.equal(report.shots[0].time.framesAt24, 90);
  assert.match(
    buildReplacementVideoPrompt(report.shots[0], {}, report.shots[0].mapping),
    /90 帧/
  );
});
