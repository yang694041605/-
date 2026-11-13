import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDeliveryPackage } from "../server/delivery.mjs";

test("交付包包含成片、字幕、工程、镜头表、提示词、质检和哈希清单", async () => {
  const temp = await mkdtemp(join(tmpdir(), "xying-delivery-test-"));
  try {
    const video = join(temp, "film.mp4");
    const subtitle = join(temp, "film.srt");
    const editProject = join(temp, "edit-project.json");
    await writeFile(video, "video");
    await writeFile(subtitle, "1\n00:00:00,000 --> 00:00:02,000\n测试\n");
    await writeFile(editProject, "{}");
    const result = await createDeliveryPackage({
      outputDir: join(temp, "delivery"),
      project: {
        id: "project-test",
        name: "测试婚礼",
        groom: "陈一",
        bride: "苏禾",
        duration: 40,
        musicLicense: "测试授权",
        storyboard: [
          {
            id: "shot-01",
            order: 1,
            imagePrompt: "图片提示词",
            videoPrompt: "视频提示词",
            review: { identity: "passed" }
          }
        ]
      },
      videoPath: video,
      subtitlePath: subtitle,
      editProjectPath: editProject,
      technicalQc: { ok: true },
      approval: { step: 13, fingerprint: "approved" }
    });
    assert.ok(result.manifest.files.length >= 6);
    assert.equal(result.manifest.rights.musicLicense, "测试授权");
    const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
    assert.equal(manifest.projectId, "project-test");
    assert.ok(manifest.files.every((file) => file.sha256.length === 64));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
