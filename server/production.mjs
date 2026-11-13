import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { relative, resolve, sep } from "node:path";
import {
  buildTimeline,
  formatTimecode,
  framesToSeconds,
  secondsToFrames,
  shotReviewComplete
} from "../src/production-model.mjs";

export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

export function sha256Text(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export async function sha256File(filePath) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

export function assertInside(rootDirectory, candidate) {
  const root = resolve(rootDirectory);
  const target = resolve(root, candidate);
  const rel = relative(root, target);
  if (rel === "") return target;
  if (rel === ".." || rel.startsWith(`..${sep}`) || resolve(rel) === rel) {
    throw new Error("文件路径越界，必须位于项目素材目录内");
  }
  return target;
}

function assetBinding(value) {
  if (!value) return { assetId: "", hash: "" };
  if (typeof value === "string") return { assetId: value, hash: "" };
  return {
    assetId: value.assetId || "",
    hash: value.hash || value.contentHash || ""
  };
}

function normalizeStoryboardShots(project, assetsById) {
  return (Array.isArray(project.storyboard) ? project.storyboard : []).map(
    (shot, index) => {
      const firstFrame = assetBinding(shot.assets?.firstFrame);
      const video = assetBinding(shot.assets?.video);
      const finalClip = assetBinding(shot.assets?.finalClip);
      const selectedClip = finalClip.assetId ? finalClip : video;
      return {
        ...shot,
        id: shot.id || `shot-${String(index + 1).padStart(2, "0")}`,
        order: shot.order || index + 1,
        start: Number(shot.start || 0),
        end: Number(shot.end || 0),
        frames:
          Number(shot.frames) ||
          secondsToFrames(Number(shot.end || 0) - Number(shot.start || 0), project.fps || 24),
        promptVersion:
          shot.promptVersion || {
            version: 1,
            hash: "",
            text: String(shot.prompt || "")
          },
        assets: {
          firstFrame,
          video,
          finalClip
        },
        assetId: selectedClip.assetId || "",
        hash:
          selectedClip.hash || assetsById.get(selectedClip.assetId)?.contentHash || "",
        review: shot.review || {},
        status: shot.status || "draft"
      };
    }
  );
}

function selectedAudioTrack(project, assets, kind, explicitId) {
  const candidates = assets.filter((asset) => asset.kind === kind);
  const fullMixId = project.timelineSelection?.fullMixAssetId;
  if (fullMixId && kind === "music") return [];
  if (fullMixId && kind === "voice") {
    const fullMix = assets.find(
      (asset) => asset.id === fullMixId && asset.kind === "mix"
    );
    if (fullMix) {
      return [
        {
          assetId: fullMix.id,
          hash: fullMix.contentHash || fullMix.sha256 || "",
          start: 0,
          end: Number(project.duration || 0),
          sourceStart: 0
        }
      ];
    }
  }
  if (project.mode === "remix" && !explicitId) return [];
  const selected =
    assets.find((asset) => asset.id === explicitId) ||
    candidates
      .slice()
      .sort(
        (left, right) =>
          new Date(right.updatedAt || 0).getTime() -
          new Date(left.updatedAt || 0).getTime()
      )[0];
  if (!selected) return [];
  return [
    {
      assetId: selected.id,
      hash: selected.contentHash || selected.sha256 || "",
      start: 0,
      end: Number(project.duration || 0),
      sourceStart: Number(selected.sourceStart || 0)
    }
  ];
}

export function buildProjectTimeline(project, assets = [], revision = 1) {
  const fps = Number(project.fps) || 24;
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const shots = normalizeStoryboardShots(project, assetsById);
  const selection = project.timelineSelection || {};
  const timeline = buildTimeline({
    mode: project.mode || "story",
    duration: Number(project.duration) || 0,
    fps,
    shots,
    voice: selectedAudioTrack(project, assets, "voice", selection.voiceAssetId),
    music: selectedAudioTrack(project, assets, "music", selection.musicAssetId),
    subtitle: selectedAudioTrack(project, assets, "subtitle", selection.subtitleAssetId)
  });
  timeline.revision = Math.max(1, Number(revision) || 1);
  const hashPayload = {
    schema: timeline.schema,
    mode: timeline.mode,
    fps: timeline.fps,
    duration: timeline.duration,
    totalFrames: timeline.totalFrames,
    tracks: timeline.tracks
  };
  timeline.hash = sha256Text(stableStringify(hashPayload));
  timeline.timecode = formatTimecode(timeline.totalFrames, timeline.fps);
  return timeline;
}

export function approvalSnapshot(project, assets, { mode, step }) {
  const numericStep = Number(step);
  const timelineProject =
    numericStep < 12
      ? {
          ...project,
          timelineSelection: {
            ...(project.timelineSelection || {}),
            fullMixAssetId: ""
          }
        }
      : project;
  const timeline = buildProjectTimeline(timelineProject, assets);
  const scopedTracks = {
    video:
      numericStep >= 6
        ? timeline.tracks.video.map((track) =>
            numericStep >= 9
              ? track
              : {
                  id: track.id,
                  shotId: track.shotId || track.id,
                  order: track.order,
                  startFrame: track.startFrame,
                  endFrame: track.endFrame,
                  duration: track.duration
                }
          )
        : [],
    voice: [4, 5, 12, 13, 14].includes(numericStep)
      ? timeline.tracks.voice
      : [],
    music: [10, 13, 14].includes(numericStep)
      ? timeline.tracks.music
      : [],
    subtitle: numericStep >= 13 ? timeline.tracks.subtitle : []
  };
  const scopedTimelineHash = sha256Text(
    stableStringify({
      schema: timeline.schema,
      mode: timeline.mode,
      fps: timeline.fps,
      duration: timeline.duration,
      totalFrames: timeline.totalFrames,
      tracks: scopedTracks
    })
  );
  const usedAssetIds = new Set([
    ...scopedTracks.video.map((item) => item.assetId),
    ...scopedTracks.voice.map((item) => item.assetId),
    ...scopedTracks.music.map((item) => item.assetId),
    ...scopedTracks.subtitle.map((item) => item.assetId)
  ]);
  if (numericStep >= 7) {
    for (const shot of project.storyboard || []) {
      if (shot.assets?.firstFrame?.assetId) {
        usedAssetIds.add(shot.assets.firstFrame.assetId);
      }
      if (numericStep >= 9 && shot.assets?.video?.assetId) {
        usedAssetIds.add(shot.assets.video.assetId);
      }
      if (numericStep >= 9 && shot.assets?.finalClip?.assetId) {
        usedAssetIds.add(shot.assets.finalClip.assetId);
      }
    }
  }
  if (numericStep >= 11 && project.mixSampleAssetId && numericStep === 11) {
    usedAssetIds.add(project.mixSampleAssetId);
  }
  if (numericStep >= 12 && project.mixAssetId) {
    usedAssetIds.add(project.mixAssetId);
  }
  if (numericStep >= 13 && project.previewAssetId) {
    usedAssetIds.add(project.previewAssetId);
  }
  if (numericStep >= 14 && project.deliveryPackageAssetId) {
    usedAssetIds.add(project.deliveryPackageAssetId);
  }
  const assetHashes = Object.fromEntries(
    assets
      .filter((asset) => usedAssetIds.has(asset.id))
      .map((asset) => [asset.id, asset.contentHash || asset.sha256 || ""])
  );
  const promptVersions = Object.fromEntries(
    (project.storyboard || []).map((shot) => [
      shot.id,
      `${Number(shot.promptVersion?.version || 1)}:${shot.promptVersion?.hash || sha256Text(String(shot.prompt || ""))}`
    ])
  );
  const storyboardContent = (project.storyboard || []).map((shot) => ({
    id: shot.id,
    start: shot.start,
    end: shot.end,
    frames: shot.frames,
    title: shot.title,
    scene: shot.scene,
    shot: shot.shot,
    move: shot.move,
    act: shot.act,
    prompt: shot.prompt || "",
    source: shot.source || null,
    characters: shot.characters || null,
    status: numericStep >= 9 ? shot.status || "" : undefined,
    review: numericStep >= 9 ? shot.review || {} : undefined,
    imagePrompt: numericStep >= 7 ? shot.imagePrompt || "" : undefined,
    imagePromptVersion:
      numericStep >= 7 ? shot.imagePromptVersion || null : undefined,
    imageStatus: numericStep >= 7 ? shot.imageStatus || "" : undefined,
    imageReview: numericStep >= 7 ? shot.imageReview || {} : undefined,
    videoPrompt: numericStep >= 9 ? shot.videoPrompt || "" : undefined,
    videoPromptVersion:
      numericStep >= 9 ? shot.videoPromptVersion || null : undefined
  }));
  const scopedContent = {
      groom: project.groom || "",
      bride: project.bride || "",
      weddingDate: project.weddingDate || project.date || "",
      city: project.city || "",
      story: project.story || "",
      storyBeats: project.storyBeats || {},
      duration: project.duration,
      theme: project.theme || "",
      tone: project.tone || "",
      aspect: project.aspect || "",
      templateId: project.templateId || "",
      photoAssetIds: project.photoAssetIds || {},
      musicLicense: numericStep >= 10 ? project.musicLicense || "" : undefined,
      subtitleStyle: numericStep >= 13 ? project.subtitleStyle || null : undefined,
      mixSampleAssetId:
        numericStep >= 11 ? project.mixSampleAssetId || "" : undefined,
      mixAssetId: numericStep >= 12 ? project.mixAssetId || "" : undefined,
      deliveryPackageAssetId:
        numericStep >= 14 ? project.deliveryPackageAssetId || "" : undefined,
      previewAssetId:
        numericStep >= 13 ? project.previewAssetId || "" : undefined,
      treatment: project.treatment || null,
      remixTargets: project.remixTargets || null,
      remixRange: project.remixRange || null,
      storyboard: numericStep >= 6 ? storyboardContent : []
  };
  const contentHash = sha256Text(stableStringify(scopedContent));
  const payload = {
    projectId: project.id,
    mode: mode === "remix" ? "remix" : "story",
    step: Number(step),
    timelineHash: scopedTimelineHash,
    contentHash,
    assetHashes,
    promptVersions
  };
  return {
    ...payload,
    fingerprint: sha256Text(stableStringify(payload))
  };
}

export function approveStep(project, { mode, step, snapshot, evidence }) {
  if (!snapshot?.fingerprint) throw new Error("审批快照缺失");
  const workflow = project.workflow || {
    currentStep: 1,
    approvals: {}
  };
  const numericStep = Math.max(1, Number(step) || 1);
  return {
    ...workflow,
    currentStep:
      mode === "remix"
        ? Math.min(5, Math.max(Number(workflow.currentStep || 1), numericStep + 1))
        : Math.min(15, Math.max(Number(workflow.currentStep || 1), numericStep + 1)),
    approvals: {
      ...(workflow.approvals || {}),
      [numericStep]: {
        approved: true,
        approvedAt: new Date().toISOString(),
        mode: mode === "remix" ? "remix" : "story",
        step: numericStep,
        evidence: String(evidence || "").trim() || "未填写确认依据",
        fingerprint: snapshot.fingerprint,
        timelineHash: snapshot.timelineHash,
        contentHash: snapshot.contentHash,
        assetHashes: snapshot.assetHashes || {},
        promptVersions: snapshot.promptVersions || {}
      }
    }
  };
}

export function validateRenderTimeline(project, timeline, assets) {
  const expectedFrames = secondsToFrames(Number(project.duration), project.fps || 24);
  if (Number(timeline.totalFrames) !== expectedFrames) {
    throw new Error(
      `时间轴总帧数不一致：项目 ${expectedFrames}，成片 ${timeline.totalFrames}`
    );
  }
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const shotsById = new Map(
    (Array.isArray(project.storyboard) ? project.storyboard : []).map((shot) => [
      shot.id,
      shot
    ])
  );
  const videoTracks = (timeline.tracks?.video || [])
    .slice()
    .sort((left, right) => left.startFrame - right.startFrame);
  if (videoTracks.length === 0) throw new Error("时间轴没有视频镜头");
  if (videoTracks[0].startFrame !== 0) throw new Error("视频镜头必须从第 0 帧连续开始");

  let expectedStart = 0;
  const clips = [];
  for (const track of videoTracks) {
    if (track.startFrame !== expectedStart) {
      throw new Error("视频镜头必须连续，不能存在缺口或重叠");
    }
    expectedStart = track.endFrame;
    const shotId = track.shotId || track.id;
    const shot = shotsById.get(shotId);
    if (!shot) throw new Error(`未找到镜头 ${shotId || "（空镜号）"}`);
    if (shot.status !== "approved") throw new Error(`镜头 ${shot.id} 未批准`);
    if (!shotReviewComplete(shot.review)) throw new Error(`镜头 ${shot.id} 人工质检未通过`);
    const asset = assetsById.get(track.assetId);
    if (!asset) throw new Error(`镜头 ${shot.id} 的成片素材不存在`);
    const actualHash = asset.contentHash || asset.sha256 || "";
    if (track.hash && actualHash && track.hash !== actualHash) {
      throw new Error(`镜头 ${shot.id} 素材哈希已经变化`);
    }
    const duration = framesToSeconds(track.endFrame - track.startFrame, timeline.fps);
    if (asset.media?.duration && Number(asset.media.duration) + 0.05 < duration) {
      throw new Error(`镜头 ${shot.id} 源素材时长不足`);
    }
    clips.push({
      shotId: shot.id,
      asset,
      path: asset.localPath,
      start: Number(track.in || 0),
      duration
    });
  }
  if (expectedStart !== expectedFrames) {
    throw new Error(`视频镜头没有覆盖完整时间轴：${expectedStart}/${expectedFrames}`);
  }

  const resolveAudio = (tracks, label) =>
    tracks.map((track) => {
      const asset = assetsById.get(track.assetId);
      if (!asset) throw new Error(`${label}素材不存在：${track.assetId}`);
      return asset;
    });
  return {
    clips,
    voiceAssets: resolveAudio(timeline.tracks?.voice || [], "旁白"),
    musicAssets: resolveAudio(timeline.tracks?.music || [], "音乐"),
    subtitleAssets: resolveAudio(timeline.tracks?.subtitle || [], "字幕"),
    duration: framesToSeconds(expectedFrames, timeline.fps)
  };
}

export function storyWorkflowReady(project, assets, step, workflow = project.workflow) {
  const shots = Array.isArray(project.storyboard) ? project.storyboard : [];
  const hasKind = (kind) => assets.some((asset) => asset.kind === kind);
  const imageApproved = (shot) =>
    shot.imageStatus === "approved" &&
    Boolean(shot.assets?.firstFrame?.assetId) &&
    ["identity", "sameCouple", "hands", "costume", "composition"].every(
      (key) => shot.imageReview?.[key] === "passed"
    );
  const keyShotIds = shots.length
    ? [
        shots[0]?.id,
        shots[Math.floor((shots.length - 1) / 2)]?.id,
        shots.at(-1)?.id
      ].filter(Boolean)
    : [];
  if (step === 1) {
    return Boolean(
      String(project.groom || "").trim() &&
        String(project.bride || "").trim() &&
        String(project.story || "").trim().length >= 20
    );
  }
  if (step === 2) return Array.isArray(project.treatment?.acts) && project.treatment.acts.length === 5;
  if (step === 3) return Boolean(workflow?.approvals?.[2]);
  if (step === 4 || step === 5) return hasKind("voice");
  if (step === 6) return shots.length > 0;
  if (step === 7) {
    return (
      keyShotIds.length > 0 &&
      shots
        .filter((shot) => keyShotIds.includes(shot.id))
        .every(imageApproved)
    );
  }
  if (step === 8) return shots.length > 0 && shots.every(imageApproved);
  if (step === 9) {
    return (
      shots.length > 0 &&
      shots.every(
        (shot) =>
          shot.status === "approved" &&
          shotReviewComplete(shot.review) &&
          shot.assets?.firstFrame?.assetId &&
          shot.assets?.video?.assetId
      )
    );
  }
  if (step === 10) {
    return hasKind("music") && Boolean(String(project.musicLicense || "").trim());
  }
  if (step === 11) {
    return assets.some((asset) => asset.id === project.mixSampleAssetId);
  }
  if (step === 12) {
    return assets.some(
      (asset) => asset.id === project.mixAssetId && asset.kind === "mix"
    );
  }
  if (step === 13) {
    const approvedAt = workflow?.approvals?.[12]?.approvedAt || "";
    return assets.some(
      (asset) =>
        asset.id === project.previewAssetId &&
        asset.kind === "preview" &&
        (!approvedAt || String(asset.createdAt || "") >= approvedAt)
    );
  }
  if (step === 14) {
    return assets.some(
      (asset) =>
        asset.id === project.deliveryPackageAssetId &&
        asset.kind === "delivery-package"
    );
  }
  return false;
}

export function remixWorkflowReady(project, template, assets, step) {
  if (step === 1) return Number(template?.remixExtraction?.totalFrames || 0) > 0;
  if (step === 2) return Boolean(template?.remixAnalysis);
  if (step === 3) {
    const shots = Array.isArray(project.storyboard) ? project.storyboard : [];
    return (
      shots.length > 0 &&
      shots.length <= 8 &&
      shots.every(
        (shot) =>
          shot.status === "approved" &&
          shotReviewComplete(shot.review) &&
          shot.assets?.video?.assetId
      )
    );
  }
  if (step === 4) {
    const approvedAt =
      project.remixWorkflow?.approvals?.[3]?.approvedAt || "";
    return assets.some(
      (asset) =>
        asset.kind === "export" &&
        (!approvedAt || String(asset.createdAt || "") >= approvedAt)
    );
  }
  return false;
}

export function rejectFilesystemPathKeys(value, pathPrefix = "") {
  const forbidden = new Set([
    "path",
    "localPath",
    "voicePath",
    "musicPath",
    "subtitlePath",
    "referencePath",
    "clipPath",
    "videoPath",
    "imagePath"
  ]);
  if (value == null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      rejectFilesystemPathKeys(item, `${pathPrefix}[${index}]`)
    );
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) {
      throw new Error(`接口不接受文件路径字段：${pathPrefix}${key}`);
    }
    rejectFilesystemPathKeys(child, `${pathPrefix}${key}.`);
  }
}
