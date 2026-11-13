import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runProcess } from "../server/ark.mjs";

async function startServer() {
  const temp = await mkdtemp(join(tmpdir(), "xying-complete-flow-"));
  const port = 4900 + Math.floor(Math.random() * 500);
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: resolve("."),
    env: {
      ...process.env,
      PORT: String(port),
      XYING_DATA_DIR: temp,
      XYING_DB_PATH: join(temp, "test.db")
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return { child, temp, base };
    } catch {
      // Keep waiting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  child.kill();
  throw new Error(`测试服务启动失败：${output}`);
}

async function stopServer(child, temp) {
  child.kill();
  await new Promise((resolveWait) => {
    if (child.exitCode !== null) return resolveWait();
    child.once("exit", resolveWait);
    setTimeout(resolveWait, 2000);
  });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await rm(temp, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
}

async function jsonRequest(base, path, method = "GET", body = undefined) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

async function upload(base, path, kind, projectId) {
  const content = await readFile(path);
  const response = await fetch(
    `${base}/api/assets/upload?kind=${encodeURIComponent(kind)}&projectId=${encodeURIComponent(projectId)}&name=${encodeURIComponent(path.split(/[\\/]/).at(-1))}`,
    {
      method: "POST",
      headers: { "Content-Type": kind === "video" ? "video/mp4" : kind === "image" || kind === "photo" ? "image/png" : "audio/wav" },
      body: content
    }
  );
  const payload = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(payload));
  return payload.item;
}

async function approve(base, projectId, step) {
  return jsonRequest(base, `/api/projects/${projectId}/workflow/approve`, "POST", {
    mode: "story",
    step,
    confirmText: "确认当前版本",
    evidence: `集成验收第 ${step} 步`
  });
}

async function waitForJob(base, jobId) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const payload = await jsonRequest(base, `/api/jobs/${jobId}`);
    if (payload.item.status === "succeeded") return payload.item;
    if (["failed", "cancelled", "unknown"].includes(payload.item.status)) {
      throw new Error(payload.item.error || payload.item.status);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error("任务超时");
}

test("完整 1-14 步可以生成预览和交付包", { timeout: 180000 }, async () => {
  const { child, temp, base } = await startServer();
  try {
    const projectId = "project-default";
    const imageA = join(temp, "groom.png");
    const imageB = join(temp, "bride.png");
    const voiceFile = join(temp, "voice.wav");
    const musicFile = join(temp, "music.wav");
    const videoA = join(temp, "shot-01.mp4");
    const videoB = join(temp, "shot-02.mp4");
    await runProcess("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=0x7b2233:s=320x320", "-frames:v", "1", imageA]);
    await runProcess("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=0xddccbb:s=320x320", "-frames:v", "1", imageB]);
    await runProcess("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=8", "-ac", "2", voiceFile]);
    await runProcess("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=8", "-ac", "2", musicFile]);
    await runProcess("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=0x551122:s=320x180:d=4:r=24", "-c:v", "libx264", "-pix_fmt", "yuv420p", videoA]);
    await runProcess("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=0x224455:s=320x180:d=4:r=24", "-c:v", "libx264", "-pix_fmt", "yuv420p", videoB]);

    const groomPhoto = await upload(base, imageA, "photo", projectId);
    const bridePhoto = await upload(base, imageB, "photo", projectId);
    const voice = await upload(base, voiceFile, "voice", projectId);
    const music = await upload(base, musicFile, "music", projectId);
    const firstImage = await upload(base, imageA, "image", projectId);
    const secondImage = await upload(base, imageB, "image", projectId);
    const firstVideo = await upload(base, videoA, "video", projectId);
    const secondVideo = await upload(base, videoB, "video", projectId);

    const act = (label, title) => ({ label, title, summary: title, era: "今生" });
    const shots = [
      {
        id: "shot-01",
        number: 1,
        order: 1,
        start: 0,
        end: 4,
        frames: 96,
        title: "初见",
        scene: "婚礼庭院",
        shot: "中景",
        move: "缓慢推进",
        act: "第一幕 · 相识",
        prompt: "两人第一次牵手",
        promptVersion: { version: 1, hash: "p1", text: "两人第一次牵手" },
        source: { mode: "story" },
        characters: { groom: { target: "left" }, bride: { target: "right" } },
        assets: { firstFrame: null, video: null, finalClip: null },
        review: {},
        status: "draft"
      },
      {
        id: "shot-02",
        number: 2,
        order: 2,
        start: 4,
        end: 8,
        frames: 96,
        title: "承诺",
        scene: "婚礼正厅",
        shot: "近景",
        move: "静止微推",
        act: "第五幕 · 承诺",
        prompt: "两人交换誓言",
        promptVersion: { version: 1, hash: "p2", text: "两人交换誓言" },
        source: { mode: "story" },
        characters: { groom: { target: "left" }, bride: { target: "right" } },
        assets: { firstFrame: null, video: null, finalClip: null },
        review: {},
        status: "draft"
      }
    ];
    await jsonRequest(base, `/api/projects/${projectId}`, "PUT", {
      name: "完整流程验收",
      groom: "陈一",
      bride: "苏禾",
      weddingDate: "2026-12-20",
      city: "杭州",
      duration: 8,
      storyDuration: 8,
      fps: 24,
      aspect: "16:9",
      story: "我们在校园初次相遇，后来一起旅行，在异地互相陪伴，今天终于举行婚礼。",
      storyBeats: {
        origin: "校园初次相遇",
        knowing: "一起旅行",
        confirm: "决定在同一座城市生活",
        companionship: "异地期间互相陪伴",
        promise: "今天举行婚礼"
      },
      photos: { groom: groomPhoto.url, bride: bridePhoto.url },
      photoAssetIds: { groom: groomPhoto.id, bride: bridePhoto.id },
      treatment: {
        logline: "陈一与苏禾的真实爱情",
        acts: [
          act("第一幕", "相识"),
          act("第二幕", "相知"),
          act("第三幕", "确认"),
          act("第四幕", "相伴"),
          act("第五幕", "承诺")
        ]
      },
      storyboard: shots,
      storyStoryboard: shots,
      timelineSelection: { voiceAssetId: voice.id, musicAssetId: music.id },
      musicLicense: "测试原创音乐授权",
      workflow: { currentStep: 1, approvals: {} }
    });

    for (const step of [1, 2, 3, 4, 5, 6]) {
      await approve(base, projectId, step);
    }
    for (const [index, shot] of shots.entries()) {
      const image = index === 0 ? firstImage : secondImage;
      await jsonRequest(base, `/api/projects/${projectId}/shots/${shot.id}`, "PUT", {
        mode: "story",
        imagePrompt: `图片提示词 ${shot.id}`,
        assets: {
          ...shot.assets,
          firstFrame: { assetId: image.id, hash: image.contentHash }
        },
        imageStatus: "approved",
        imageReview: {
          identity: "passed",
          sameCouple: "passed",
          hands: "passed",
          costume: "passed",
          composition: "passed",
          reviewedBy: "producer",
          reviewedAt: new Date().toISOString()
        }
      });
    }
    await approve(base, projectId, 7);
    await approve(base, projectId, 8);

    for (const [index, shot] of shots.entries()) {
      const video = index === 0 ? firstVideo : secondVideo;
      await jsonRequest(base, `/api/projects/${projectId}/shots/${shot.id}`, "PUT", {
        mode: "story",
        videoPrompt: `视频提示词 ${shot.id}`,
        assets: {
          firstFrame: shot.assets.firstFrame || {
            assetId: (index === 0 ? firstImage : secondImage).id,
            hash: (index === 0 ? firstImage : secondImage).contentHash
          },
          video: { assetId: video.id, hash: video.contentHash },
          finalClip: { assetId: video.id, hash: video.contentHash }
        },
        review: {
          identity: "passed",
          crossFace: "passed",
          hands: "passed",
          actionMatch: "passed",
          prop: "passed",
          backgroundDrift: "passed",
          blackBars: "passed",
          subtitleSafety: "passed",
          audioSync: "passed",
          reviewedBy: "producer",
          reviewedAt: new Date().toISOString()
        },
        status: "approved"
      });
    }
    await approve(base, projectId, 9);
    await approve(base, projectId, 10);
    await jsonRequest(base, `/api/projects/${projectId}/mix/sample`, "POST", { start: 0, duration: 4 });
    await approve(base, projectId, 11);
    await jsonRequest(base, `/api/projects/${projectId}/mix/full`, "POST", {});
    await approve(base, projectId, 12);
    await jsonRequest(base, `/api/subtitles`, "POST", {
      projectId,
      duration: 8,
      text: "陈一与苏禾从相识走到婚礼。愿余生朝朝暮暮岁岁平安。",
      title: "完整流程字幕"
    });
    const timeline = await jsonRequest(base, `/api/projects/${projectId}/timeline?mode=story`);
    const previewResponse = await jsonRequest(
      base,
      `/api/projects/${projectId}/preview`,
      "POST",
      { mode: "story", timelineHash: timeline.item.hash }
    );
    await waitForJob(base, previewResponse.job.id);
    await approve(base, projectId, 13);
    const delivery = await jsonRequest(
      base,
      `/api/projects/${projectId}/delivery`,
      "POST",
      { mode: "story" }
    );
    assert.ok(delivery.item.manifest.files.some((file) => file.name.endsWith(".mp4")));
    await approve(base, projectId, 14);
  } finally {
    await stopServer(child, temp);
  }
});
