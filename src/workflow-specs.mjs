const rawSpecs = [
  {
    number: 1,
    key: "story-intake",
    title: "故事采集",
    subtitle: "收集真实人物、照片和五幕事实",
    goal: "形成可写作、可追溯的新人事实库，不能先写剧情再补事实。",
    requiredInputs: ["男女主姓名", "男女主照片", "婚礼日期与城市", "五幕爱情故事"],
    inputKeys: ["leadNames", "leadPhotos", "weddingInfo", "storyFacts"],
    actions: ["按角色上传男女主照片", "填写五幕事实", "标记不呈现的事件", "复制故事采集卡"],
    outputs: ["事实清单", "照片映射", "资料缺项"],
    checks: ["五幕均有真实内容", "男女主各有清晰正脸照", "姓名和日期正确"],
    promptKinds: []
  },
  {
    number: 2,
    key: "script",
    title: "文案写作包",
    subtitle: "把事实写进完整旁白和五幕结构",
    goal: "生成可通读、可修改、可核对事实来源的婚礼旁白初稿。",
    requiredInputs: ["事实清单", "目标时长", "叙事主题", "情绪语气"],
    inputKeys: ["storyFacts", "duration", "theme", "tone"],
    actions: ["生成五幕大纲", "生成完整旁白", "显示事实对应关系", "估算字数与实际时长"],
    outputs: ["文案 v1", "完整旁白稿", "事实对应表"],
    checks: ["旁白时长适合目标片长", "没有新增真实经历", "人物姓名使用正确"],
    promptKinds: []
  },
  {
    number: 3,
    key: "script-approval",
    title: "新人确认文案",
    subtitle: "让新人确认当前文案版本",
    goal: "取得新人对当前文案哈希的明确确认，而不是只由制作方自行通过。",
    requiredInputs: ["文案 v1", "待核实问题", "确认人身份"],
    inputKeys: ["script", "unresolvedQuestions", "reviewEvidence"],
    actions: ["逐幕展示文案", "复制确认稿", "登记修改意见", "保存新人确认证据"],
    outputs: ["新人确认版文案", "确认证据"],
    checks: ["事实和称呼正确", "新人对当前版本明确确认", "确认记录绑定内容哈希"],
    promptKinds: []
  },
  {
    number: 4,
    key: "voice-audition",
    title: "音色试听",
    subtitle: "用同一段文字比较真实音色",
    goal: "通过实际音频而不是模型名称选择旁白音色、语速和情绪。",
    requiredInputs: ["试听文字", "可用语音模型", "语速与情绪方向"],
    inputKeys: ["auditionText", "voiceModels", "voiceDirection"],
    actions: ["生成至少三个候选", "对比播放", "查看时长", "保存音色选择"],
    outputs: ["试听音频", "音色选择记录"],
    checks: ["同一段文字", "实际完整试听", "已选定音色和语速"],
    promptKinds: []
  },
  {
    number: 5,
    key: "full-narration",
    title: "完整旁白",
    subtitle: "生成并确认全片旁白",
    goal: "得到完整、可播放、带逐句时间点的最终旁白。",
    requiredInputs: ["新人确认文案", "已选音色", "语速"],
    inputKeys: ["approvedScript", "voiceSelection", "rate"],
    actions: ["生成完整旁白", "检查漏字和错读", "显示时间点与总时长", "完整试听"],
    outputs: ["最终旁白 WAV", "逐句时间表"],
    checks: ["无漏字多字", "完整试听通过", "实际时长被接受"],
    promptKinds: []
  },
  {
    number: 6,
    key: "storyboard",
    title: "分镜设计",
    subtitle: "按旁白节奏建立可生产镜头表",
    goal: "把五幕故事拆成时间准确、人物明确、动作可生成的镜头。",
    requiredInputs: ["旁白时间表", "五幕事实", "人物参考", "目标时长"],
    inputKeys: ["narrationTiming", "storyFacts", "characterReferences", "duration"],
    actions: ["自动拆镜", "编辑逐镜动作和运镜", "绑定人物与服装", "校验总帧数"],
    outputs: ["正式分镜表", "镜头参考映射"],
    checks: ["时间连续无缺口", "总帧数准确", "每镜有事实、动作和转场"],
    promptKinds: []
  },
  {
    number: 7,
    key: "key-stills",
    title: "三个重点静帧",
    subtitle: "先生成三个高风险镜头首帧",
    goal: "先解决最影响身份、服装和叙事的三张关键画面。",
    requiredInputs: ["三个重点镜头", "男女主角色图", "服装参考", "场景参考"],
    inputKeys: ["keyShots", "characterReferences", "wardrobeReferences", "sceneReferences"],
    actions: ["生成图片提示词", "复制提示词到模型", "生成或上传首帧", "选版并绑定镜头"],
    outputs: ["重点首帧", "图片提示词版本"],
    checks: ["像本人", "手部正确", "服装和时代正确", "首帧可继续生成视频"],
    promptKinds: ["image"]
  },
  {
    number: 8,
    key: "remaining-stills",
    title: "剩余分镜图片",
    subtitle: "为每个镜头补齐已绑定首帧",
    goal: "保证每个镜头都有符合身份和服装连续性的图片版本。",
    requiredInputs: ["全部分镜", "已通过重点首帧", "造型库", "场景参考"],
    inputKeys: ["shots", "keyStills", "looks", "sceneReferences"],
    actions: ["按镜生成图片提示词", "逐镜生成或上传", "比较多个版本", "单镜返工"],
    outputs: ["每镜首帧", "图片选择记录"],
    checks: ["每镜都有图片", "脸和服装一致", "不得存在未绑定镜头的图片"],
    promptKinds: ["image"]
  },
  {
    number: 9,
    key: "image-to-video",
    title: "图生视频",
    subtitle: "从首帧生成动作和运镜",
    goal: "把每张批准首帧变成动作连续、身份稳定的视频镜头。",
    requiredInputs: ["每镜首帧", "图片提示词", "视频提示词", "视频模型"],
    inputKeys: ["firstFrames", "imagePrompts", "videoPrompts", "videoModel"],
    actions: ["生成视频提示词", "绑定首帧", "逐镜生成视频", "播放检查", "八项人工质检"],
    outputs: ["每镜视频", "视频提示词版本", "质检记录"],
    checks: ["身份一致", "无串脸", "手部正确", "动作匹配", "背景稳定", "字幕安全", "音画同步", "无黑边"],
    promptKinds: ["video"]
  },
  {
    number: 10,
    key: "bgm",
    title: "BGM 试听",
    subtitle: "选择真实可播放且授权清楚的音乐",
    goal: "选出适合旁白情绪曲线的实际音乐候选。",
    requiredInputs: ["旁白情绪时间线", "目标时长", "音乐授权信息"],
    inputKeys: ["narrationTimeline", "duration", "musicRights"],
    actions: ["生成或上传候选", "对比播放", "记录来源授权", "选定 BGM"],
    outputs: ["选定音乐", "来源与授权记录"],
    checks: ["至少试听实际音频", "音乐时长足够", "授权信息可追溯"],
    promptKinds: []
  },
  {
    number: 11,
    key: "sample-mix",
    title: "配音与 BGM 试混",
    subtitle: "验证代表段落的旁白和音乐关系",
    goal: "用真实混音小样确认旁白清楚、音乐让位和情绪抬升。",
    requiredInputs: ["最终旁白", "选定音乐", "四个代表时间点"],
    inputKeys: ["voice", "music", "mixCues"],
    actions: ["生成代表段混音", "旁白自动压低音乐", "显示响度和峰值", "播放对比"],
    outputs: ["试混 WAV", "混音参数"],
    checks: ["旁白清楚", "音乐不过响", "高潮有变化", "结尾自然"],
    promptKinds: []
  },
  {
    number: 12,
    key: "full-mix",
    title: "完整混音",
    subtitle: "完成全片旁白与音乐混音",
    goal: "输出与当前时间轴等长、响度合格的完整主混音。",
    requiredInputs: ["完整旁白", "完整音乐", "镜头时间轴"],
    inputKeys: ["voice", "music", "timeline"],
    actions: ["生成完整混音", "保留独立声轨", "执行响度归一化", "完整试听"],
    outputs: ["完整混音 WAV", "旁白轨", "音乐轨"],
    checks: ["全片时长一致", "-14 LUFS 左右", "True Peak 合规", "完整听审通过"],
    promptKinds: []
  },
  {
    number: 13,
    key: "subtitle-preview",
    title: "字幕预览",
    subtitle: "打轴、排版并渲染完整预览",
    goal: "形成字幕准确、音画同步、可直接观看的完整预览。",
    requiredInputs: ["确认文案", "旁白时间", "完整混音", "当前镜头时间轴"],
    inputKeys: ["approvedCopy", "narrationTiming", "fullMix", "timeline"],
    actions: ["生成 SRT", "编辑字幕时间", "设置字体样式", "渲染完整预览"],
    outputs: ["预览 MP4", "SRT", "字幕样式"],
    checks: ["每行字幕不超安全宽度", "字幕不挡人物", "音画同步", "完整观看通过"],
    promptKinds: []
  },
  {
    number: 14,
    key: "delivery",
    title: "正式成片交付",
    subtitle: "导出并核对全部交付物",
    goal: "交付可播放成片、字幕、工程、提示词和质检记录。",
    requiredInputs: ["通过预览", "全部镜头", "声音资产", "授权记录"],
    inputKeys: ["preview", "shots", "audio", "rights"],
    actions: ["生成正式成片", "生成交付清单", "导出工程与字幕", "登记双方验收"],
    outputs: ["正式 MP4", "SRT", "可编辑工程", "镜头表", "QC 报告", "交付清单"],
    checks: ["技术与人工检查通过", "文件哈希可追溯", "制作方和新人分别验收"],
    promptKinds: []
  }
];

export const WORKFLOW_SPECS = Object.freeze(
  rawSpecs.map((step) =>
    Object.freeze({
      ...step,
      route: `step${step.number}`,
      requiredInputs: Object.freeze([...step.requiredInputs]),
      inputKeys: Object.freeze([...step.inputKeys]),
      actions: Object.freeze([...step.actions]),
      outputs: Object.freeze([...step.outputs]),
      checks: Object.freeze([...step.checks]),
      promptKinds: Object.freeze([...step.promptKinds])
    })
  )
);

export function getWorkflowStep(number) {
  return WORKFLOW_SPECS.find((step) => step.number === Number(number)) || null;
}

export function workflowStepGaps(step, state = {}) {
  if (!step) return [];
  return step.inputKeys
    .map((key, index) => ({ key, label: step.requiredInputs[index] }))
    .filter(({ key }) => !state[key])
    .map(({ label }) => label);
}

export function buildStepNavigationChildren() {
  return [];
}
