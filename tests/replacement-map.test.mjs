import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  normalizeReplacementMap,
  validateReplacementClip,
  bindImportedVideo
} from "../src/replacement-map.mjs";
import { REVIEW_CHECKS, shotReviewComplete } from "../src/production-model.mjs";
import { runProcess } from "../server/ark.mjs";

async function startTestServer() {
  const temp = await mkdtemp(join(tmpdir(), "xying-replacement-test-"));
  const port = 5700 + Math.floor(Math.random() * 250);
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
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) {
        return { child, temp, base };
      }
    } catch {
      // Keep waiting for the isolated server.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  child.kill();
  throw new Error("替换视频测试服务启动失败");
}

async function stopTestServer(child, temp) {
  child.kill();
  await new Promise((resolveWait) => {
    if (child.exitCode !== null) return resolveWait();
    child.once("exit", resolveWait);
    setTimeout(resolveWait, 2000);
  });
  await rm(temp, { recursive: true, force: true });
}

test("男女主替换目标不能相同，道具只能引用资产 ID", () => {
  const value = normalizeReplacementMap({
    groom: { target: "person-1", sourceAssetId: "asset-groom" },
    bride: { target: "person-2", sourceAssetId: "asset-bride" },
    props: [{ target: "prop-1", sourceAssetId: "asset-flower", description: "红伞" }]
  });
  assert.equal(value.groom.target, "person-1");
  assert.equal(value.props[0].sourceAssetId, "asset-flower");
  assert.throws(
    () =>
      normalizeReplacementMap({
        groom: { target: "left", sourceAssetId: "asset-groom" },
        bride: { target: "left", sourceAssetId: "asset-bride" }
      }),
    /不能相同/
  );
  assert.throws(
    () =>
      normalizeReplacementMap({
        groom: { target: "left", sourceAssetId: "asset-groom" },
        bride: { target: "right", sourceAssetId: "asset-bride" },
        props: [{ target: "prop-1", sourceAssetId: "C:\\private\\flower.jpg" }]
      }),
    /资产 ID/
  );
});

test("导入视频必须匹配镜头时长、视频轨和画幅", () => {
  const mapping = normalizeReplacementMap({
    groom: { target: "left", sourceAssetId: "asset-groom" },
    bride: { target: "right", sourceAssetId: "asset-bride" }
  });
  const result = validateReplacementClip({
    shot: { frames: 96, duration: 4, aspect: "16:9" },
    asset: {
      id: "asset-video",
      media: { duration: 4.02, video: { width: 1280, height: 720 } }
    },
    mapping
  });
  assert.equal(result.ok, true);
  assert.equal(result.shotFrames, 96);
  assert.throws(
    () =>
      validateReplacementClip({
        shot: { frames: 96, duration: 4, aspect: "16:9" },
        asset: {
          id: "asset-video",
          media: { duration: 4, video: { width: 720, height: 1280 } }
        },
        mapping
      }),
    /画幅/
  );
});

test("导入新视频会绑定资产哈希并清空全部九项审核", () => {
  const bound = bindImportedVideo(
    {
      id: "shot-1",
      duration: 4,
      frames: 96,
      assets: { firstFrame: { assetId: "asset-frame" } },
      review: Object.fromEntries(REVIEW_CHECKS.map((key) => [key, "passed"]))
    },
    {
      id: "asset-video",
      contentHash: "hash-video",
      localPath: "E:\\private\\video.mp4"
    },
    normalizeReplacementMap({
      groom: { target: "left", sourceAssetId: "asset-groom" },
      bride: { target: "right", sourceAssetId: "asset-bride" },
      props: [{ target: "prop-1", sourceAssetId: "asset-flower", description: "红伞" }]
    })
  );
  assert.equal(REVIEW_CHECKS.length, 9);
  assert.equal(bound.assets.video.assetId, "asset-video");
  assert.equal(bound.assets.finalClip.hash, "hash-video");
  assert.deepEqual(
    REVIEW_CHECKS.map((key) => bound.review[key]),
    Array(9).fill("pending")
  );
  assert.equal(shotReviewComplete(bound.review), false);
  assert.equal(bound.characters.groom.target, "left");
  assert.equal(bound.replacement.props[0].sourceAssetId, "asset-flower");
  assert.doesNotMatch(JSON.stringify(bound), /E:\\\\private/);
});

test("导入视频接口只接收上传文件并更新镜头时间轴版本", { timeout: 30000 }, async () => {
  const { child, temp, base } = await startTestServer();
  try {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0YQAAAAASUVORK5CYII=",
      "base64"
    );
    const photoIds = {};
    for (const role of ["groom", "bride"]) {
      const response = await fetch(
        `${base}/api/projects/project-default/photos?role=${role}&name=${role}.png`,
        {
          method: "POST",
          headers: { "Content-Type": "image/png" },
          body: png
        }
      );
      assert.equal(response.status, 201);
      photoIds[role] = (await response.json()).asset.id;
    }
    const passedReview = Object.fromEntries(
      REVIEW_CHECKS.map((key) => [key, "passed"])
    );
    const shot = {
      id: "shot-import-1",
      duration: 4,
      frames: 96,
      aspect: "16:9",
      characters: {
        groom: { target: "left", referenceAssetId: photoIds.groom },
        bride: { target: "right", referenceAssetId: photoIds.bride }
      },
      assets: {
        firstFrame: { assetId: "asset-frame", hash: "frame-hash" },
        video: { assetId: "asset-old", hash: "old-hash" },
        finalClip: { assetId: "asset-old", hash: "old-hash" }
      },
      review: passedReview,
      status: "approved"
    };
    const projectResponse = await fetch(
      `${base}/api/projects/project-default`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "remix",
          aspect: "16:9",
          photoAssetIds: photoIds,
          remixTargets: { groom: "left", bride: "right" },
          storyboard: [shot],
          remixStoryboard: [shot],
          timelineRevision: 3
        })
      }
    );
    assert.equal(projectResponse.status, 200);

    const videoPath = join(temp, "replacement.mp4");
    await runProcess("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x7b2233:s=320x180:d=4:r=24",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      videoPath
    ]);
    const video = await readFile(videoPath);
    const response = await fetch(
      `${base}/api/projects/project-default/shots/${shot.id}/import-video?name=replacement.mp4`,
      {
        method: "POST",
        headers: { "Content-Type": "video/mp4" },
        body: video
      }
    );
    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.shot.status, "video_ready");
    assert.ok(payload.shot.assets.video.assetId);
    assert.equal(
      payload.shot.assets.video.assetId,
      payload.shot.assets.finalClip.assetId
    );
    assert.equal(
      REVIEW_CHECKS.every((key) => payload.shot.review[key] === "pending"),
      true
    );
    assert.equal(payload.item.timelineRevision, 4);
    assert.equal(payload.shot.characters.groom.target, "left");
    assert.equal(payload.shot.characters.bride.target, "right");
  } finally {
    await stopTestServer(child, temp);
  }
});
