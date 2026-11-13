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

export const VIDEO_STORYBOARD_TEMPLATE_ID = "unit-video-storyboard";

export const DEFAULT_VIDEO_STORYBOARD_TEMPLATE = Object.freeze({
  title: "小罗师傅与任家老太爷",
  videoStyle:
    "本片致敬林正英系列民国志怪僵尸喜剧。融合茅山道术、民俗悬疑、港式灵幻、喜剧与市井人物设定，节奏明快张弛有度。采用冷暖对比电影光效，夜间法戏以冷青月光为底，搭配暖黄火色；道法光效高饱和但不写实。剪辑使用短镜头、快切和动作带来的直接反应，整体兼顾惊悚、荒诞幽默与正向情绪落点。",
  scenes:
    "夜间乱葬岗、海边回忆场景、民国小镇街道、义庄停灵房、胡老板药铺兼客堂、矿场事故地。",
  characters:
    "1. 小罗师傅：少年道士，圆脸，眉眼清亮，伶俐英气；白色短褂配深色外套，戴混元巾，腰间挂法袋与铜钱法器。表面贪财，关键时刻善良可靠。\n2. 任老太爷：男性老年僵尸，面色青黑，黑眼袋深重，灰白鬓发，穿深色马褂，动作僵硬，强大但痛苦。\n3. 任老爷：中年男性，长衫配深色坎肩，神情惶恐，市侩怯懦。\n4. 戏服女鬼：女鬼形态为戏曲花旦妆造，水袖、珠饰与戏服；人形态是短发女性，神情温柔哀伤。\n5. 胡老板：药铺老板，长衫，手持茶盏，表面和气，遇事谨慎。",
  language:
    "全片对白、字幕和画外音均为中文，无其他语言。人物称呼、时代用语和字幕保持一致。",
  units: [
    "Unit 1｜0s–15s\n承接片头，固定远中景展示夜间乱葬岗，地面散落墓碑和杂草，冷青月光。旁白提示本片包含惊悚玄幻元素。任老爷在乱葬岗呼救，小罗师傅淡定出现并抬手掐诀，纯阳起法，金光乍现。",
    "Unit 2｜15s–30s\n承接掐诀动作，近景拍小罗掌心托起一簇荧黄火焰，吹气引燃符纸。固定特写法坛和符文。戏服女鬼悬浮在半空。全景展现法坛火星升腾，小罗按住桃木剑，警惕女鬼方向。",
    "Unit 3｜30s–45s\n承接结印动作，小罗操控法扇飞向女鬼，周身环绕淡金色术法光效。女鬼抬手抛铜钱抵挡，半空碰撞爆炸火光和烟尘。法扇被震回，小罗侧脸看向任老爷方向。",
    "Unit 4｜45s–60s\n任老爷被任老太爷按在地上，张嘴向小罗呼救。固定特写任老太爷青黑干尸脸、泛红眼和尖牙。任老太爷压低声音，任老爷面露难色，继续被按着，试图用生意赔钱和铺面升值求饶。",
    "Unit 5｜60s–75s\n任老爷眼神闪躲继续劝说，任老太爷先停顿后暴怒，疯狂摇晃任老爷并掐住他。任老爷急促大喊，任老太爷听到铺面升值后动作停下，满意松手。",
    "Unit 6｜75s–90s\n任老太爷抬头看见半空的戏服女鬼，松开任老爷飞扑过去，把女鬼抱在怀里。小罗无语翻白眼，吐槽老登变僵尸还贪美色。小罗抽出两道令牌，护坛双令直剿诛邪。",
    "Unit 7｜90s–105s\n女鬼从任老太爷怀里探头，悲伤询问他是否还活着。画面切入海边回忆：女鬼人形态半身站在海水中，抓住老太爷的手。老太爷老泪纵横，死死抓着戏子双手。海浪打来，女鬼化作光点，老太爷跪在岸边痛哭。",
    "Unit 8｜105s–120s\n承接女鬼消散，任老太爷抱着残余戏服碎片，仰天怒吼后冲向小罗。小罗左手摇铜铃、右手挥桃木剑，口念道音截行、法音止路。供果飞到半空，小罗龇牙一笑。",
    "Unit 9｜120s–135s\n承接小罗笑容，桃木剑挑起飞来的苹果，精准弹进冲来的任老太爷嘴里。任老太爷被定住，跪地扑过去抱住小罗的腿，哭求不要烧他。小罗低头，面露诧异。",
    "Unit 10｜135s–150s\n小罗皱眉看向任老爷，一脸无语，问你是不是疯了。随后眼神一转，露出算计笑意，伸手比出五根手指，开价五个大洋。任老爷急忙砍价并掏出钱递给小罗。",
    "Unit 11｜150s–165s\n承接任老爷递钱，小罗收钱后满意点头，施法念五帝金镇、七星开吉。任老太爷被金色法链和符纸压制，小罗神情严肃，用符纸白布将老太爷缠成木乃伊，封住尸气。",
    "Unit 12｜165s–180s\n任老爷跑到财神像前连连鞠躬，笑着道谢。任老爷抱起被捆严实的父亲，开心离开。小罗抬下巴暗示加钱，任老爷笑容僵住，肉痛地再付十块大洋，一步三回头地离开乱葬岗。",
    "Unit 13｜180s–195s\n小罗在法坛旁突然皱眉，疑惑不可能，推算这次三具老僵为何买一送二。他用红绳和黄符在地上布阵，动作麻利，念朱门对道门、寻踪法自生。",
    "Unit 14｜195s–210s\n承接布阵动作，小罗点燃符纸，神态严肃，念周山炎法、阴眼检查。火焰顺红绳快速蔓延到坟堆，一块画着玉皇符阵的黑布被火焰从坟里烧出，冒出白烟。小罗惊讶上前，认出这是哪家的玉皇符阵。",
    "Unit 15｜210s–225s\n小罗将黑布收进包袱，回望任老爷离开的方向，决定先回去找人帮任老太爷搬迁义庄。第二天清晨，民国小镇街道雾气弥漫，工人清扫路面，公鸡在屋顶报晓。四名工人合力抬着被捆成木乃伊的任老太爷，走进义庄停灵房并放入棺木。",
    "Unit 16｜225s–240s\n承接工人放好棺木，切到道堂屋内。小罗手掌一只青花瓷茶杯，胡老板坐在太师椅上，手持茶杯，询问胡家仆人小罗师傅几天未归。仆从恭敬回答不清楚，胡老板让他再去一趟茅山，问何时回来。墙上八卦符咒条幅和香炉烟雾保持空间连续。",
    "Unit 17｜240s–255s\n小罗从门外进来，笑着向胡老板打招呼。小罗坐到桌边，从袖口摸出刻着符文的牛皮交给胡老板。胡老板放下茶杯，疑惑询问来处。小罗笑着卖关子，胡老板无奈追问，小罗才说这次真有问题，并提到新开的工厂。",
    "Unit 18｜255s–270s\n小罗身体前倾，好奇追问工厂出了什么问题。胡老板点头，脸色凝重，说机器多了、厂房也多了。小罗拍胸脯表示可以帮忙。胡老板压低声音，提到半月前有人进山买矿，几日后矿场抬出几具尸体。",
    "Unit 19｜270s–285s\n承接胡老板说话，胡老板眉头紧锁，认为这不是普通怪病。画面切到工头家坟地，地面只剩坟土和带血手印，周围村民面露惊恐。小罗手指敲桌面，起身凝重地说又出了怪事。",
    "Unit 20｜285s–291s\n承接小罗看向门外的动作，小罗收回视线，语气凝重，说不过这桩事情得亲自去看看。堂屋烛火跳动，窗外天光照进来，落在小罗严肃的脸上，画面渐暗。"
  ].join("\n\n")
});

export function buildVideoStoryboardPrompt(overrides = {}) {
  const template = {
    ...DEFAULT_VIDEO_STORYBOARD_TEMPLATE,
    ...(overrides || {})
  };
  return [
    `【视频标题】${String(template.title || "").trim() || DEFAULT_VIDEO_STORYBOARD_TEMPLATE.title}`,
    `【视频风格】${String(template.videoStyle || "").trim() || DEFAULT_VIDEO_STORYBOARD_TEMPLATE.videoStyle}`,
    `【场景】${String(template.scenes || "").trim() || DEFAULT_VIDEO_STORYBOARD_TEMPLATE.scenes}`,
    `【人物】\n${String(template.characters || "").trim() || DEFAULT_VIDEO_STORYBOARD_TEMPLATE.characters}`,
    `【语言】${String(template.language || "").trim() || DEFAULT_VIDEO_STORYBOARD_TEMPLATE.language}`,
    `【分单元脚本】\n${String(template.units || "").trim() || DEFAULT_VIDEO_STORYBOARD_TEMPLATE.units}`,
    "【全局生成要求】所有 Unit 必须保持同一人物身份、服装、道具、空间轴线、主光方向和时间连续性。每个 Unit 写明景别、动作、运镜、台词与转场；不得生成画面内文字、水印、黑边、肢体粘连、多余手指、人物串脸或无来源道具。",
    "【输出要求】按 Unit 顺序生成可逐段剪辑的视频提示词；镜头长度与标注时间一致，台词留给后期配音或字幕，视频模型不生成文字。"
  ].join("\n\n");
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
