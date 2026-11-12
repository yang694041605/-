export const FILM_FPS = 24;
export const STORY_STEP_COUNT = 14;
export const REMIX_STEP_COUNT = 4;

export const REVIEW_CHECKS = [
  "identity",
  "crossFace",
  "hands",
  "actionMatch",
  "backgroundDrift",
  "blackBars",
  "subtitleSafety",
  "audioSync"
];

const MODE_ROUTES = new Set(["story", "remix"]);
const PAGE_ROUTES = new Set([
  "overview",
  "assets",
  "wizard",
  "templates",
  "story",
  "characters",
  "looks",
  "scenes",
  "storyboard",
  "generate",
  "prompts",
  "models",
  "edit",
  "audio",
  "export",
  "jobs",
  "method",
  "guide",
  "remix"
]);

export function parseRouteHash(input = "") {
  const raw = String(input || "")
    .trim()
    .replace(/^#\/?/, "")
    .replace(/\/+$/, "");
  if (!raw) return { page: "overview", mode: "story", step: null };

  const parts = raw.split("/").filter(Boolean);
  const legacyStep = raw.match(/^step(\d+)$/i);
  if (legacyStep) {
    const step = Number(legacyStep[1]);
    if (step >= 1 && step <= STORY_STEP_COUNT) {
      return { page: "story", mode: "story", step };
    }
    return { page: "wizard", mode: "story", step: null };
  }

  if (parts[0] === "story" && parts[1] === "step") {
    const step = Number(parts[2]);
    return step >= 1 && step <= STORY_STEP_COUNT
      ? { page: "story", mode: "story", step }
      : { page: "story", mode: "story", step: null };
  }
  if (parts[0] === "remix" && parts[1] === "step") {
    const step = Number(parts[2]);
    return step >= 1 && step <= REMIX_STEP_COUNT
      ? { page: "remix", mode: "remix", step }
      : { page: "remix", mode: "remix", step: null };
  }
  if (parts[0] === "story") return { page: "story", mode: "story", step: null };
  if (parts[0] === "remix") return { page: "remix", mode: "remix", step: null };

  return {
    page: PAGE_ROUTES.has(parts[0]) ? parts[0] : "overview",
    mode: "story",
    step: null
  };
}

export function routeHash(page, { mode = "story", step = null } = {}) {
  const normalizedPage = String(page || "overview");
  if (normalizedPage === "story") {
    return step ? `#/story/step/${Number(step)}` : "#/story";
  }
  if (normalizedPage === "remix") {
    return step ? `#/remix/step/${Number(step)}` : "#/remix";
  }
  if (MODE_ROUTES.has(normalizedPage)) {
    return step
      ? `#/${normalizedPage}/step/${Number(step)}`
      : `#/${normalizedPage}`;
  }
  return `#/${normalizedPage}`;
}

export function formatTimecode(frames, fps = FILM_FPS) {
  const safeFps = Math.max(1, Math.round(Number(fps) || FILM_FPS));
  let remaining = Math.max(0, Math.round(Number(frames) || 0));
  const frame = remaining % safeFps;
  remaining = Math.floor(remaining / safeFps);
  const seconds = remaining % 60;
  remaining = Math.floor(remaining / 60);
  const minutes = remaining % 60;
  const hours = Math.floor(remaining / 60);
  return [hours, minutes, seconds, frame]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function secondsToFrames(seconds, fps = FILM_FPS) {
  return Math.max(0, Math.round((Number(seconds) || 0) * Number(fps || FILM_FPS)));
}

export function framesToSeconds(frames, fps = FILM_FPS) {
  return Number(frames || 0) / Number(fps || FILM_FPS);
}

export function snapToFrame(seconds, fps = FILM_FPS) {
  return framesToSeconds(secondsToFrames(seconds, fps), fps);
}

export function allocateFrameDurations(totalFrames, weights) {
  const total = Math.max(1, Math.round(Number(totalFrames) || 0));
  const safeWeights = (Array.isArray(weights) ? weights : [])
    .map((weight) => Math.max(0, Number(weight) || 0))
    .filter((weight) => weight > 0);
  if (safeWeights.length === 0) return [total];

  const weightSum = safeWeights.reduce((sum, weight) => sum + weight, 0);
  const exact = safeWeights.map((weight) => (total * weight) / weightSum);
  const counts = exact.map(Math.floor);
  let remaining = total - counts.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let index = 0; index < remaining; index += 1) {
    counts[order[index % order.length].index] += 1;
  }
  return counts;
}

export function createReviewState(existing = {}) {
  return Object.fromEntries(
    REVIEW_CHECKS.map((key) => [key, existing?.[key] || "pending"])
  );
}

export function shotReviewComplete(review = {}) {
  return REVIEW_CHECKS.every((key) => review?.[key] === "passed");
}

export function splitSubtitleText(text, maxChars = 18) {
  const limit = Math.max(4, Number(maxChars) || 18);
  const sentences = String(text || "")
    .split(/[。！？!?；;\n]+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const source = sentences.length ? sentences : [String(text || "").trim()].filter(Boolean);
  return source.flatMap((line) => {
    if (line.length <= limit) return [line];
    const chunks = [];
    for (let cursor = 0; cursor < line.length; cursor += limit) {
      chunks.push(line.slice(cursor, cursor + limit));
    }
    return chunks;
  });
}

export function bindStoryboardToTemplate(storyboard, template) {
  const shots = Array.isArray(storyboard) ? storyboard : [];
  const templateShots = Array.isArray(template?.recipe?.shots)
    ? template.recipe.shots
    : [];
  if (templateShots.length === 0) {
    return shots.map((shot, index) => ({
      ...shot,
      order: index + 1,
      source: shot.source || {
        mode: "story",
        templateId: "",
        templateShotId: "",
        referenceStart: null,
        referenceEnd: null
      },
      promptVersion: shot.promptVersion || {
        version: 1,
        hash: "",
        text: String(shot.prompt || "")
      },
      assets: shot.assets || { firstFrame: null, video: null, finalClip: null },
      review: createReviewState(shot.review),
      status: shot.status === "已确认" ? "approved" : shot.status || "draft"
    }));
  }

  return shots.map((shot, index) => {
    const startRatio = index / shots.length;
    const endRatio = (index + 1) / shots.length;
    const startIndex = Math.min(
      templateShots.length - 1,
      Math.floor(startRatio * templateShots.length)
    );
    const endIndex = Math.max(
      startIndex,
      Math.min(templateShots.length - 1, Math.ceil(endRatio * templateShots.length) - 1)
    );
    const first = templateShots[startIndex];
    const last = templateShots[endIndex];
    return {
      ...shot,
      order: index + 1,
      source: {
        mode: "template",
        templateId: template.id,
        templateShotId: `template-shot-${template.id}-${startIndex + 1}`,
        templateShotIndex: startIndex + 1,
        templateShotEndIndex: endIndex + 1,
        referenceStart: Number(first.start || 0),
        referenceEnd: Number(last.end || first.end || 0),
        mapping: "proportional"
      },
      promptVersion: shot.promptVersion || {
        version: 1,
        hash: "",
        text: String(shot.prompt || "")
      },
      assets: shot.assets || { firstFrame: null, video: null, finalClip: null },
      review: createReviewState(shot.review),
      status: shot.status === "已确认" ? "approved" : shot.status || "draft"
    };
  });
}

export function shotReferenceWindow(shot, maxDuration = 8) {
  const referenceStart = Number(shot?.source?.referenceStart);
  if (!Number.isFinite(referenceStart) || referenceStart < 0) {
    throw new Error("当前镜头尚未绑定模板起始时间");
  }
  const referenceEnd = Number(shot?.source?.referenceEnd);
  const boundDuration =
    Number.isFinite(referenceEnd) && referenceEnd > referenceStart
      ? referenceEnd - referenceStart
      : Number(shot?.duration) || 4;
  return {
    start: referenceStart,
    duration: Math.max(0.5, Math.min(maxDuration, boundDuration))
  };
}

function normalizeTrack(items, kind, fps) {
  return (Array.isArray(items) ? items : []).map((item, index) => {
    const startFrame = secondsToFrames(item.start ?? 0, fps);
    const endFrame =
      item.end == null ? null : Math.max(startFrame + 1, secondsToFrames(item.end, fps));
    return {
      ...item,
      kind,
      order: item.order || index + 1,
      start: framesToSeconds(startFrame, fps),
      end: endFrame == null ? null : framesToSeconds(endFrame, fps),
      startFrame,
      endFrame
    };
  });
}

export function buildTimeline({
  mode = "story",
  duration = 40,
  fps = FILM_FPS,
  shots = [],
  voice = [],
  music = [],
  subtitle = []
} = {}) {
  const safeFps = Math.max(1, Math.round(Number(fps) || FILM_FPS));
  const totalFrames = secondsToFrames(duration, safeFps);
  const normalizedDuration = framesToSeconds(totalFrames, safeFps);
  return {
    schema: "xying-production-timeline/v1",
    mode: mode === "remix" ? "remix" : "story",
    fps: safeFps,
    duration: normalizedDuration,
    totalFrames,
    timecode: formatTimecode(totalFrames, safeFps),
    revision: 1,
    hash: "",
    tracks: {
      video: normalizeTrack(shots, "video", safeFps),
      voice: normalizeTrack(voice, "voice", safeFps),
      music: normalizeTrack(music, "music", safeFps),
      subtitle: normalizeTrack(subtitle, "subtitle", safeFps)
    }
  };
}

export function approvalIsCurrent(approval, snapshot) {
  if (!approval?.approved || !snapshot) return false;
  return (
    approval.fingerprint === snapshot.fingerprint &&
    approval.timelineHash === snapshot.timelineHash &&
    approval.contentHash === snapshot.contentHash &&
    JSON.stringify(approval.assetHashes || {}) ===
      JSON.stringify(snapshot.assetHashes || {}) &&
    JSON.stringify(approval.promptVersions || {}) ===
      JSON.stringify(snapshot.promptVersions || {})
  );
}

