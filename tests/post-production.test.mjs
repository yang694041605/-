import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProcess } from "../server/ark.mjs";
import { renderOriginalBgm } from "../server/bgm.mjs";
import {
  inspectAudioMix,
  renderFullMix,
  renderMixSample
} from "../server/post-production.mjs";

test("试混与完整混音生成真实可播放音频", { timeout: 60000 }, async () => {
  const temp = await mkdtemp(join(tmpdir(), "xying-mix-test-"));
  try {
    const voice = join(temp, "voice.wav");
    const music = join(temp, "music.wav");
    await runProcess("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000:duration=4",
      "-ac",
      "2",
      voice
    ]);
    await renderOriginalBgm(music, 8, "warm-cinematic");
    const sample = join(temp, "sample.wav");
    await renderMixSample({
      voicePath: voice,
      musicPath: music,
      outputPath: sample,
      start: 0,
      duration: 3
    });
    const full = join(temp, "full.wav");
    await renderFullMix({
      voicePath: voice,
      musicPath: music,
      outputPath: full,
      duration: 4
    });
    assert.ok((await stat(sample)).size > 100000);
    assert.ok((await stat(full)).size > 100000);
    const info = await inspectAudioMix(full);
    assert.equal(info.audioChannels, 2);
    assert.ok(info.duration >= 3.9 && info.duration <= 4.1);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
