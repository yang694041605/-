import { secondsToFrames } from "./production-model.mjs";

const TARGET_LABELS = Object.freeze({
  left: "左侧人物",
  right: "右侧人物",
  "person-1": "人物 1",
  "person-2": "人物 2",
  "person-3": "人物 3",
  "person-4": "人物 4"
});

function numericTime(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function shotIdFor(index) {
  return `shot-${String(index + 1).padStart(3, "0")}`;
}

function cuesForRange(items, start, end) {
  return (Array.isArray(items) ? items : [])
    .filter((cue) => numericTime(cue.end) > start && numericTime(cue.start) < end)
    .map((cue) => ({ ...cue }));
}

function targetLabel(value) {
  return TARGET_LABELS[value] || value || "未指定";
}

function normalizeShot(shot, index, template, options) {
  const shotId = shot.id || shot.shotId || shotIdFor(index);
  const start = Math.max(0, numericTime(shot.start));
  const end = Math.max(
    start,
    numericTime(shot.end, numericTime(template.duration))
  );
  const keyFrameSet =
    shot.keyFrames ||
    options.keyFrames?.[shotId] ||
    options.keyFrames?.[index] ||
    {};
  return {
    shotId,
    time: {
      start,
      end,
      duration: Number((end - start).toFixed(3)),
      framesAt24: secondsToFrames(end - start, 24)
    },
    keyFrames: {
      first: keyFrameSet.first || keyFrameSet.start || "",
      middle: keyFrameSet.middle || "",
      last: keyFrameSet.last || keyFrameSet.end || ""
    },
    visual: {
      framing: shot.framing || "",
      composition: shot.composition || "",
      action: shot.action || shot.prompt || "",
      camera: shot.camera || shot.move || "",
      lighting: shot.lighting || "",
      background: shot.scene || shot.background || "",
      props: Array.isArray(shot.props) ? [...shot.props] : []
    },
    audio: {
      source: options.audioPath || options.audio?.source || "",
      cues: cuesForRange(
        options.audioCues || options.audio?.cues || [],
        start,
        end
      )
    },
    subtitles: cuesForRange(options.transcript || [], start, end),
    mapping: {
      groom: options.mapping?.groom || shot.characters?.groom?.target || "",
      bride: options.mapping?.bride || shot.characters?.bride?.target || ""
    },
    replacement: {
      objects: Array.isArray(shot.replacement?.objects)
        ? shot.replacement.objects.map((item) => ({ ...item }))
        : [],
      backgroundPolicy: shot.replacement?.backgroundPolicy || "keep"
    },
    promptVersions: {
      image: numericTime(shot.promptVersions?.image, 1),
      video: numericTime(shot.promptVersions?.video, 1),
      audio: numericTime(shot.promptVersions?.audio, 1)
    },
    confidence: numericTime(shot.confidence, options.confidence ?? 0)
  };
}

export function normalizeRemixReport(template = {}, options = {}) {
  const duration = Math.max(0, numericTime(template.duration));
  const rawShots =
    Array.isArray(template.recipe?.shots) && template.recipe.shots.length
      ? template.recipe.shots
      : [{ start: 0, end: duration, action: "" }];
  const shots = rawShots.map((shot, index) =>
    normalizeShot(shot, index, template, options)
  );
  return {
    schema: "xying-remix-report/v1",
    title: template.title || "抖音婚礼参考片",
    templateId: template.id || "",
    duration,
    fps: 24,
    totalFramesAt24: secondsToFrames(duration, 24),
    audioSource: options.audioPath || options.audio?.source || "",
    shots
  };
}

export function buildStoredRemixReport(template = null, project = {}) {
  if (!template?.id) {
    return {
      schema: "xying-remix-report/v1",
      title: "尚未导入抖音参考片",
      templateId: "",
      duration: 0,
      fps: 24,
      totalFramesAt24: 0,
      audioSource: "",
      shots: []
    };
  }
  const analyzedShots = Array.isArray(template.remixAnalysis?.shots)
    ? template.remixAnalysis.shots
    : [];
  const reportTemplate = {
    ...template,
    recipe: {
      ...(template.recipe || {}),
      shots:
        template.recipe?.shots?.length
          ? template.recipe.shots
          : analyzedShots
    }
  };
  return normalizeRemixReport(reportTemplate, {
    audioPath:
      template?.remixExtraction?.audioUrl ||
      (template?.remixExtraction?.audioPath ? "original-audio.wav" : "") ||
      "",
    transcript: template?.remixAnalysis?.audio?.transcript || [],
    audioCues: [],
    mapping: {
      groom: project?.remixTargets?.groom || "",
      bride: project?.remixTargets?.bride || ""
    }
  });
}

export function buildAudioAnalysisPrompt(report = {}) {
  return [
    "【任务】拆解参考片音频，不改写、不伪造原音频。",
    "【输出】旁白区间、音乐区间、环境声、音效、节拍点、建议音量曲线。",
    `【时间基准】0–${numericTime(report.duration).toFixed(2)} 秒，24 FPS。`,
    `【镜头数量】${Array.isArray(report.shots) ? report.shots.length : 0} 个。`,
    "【规则】保留原始时间码；人物替换不得移动原音乐和字幕的时间基准。",
    "【输出格式】JSON，包含 start、end、type、description、confidence。"
  ].join("\n");
}

export function buildReferenceImagePrompt(shot = {}, project = {}) {
  const identityReferences = [
    `图一为男主角${project.groom || "男主角"}(资产 ${project.photoAssetIds?.groom || "未绑定"})`,
    `图二为女主角${project.bride || "女主角"}(资产 ${project.photoAssetIds?.bride || "未绑定"})`,
    "图三为服装或场景参考"
  ].join("；");
  return [
    "【任务】生成与该镜头构图一致的婚礼角色图。",
    `【参考图】${identityReferences}。`,
    "【身份锁定】保持脸型、五官比例、眼距、鼻型、唇形、发际线、发型、肤色和身高差。",
    `【动作瞬间】${shot.visual?.action || "自然牵手"}。`,
    `【场景与光色】${shot.visual?.background || "真实婚礼场景"}；${
      shot.visual?.camera || "稳定机位"
    }。`,
    `【画幅】${project.aspect || "16:9"}。`,
    "【禁止】文字、水印、黑边、换脸感、错误手指、串脸、多余人物。"
  ].join("\n");
}

export function buildReplacementVideoPrompt(
  shot = {},
  project = {},
  mapping = {}
) {
  const objects = shot.replacement?.objects || [];
  const propText = objects.length
    ? objects
        .map(
          (item) =>
            `${item.target || "原道具"}→${item.description || item.sourceAssetId || "项目道具"}`
        )
        .join("；")
    : "保持原道具和接触关系";
  return [
    "【任务】参考原视频运镜和动作，替换指定人物与道具。",
    `【参考区间】${shot.shotId || "未编号镜头"}，${numericTime(
      shot.time?.start
    ).toFixed(2)}–${numericTime(shot.time?.end).toFixed(2)} 秒，共 ${
      numericTime(shot.time?.framesAt24)
    } 帧。`,
    `【人物映射】图一男主角${project.groom || "男主角"}替换${targetLabel(
      mapping.groom
    )}；图二女主角${project.bride || "女主角"}替换${targetLabel(
      mapping.bride
    )}。`,
    `【道具映射】${propText}。`,
    "【动作过程】从批准首帧开始，保持接触关系、重心和结束状态。",
    `【运镜】${shot.visual?.camera || "保持原机位和速度"}。`,
    `【背景策略】${
      shot.replacement?.backgroundPolicy === "change"
        ? "替换为项目指定婚礼背景，并匹配透视、主光与阴影。"
        : "保持原背景。"
    }`,
    "【音频字幕】不生成字幕和音乐；完成后回到原音轨和原字幕时间轴。",
    `【输出规格】${project.aspect || "16:9"}，24 FPS，原镜头时长，无黑边。`,
    "【禁止】串脸、面部漂移、服装跳变、肢体粘连、多余手指、道具穿模。"
  ].join("\n");
}
