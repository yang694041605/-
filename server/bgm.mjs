import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const SAMPLE_RATE = 44100;

function midi(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function envelope(t, duration, attack = 0.02, release = 0.7) {
  const attackGain = Math.min(1, t / attack);
  const releaseGain = Math.min(1, Math.max(0, (duration - t) / release));
  return Math.max(0, attackGain * releaseGain);
}

function addTone(left, right, start, duration, frequency, gain, pan = 0) {
  const startIndex = Math.max(0, Math.floor(start * SAMPLE_RATE));
  const endIndex = Math.min(left.length, Math.floor((start + duration) * SAMPLE_RATE));
  const leftGain = gain * Math.sqrt((1 - pan) / 2);
  const rightGain = gain * Math.sqrt((1 + pan) / 2);
  for (let index = startIndex; index < endIndex; index += 1) {
    const t = index / SAMPLE_RATE - start;
    const env = envelope(t, duration);
    const value =
      Math.sin(2 * Math.PI * frequency * t) * 0.62 +
      Math.sin(2 * Math.PI * frequency * 2 * t) * 0.18 +
      Math.sin(2 * Math.PI * frequency * 3 * t) * 0.06;
    left[index] += value * env * leftGain;
    right[index] += value * env * rightGain;
  }
}

function writeWav(buffer, channels, sampleRate) {
  const dataLength = buffer.length * 2;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);
  const pcm = Buffer.alloc(dataLength);
  for (let index = 0; index < buffer.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, buffer[index]));
    pcm.writeInt16LE(Math.round(sample * 32767), index * 2);
  }
  return Buffer.concat([header, pcm]);
}

export async function renderOriginalBgm(outputPath, duration = 40, mood = "warm-cinematic") {
  await mkdir(dirname(outputPath), { recursive: true });
  const totalSamples = Math.ceil(duration * SAMPLE_RATE);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  const progression = [
    { bass: 38, notes: [62, 66, 69, 73] },
    { bass: 35, notes: [59, 62, 66, 69] },
    { bass: 43, notes: [67, 71, 74, 78] },
    { bass: 45, notes: [64, 69, 73, 76] }
  ];
  const beat = 60 / 78;
  const bar = beat * 4;

  for (let time = 0, barIndex = 0; time < duration; time += bar, barIndex += 1) {
    const chord = progression[barIndex % progression.length];
    addTone(left, right, time, bar, midi(chord.bass), 0.12, 0);
    chord.notes.forEach((note, index) => {
      addTone(
        left,
        right,
        time + (index * beat) / 2,
        Math.min(bar, duration - time),
        midi(note),
        0.055,
        -0.45 + index * 0.3
      );
    });
    if (mood === "bright-romantic") {
      const melody = [74, 78, 81, 78, 76, 73, 76, 74];
      melody.forEach((note, index) => {
        const start = time + index * beat * 0.5;
        if (start < duration) {
          addTone(left, right, start, beat * 0.46, midi(note), 0.038, 0.25);
        }
      });
    }
  }

  const mix = new Float32Array(totalSamples * 2);
  const fade = Math.max(1, Math.floor(duration * 0.04 * SAMPLE_RATE));
  for (let index = 0; index < totalSamples; index += 1) {
    const fadeIn = Math.min(1, index / fade);
    const fadeOut = Math.min(1, (totalSamples - index) / fade);
    const gain = Math.min(fadeIn, fadeOut);
    mix[index * 2] = left[index] * gain;
    mix[index * 2 + 1] = right[index] * gain;
  }
  await writeFile(outputPath, writeWav(mix, 2, SAMPLE_RATE));
  return outputPath;
}
