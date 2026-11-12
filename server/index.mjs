import { createServer } from "node:http";
import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { basename, extname, join, normalize, relative, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import {
  deleteEntity,
  getEntity,
  id,
  listEntities,
  saveEntity,
  seedDefaults,
  updateEntity
} from "./db.mjs";
import { dataRoot, mediaRoot, projectRoot } from "./paths.mjs";
import {
  arkAuthStatus,
  arkResources,
  chatText,
  generateImage,
  queryVideoTask,
  runProcess,
  submitVideo,
  understandMedia
} from "./ark.mjs";
import {
  detectSceneCuts,
  extractContactSheets,
  extractCover,
  extractVideoSegment,
  inferExtension,
  inspectRenderedQuality,
  probeMedia,
  renderTimeline,
  runAdvancedMediaCheck,
  sceneCutsToShots,
  transcribeWithWhisper,
  verifyMedia
} from "./media.mjs";
import { synthesizeSapi, synthesizeVoice } from "./voice.mjs";
import { renderOriginalBgm } from "./bgm.mjs";
import {
  generatePollinationsImage,
  generatePollinationsText
} from "./pollinations.mjs";
import { checkVvv, createVvvProject, findVvvRoot } from "./vvv.mjs";
import {
  approvalSnapshot,
  approveStep,
  assertInside,
  buildProjectTimeline,
  remixWorkflowReady,
  rejectFilesystemPathKeys,
  sha256File,
  sha256Text,
  storyWorkflowReady,
  validateRenderTimeline
} from "./production.mjs";
import {
  approvalIsCurrent,
  shotReviewComplete,
  splitSubtitleText
} from "../src/production-model.mjs";
import {
  buildFrameExtractionPlan,
  buildRemixShotPlan,
  extractRemixFrames,
  normalizeReplacementTargets,
  resolveRemixRange,
  sliceSrt,
  transcriptToSrt
} from "./remix.mjs";

seedDefaults();
migrateProjectRecords();
normalizeModelDefaults();
migrateInterruptedJobs();
await migrateAssetHashes();
await migrateRemixSubtitles();

const port = Number(process.env.PORT || 4173);
const host = "127.0.0.1";
const maxJsonBody = 12 * 1024 * 1024;
const resumeTimers = new Set();
const allowedOrigins = new Set(
  [
    `http://${host}:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
    ...(process.env.XYING_ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  ]
);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".srt": "application/x-subrip; charset=utf-8"
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || host}`);
    if (url.pathname.startsWith("/api/")) {
      const origin = request.headers.origin || "";
      if (origin && !allowedOrigins.has(origin)) {
        sendJson(response, 403, {
          ok: false,
          error: "拒绝来自未授权页面的本地服务请求"
        });
        return;
      }
      setCors(response, origin);
      await handleApi(request, response, url);
      return;
    }
    if (url.pathname.startsWith("/media/")) {
      await serveFile(response, resolve(mediaRoot, `.${url.pathname.slice("/media".length)}`), mediaRoot);
      return;
    }
    const requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    await serveFile(response, resolve(projectRoot, `.${requested}`), projectRoot);
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: safeError(error)
    });
  }
});

server.listen(port, host, () => {
  console.log(`囍映 AI 1.0 已启动：http://${host}:${port}`);
});

resumeVideoJobs();

async function handleApi(request, response, url) {
  const method = request.method || "GET";
  const path = url.pathname;
  if (method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (method === "GET" && path === "/api/health") {
    const auth = await arkAuthStatus().catch((error) => ({ error: error.message }));
    return sendJson(response, 200, {
      ok: true,
      service: "xying-wedding-film-studio",
      version: "1.0.0",
      arkAuth: {
        loggedIn: Boolean(auth.logged_in),
        method: auth.auth_method || "",
        profile: auth.active_profile?.name || "",
        controlPlane: auth.control_plane_auth?.status || ""
      }
    });
  }

  if (method === "GET" && path === "/api/bootstrap") {
    return sendJson(response, 200, {
      ok: true,
      projects: listEntities("project"),
      templates: listEntities("template"),
      models: listEntities("model"),
      looks: listEntities("look"),
      assets: listEntities("asset"),
      exports: listEntities("export"),
      jobs: listEntities("job", 50)
    });
  }

  if (path === "/api/projects" && method === "GET") {
    return sendJson(response, 200, { ok: true, items: listEntities("project") });
  }

  if (path === "/api/projects" && method === "POST") {
    const body = await readJson(request);
    try {
      rejectFilesystemPathKeys(body);
    } catch (error) {
      return sendJson(response, 400, { ok: false, error: safeError(error) });
    }
    const project = saveEntity("project", {
      ...body,
      id: body.id || id("project"),
      mode: body.mode === "remix" ? "remix" : "story",
      storyDuration: Number(body.storyDuration || body.duration || 40),
      remixDuration: Number(body.remixDuration || 0),
      storyStoryboard: body.storyStoryboard || (body.mode !== "remix" ? body.storyboard || [] : []),
      remixStoryboard: body.remixStoryboard || (body.mode === "remix" ? body.storyboard || [] : []),
      status: body.status || "draft"
    });
    return sendJson(response, 201, { ok: true, item: project });
  }

  const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch && method === "GET") {
    const project = getEntity("project", projectMatch[1]);
    return project
      ? sendJson(response, 200, { ok: true, item: project })
      : sendJson(response, 404, { ok: false, error: "项目不存在" });
  }
  if (projectMatch && method === "PUT") {
    const body = await readJson(request);
    try {
      rejectFilesystemPathKeys(body);
    } catch (error) {
      return sendJson(response, 400, { ok: false, error: safeError(error) });
    }
    const project = updateEntity("project", projectMatch[1], body);
    return project
      ? sendJson(response, 200, { ok: true, item: project })
      : sendJson(response, 404, { ok: false, error: "项目不存在" });
  }

  const projectTimelineMatch = path.match(/^\/api\/projects\/([^/]+)\/timeline$/);
  if (projectTimelineMatch && method === "GET") {
    const project = getEntity("project", projectTimelineMatch[1]);
    if (!project) return sendJson(response, 404, { ok: false, error: "项目不存在" });
    const requestedMode = url.searchParams.get("mode") || project.mode || "story";
    const projectView = projectForMode(project, requestedMode);
    const assets = projectAssets(project.id);
    const timeline = buildProjectTimeline(
      projectView,
      assets,
      Number(project.timelineRevision) || 1
    );
    const maxStep = projectView.mode === "remix" ? 4 : 14;
    const approvalSnapshots = Object.fromEntries(
      Array.from({ length: maxStep }, (_, index) => {
        const step = index + 1;
        return [
          step,
          approvalSnapshot(projectView, assets, {
            mode: projectView.mode,
            step
          })
        ];
      })
    );
    return sendJson(response, 200, {
      ok: true,
      item: timeline,
      approvalSnapshot: approvalSnapshot(projectView, assets, {
        mode: projectView.mode,
        step: Number(
          (projectView.mode === "remix"
            ? project.remixWorkflow?.currentStep
            : project.workflow?.currentStep) || 1
        )
      }),
      approvalSnapshots,
      workflow:
        projectView.mode === "remix" ? project.remixWorkflow : project.workflow
    });
  }

  const projectRenderMatch = path.match(/^\/api\/projects\/([^/]+)\/render-timeline$/);
  if (projectRenderMatch && method === "POST") {
    const project = getEntity("project", projectRenderMatch[1]);
    if (!project) return sendJson(response, 404, { ok: false, error: "项目不存在" });
    const body = await readJson(request);
    const projectView = projectForMode(
      project,
      body.mode || url.searchParams.get("mode") || project.mode
    );
    const assets = projectAssets(project.id);
    const timeline = buildProjectTimeline(
      projectView,
      assets,
      Number(project.timelineRevision) || 1
    );
    if (body.timelineHash && body.timelineHash !== timeline.hash) {
      return sendJson(response, 409, {
        ok: false,
        error: "时间轴已变化，请重新检查并确认当前版本"
      });
    }
    const requiredStep = projectView.mode === "remix" ? 3 : 9;
    const workflow =
      projectView.mode === "remix" ? project.remixWorkflow : project.workflow;
    const renderApproval = workflow?.approvals?.[requiredStep];
    const renderSnapshot = approvalSnapshot(projectView, assets, {
      mode: projectView.mode,
      step: requiredStep
    });
    if (!approvalIsCurrent(renderApproval, renderSnapshot)) {
      return sendJson(response, 409, {
        ok: false,
        error:
          projectView.mode === "remix"
            ? "复刻第 3 步尚未按当前素材确认，或素材已变化"
            : "故事第 9 步尚未按当前素材确认，或素材已变化"
      });
    }
    let resolved;
    try {
      resolved = validateRenderTimeline(projectView, timeline, assets);
    } catch (error) {
      return sendJson(response, 409, { ok: false, error: safeError(error) });
    }
    const voice = resolved.voiceAssets[0];
    const music = resolved.musicAssets[0];
    const subtitle = resolved.subtitleAssets[0];
    const musicTrack = (timeline.tracks.music || []).find(
      (track) => track.assetId === music?.id
    );
    const job = createJob("timeline-render", {
      projectId: project.id,
      input: {
        title: project.name || "婚礼微电影",
        mode: projectView.mode,
        duration: resolved.duration,
        fps: timeline.fps,
        width: 1280,
        height: 720,
        clips: resolved.clips.map((clip) => ({
          path: clip.path,
          start: clip.start,
          duration: clip.duration,
          shotId: clip.shotId,
          assetId: clip.asset.id,
          contentHash: clip.asset.contentHash || clip.asset.sha256 || ""
        })),
        voicePath: voice?.localPath || "",
        musicPath: music?.localPath || "",
        musicStart: Number(musicTrack?.sourceStart || 0),
        subtitlePath: subtitle?.localPath || "",
        autoMusic: !music,
        mood: project.musicMood || "warm-cinematic",
        timelineHash: timeline.hash,
        timelineRevision: timeline.revision,
        timeline
      }
    });
    queueJob(job.id, () => renderJob(job.id));
    return sendJson(response, 202, { ok: true, job });
  }

  const projectApproveMatch = path.match(
    /^\/api\/projects\/([^/]+)\/workflow\/approve$/
  );
  if (projectApproveMatch && method === "POST") {
    const project = getEntity("project", projectApproveMatch[1]);
    if (!project) return sendJson(response, 404, { ok: false, error: "项目不存在" });
    const body = await readJson(request);
    const mode = body.mode === "remix" ? "remix" : "story";
    const step = Number(body.step);
    const maximum = mode === "remix" ? 4 : 14;
    if (!Number.isInteger(step) || step < 1 || step > maximum) {
      return sendJson(response, 400, { ok: false, error: "确认步骤无效" });
    }
    if (body.confirmText !== "确认当前版本") {
      return sendJson(response, 400, {
        ok: false,
        error: "请明确输入“确认当前版本”后提交确认"
      });
    }
    const assets = projectAssets(project.id);
    const projectView = projectForMode(project, mode);
    const snapshot = approvalSnapshot(projectView, assets, { mode, step });
    const workflowBase =
      mode === "remix"
        ? project.remixWorkflow || { currentStep: 1, approvals: {} }
        : project.workflow || { currentStep: 1, approvals: {} };
    if (step > Number(workflowBase.currentStep || 1)) {
      return sendJson(response, 409, {
        ok: false,
        error: `不能跳过第 ${workflowBase.currentStep || 1} 步，必须先按顺序确认`
      });
    }
    for (let previousStep = 1; previousStep < step; previousStep += 1) {
      const previousSnapshot = approvalSnapshot(projectView, assets, {
        mode,
        step: previousStep
      });
      if (
        !approvalIsCurrent(
          workflowBase.approvals?.[previousStep],
          previousSnapshot
        )
      ) {
        return sendJson(response, 409, {
          ok: false,
          error: `第 ${previousStep} 步确认已失效，请按顺序重新确认`
        });
      }
    }
    const template = getEntity("template", project.templateId);
    const ready =
      mode === "remix"
        ? remixWorkflowReady(projectView, template, assets, step)
        : storyWorkflowReady(projectView, assets, step, workflowBase);
    if (!ready) {
      return sendJson(response, 409, {
        ok: false,
        error: `第 ${step} 步材料或人工审核尚未达到放行条件`
      });
    }
    const workflow = approveStep({ ...project, workflow: workflowBase }, {
      mode,
      step,
      snapshot,
      evidence: body.evidence
    });
    const updated = updateEntity(
      "project",
      project.id,
      mode === "remix"
        ? {
            remixWorkflow: workflow,
            mode: "remix",
            lastRemixApprovalAt: new Date().toISOString()
          }
        : {
            workflow,
            mode: "story",
            lastApprovalAt: new Date().toISOString()
          }
    );
    return sendJson(response, 200, {
      ok: true,
      item: updated,
      approval: workflow.approvals[step],
      workflow
    });
  }

  const projectShotMatch = path.match(
    /^\/api\/projects\/([^/]+)\/shots\/([^/]+)$/
  );
  if (projectShotMatch && method === "PUT") {
    const project = getEntity("project", projectShotMatch[1]);
    if (!project) return sendJson(response, 404, { ok: false, error: "项目不存在" });
    const body = await readJson(request);
    const mode = body.mode === "remix" ? "remix" : "story";
    const sourceStoryboard =
      mode === "remix"
        ? project.remixStoryboard ||
          (project.mode === "remix" ? project.storyboard : null) ||
          []
        : project.storyStoryboard ||
          (project.mode !== "remix" ? project.storyboard : null) ||
          [];
    const shotId = decodeURIComponent(projectShotMatch[2]);
    const index = sourceStoryboard.findIndex((shot) => shot.id === shotId);
    if (index < 0) return sendJson(response, 404, { ok: false, error: "镜头不存在" });
    const current = project.storyboard[index];
    const patch = {};
    for (const key of ["status", "assets", "characters", "source", "review", "prompt"]) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    if (body.prompt !== undefined) {
      const text = String(body.prompt || "");
      patch.prompt = text;
      patch.promptVersion = {
        version: Number(current.promptVersion?.version || 1) + 1,
        hash: sha256Text(text),
        text
      };
    } else if (body.promptVersion?.text !== undefined) {
      const text = String(body.promptVersion.text || "");
      patch.promptVersion = {
        version: Number(current.promptVersion?.version || 1) + 1,
        hash: sha256Text(text),
        text
      };
    }
    if (
      patch.status === "approved" &&
      !shotReviewComplete(patch.review || current.review || {})
    ) {
      return sendJson(response, 409, {
        ok: false,
        error: "八项人工质检未全部通过，不能把镜头标记为已批准"
      });
    }
    const storyboard = sourceStoryboard.slice();
    storyboard[index] = { ...current, ...patch };
    const updated = updateEntity("project", project.id, {
      storyboard,
      ...(mode === "remix"
        ? { remixStoryboard: storyboard }
        : { storyStoryboard: storyboard }),
      timelineRevision: Number(project.timelineRevision || 1) + 1
    });
    return sendJson(response, 200, {
      ok: true,
      item: storyboard[index],
      project: updated
    });
  }

  const projectRemixTargetsMatch = path.match(
    /^\/api\/projects\/([^/]+)\/remix\/targets$/
  );
  if (projectRemixTargetsMatch && method === "PUT") {
    const project = getEntity("project", projectRemixTargetsMatch[1]);
    if (!project) return sendJson(response, 404, { ok: false, error: "项目不存在" });
    const body = await readJson(request);
    let targets;
    try {
      targets = normalizeReplacementTargets(body);
    } catch (error) {
      return sendJson(response, 400, { ok: false, error: safeError(error) });
    }
    const template = getEntity("template", body.templateId || project.templateId);
    if (!template) return sendJson(response, 409, { ok: false, error: "请先选择模板" });
    if (!template.remixAnalysis) {
      return sendJson(response, 409, {
        ok: false,
        error: "模板尚未完成画面、声音和提示词结构分析"
      });
    }
    const remixRange = resolveRemixRange(template, {
      remixRange: body.remixRange || project.remixRange
    });
    const effectiveRange = {
      start: remixRange.start,
      end: remixRange.start + remixRange.duration
    };
    const nextProject = {
      ...project,
      mode: "remix",
      templateId: template.id,
      remixTargets: targets,
      remixRange: effectiveRange,
      duration: remixRange.duration,
      remixDuration: remixRange.duration,
      storyDuration: Number(project.storyDuration || project.duration || 40),
      referenceDuration: Number(template.duration || remixRange.duration),
      durationSource: "remix-reference"
    };
    if (template.remixExtraction?.audioPath) {
      const originalAudioAsset = saveEntity(
        "asset",
        {
          id: `asset-remix-audio-${project.id}`,
          kind: "music",
          projectId: project.id,
          ownerId: project.id,
          templateId: template.id,
          title: "抖音参考片原始声音",
          localPath: template.remixExtraction.audioPath,
          url: template.remixExtraction.audioUrl,
          mimeType: "audio/wav",
          contentHash: await sha256File(template.remixExtraction.audioPath).catch(() => ""),
          version: 1,
          source: "reference-video-audio",
          sourceStart: effectiveRange.start
        },
        `asset-remix-audio-${project.id}`
      );
      nextProject.timelineSelection = {
        musicAssetId: originalAudioAsset.id,
        voiceAssetId: "",
        subtitleAssetId: ""
      };
    }
    if (template.remixAnalysis?.subtitles?.srtPath) {
      const sourceSrt = await readFile(
        template.remixAnalysis.subtitles.srtPath,
        "utf8"
      ).catch(() => "");
      const slicedSrt = sliceSrt(
        sourceSrt,
        effectiveRange.start,
        effectiveRange.end
      );
      if (slicedSrt.trim()) {
        const subtitleId = `asset-remix-subtitle-${project.id}`;
        const subtitlePath = resolve(mediaRoot, "assets", `${subtitleId}.srt`);
        await writeFile(subtitlePath, slicedSrt, "utf8");
        const subtitleAsset = saveEntity(
          "asset",
          {
            id: subtitleId,
            kind: "subtitle",
            projectId: project.id,
            ownerId: project.id,
            templateId: template.id,
            title: "抖音参考片字幕裁剪版",
            localPath: subtitlePath,
            url: mediaUrlForPath(subtitlePath),
            mimeType: "application/x-subrip",
            contentHash: await sha256File(subtitlePath),
            version: 1,
            source: "reference-video-subtitles",
            sourceStart: effectiveRange.start
          },
          subtitleId
        );
        nextProject.timelineSelection = {
          ...(nextProject.timelineSelection || {}),
          subtitleAssetId: subtitleAsset.id
        };
      }
    }
    const storyboard = buildRemixShotPlan(template, nextProject);
    const updated = updateEntity("project", project.id, {
      mode: "remix",
      templateId: template.id,
      remixTargets: targets,
      duration: nextProject.duration,
      remixDuration: nextProject.remixDuration,
      storyDuration: nextProject.storyDuration,
      referenceDuration: nextProject.referenceDuration,
      remixRange: effectiveRange,
      timelineSelection: nextProject.timelineSelection || project.timelineSelection || {},
      durationSource: nextProject.durationSource,
      storyboard,
      remixStoryboard: storyboard,
      remixWorkflow: project.remixWorkflow || { currentStep: 1, approvals: {} },
      timelineRevision: Number(project.timelineRevision || 1) + 1
    });
    return sendJson(response, 200, {
      ok: true,
      item: updated,
      shots: storyboard
    });
  }

  const projectPhotoMatch = path.match(/^\/api\/projects\/([^/]+)\/photos$/);
  if (projectPhotoMatch && method === "POST") {
    const role = url.searchParams.get("role");
    if (!["groom", "bride"].includes(role)) {
      return sendJson(response, 400, { ok: false, error: "role 必须是 groom 或 bride" });
    }
    const asset = await receiveUpload(request, {
      kind: "photo",
      ownerId: projectPhotoMatch[1],
      preferredName: url.searchParams.get("name") || `${role}.jpg`
    });
    const project = updateEntity("project", projectPhotoMatch[1], (current) => ({
      photos: { ...current.photos, [role]: asset.url },
      photoSources: { ...(current.photoSources || {}), [role]: asset.localPath },
      photoAssetIds: { ...(current.photoAssetIds || {}), [role]: asset.id }
    }));
    return sendJson(response, 201, { ok: true, asset, project });
  }

  if (path === "/api/templates" && method === "GET") {
    return sendJson(response, 200, { ok: true, items: listEntities("template") });
  }

  if (path === "/api/templates/upload" && method === "POST") {
    const asset = await receiveUpload(request, {
      kind: "template-source",
      preferredName: url.searchParams.get("name") || "template.mp4"
    });
    const template = await createTemplateFromFile(asset.localPath, {
      sourceKind: "upload",
      title: url.searchParams.get("title") || basename(asset.originalName, extname(asset.originalName)),
      sourceUrl: "",
      author: ""
    });
    const job = createJob("template-analysis", {
      templateId: template.id,
      input: { templateId: template.id }
    });
    queueJob(job.id, () => analyzeTemplate(template.id, job.id));
    return sendJson(response, 202, { ok: true, item: template, job });
  }

  if (path === "/api/templates/import-url" && method === "POST") {
    const body = await readJson(request);
    if (!/^https?:\/\//i.test(body.url || "")) {
      return sendJson(response, 400, { ok: false, error: "请输入有效的视频链接" });
    }
    const job = createJob("template-import", { input: { url: body.url } });
    queueJob(job.id, () => importTemplateFromUrl(body.url, job.id));
    return sendJson(response, 202, { ok: true, job });
  }

  const templateMatch = path.match(/^\/api\/templates\/([^/]+)$/);
  if (templateMatch && method === "GET") {
    const template = getEntity("template", templateMatch[1]);
    return template
      ? sendJson(response, 200, { ok: true, item: template })
      : sendJson(response, 404, { ok: false, error: "模板不存在" });
  }
  if (templateMatch && method === "DELETE") {
    const deleted = deleteEntity("template", templateMatch[1]);
    return sendJson(response, deleted ? 200 : 404, { ok: Boolean(deleted) });
  }

  const templateAnalyzeMatch = path.match(/^\/api\/templates\/([^/]+)\/analyze$/);
  if (templateAnalyzeMatch && method === "POST") {
    const body = await readJson(request).catch(() => ({}));
    const job = createJob("template-ai-analysis", {
      templateId: templateAnalyzeMatch[1],
      input: { templateId: templateAnalyzeMatch[1], deep: Boolean(body.deep) }
    });
    queueJob(job.id, () => analyzeTemplate(templateAnalyzeMatch[1], job.id, Boolean(body.deep)));
    return sendJson(response, 202, { ok: true, job });
  }

  const templateApplyMatch = path.match(/^\/api\/templates\/([^/]+)\/apply$/);
  if (templateApplyMatch && method === "POST") {
    const body = await readJson(request);
    const template = getEntity("template", templateApplyMatch[1]);
    if (!template) return sendJson(response, 404, { ok: false, error: "模板不存在" });
    const project = updateEntity("project", body.projectId, (current) => ({
      templateId: template.id,
      referenceDuration: Number(template.duration || 0),
      duration: body.duration
        ? Number(body.duration)
        : Number(current.duration || 40),
      aspect: body.aspect || template.aspect || current.aspect || "16:9",
      timelineRevision: Number(current.timelineRevision || 1) + 1
    }));
    return project
      ? sendJson(response, 200, { ok: true, item: project })
      : sendJson(response, 404, { ok: false, error: "项目不存在" });
  }

  const templateClipMatch = path.match(/^\/api\/templates\/([^/]+)\/clip$/);
  if (templateClipMatch && method === "POST") {
    const body = await readJson(request);
    const template = getEntity("template", templateClipMatch[1]);
    if (!template) return sendJson(response, 404, { ok: false, error: "模板不存在" });
    const start = Math.max(0, Number(body.start || 0));
    const duration = Math.min(8, Math.max(0.5, Number(body.duration || 5)));
    const clipId = id("asset");
    const targetDir = resolve(mediaRoot, "generated", clipId);
    await mkdir(targetDir, { recursive: true });
    const localPath = resolve(targetDir, "reference.mp4");
    await extractVideoSegment(template.videoPath, localPath, start, duration);
    const asset = saveEntity("asset", {
      id: clipId,
      kind: "template-clip",
      projectId: body.projectId || "",
      ownerId: body.projectId || "",
      templateId: template.id,
      title: `${template.title} · ${start.toFixed(2)}–${(start + duration).toFixed(2)} 秒`,
      localPath,
      url: mediaUrlForPath(localPath),
      mimeType: "video/mp4",
      sourceStart: start,
      sourceEnd: start + duration,
      contentHash: await sha256File(localPath),
      version: 1,
      media: await probeMedia(localPath).catch(() => null)
    });
    return sendJson(response, 201, {
      ok: true,
      item: {
        assetId: asset.id,
        url: asset.url,
        start,
        duration,
        templateId: template.id,
        contentHash: asset.contentHash
      },
      asset
    });
  }

  const remixExtractMatch = path.match(/^\/api\/templates\/([^/]+)\/remix\/extract$/);
  if (remixExtractMatch && method === "POST") {
    const template = getEntity("template", remixExtractMatch[1]);
    if (!template) return sendJson(response, 404, { ok: false, error: "模板不存在" });
    const job = createJob("remix-extract", {
      templateId: template.id,
      input: { templateId: template.id, fps: 24 }
    });
    queueJob(job.id, () => extractRemixTemplate(template.id, job.id));
    return sendJson(response, 202, { ok: true, job });
  }

  const remixAnalyzeMatch = path.match(/^\/api\/templates\/([^/]+)\/remix\/analyze$/);
  if (remixAnalyzeMatch && method === "POST") {
    const template = getEntity("template", remixAnalyzeMatch[1]);
    if (!template) return sendJson(response, 404, { ok: false, error: "模板不存在" });
    if (!template.remixExtraction?.totalFrames) {
      return sendJson(response, 409, {
        ok: false,
        error: "请先完成 24 FPS 全帧提取和原音频提取"
      });
    }
    const job = createJob("remix-analysis", {
      templateId: template.id,
      input: { templateId: template.id }
    });
    queueJob(job.id, () => analyzeRemixTemplate(template.id, job.id));
    return sendJson(response, 202, { ok: true, job });
  }

  if (path === "/api/assets" && method === "GET") {
    return sendJson(response, 200, { ok: true, items: listEntities("asset") });
  }
  if (path === "/api/assets/upload" && method === "POST") {
    const asset = await receiveUpload(request, {
      kind: url.searchParams.get("kind") || "project-photo",
      ownerId: url.searchParams.get("projectId") || "",
      preferredName: url.searchParams.get("name") || "upload"
    });
    return sendJson(response, 201, { ok: true, item: asset });
  }
  if (path === "/api/looks" && method === "GET") {
    return sendJson(response, 200, { ok: true, items: listEntities("look") });
  }

  const lookMatch = path.match(/^\/api\/looks\/([^/]+)$/);
  if (lookMatch && method === "PUT") {
    const body = await readJson(request);
    const updated = updateEntity("look", lookMatch[1], body);
    return updated
      ? sendJson(response, 200, { ok: true, item: updated })
      : sendJson(response, 404, { ok: false, error: "造型不存在" });
  }

  const assetMatch = path.match(/^\/api\/assets\/([^/]+)$/);
  if (assetMatch && method === "DELETE") {
    const asset = getEntity("asset", assetMatch[1]);
    if (!asset) return sendJson(response, 404, { ok: false, error: "资产不存在" });
    const deleted = deleteEntity("asset", assetMatch[1]);
    return sendJson(response, 200, { ok: Boolean(deleted), item: asset });
  }

  const lookGenerateMatch = path.match(/^\/api\/looks\/([^/]+)\/generate$/);
  if (lookGenerateMatch && method === "POST") {
    const body = await readJson(request).catch(() => ({}));
    try {
      rejectFilesystemPathKeys(body);
    } catch (error) {
      return sendJson(response, 400, { ok: false, error: safeError(error) });
    }
    const look = getEntity("look", lookGenerateMatch[1]);
    if (!look) return sendJson(response, 404, { ok: false, error: "造型不存在" });
    const job = createJob("look-image", {
      modelId: body.modelId || "",
      projectId: body.projectId || "project-default",
      input: {
        lookId: look.id,
        prompt: buildLookPrompt(look),
        projectId: body.projectId || "project-default",
        referencePath: body.referenceAssetId
          ? resolveGenerationInputs(
              [`reference_image:${body.referenceAssetId}`],
              body.projectId || ""
            )[0].replace(/^reference_image:@?/, "")
          : ""
      }
    });
    queueJob(job.id, () => generateLook(job.id));
    return sendJson(response, 202, { ok: true, job });
  }

  if (path === "/api/models" && method === "GET") {
    return sendJson(response, 200, { ok: true, items: listEntities("model") });
  }

  const modelMatch = path.match(/^\/api\/models\/([^/]+)$/);
  if (modelMatch && method === "PUT") {
    const body = await readJson(request);
    const updated = updateEntity("model", modelMatch[1], body);
    return updated
      ? sendJson(response, 200, { ok: true, item: updated })
      : sendJson(response, 404, { ok: false, error: "模型配置不存在" });
  }

  const modelTestMatch = path.match(/^\/api\/models\/([^/]+)\/test$/);
  if (modelTestMatch && method === "POST") {
    const model = getEntity("model", modelTestMatch[1]);
    if (!model) return sendJson(response, 404, { ok: false, error: "模型配置不存在" });
    const result = await testModel(model);
    const updated = updateEntity("model", model.id, {
      status: result.ok
        ? ["subscription_expired", "external_service_blocked"].includes(model.status)
          ? model.status
          : "ready"
        : "error",
      lastTest: {
        ok: result.ok,
        message: result.message,
        at: new Date().toISOString()
      }
    });
    return sendJson(response, 200, { ok: result.ok, result, item: updated });
  }

  if (path === "/api/generate/text" && method === "POST") {
    const body = await readJson(request);
    const job = createJob("text-generation", {
      modelId: body.modelId || "",
      projectId: body.projectId || "",
      input: {
        prompt: body.prompt || "",
        instructions: body.instructions || "",
        parameters: body.parameters || {}
      }
    });
    queueJob(job.id, () => generateTextJob(job.id));
    return sendJson(response, 202, { ok: true, job });
  }

  if (path === "/api/generate/image" && method === "POST") {
    const body = await readJson(request);
    try {
      rejectFilesystemPathKeys(body);
    } catch (error) {
      return sendJson(response, 400, { ok: false, error: safeError(error) });
    }
    let inputs = [];
    try {
      inputs = resolveGenerationInputs(body.inputs || [], body.projectId || "");
    } catch (error) {
      return sendJson(response, 400, { ok: false, error: safeError(error) });
    }
    const job = createJob("image-generation", {
      modelId: body.modelId || "",
      projectId: body.projectId || "",
      input: {
        prompt: body.prompt || "",
        inputs,
        lookId: body.lookId || "",
        kind: body.kind || "image"
      }
    });
    queueJob(job.id, () => generateImageJob(job.id));
    return sendJson(response, 202, { ok: true, job });
  }

  if (path === "/api/generate/video" && method === "POST") {
    const body = await readJson(request);
    try {
      rejectFilesystemPathKeys(body);
    } catch (error) {
      return sendJson(response, 400, { ok: false, error: safeError(error) });
    }
    let inputs = [];
    try {
      inputs = resolveGenerationInputs(body.inputs || [], body.projectId || "");
    } catch (error) {
      return sendJson(response, 400, { ok: false, error: safeError(error) });
    }
    const job = createJob("video-generation", {
      modelId: body.modelId || "",
      projectId: body.projectId || "",
      input: {
        prompt: body.prompt || "",
        inputs,
        shotId: body.shotId || "",
        parameters: body.parameters || {}
      }
    });
    queueJob(job.id, () => submitVideoJob(job.id));
    return sendJson(response, 202, { ok: true, job });
  }

  if (path === "/api/voice/generate" && method === "POST") {
    const body = await readJson(request);
    const model = getModelOrDefault(body.modelId, "voice");
    const extension = model?.provider === "windows-sapi" ? ".wav" : ".mp3";
    const outputPath = resolve(mediaRoot, "audio", `${id("voice")}${extension}`);
    await mkdir(resolve(mediaRoot, "audio"), { recursive: true });
    if (model?.provider === "windows-sapi") {
      await synthesizeSapi({
        text: body.text,
        voice: model.model,
        outputPath,
        rate: model.parameters?.rate ?? -1
      });
    } else {
      await synthesizeVoice({
        text: body.text,
        voice: model?.model || "zh-CN-XiaoxiaoNeural",
        outputPath,
        rate: model?.parameters?.rate || "-5%"
      });
    }
    const asset = saveEntity("asset", {
      id: id("asset"),
      kind: "voice",
      title: body.title || "旁白",
      localPath: outputPath,
      url: mediaUrlForPath(outputPath),
      mimeType: model?.provider === "windows-sapi" ? "audio/wav" : "audio/mpeg",
      provider: model?.provider || "edge-tts",
      model: model?.model || "",
      projectId: body.projectId || "",
      contentHash: await sha256File(outputPath),
      version: 1
    });
    return sendJson(response, 201, { ok: true, item: asset, url: `/media/audio/${basename(outputPath)}` });
  }

  if (path === "/api/music/generate" && method === "POST") {
    const body = await readJson(request);
    const duration = Math.max(8, Number(body.duration || 40));
    const outputPath = resolve(mediaRoot, "audio", `${id("music")}.wav`);
    await mkdir(resolve(mediaRoot, "audio"), { recursive: true });
    await renderOriginalBgm(outputPath, duration, body.mood || "warm-cinematic");
    const asset = saveEntity("asset", {
      id: id("asset"),
      kind: "music",
      title: body.title || "囍映原创婚礼配乐",
      localPath: outputPath,
      url: mediaUrlForPath(outputPath),
      mimeType: "audio/wav",
      provider: "xying-original",
      model: "xying-wedding-score-v1",
      projectId: body.projectId || "",
      contentHash: await sha256File(outputPath),
      version: 1
    });
    return sendJson(response, 201, { ok: true, item: asset, url: `/media/audio/${basename(outputPath)}` });
  }

  if (path === "/api/subtitles" && method === "POST") {
    const body = await readJson(request);
    const duration = Math.max(1, Number(body.duration || 40));
    const text = String(body.text || "").trim();
    if (!text) return sendJson(response, 400, { ok: false, error: "字幕文案不能为空" });
    const subtitlePath = resolve(mediaRoot, "assets", `${id("subtitle")}.srt`);
    await mkdir(resolve(mediaRoot, "assets"), { recursive: true });
    const lines = splitSubtitleLines(text, duration);
    await writeFile(subtitlePath, toSrt(lines), "utf8");
    const asset = saveEntity("asset", {
      id: id("asset"),
      kind: "subtitle",
      title: body.title || "婚礼字幕",
      localPath: subtitlePath,
      url: mediaUrlForPath(subtitlePath),
      mimeType: "application/x-subrip",
      projectId: body.projectId || "",
      lines,
      contentHash: await sha256File(subtitlePath),
      version: 1
    });
    return sendJson(response, 201, { ok: true, item: asset });
  }

  if (path === "/api/render" && method === "POST") {
    const legacyBody = await readJson(request).catch(() => ({}));
    try {
      rejectFilesystemPathKeys(legacyBody);
    } catch (error) {
      return sendJson(response, 400, { ok: false, error: safeError(error) });
    }
    return sendJson(response, 410, {
      ok: false,
      error: "旧版路径合成接口已停用，请使用当前项目时间轴合成"
    });
  }

  if (path === "/api/vvv/project" && method === "POST") {
    const body = await readJson(request);
    const root = await findVvvRoot();
    if (!root) {
      return sendJson(response, 409, {
        ok: false,
        error: "未找到 VVV 模板环境，请设置 VVV_ROOT"
      });
    }
    const photos = (body.assetIds || [])
      .map((assetId) => getEntity("asset", assetId))
      .filter(
        (asset) =>
          asset?.localPath && /\.(jpg|jpeg|png|webp)$/i.test(asset.localPath)
      )
      .map((asset) => asset.localPath);
    if (photos.length === 0) {
      return sendJson(response, 400, {
        ok: false,
        error: "创建 VVV 工程至少需要一张婚礼照片"
      });
    }
    const outputRoot = resolve(mediaRoot, "vvv-projects", id("vvv"));
    const project = getEntity("project", body.projectId);
    const created = await createVvvProject({
      root,
      template: body.template || "starter",
      format: body.format || "16:9",
      photos,
      outputDir: outputRoot,
      allowRepeat: Boolean(body.allowRepeat),
      projectInfo: {
        name: project?.name || "我们的婚礼",
        groom: project?.groom || "新郎",
        bride: project?.bride || "新娘",
        weddingDate: project?.weddingDate || ""
      }
    });
    const asset = saveEntity("asset", {
      id: id("asset"),
      kind: "remotion-project",
      projectId: body.projectId || "",
      title: `VVV ${body.template || "starter"} 可编辑工程`,
      localPath: created.projectDir,
      previewPath: resolve(created.projectDir, "creative", "contact-sheet.jpg"),
      previewUrl: mediaUrlForPath(
        resolve(created.projectDir, "creative", "contact-sheet.jpg")
      ),
      template: body.template || "starter",
      format: body.format || "16:9"
    });
    return sendJson(response, 201, { ok: true, item: { ...created, asset } });
  }

  if (path === "/api/vvv/doctor" && method === "GET") {
    const root = await findVvvRoot();
    if (!root) return sendJson(response, 409, { ok: false, error: "未找到 VVV" });
    const result = await checkVvv(root);
    return sendJson(response, 200, { ok: true, item: result, root });
  }

  if (path === "/api/jobs" && method === "GET") {
    return sendJson(response, 200, { ok: true, items: listEntities("job", 200) });
  }

  const jobMatch = path.match(/^\/api\/jobs\/([^/]+)$/);
  if (jobMatch && method === "GET") {
    const job = getEntity("job", jobMatch[1]);
    return job
      ? sendJson(response, 200, { ok: true, item: job })
      : sendJson(response, 404, { ok: false, error: "任务不存在" });
  }

  const jobQueryMatch = path.match(/^\/api\/jobs\/([^/]+)\/query$/);
  if (jobQueryMatch && method === "POST") {
    const job = getEntity("job", jobQueryMatch[1]);
    if (!job) return sendJson(response, 404, { ok: false, error: "任务不存在" });
    if (job.kind === "video-generation" && job.providerTaskId) {
      const result = await queryVideoTask(job.providerTaskId, resolve(mediaRoot, "generated"));
      const updated = await applyVideoQuery(job, result);
      return sendJson(response, 200, { ok: true, item: updated });
    }
    return sendJson(response, 200, { ok: true, item: job });
  }

  return sendJson(response, 404, { ok: false, error: `未知接口：${method} ${path}` });
}

async function serveFile(response, filePath, boundaryRoot) {
  setCors(response);
  const normalizedRoot = resolve(boundaryRoot);
  const normalizedPath = resolve(filePath);
  if (normalizedPath !== normalizedRoot && !normalizedPath.startsWith(`${normalizedRoot}\\`) && !normalizedPath.startsWith(`${normalizedRoot}/`)) {
    return sendJson(response, 403, { ok: false, error: "禁止访问" });
  }
  const fileStat = await stat(normalizedPath);
  if (!fileStat.isFile()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  const content = await readFile(normalizedPath);
  response.writeHead(200, {
    "Content-Type": contentTypes[extname(normalizedPath).toLowerCase()] || "application/octet-stream",
    "Content-Length": content.length,
    "Cache-Control": normalizedPath.startsWith(mediaRoot) ? "private, max-age=60" : "no-cache"
  });
  response.end(content);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxJsonBody) throw new Error("请求内容过大");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function projectAssets(projectId) {
  return listEntities("asset", 2000).filter(
    (asset) => asset.projectId === projectId || asset.ownerId === projectId
  );
}

function projectForMode(project, requestedMode = "") {
  const mode =
    requestedMode === "remix" || requestedMode === "story"
      ? requestedMode
      : project.mode === "remix"
        ? "remix"
        : "story";
  const storyboard =
    mode === "remix"
      ? project.remixStoryboard ||
        (project.mode === "remix" ? project.storyboard : null) ||
        []
      : project.storyStoryboard ||
        (project.mode !== "remix" ? project.storyboard : null) ||
        [];
  const duration =
    mode === "remix"
      ? Number(
          project.remixDuration ||
            (project.remixRange
              ? project.remixRange.end - project.remixRange.start
              : 0) ||
            project.duration ||
            40
        )
      : Number(project.storyDuration || project.duration || 40);
  return {
    ...project,
    mode,
    storyboard,
    duration
  };
}

function resolveGenerationInputs(inputs, projectId = "") {
  if (!Array.isArray(inputs)) return [];
  return inputs.map((entry) => {
    const raw = String(entry || "");
    const separator = raw.indexOf(":");
    if (separator < 1) throw new Error("生成素材必须使用“角色:资产ID”格式");
    const role = raw.slice(0, separator);
    const value = raw.slice(separator + 1);
    if (/^https?:\/\//i.test(value)) return `${role}:${value}`;
    if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith("/") || value.startsWith("\\\\")) {
      throw new Error("生成接口不接受文件路径，请提交素材资产 ID");
    }
    const asset = getEntity("asset", value);
    if (!asset) throw new Error(`素材资产不存在：${value}`);
    if (projectId && asset.projectId && asset.projectId !== projectId) {
      throw new Error("不能引用其他项目的素材");
    }
    const localPath = assertInside(mediaRoot, asset.localPath);
    return `${role}:@${localPath}`;
  });
}

function migrateProjectRecords() {
  for (const project of listEntities("project", 2000)) {
    const shots = Array.isArray(project.storyboard) ? project.storyboard : [];
    const normalizedShots = shots.map((shot, index) => {
      const frames =
        Number(shot.frames) ||
        Math.max(1, Math.round((Number(shot.end || 0) - Number(shot.start || 0)) * 24));
      return {
        ...shot,
        order: shot.order || index + 1,
        frames,
        startFrame:
          shot.startFrame == null ? Math.round(Number(shot.start || 0) * 24) : shot.startFrame,
        endFrame:
          shot.endFrame == null
            ? Math.round(Number(shot.start || 0) * 24) + frames
            : shot.endFrame,
        promptVersion:
          shot.promptVersion || {
            version: 1,
            hash: "",
            text: String(shot.prompt || "")
          },
        assets: shot.assets || { firstFrame: null, video: null, finalClip: null },
        review: shot.review || {
          identity: "pending",
          crossFace: "pending",
          hands: "pending",
          actionMatch: "pending",
          backgroundDrift: "pending",
          blackBars: "pending",
          subtitleSafety: "pending",
          audioSync: "pending"
        },
        status:
          shot.status === "已确认"
            ? "human-review"
            : shot.status === "待生成"
              ? "draft"
              : shot.status || "draft"
      };
    });
    const shotFrames = normalizedShots.reduce((sum, shot) => sum + shot.frames, 0);
    const projectFrames = Math.round(Number(project.duration || 0) * 24);
    const legacyStoryApprovals = Object.values(project.workflow?.approvals || {}).some(
      (approval) => !approval?.fingerprint
    );
    const legacyRemixApprovals = Object.values(
      project.remixWorkflow?.approvals || {}
    ).some((approval) => !approval?.fingerprint);
    const workflow = legacyStoryApprovals
      ? {
          currentStep: 1,
          approvals: {},
          legacyApprovals: project.workflow?.approvals || {}
        }
      : project.workflow || { currentStep: 1, approvals: {} };
    const remixWorkflow = legacyRemixApprovals
      ? {
          currentStep: 1,
          approvals: {},
          legacyApprovals: project.remixWorkflow?.approvals || {}
        }
      : project.remixWorkflow || { currentStep: 1, approvals: {} };
    const shouldRepairDuration =
      shotFrames > 0 && Math.abs(shotFrames - projectFrames) > 1;
    const assets = projectAssets(project.id);
    const photoAssetIds = {
      groom:
        project.photoAssetIds?.groom ||
        assets.find(
          (asset) =>
            (asset.kind === "photo" || asset.kind === "project-photo") &&
            ((project.photoSources?.groom &&
              resolve(asset.localPath) === resolve(project.photoSources.groom)) ||
              (project.photos?.groom && project.photos.groom.includes(asset.id)))
        )?.id ||
        "",
      bride:
        project.photoAssetIds?.bride ||
        assets.find(
          (asset) =>
            (asset.kind === "photo" || asset.kind === "project-photo") &&
            ((project.photoSources?.bride &&
              resolve(asset.localPath) === resolve(project.photoSources.bride)) ||
              (project.photos?.bride && project.photos.bride.includes(asset.id)))
        )?.id ||
        ""
    };
    const duration = shouldRepairDuration ? shotFrames / 24 : Number(project.duration || 40);
    if (
      shouldRepairDuration ||
      !project.mode ||
      !project.timelineRevision ||
      !project.photoAssetIds ||
      legacyStoryApprovals ||
      legacyRemixApprovals ||
      Boolean(project.photos?.groom && !project.photoAssetIds?.groom) ||
      Boolean(project.photos?.bride && !project.photoAssetIds?.bride) ||
      !project.storyDuration ||
      project.storyStoryboard == null ||
      project.remixStoryboard == null ||
      normalizedShots.some((shot, index) => shot.status !== shots[index]?.status)
    ) {
      updateEntity("project", project.id, {
        mode: project.mode || "story",
        duration,
        legacyDuration: shouldRepairDuration
          ? Number(project.legacyDuration || project.duration || 0)
          : project.legacyDuration,
        referenceDuration:
          Number(project.referenceDuration || 0) ||
          (project.templateId && shouldRepairDuration ? Number(project.duration || 0) : 0),
        storyboard: normalizedShots,
        workflow,
        remixWorkflow,
        storyStoryboard:
          project.storyStoryboard ||
          (project.mode !== "remix" ? normalizedShots : []),
        remixStoryboard:
          project.remixStoryboard ||
          (project.mode === "remix" ? normalizedShots : []),
        storyDuration:
          Number(project.storyDuration || 0) ||
          (project.mode !== "remix" ? duration : 40),
        remixDuration:
          Number(project.remixDuration || 0) ||
          (project.mode === "remix" ? duration : 0),
        photoAssetIds,
        timelineRevision: Number(project.timelineRevision || 1)
      });
    }
  }
}

async function migrateAssetHashes() {
  for (const asset of listEntities("asset", 5000)) {
    if (asset.contentHash || !asset.localPath) continue;
    const contentHash = await sha256File(asset.localPath).catch(() => "");
    if (contentHash) {
      updateEntity("asset", asset.id, { contentHash, version: asset.version || 1 });
    }
  }
}

async function migrateRemixSubtitles() {
  for (const template of listEntities("template", 1000)) {
    const transcript = template.remixAnalysis?.audio?.transcript || [];
    if (!transcript.length || template.remixAnalysis?.subtitles?.srtPath) continue;
    const srt = transcriptToSrt(transcript, 18);
    if (!srt.trim()) continue;
    const subtitlePath = resolve(
      mediaRoot,
      "templates",
      template.id,
      "remix-analysis",
      "auto-subtitles.srt"
    );
    await mkdir(
      resolve(mediaRoot, "templates", template.id, "remix-analysis"),
      { recursive: true }
    );
    await writeFile(subtitlePath, srt, "utf8");
    updateEntity("template", template.id, {
      remixAnalysis: {
        ...template.remixAnalysis,
        subtitles: {
          ...(template.remixAnalysis.subtitles || {}),
          srtPath: subtitlePath,
          srtUrl: mediaUrlForPath(subtitlePath),
          lines: transcript
        }
      }
    });
  }
}

function migrateInterruptedJobs() {
  for (const job of listEntities("job", 5000)) {
    if (
      ["queued", "running"].includes(job.status) &&
      (job.kind !== "video-generation" || !job.providerTaskId)
    ) {
      updateJob(job.id, {
        status: "unknown",
        error: "本地服务在任务完成前重启；请核对原任务后明确重新发起"
      });
    }
  }
}

function normalizeModelDefaults() {
  const models = listEntities("model", 1000);
  const categories = [...new Set(models.map((model) => model.category))];
  for (const category of categories) {
    const candidates = models.filter((model) => model.category === category);
    const currentDefault = candidates.find((model) => model.isDefault);
    const preferred =
      (currentDefault?.enabled &&
        currentDefault.status === "ready" &&
        currentDefault) ||
      candidates.find((model) => model.enabled && model.status === "ready") ||
      candidates.find((model) => model.enabled) ||
      candidates[0];
    if (!preferred) continue;
    for (const candidate of candidates) {
      const shouldBeDefault = candidate.id === preferred.id;
      if (Boolean(candidate.isDefault) !== shouldBeDefault) {
        updateEntity("model", candidate.id, { isDefault: shouldBeDefault });
      }
    }
  }
}

async function receiveUpload(request, { kind, ownerId = "", preferredName = "upload" }) {
  const assetId = id("asset");
  const extension = inferExtension(request.headers["content-type"], preferredName);
  const targetDir = resolve(mediaRoot, kind === "template-source" ? "templates" : "assets", assetId);
  await mkdir(targetDir, { recursive: true });
  const localPath = resolve(targetDir, `${assetId}${extension}`);
  await pipeline(request, createWriteStream(localPath));
  let media = null;
  if ([".mp4", ".mov", ".webm", ".mp3", ".wav"].includes(extension)) {
    media = await probeMedia(localPath).catch(() => null);
  }
  const asset = saveEntity("asset", {
    id: assetId,
    kind,
    ownerId,
    title: preferredName,
    originalName: preferredName,
    localPath,
    url: mediaUrlForPath(localPath),
    mimeType: request.headers["content-type"] || "",
    size: (await stat(localPath)).size,
    contentHash: await sha256File(localPath),
    version: 1,
    media
  });
  return asset;
}

async function createTemplateFromFile(videoPath, meta = {}) {
  const media = await probeMedia(videoPath);
  const templateId = id("template");
  const templateDir = resolve(mediaRoot, "templates", templateId);
  await mkdir(templateDir, { recursive: true });
  let coverPath = resolve(templateDir, "cover.jpg");
  try {
    await extractCover(videoPath, coverPath);
  } catch {
    coverPath = "";
  }
  return saveEntity(
    "template",
    {
      id: templateId,
      title: meta.title || "未命名模板",
      sourceUrl: meta.sourceUrl || "",
      sourceKind: meta.sourceKind || "upload",
      author: meta.author || "",
      videoPath,
      videoUrl: mediaUrlForPath(videoPath),
      coverPath,
      coverUrl: coverPath ? mediaUrlForPath(coverPath) : "",
      media,
      duration: Number(media.duration || 0),
      aspect:
        media.video?.width && media.video?.height
          ? normalizeAspect(media.video.width, media.video.height)
          : "16:9",
      fps: Number(String(media.video?.avg_frame_rate || "24/1").split("/")[0]) || 24,
      status: "ready_for_analysis",
      recipe: null
    },
    templateId
  );
}

async function analyzeTemplate(templateId, jobId, deep = false) {
  const template = getEntity("template", templateId);
  if (!template) throw new Error("模板不存在");
  updateEntity("template", templateId, { status: "analyzing" });
  const cuts = await detectSceneCuts(template.videoPath);
  const contactSheetDir = resolve(mediaRoot, "templates", templateId, "contact");
  const contactSheetPaths = await extractContactSheets(
    template.videoPath,
    contactSheetDir
  ).catch(() => []);
  const shots = sceneCutsToShots(cuts, template.duration);
  let aiAnalysis = null;
  let aiAnalysisError = "";
  if (deep) {
    const vision = getModelOrDefault("", "vision");
    if (!vision) throw new Error("未配置视觉理解模型");
    const prompt = [
      "你是婚礼微电影模板分析师。请分析参考视频，提取可执行的模板配方。",
      "只输出 JSON，不要 Markdown。",
      '格式：{"title":"","styleTags":[],"palette":[],"summary":"","shots":[{"start":0,"end":2,"framing":"","action":"","camera":"","transition":"","characters":"","emotion":""}],"audio":{"hasVoiceover":true,"musicMood":""},"reusableRules":[]}',
      "镜头必须覆盖完整视频，时间以秒为单位，不要编造看不到的内容。"
    ].join("\n");
    try {
      updateJob(jobId, {
        status: "running",
        progress: 35,
        log: "视频理解模型正在分析画面、声音和镜头"
      });
      const result = await understandMedia({
        profile: vision.profile,
        model: vision.model,
        subSkill: "video-summary",
        inputPath: template.videoPath,
        prompt,
        parameters: { maxOutputTokens: 6000, temperature: 0.2 }
      });
      aiAnalysis = parseModelJson(result.content);
      shots.splice(0, shots.length, ...normalizeAiShots(aiAnalysis.shots, template.duration));
    } catch (error) {
      aiAnalysisError = safeError(error);
      if (/subscription has expired|subscription is invalid/i.test(aiAnalysisError)) {
        updateEntity("model", vision.id, {
          status: "subscription_expired",
          lastError: aiAnalysisError
        });
      }
    }
  }
  const recipe = {
    templateId,
    title: aiAnalysis?.title || template.title,
    styleTags: aiAnalysis?.styleTags || [],
    palette: aiAnalysis?.palette || ["朱砂红", "鎏金"],
    summary:
      aiAnalysis?.summary ||
      (aiAnalysisError
        ? "已完成本地镜头切点分析；视觉模型当前不可用，画面语义仍需人工补充。"
        : "已完成镜头切点分析，可继续补充画面语义。"),
    duration: template.duration,
    fps: 24,
    aspect: template.aspect,
    shots,
    audio: aiAnalysis?.audio || { hasVoiceover: false, musicMood: "" },
    reusableRules: aiAnalysis?.reusableRules || [],
    analysisWarnings: aiAnalysisError ? [aiAnalysisError] : [],
    analyzedAt: new Date().toISOString()
  };
  const updated = updateEntity("template", templateId, {
    status: "ready",
    contactSheetPaths,
    contactSheetUrls: contactSheetPaths.map(mediaUrlForPath),
    recipe
  });
  updateJob(jobId, {
    status: "succeeded",
    progress: 100,
    result: { template: updated }
  });
}

async function extractRemixTemplate(templateId, jobId) {
  const template = getEntity("template", templateId);
  if (!template) throw new Error("模板不存在");
  const plan = buildFrameExtractionPlan(template.duration, 24);
  const outputDir = resolve(mediaRoot, "templates", template.id, "remix");
  updateJob(jobId, {
    status: "running",
    progress: 5,
    result: { plan }
  });
  const extracted = await extractRemixFrames({
    videoPath: template.videoPath,
    outputDir,
    fps: 24,
    onProgress: (progress, message) =>
      updateJob(jobId, { progress, log: message })
  });
  const extraction = {
    fps: 24,
    duration: plan.duration,
    durationTimecode: plan.durationTimecode,
    totalFrames: extracted.totalFrames,
    expectedFrames: plan.totalFrames,
    seconds: plan.seconds,
    framesDir: extracted.framesDir,
    audioPath: extracted.audioPath,
    audioUrl: mediaUrlForPath(extracted.audioPath),
    indexPath: extracted.indexPath,
    indexUrl: mediaUrlForPath(extracted.indexPath),
    extractedAt: new Date().toISOString()
  };
  const updated = updateEntity("template", template.id, {
    remixExtraction: extraction
  });
  updateJob(jobId, {
    status: "succeeded",
    progress: 100,
    result: { templateId: template.id, extraction, template: updated }
  });
}

async function analyzeRemixTemplate(templateId, jobId) {
  const template = getEntity("template", templateId);
  if (!template?.remixExtraction?.totalFrames) {
    throw new Error("缺少 24 FPS 帧提取记录");
  }
  const analysisDir = resolve(mediaRoot, "templates", template.id, "remix-analysis");
  await mkdir(analysisDir, { recursive: true });
  let transcript = [];
  let transcriptSrt = "";
  let transcriptError = "";
  updateJob(jobId, {
    status: "running",
    progress: 15,
    log: "正在本地转写原声音并生成字幕时间轴"
  });
  try {
    const result = await transcribeWithWhisper(template.videoPath, analysisDir);
    transcript = result.transcript || [];
    updateJob(jobId, {
      status: "running",
      progress: 35,
      log: `已转写 ${transcript.length} 段原声音`
    });
  } catch (whisperError) {
    try {
      const vision = getModelOrDefault("", "vision");
      const result = await understandMedia({
        profile: vision?.profile || "",
        model: vision?.model || "",
        subSkill: "asr-align",
        inputPath: template.remixExtraction.audioPath,
        parameters: { maxOutputTokens: 8000, temperature: 0.1, timeout: "2m" }
      });
      transcriptSrt = String(result.content || "");
      transcript = transcriptSrt
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !/^\d+$/.test(line) && !line.includes("-->"))
        .map((text) => ({ text }));
    } catch (arkError) {
      transcriptError = `Whisper 与 Ark 转写均失败：${safeError(whisperError)}；${safeError(arkError)}`;
    }
  }
  if (!transcriptSrt.trim() && transcript.length) {
    transcriptSrt = transcriptToSrt(transcript, 18);
  }
  updateJob(jobId, {
    status: "running",
    progress: 55,
    log: "正在分析逐镜画面、动作、运镜和提示词结构"
  });
  await analyzeTemplate(template.id, jobId, true);
  const analyzedTemplate = getEntity("template", template.id);
  const shots = analyzedTemplate.recipe?.shots || [];
  const promptShots = shots.map((shot, index) => ({
    index: index + 1,
    start: shot.start,
    end: shot.end,
    framesAt24fps: shot.framesAt24fps,
    prompt: [
      `参考原视频 ${Number(shot.start).toFixed(2)}–${Number(shot.end).toFixed(2)} 秒镜头。`,
      `景别：${shot.framing || "待视觉模型或人工补充"}。`,
      `动作：${shot.action || "保持原视频人物动作"}。`,
      `运镜：${shot.camera || "保持原视频机位与运动"}。`,
      "替换男女主角身份，保持背景、动作、切点和时间轴不变。"
    ].join("")
  }));
  const subtitlePath = join(analysisDir, "auto-subtitles.srt");
  if (transcriptSrt.trim()) {
    await writeFile(subtitlePath, transcriptSrt, "utf8");
  }
  const remixAnalysis = {
    templateId: template.id,
    totalFrames: template.remixExtraction.totalFrames,
    fps: 24,
    shots: promptShots,
    promptArchitecture: {
      source: "template-recipe",
      fields: [
        "模板时间区间",
        "人物目标",
        "景别",
        "动作",
        "运镜",
        "背景",
        "身份连续性",
        "切换规则",
        "声音参考",
        "负向约束"
      ]
    },
    audio: {
      sourcePath: template.remixExtraction.audioPath,
      transcript,
      transcriptSrt,
      hasVoiceover: transcript.length > 0,
      transcriptError
    },
    subtitles: {
      mode: "requires-ocr-or-reviewed-transcript",
      lines: transcript,
      srtPath: transcriptSrt.trim() ? subtitlePath : "",
      srtUrl: transcriptSrt.trim() ? mediaUrlForPath(subtitlePath) : "",
      fontConfidence: "unknown"
    },
    targetCandidates: ["left", "right", "person-1", "person-2", "person-3", "person-4"],
    warnings: [
      ...(analyzedTemplate.recipe?.analysisWarnings || []),
      ...(transcriptError ? [`音频转写失败：${transcriptError}`] : [])
    ],
    analyzedAt: new Date().toISOString()
  };
  const updated = updateEntity("template", template.id, { remixAnalysis });
  updateJob(jobId, {
    status: "succeeded",
    progress: 100,
    result: { templateId: template.id, remixAnalysis, template: updated },
    error: remixAnalysis.warnings.length ? remixAnalysis.warnings.join("\n") : null
  });
}

async function importTemplateFromUrl(sourceUrl, jobId) {
  const workDir = resolve(mediaRoot, "templates", id("import"));
  await mkdir(workDir, { recursive: true });
  const script =
    process.env.VIDEO_FETCH_SCRIPT ||
    "C:\\Users\\dell\\.codex\\skills\\video-copy-extractor\\scripts\\fetch_video.mjs";
  const result = await runProcess(process.execPath, [script, sourceUrl, "--out", workDir], {
    cwd: workDir,
    env: {
      NODE_PATH:
        process.env.CODEX_NODE_MODULES ||
        "C:\\Users\\dell\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules"
    }
  });
  const fetchResult = JSON.parse(await readFile(join(workDir, "fetch_result.json"), "utf8"));
  const videoPath = fetchResult.video_path || join(workDir, "video.mp4");
  const template = await createTemplateFromFile(videoPath, {
    sourceKind: "url",
    title: fetchResult.caption || fetchResult.title || "在线视频模板",
    sourceUrl,
    author: fetchResult.author || ""
  });
  updateJob(jobId, {
    progress: 55,
    result: { fetchResult, templateId: template.id },
    log: result.stderr
  });
  const analysisJob = createJob("template-analysis", {
    templateId: template.id,
    input: { templateId: template.id }
  });
  queueJob(analysisJob.id, () => analyzeTemplate(template.id, analysisJob.id, false));
  updateJob(jobId, {
    status: "succeeded",
    progress: 100,
    result: { templateId: template.id, analysisJobId: analysisJob.id }
  });
}

function buildLookPrompt(look) {
  return [
    `cinematic wedding character reference portrait, adult East Asian ${look.gender === "male" ? "man" : "woman"}, ${look.description}.`,
    "full-body or three-quarter body, accurate adult facial proportions, natural hands, real skin texture, physically accurate fabric and metal details.",
    "clean neutral photography studio background, editorial lighting, consistent identity reference, no text, no watermark, no border, no collage.",
    `era: ${look.era}; mood: ${look.prompt}.`
  ].join("");
}

async function generateLook(jobId) {
  const job = getEntity("job", jobId);
  const model = getModelOrDefault(job.modelId, "image");
  if (!model) throw new Error("未配置图片模型");
  const outputDir = resolve(mediaRoot, "generated", job.id);
  const result =
    model.provider === "pollinations"
      ? await generatePollinationsImage({
          prompt: job.input.prompt,
          outputPath: resolve(outputDir, `${job.id}.jpg`),
          width: model.parameters?.width || 1024,
          height: model.parameters?.height || 1365,
          model: model.model || "flux"
        })
      : await generateImage({
          profile: model.profile,
          model: model.model,
          prompt: job.input.prompt,
          outputDir,
          inputs: job.input.referencePath ? [job.input.referencePath] : [],
          parameters: model.parameters
        });
  const localPath = firstLocalPath(result);
  const contentHash = localPath ? await sha256File(localPath).catch(() => "") : "";
  const asset = saveEntity("asset", {
    id: id("asset"),
    kind: "look-image",
    lookId: job.input.lookId,
    projectId: job.input.projectId,
    title: getEntity("look", job.input.lookId)?.title || "人物造型",
    localPath,
    url: mediaUrlForPath(localPath),
    outputUrl: result.output_url || "",
    provider: result.provider,
    model: model.model,
    jobId: job.id,
    contentHash,
    version: 1
  });
  if (job.input.lookId && localPath) {
    updateEntity("look", job.input.lookId, {
      imagePath: mediaUrlForPath(localPath),
      localImagePath: localPath,
      status: "ready"
    });
  }
  updateJob(jobId, {
    status: "succeeded",
    progress: 100,
    result: { provider: result, asset }
  });
}

async function generateTextJob(jobId) {
  const job = getEntity("job", jobId);
  const model = getModelOrDefault(job.modelId, "text");
  if (!model) throw new Error("未配置文字模型");
  const result =
    model.provider === "pollinations"
      ? await generatePollinationsText({
          prompt: job.input.prompt,
          instructions: job.input.instructions
        })
      : await chatText({
          profile: model.profile,
          model: model.model,
          prompt: job.input.prompt,
          instructions: job.input.instructions,
          parameters: { ...model.parameters, ...job.input.parameters }
        });
  updateJob(jobId, {
    status: "succeeded",
    progress: 100,
    result: {
      content: result.content,
      responseId: result.id,
      usage: result.usage,
      model: model.model
    }
  });
}

async function generateImageJob(jobId) {
  const job = getEntity("job", jobId);
  const model = getModelOrDefault(job.modelId, "image");
  if (!model) throw new Error("未配置图片模型");
  const outputDir = resolve(mediaRoot, "generated", job.id);
  const result =
    model.provider === "pollinations"
      ? await generatePollinationsImage({
          prompt: job.input.prompt,
          outputPath: resolve(outputDir, `${job.id}.jpg`),
          width: model.parameters?.width || 1024,
          height: model.parameters?.height || 1365,
          model: model.model || "flux"
        })
      : await generateImage({
          profile: model.profile,
          model: model.model,
          prompt: job.input.prompt,
          outputDir,
          inputs: job.input.inputs,
          parameters: model.parameters
        });
  const localPath = firstLocalPath(result);
  const contentHash = localPath ? await sha256File(localPath).catch(() => "") : "";
  const asset = saveEntity("asset", {
    id: id("asset"),
    kind: job.input.kind || "image",
    projectId: job.projectId,
    title: job.input.prompt.slice(0, 40),
    localPath,
    url: mediaUrlForPath(localPath),
    outputUrl: result.output_url || "",
    provider: result.provider,
    model: model.model,
    jobId: job.id,
    contentHash,
    version: 1
  });
  updateJob(jobId, {
    status: "succeeded",
    progress: 100,
    result: { provider: result, asset }
  });
}

async function submitVideoJob(jobId) {
  const job = getEntity("job", jobId);
  const model = getModelOrDefault(job.modelId, "video");
  if (!model) throw new Error("未配置视频模型");
  const outputDir = resolve(mediaRoot, "generated", job.id);
  const result = await submitVideo({
    profile: model.profile,
    model: model.model,
    prompt: job.input.prompt,
    outputDir,
    inputs: job.input.inputs,
    parameters: { ...model.parameters, ...job.input.parameters }
  });
  const taskId = result.task_id || result.id || result.taskId;
  if (!taskId) {
    updateJob(jobId, {
      status: "unknown",
      error: "视频提交没有返回 task_id，保留请求并停止自动重试",
      result: { provider: result }
    });
    return;
  }
  updateJob(jobId, {
    status: result.status?.phase || result.status || "queued",
    progress: 30,
    providerTaskId: taskId,
    result: { provider: result }
  });
  scheduleVideoPolling(jobId, outputDir);
}

function scheduleVideoPolling(jobId, outputDir, attempt = 0) {
  const timer = setTimeout(async () => {
    resumeTimers.delete(timer);
    const job = getEntity("job", jobId);
    if (!job || ["succeeded", "failed", "cancelled"].includes(job.status)) return;
    try {
      const result = await queryVideoTask(job.providerTaskId, outputDir);
      const updated = await applyVideoQuery(job, result);
      if (!["succeeded", "failed", "cancelled"].includes(updated.status) && attempt < 180) {
        scheduleVideoPolling(jobId, outputDir, attempt + 1);
      }
    } catch (error) {
      updateJob(jobId, {
        status: attempt >= 180 ? "failed" : "running",
        progress: 35,
        error: `查询原任务失败：${error.message}`
      });
      if (attempt < 180) scheduleVideoPolling(jobId, outputDir, attempt + 1);
    }
  }, Math.min(30000, 5000 + attempt * 200));
  resumeTimers.add(timer);
}

async function applyVideoQuery(job, result) {
  const phase = result.status?.phase || result.status || "running";
  if (["succeeded", "failed", "cancelled"].includes(phase)) {
    if (phase === "succeeded") {
      const localPath = firstLocalPath(result);
      const contentHash = localPath ? await sha256File(localPath).catch(() => "") : "";
      const asset = saveEntity("asset", {
        id: id("asset"),
        kind: "video",
        projectId: job.projectId,
        title: job.input?.prompt?.slice(0, 40) || "视频镜头",
        localPath,
        url: mediaUrlForPath(localPath),
        outputUrl: result.output_url || "",
        provider: "volcengine-ark",
        model: job.modelId,
        jobId: job.id,
        providerTaskId: job.providerTaskId,
        contentHash,
        version: 1
      });
      return updateJob(job.id, {
        status: "succeeded",
        progress: 100,
        result: { provider: result, asset }
      });
    }
    return updateJob(job.id, {
      status: phase,
      error: result.error || result.status?.message || "视频任务失败",
      result: { provider: result }
    });
  }
  return updateJob(job.id, {
    status: phase,
    progress: phase === "running" ? 70 : 40,
    result: { provider: result }
  });
}

async function renderJob(jobId) {
  const job = getEntity("job", jobId);
  const outputDir = resolve(mediaRoot, "renders", job.id);
  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, `${job.projectId || "wedding-film"}-${job.id}.mp4`);
  let musicPath = job.input.musicPath || "";
  if (!musicPath && job.input.autoMusic !== false) {
    musicPath = join(outputDir, "original-score.wav");
    await renderOriginalBgm(
      musicPath,
      Math.max(8, Number(job.input.duration || 40)),
      job.input.mood || "warm-cinematic"
    );
  }
  await renderTimeline({
    clips: job.input.clips || [],
    outputPath,
    width: job.input.width || 1280,
    height: job.input.height || 720,
    fps: job.input.fps || 24,
    musicPath,
    musicStart: job.input.musicStart || 0,
    voicePath: job.input.voicePath || "",
    subtitlePath: job.input.subtitlePath || ""
  });
  const verified = await verifyMedia(outputPath);
  const advancedCheck = await runAdvancedMediaCheck(outputPath, "youtube").catch((error) => ({
    status: "failed",
    ok: false,
    error: safeError(error)
  }));
  const technicalQc = await inspectRenderedQuality({
    filePath: outputPath,
    expectedDuration: Number(job.input.duration || verified.duration),
    width: Number(job.input.width || 1280),
    height: Number(job.input.height || 720),
    fps: Number(job.input.fps || 24),
    subtitlePath: job.input.subtitlePath || ""
  }).catch((error) => ({
    ok: false,
    checks: {},
    error: safeError(error)
  }));
  const outputUrl = mediaUrlForPath(outputPath);
  const editProjectPath = join(outputDir, "edit-project.json");
  await writeFile(
    editProjectPath,
    JSON.stringify(
      {
        schema: "xying-edit-project/v1",
        projectId: job.projectId,
        title: job.input.title || "婚礼微电影",
        fps: job.input.fps || 24,
        resolution: {
          width: job.input.width || 1280,
          height: job.input.height || 720
        },
        clips: job.input.clips || [],
        audio: {
          voicePath: job.input.voicePath || "",
          musicPath,
          autoMusic: job.input.autoMusic !== false
        },
        subtitlePath: job.input.subtitlePath || "",
        timelineHash: job.input.timelineHash || "",
        timelineRevision: job.input.timelineRevision || 1,
        timeline: job.input.timeline || null,
        outputPath,
        verifiedMedia: verified,
        advancedCheck,
        technicalQc,
        createdAt: new Date().toISOString()
      },
      null,
      2
    ),
    "utf8"
  );
  const exportEntity = saveEntity("export", {
    id: id("export"),
    projectId: job.projectId,
    jobId: job.id,
    title: job.input.title || "婚礼微电影",
    localPath: outputPath,
    contentHash: await sha256File(outputPath),
    version: 1,
    media: verified,
    technicalQc
  });
  const asset = saveEntity("asset", {
    id: id("asset"),
    kind: "export",
    projectId: job.projectId,
    title: job.input.title || "婚礼微电影",
    localPath: outputPath,
    url: outputUrl,
    mimeType: "video/mp4",
    media: verified,
    contentHash: await sha256File(outputPath),
    technicalQc,
    version: 1,
    jobId: job.id
  });
  const editProjectAsset = saveEntity("asset", {
    id: id("asset"),
    kind: "edit-project",
    projectId: job.projectId,
    title: `${job.input.title || "婚礼微电影"} · 可编辑工程`,
    localPath: editProjectPath,
    url: mediaUrlForPath(editProjectPath),
    mimeType: "application/json",
    jobId: job.id
  });
  updateJob(jobId, {
    status: "succeeded",
    progress: 100,
    result: {
      outputPath,
      url: outputUrl,
      media: verified,
      export: exportEntity,
      asset,
      editProject: editProjectAsset,
      advancedCheck,
      technicalQc
    }
  });
}

function createJob(kind, payload = {}) {
  return saveEntity("job", {
    id: id("job"),
    kind,
    status: "queued",
    progress: 0,
    modelId: payload.modelId || "",
    projectId: payload.projectId || "",
    templateId: payload.templateId || "",
    input: payload.input || {},
    result: null,
    error: null,
    providerTaskId: "",
    log: ""
  });
}

function updateJob(jobId, patch) {
  return updateEntity("job", jobId, patch);
}

function queueJob(jobId, worker) {
  setImmediate(async () => {
    updateJob(jobId, { status: "running", progress: Math.max(5, getEntity("job", jobId)?.progress || 0) });
    try {
      await worker();
      const current = getEntity("job", jobId);
      if (current && current.status === "running") {
        updateJob(jobId, { status: "succeeded", progress: 100 });
      }
    } catch (error) {
      const currentJob = getEntity("job", jobId);
      const message = safeError(error);
      if (
        currentJob?.modelId &&
        /subscription has expired|subscription is invalid|quota|BalanceNotEnough/i.test(
          message
        )
      ) {
        updateEntity("model", currentJob.modelId, {
          status: "subscription_expired",
          lastError: message
        });
      }
      updateJob(jobId, {
        status: "failed",
        error: message
      });
    }
  });
}

function getModelOrDefault(modelId, category) {
  if (modelId) {
    const explicit = getEntity("model", modelId);
    if (explicit) return explicit;
  }
  return listEntities("model", 100).find(
    (model) => model.category === category && model.isDefault
  );
}

async function testModel(model) {
  try {
    if (model.provider === "volcengine-ark") {
      const resources = await arkResources(model.profile, model.category);
      const ids = (resources.items || []).map((item) => item.id);
      const callable = ids.includes(model.model);
      return {
        ok: callable,
        message: callable
          ? `连接正常，当前模型 ${model.model} 可见`
          : `当前 Profile 未发现可调用的 ${model.model}；资源数 ${ids.length}`,
        resources: ids
      };
    }
    if (model.provider === "ffmpeg") {
      const result = await runProcess("ffmpeg", ["-version"]);
      return { ok: true, message: result.stdout.split("\n")[0] };
    }
    if (model.provider === "edge-tts") {
      return { ok: true, message: "Edge TTS 配置已就绪，生成时验证网络与音色" };
    }
    if (model.provider === "windows-sapi") {
      return { ok: true, message: "Windows 本地中文语音可用" };
    }
    if (model.provider === "xying-original") {
      return { ok: true, message: "本地原创配乐引擎可用" };
    }
    if (model.provider === "pollinations") {
      return {
        ok: true,
        message:
          model.category === "text"
            ? "Pollinations GPT-OSS 20B 文字引擎已配置"
            : "Pollinations FLUX 免费图片引擎已配置"
      };
    }
    if (model.provider === "beatra") {
      return { ok: false, message: "Beatra 尚未初始化，需要安装并完成账号授权" };
    }
    if (model.provider === "vvv-remotion") {
      const root = await findVvvRoot();
      if (!root) return { ok: false, message: "未找到 VVV 模板环境" };
      const result = await checkVvv(root);
      return {
        ok: result.status === "passed",
        message:
          result.status === "passed"
            ? "VVV / Remotion 模板环境可用；Node 版本差异会在渲染时提示"
            : "VVV 检查未通过",
        details: result
      };
    }
    return { ok: false, message: "未知模型供应商" };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

function parseModelJson(text) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error("模型没有返回合法 JSON");
  }
}

function normalizeAiShots(shots, duration) {
  if (!Array.isArray(shots) || shots.length === 0) {
    return sceneCutsToShots([], duration);
  }
  return shots
    .map((shot, index) => ({
      index: index + 1,
      start: Math.max(0, Number(shot.start || 0)),
      end: Math.min(duration, Number(shot.end || duration)),
      duration: Math.max(0.1, Number(shot.end || duration) - Number(shot.start || 0)),
      framesAt24fps: Math.round(
        Math.max(0.1, Number(shot.end || duration) - Number(shot.start || 0)) * 24
      ),
      framing: shot.framing || "",
      action: shot.action || "",
      camera: shot.camera || "",
      transition: shot.transition || "",
      characters: shot.characters || "",
      emotion: shot.emotion || ""
    }))
    .filter((shot) => shot.end > shot.start)
    .sort((a, b) => a.start - b.start);
}

function firstLocalPath(result) {
  return (
    result.local_path ||
    result.localPath ||
    result.local_paths?.[0] ||
    result.result?.local_path ||
    result.result?.local_paths?.[0] ||
    ""
  );
}

function normalizeAspect(width, height) {
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function splitSubtitleLines(text, duration) {
  const sentences = splitSubtitleText(text, 18);
  const weights = sentences.map((line) => Math.max(4, line.length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;
  return sentences.map((line, index) => {
    const start = cursor;
    const end =
      index === sentences.length - 1
        ? duration
        : Math.min(duration, cursor + (duration * weights[index]) / totalWeight);
    cursor = end;
    return { text: line, start: Number(start.toFixed(3)), end: Number(end.toFixed(3)) };
  });
}

function toSrt(lines) {
  const stamp = (seconds) => {
    const ms = Math.round(seconds * 1000);
    const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
    const m = String(Math.floor(ms / 60000) % 60).padStart(2, "0");
    const s = String(Math.floor(ms / 1000) % 60).padStart(2, "0");
    const msPart = String(ms % 1000).padStart(3, "0");
    return `${h}:${m}:${s},${msPart}`;
  };
  return lines
    .map(
      (line, index) =>
        `${index + 1}\n${stamp(line.start)} --> ${stamp(line.end)}\n${line.text}\n`
    )
    .join("\n");
}

function mediaUrlForPath(localPath) {
  if (!localPath) return "";
  const relativePath = relative(mediaRoot, resolve(localPath)).replaceAll("\\", "/");
  if (relativePath.startsWith("..")) return "";
  return `/media/${relativePath}`;
}

function safeError(error) {
  return String(error?.message || error || "未知错误")
    .replace(/ark-[A-Za-z0-9_-]+/g, "ark-***")
    .slice(0, 2000);
}

function sendJson(response, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store"
  });
  response.end(body);
}

function setCors(response, origin = "") {
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-File-Name, X-Xying-Token"
  );
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
}

function resumeVideoJobs() {
  for (const job of listEntities("job", 200)) {
    if (
      job.kind === "video-generation" &&
      job.providerTaskId &&
      !["succeeded", "failed", "cancelled"].includes(job.status)
    ) {
      scheduleVideoPolling(job.id, resolve(mediaRoot, "generated", job.id));
    }
  }
}
