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
  if (project.mode === "remix" && !explicitId) return [];
  const selected =
    candidates.find((asset) => asset.id === explicitId) ||
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
  const timeline = buildProjectTimeline(project, assets);
  const usedAssetIds = new Set([
    ...timeline.tracks.video.map((item) => item.assetId),
    ...timeline.tracks.voice.map((item) => item.assetId),
    ...timeline.tracks.music.map((item) => item.assetId),
    ...timeline.tracks.subtitle.map((item) => item.assetId)
  ]);
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
  const payload = {
    projectId: project.id,
    mode: mode === "remix" ? "remix" : "story",
    step: Number(step),
    timelineHash: timeline.hash,
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
