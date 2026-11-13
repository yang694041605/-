function targetLabel(target) {
  const labels = {
    left: "左侧人物",
    right: "右侧人物",
    "person-1": "人物 1",
    "person-2": "人物 2",
    "person-3": "人物 3",
    "person-4": "人物 4"
  };
  return labels[target] || target || "未指定";
}

function referenceRange(shot) {
  if (
    shot?.source?.referenceStart == null ||
    shot?.source?.referenceEnd == null
  ) {
    return "未绑定参考视频区间";
  }
  return `${Number(shot.source.referenceStart).toFixed(2)}–${Number(
    shot.source.referenceEnd
  ).toFixed(2)} 秒`;
}

export const CHARACTER_SHEET_TEMPLATE_ID = "character-sheet-triple-view";

export const DEFAULT_CHARACTER_SHEET_DESCRIPTION =
  "冷静敏锐的工程师与设备分析人员，负责检修观测节点，持续追查陨川与寂灯界信号。";

export const SCENE_BOARD_TEMPLATE_ID = "scene-board-multi-view";

export const DEFAULT_SCENE_BOARD_DESCRIPTION =
  "中国古代客栈大堂内部全空，无人，挑高的木质梁柱结构，整齐摆放的深褐色实木方桌与长条木凳，桌上置有粗陶茶具，右侧是摆满酒坛的木质掌柜柜台，后方有通往二楼的木质阶梯与回廊扶手，雕花木窗透入明媚的自然斜射光束，梁上悬挂未点亮的红布灯笼，陈设古朴真实，photorealistic，high detail，professional photography，电影级光影，超写实CG渲染。";

export function buildCharacterSheetPrompt({
  characterDescription = DEFAULT_CHARACTER_SHEET_DESCRIPTION
} = {}) {
  const description =
    String(characterDescription || "").trim() ||
    DEFAULT_CHARACTER_SHEET_DESCRIPTION;
  return [
    "帮我生成人物设定图：16:9横构图，纯白背景。画面严格左右分区。",
    "【左侧三分之二区域】水平并排三张等宽等高的人物正交全身视图，从左到右依次为正面站立视图、正侧面站立视图、背面站立视图，视图间无缝拼接。",
    "【全身视图一致性】同一人物，统一服装和配饰细节，统一光影和阴影，统一身体比例，完全正交无透视畸变。",
    "【全身站姿】标准中立自然站姿，身体挺直，双脚分开与肩同宽，双臂自然垂于身体两侧，全身完整入镜，无多余动作，无任何道具或场景元素。",
    "【右侧三分之一区域】垂直堆叠三个同角色局部特写，从上到下依次为：顶部—下巴特写（仅露出下唇以下至下颌轮廓，严禁出现眼睛、鼻子和额头）；中间—眉眼特写（仅露出眉毛和眼睛区域，严禁出现完整面部、额头和鼻子）；底部—额头特写（仅露出完整额头、发际线至眉毛上方，严禁出现眼睛和鼻子）。",
    "【特写一致性】所有特写与左侧全身图为同一人物，相同光影和质感。",
    "【画质】高精度，细节极致，高分辨率角色设定图风格，纯白背景。",
    `【人物形象描述】${description}`
  ].join("\n");
}

export function buildSceneBoardPrompt({
  sceneDescription = DEFAULT_SCENE_BOARD_DESCRIPTION
} = {}) {
  const description =
    String(sceneDescription || "").trim() || DEFAULT_SCENE_BOARD_DESCRIPTION;
  return [
    "场景图提示词模板：",
    "【整体要求】16:9横版构图，纯白或极浅灰色背景，模块化分区布局，各区块需有清晰的中文小标题标识，包括多角度展示区、主视觉区域、光影氛围区、细节特写区、配色参考区。无水印、无多余装饰。所有视角与场景中的空间结构、家具陈设、材质质感、配色风格必须完全统一。",
    "【顶部—多角度展示区】横向并排展示同一场景的四个视角，从左到右依次为「正视、侧视、俯视、仰视」，等高排列，完整呈现空间结构关系。",
    "【左侧—光影氛围区】纵向排列同一场景在不同时间段的光影变化，从上到下依次为「白天、黄昏、夜晚」，体现自然光与人工光的氛围差异。",
    "【中央—主视觉区域】场景的核心展示视角大图，构图饱满，景深清晰，作为整张参考图的视觉重心，完整呈现场景的空间感、材质与氛围。",
    "【底部—细节特写区】横向并排四个特写模块，从左到右依次为「关键道具、材质纹理、装饰元素、局部细节」，展现场景中具有标志性的物件、表面质感与点睛元素。",
    "【右侧—配色参考区】纵向三个色块，从上到下依次为「主色、辅色、点缀色」，每个色块旁标注名称，提取自场景的核心配色。",
    "【画面要求】画面简洁，空间通透，材质真实，光影自然，超高清渲染，完美构图，各模块之间留有清晰的分隔留白。",
    `【场景描述】${description}`
  ].join("\n");
}

export function buildImagePrompt(shot = {}, project = {}) {
  const groom = project.groom || "男主角";
  const bride = project.bride || "女主角";
  const aspect = project.aspect || "16:9";
  const description =
    shot.imagePrompt || shot.prompt || "人物在场景中的自然瞬间";
  return [
    "【任务】生成本镜唯一首帧图片，画面是一帧决定后续视频动作的稳定瞬间。",
    `【事实来源】${shot.factSource || shot.fact || "必须来自已确认的真实爱情故事，不得增加未提供事件。"}`,
    `【人物参考】第 1 张参考图是男主角${groom}，资产 ${project.photoAssetIds?.groom || "未绑定"}；第 2 张参考图是女主角${bride}，资产 ${project.photoAssetIds?.bride || "未绑定"}。`,
    "【身份锁定】保持脸型、五官比例、眼距、鼻型、唇形、发际线、发型、肤色和身高差；不能美化成另一张脸。",
    `【年龄与时代】成年人；时代与场景由「${shot.act || project.theme || "婚礼故事"}」确定，不混用年代。`,
    `【服装造型】参考已选造型资产，服装、发型、配饰与相邻镜头一致；本镜场景为${shot.scene || "婚礼相关场景"}。`,
    `【场景】${shot.scene || "真实婚礼场景"}；道具、建筑、地面材质和环境空间必须合理。`,
    `【光线】${project.tone || "东方浪漫"}电影光线；明确主光方向、色温、阴影和环境色，人物面部受光自然。`,
    `【构图】${shot.shot || "中景"}；机位高度和人物位置服务于本镜故事任务；画幅 ${aspect}。`,
    `【动作瞬间】${description}；表情、视线、手部、衣物褶裥和重心必须准确。`,
    "【连续性】保留与前后镜一致的人物身份、服装、发型、配饰、色温和场景结构。",
    "【负向约束】不要文字、字幕、水印、黑边、拼版、多余人物、错误手指、肢体粘连、塑料皮肤、过度磨皮、换脸感和夸张仙侠特效。"
  ].join("\n");
}

export function buildVideoPrompt(shot = {}, project = {}, options = {}) {
  const groom = project.groom || "男主角";
  const bride = project.bride || "女主角";
  const policy = options.policy || "keep";
  const firstFrame = shot.assets?.firstFrame?.assetId || "未绑定首帧";
  const reference = shot.source?.referenceStart != null
    ? `参考视频 ${referenceRange(shot)}`
    : `以首帧 ${firstFrame} 为唯一视觉起点`;
  const background =
    policy === "change"
      ? `背景替换为${project.city || "现代"}婚礼场景，透视、地平线、主光方向、色温和阴影必须匹配人物动作。`
      : "严格保留首帧或参考视频中的建筑、道具、空间透视、背景材质、主光方向和环境色。";
  return [
    "【任务】图生视频 / 参考视频人物替换镜头",
    `【首帧】使用 ${firstFrame} 作为第一帧；当前画面任务：${shot.title || "指定镜头"}。`,
    `【参考】${reference}。`,
    `【输出规格】${project.aspect || "16:9"}，约 ${Number(shot.duration || 4).toFixed(2)} 秒，24 FPS，约 ${shot.frames || Math.round(Number(shot.duration || 4) * 24)} 帧。`,
    `【人物身份】男主角=${groom}，女主角=${bride}；男主目标=${targetLabel(shot.characters?.groom?.target)}；女主目标=${targetLabel(shot.characters?.bride?.target)}。`,
    "【起始状态】从批准首帧的人物站位、姿态、视线、手部、服装和受光开始，不倒退重演上一动作。",
    `【动作过程】${options.action || shot.videoAction || shot.prompt || "人物自然完成一个连续动作"}；动作具有重心、惯性和正确接触关系。`,
    `【结束状态】${options.endState || shot.endState || "停在适合本镜切换的自然姿态，保持身份和服装不变。"}`,
    `【镜头运动】${shot.move || "保持原视频运镜"}；机位高度、轴向和速度与参考一致。`,
    "【身份连续性】跨帧保持脸型、五官、发型、肤色、身高差和服装配饰；男女主不能串脸。",
    `【背景策略】${background}`,
    `【切换规则】本镜结束点衔接 ${shot.transition || "下一镜"}；不跳轴、不重复上一镜、不跳过动作起点。`,
    "【声音参考】保留环境声、脚步和衣料声的空间感；视频模型不生成旁白或音乐。",
    "【负向约束】不要文字、水印、黑边、灰色遮罩、拼版、多余人物、面部漂移、换脸特效、塑料皮肤、多余手指、肢体粘连、服装跳变和夸张仙侠特效。"
  ].join("\n");
}

export function promptFingerprintInput(shot = {}, project = {}) {
  return {
    shotId: shot.id || "",
    prompt: shot.prompt || "",
    imagePrompt: shot.imagePrompt || "",
    videoPrompt: shot.videoPrompt || "",
    referenceStart: shot.source?.referenceStart ?? null,
    referenceEnd: shot.source?.referenceEnd ?? null,
    firstFrame: shot.assets?.firstFrame?.assetId || "",
    groom: project.groom || "",
    bride: project.bride || "",
    aspect: project.aspect || "",
    city: project.city || "",
    characters: shot.characters || null
  };
}
