import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { sha256File } from "./production.mjs";

async function copyWithHash(sourcePath, targetPath) {
  await copyFile(sourcePath, targetPath);
  return {
    name: basename(targetPath),
    path: targetPath,
    sha256: await sha256File(targetPath)
  };
}

export async function createDeliveryPackage({
  outputDir,
  project,
  videoPath,
  subtitlePath,
  editProjectPath,
  technicalQc = {},
  approval = {}
}) {
  if (!videoPath) throw new Error("交付包缺少正式成片");
  await mkdir(outputDir, { recursive: true });
  const files = [];
  files.push(
    await copyWithHash(videoPath, join(outputDir, "婚礼微电影-final.mp4"))
  );
  if (subtitlePath) {
    files.push(
      await copyWithHash(subtitlePath, join(outputDir, "婚礼微电影-final.srt"))
    );
  }
  if (editProjectPath) {
    files.push(
      await copyWithHash(
        editProjectPath,
        join(outputDir, "婚礼微电影-edit-project.json")
      )
    );
  }

  const shotPlanPath = join(outputDir, "shot-plan.json");
  await writeFile(
    shotPlanPath,
    JSON.stringify(
      {
        projectId: project.id,
        duration: project.duration,
        fps: 24,
        shots: project.storyboard || []
      },
      null,
      2
    ),
    "utf8"
  );
  files.push({
    name: basename(shotPlanPath),
    path: shotPlanPath,
    sha256: await sha256File(shotPlanPath)
  });

  const promptPath = join(outputDir, "prompt-history.json");
  await writeFile(
    promptPath,
    JSON.stringify(
      (project.storyboard || []).map((shot) => ({
        shotId: shot.id,
        order: shot.order,
        imagePrompt: shot.imagePrompt || "",
        imagePromptVersion: shot.imagePromptVersion || null,
        videoPrompt: shot.videoPrompt || "",
        videoPromptVersion: shot.videoPromptVersion || null
      })),
      null,
      2
    ),
    "utf8"
  );
  files.push({
    name: basename(promptPath),
    path: promptPath,
    sha256: await sha256File(promptPath)
  });

  const qcPath = join(outputDir, "quality-control.json");
  await writeFile(
    qcPath,
    JSON.stringify({ technical: technicalQc, approval }, null, 2),
    "utf8"
  );
  files.push({
    name: basename(qcPath),
    path: qcPath,
    sha256: await sha256File(qcPath)
  });

  const rightsPath = join(outputDir, "rights-checklist.json");
  await writeFile(
    rightsPath,
    JSON.stringify(
      {
        musicLicense: project.musicLicense || "",
        portraitRights: Boolean(project.photoAssetIds?.groom && project.photoAssetIds?.bride),
        referenceUsageConfirmed: Boolean(project.templateId),
        note: "发布前仍需人工确认肖像、音乐和参考视频授权范围"
      },
      null,
      2
    ),
    "utf8"
  );
  files.push({
    name: basename(rightsPath),
    path: rightsPath,
    sha256: await sha256File(rightsPath)
  });

  const manifest = {
    schema: "xying-delivery-package/v1",
    projectId: project.id,
    projectName: project.name || "婚礼微电影",
    couple: { groom: project.groom || "", bride: project.bride || "" },
    duration: Number(project.duration || 0),
    fps: 24,
    createdAt: new Date().toISOString(),
    rights: {
      musicLicense: project.musicLicense || "",
      portraitRights: Boolean(project.photoAssetIds?.groom && project.photoAssetIds?.bride)
    },
    files
  };
  const manifestPath = join(outputDir, "delivery-manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return { outputDir, manifestPath, manifest };
}
