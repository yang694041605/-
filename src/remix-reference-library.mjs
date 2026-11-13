import { secondsToFrames } from "./production-model.mjs";

function frameUrl(templateId, frameIndex) {
  return `/media/templates/${templateId}/remix/frames/frame-${String(
    Math.max(1, frameIndex)
  ).padStart(6, "0")}.jpg`;
}

function safeTime(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function buildRemixShotPromptLibrary(template = {}, project = {}) {
  const sourceShots = Array.isArray(template.recipe?.shots)
    ? template.recipe.shots
    : [];
  const groom = project.groom || "男主角";
  const bride = project.bride || "女主角";
  return sourceShots.map((shot, index) => {
    const analysisShot = Array.isArray(template.remixAnalysis?.shots)
      ? template.remixAnalysis.shots[index]
      : null;
    const order = index + 1;
    const start = safeTime(shot.start);
    const end = Math.max(start, safeTime(shot.end));
    const startFrameIndex = secondsToFrames(start, 24);
    const endFrameIndex = Math.max(
      startFrameIndex + 1,
      secondsToFrames(end, 24)
    );
    const frames = endFrameIndex - startFrameIndex;
    const startFrame = startFrameIndex + 1;
    const endFrame = endFrameIndex;
    const middleFrame = Math.round((startFrame + endFrame) / 2);
    const shotId = `template-shot-${template.id || "reference"}-${order}`;
    const analysisPrompt = String(
      analysisShot?.prompt || shot.prompt || shot.action || ""
    ).trim();
    const imagePrompt = [
      `【任务】复刻参考片镜头 ${String(order).padStart(3, "0")} 的静态首帧。`,
      `【时间与帧数】${start.toFixed(3)}–${end.toFixed(3)} 秒，24 FPS，${frames} 帧。`,
      `【人物参考】图一为男主角${groom}，图二为女主角${bride}；保持脸型、五官比例、发际线、肤色和身高差一致。`,
      "【画面依据】严格参考本镜首帧、中间帧和尾帧的构图、景别、人物位置、服装、道具、背景、光线与色调。",
      `【参考片提取提示词】${analysisPrompt || "按本镜关键帧进行人工视觉复核后补充。"}`,
      "【构图】沿用参考镜头主体占画面比例和空间关系，不擅自增加人物或移除关键道具。",
      "【时代与材质】中式婚礼真实婚服、凤冠、金绣、木质建筑和织物纹理；材质真实，不过度磨皮。",
      "【禁止】文字、水印、黑边、拼版、串脸、多余人物、错误手指、肢体粘连、服装跳变和塑料皮肤。"
    ].join("\n");
    const videoPrompt = [
      `【任务】复刻参考片镜头 ${String(order).padStart(3, "0")} 的连续动作与运镜。`,
      `【参考区间】${start.toFixed(3)}–${end.toFixed(3)} 秒，共 ${frames} 帧。`,
      "【起始状态】从批准首帧开始，保持人物站位、姿态、视线、手部和服装受光。",
      "【动作过程】按参考关键帧还原动作顺序、重心、接触关系和结束状态。",
      `【参考片提取提示词】${analysisPrompt || "按本镜关键帧进行人工视觉复核后补充。"}`,
      `【镜头运动】按参考镜头原有机位、轴向、速度和景别执行；切换方式：${shot.transition || "保持原切点"}。`,
      "【身份连续性】图一男主角和图二女主角替换后不得串脸，服装、配饰和身高差保持一致。",
      "【背景策略】默认保持参考背景；替换背景时匹配透视、地平线、主光方向、色温和阴影。",
      "【声音字幕】视频模型不生成文字、字幕或音乐；后期重新对齐原音频和字幕。",
      "【禁止】面部漂移、肢体粘连、多余手指、道具穿模、背景闪烁、跳轴和黑边。"
    ].join("\n");
    const replacementPrompt = [
      "【替换任务】将本镜参考人物替换为当前项目新人授权素材。",
      "【人物映射】男主角默认为左侧或人物 1；女主角默认为右侧或人物 2，可在逐镜替换页调整。",
      "【锁定信息】人物、服装、道具、动作、背景和机位必须与本镜参考时间区间一致。",
      "【质量门槛】身份、串脸、手部、动作、道具、背景、黑边、字幕安全和音画同步通过后才能交付。"
    ].join("\n");
    return {
      shotId,
      order,
      title: `参考镜头 ${String(order).padStart(3, "0")}`,
      start,
      end,
      duration: Number((end - start).toFixed(3)),
      frames,
      transition: shot.transition || "",
      analysisPrompt,
      keyFrames: {
        first: frameUrl(template.id, startFrame),
        middle: frameUrl(template.id, middleFrame),
        last: frameUrl(template.id, endFrame)
      },
      imagePrompt,
      videoPrompt,
      replacementPrompt
    };
  });
}

export function remixPromptLibraryStats(items) {
  const list = Array.isArray(items) ? items : [];
  return {
    shots: list.length,
    frames: list.reduce((sum, item) => sum + Number(item.frames || 0), 0),
    imagePrompts: list.filter((item) => item.imagePrompt).length,
    videoPrompts: list.filter((item) => item.videoPrompt).length,
    replacementPrompts: list.filter((item) => item.replacementPrompt).length
  };
}
