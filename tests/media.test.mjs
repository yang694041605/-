import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildAudioMixFilter,
  buildSafeFillFilter,
  sceneCutsToShots
} from "../server/media.mjs";
import { renderOriginalBgm } from "../server/bgm.mjs";

test("模板切点转换为连续 24 FPS 镜头", () => {
  const shots = sceneCutsToShots([1.5, 4, 7.5], 10);
  assert.equal(shots.length, 4);
  assert.equal(shots.at(0).start, 0);
  assert.equal(shots.at(-1).end, 10);
  assert.ok(shots.every((shot) => shot.end > shot.start));
  assert.equal(
    shots.reduce((sum, shot) => sum + shot.framesAt24fps, 0),
    Math.round(10 * 24)
  );
});

test("本地原创配乐输出有效 WAV", async () => {
  const temp = await mkdtemp(join(tmpdir(), "xying-bgm-test-"));
  try {
    const output = join(temp, "score.wav");
    await renderOriginalBgm(output, 2, "warm-cinematic");
    const content = await readFile(output);
    assert.equal(content.subarray(0, 4).toString(), "RIFF");
    assert.equal(content.subarray(8, 12).toString(), "WAVE");
    assert.ok(content.length > 100_000);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("画面归一化默认使用模糊背景而不是黑色补边", () => {
  const filter = buildSafeFillFilter(1280, 720, 24, true);
  assert.match(filter, /gblur/);
  assert.match(filter, /overlay/);
  assert.doesNotMatch(filter, /color=black/);
});

test("旁白出现时音乐通过侧链自动压低", () => {
  const filter = buildAudioMixFilter({
    audioInputs: [
      { loop: true, volume: 0.42 },
      { loop: false, volume: 1 }
    ],
    audioStartIndex: 2,
    pictureDuration: "40.000"
  });
  assert.match(filter, /sidechaincompress/);
  assert.match(filter, /loudnorm=I=-14/);
  assert.match(filter, /musicDucked/);
});
