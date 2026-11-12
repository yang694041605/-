const STORY_BEATS = [
  {
    key: "origin",
    label: "第一幕 · 相识",
    title: "第一眼，是后来所有故事的开头",
    match: ["认识", "初见", "遇见", "学校", "大学", "高中", "工作", "朋友"],
    visual: "从旧照片或相遇地点的空镜切入，人物由剪影逐渐清晰。"
  },
  {
    key: "knowing",
    label: "第二幕 · 相知",
    title: "日常很轻，爱意很重",
    match: ["一起", "旅行", "电影", "吃饭", "陪伴", "异地", "回家"],
    visual: "用牵手、回眸、灯下相视三个特写串联共同记忆。"
  },
  {
    key: "confirm",
    label: "第三幕 · 确认",
    title: "从这一刻起，我们决定并肩",
    match: ["求婚", "表白", "决定", "搬家", "毕业", "重逢", "在一起"],
    visual: "用一次明确的选择或动作，交代关系从喜欢变成共同生活。"
  },
  {
    key: "companionship",
    label: "第四幕 · 相伴",
    title: "日子很长，幸好身边的人是你",
    match: ["生活", "工作", "养", "旅行", "照顾", "家", "一直"],
    visual: "以生活细节和动作递进表现陪伴，避免只堆照片。"
  },
  {
    key: "promise",
    label: "第五幕 · 承诺",
    title: "今天，我们把余生写进同一封信",
    match: ["结婚", "求婚", "婚礼", "决定", "以后", "未来"],
    visual: "双人并肩走向婚门，红绸落下，画面落到姓名与婚期。"
  }
];

const THEME_SIGNATURES = {
  "三生三世": {
    eras: ["古代", "民国", "今生"],
    palette: "朱红、鎏金、墨绿",
    motif: "同一对手，以三次牵手完成宿命闭环"
  },
  "时光回信": {
    eras: ["初见那年", "相爱的日子", "婚礼当天"],
    palette: "暖金、胶片米白、正红",
    motif: "把爱情故事写成三封跨越时间的信"
  },
  "星河约定": {
    eras: ["夏夜相遇", "异地守候", "此刻圆满"],
    palette: "绛红、靛蓝、烛金",
    motif: "用灯火与星光纪年，从等待走向团圆"
  }
};

const SHOT_TEMPLATES = [
  {
    title: "片头定场",
    scene: "东方庭院 · 晨雾",
    shot: "大全景",
    move: "缓慢推进",
    prompt: "晨雾中的中式婚礼庭院，红绸与灯笼被微风轻轻吹动，电影级光影，东方浪漫"
  },
  {
    title: "女主初见",
    scene: "廊桥 · 暖光",
    shot: "中近景",
    move: "侧向跟移",
    prompt: "女主角回眸，人物面部自然稳定，中式婚服细节清晰，柔暖侧光，克制而深情"
  },
  {
    title: "男主等候",
    scene: "厅堂 · 红烛",
    shot: "中景",
    move: "由虚到实",
    prompt: "男主角在红烛与木格窗前等待，微表情自然，电影景深，人物身份保持一致"
  },
  {
    title: "旧物线索",
    scene: "书案 · 信笺",
    shot: "特写",
    move: "俯拍缓移",
    prompt: "一封写了两个人名字的婚书，红纸、金墨、旧照片，细节真实，暖色电影光"
  },
  {
    title: "第一次牵手",
    scene: "长廊 · 灯笼",
    shot: "手部特写",
    move: "慢动作",
    prompt: "两人十指相扣走过灯笼长廊，手指结构正确，红金色调，轻微慢动作"
  },
  {
    title: "时光转场",
    scene: "同一城门 · 三个年代",
    shot: "匹配剪辑",
    move: "人物动作匹配",
    prompt: "同一对人物跨越三个时代，以牵手动作完成匹配转场，服装变化清晰，面部身份一致"
  },
  {
    title: "共同记忆",
    scene: "城市夜景 · 灯火",
    shot: "双人中景",
    move: "环绕半圈",
    prompt: "男女主角在现代城市灯火中相视而笑，真实生活质感，电影浅景深，自然动势"
  },
  {
    title: "誓言时刻",
    scene: "婚礼正厅 · 正红",
    shot: "近景",
    move: "静止微推",
    prompt: "男女主角交换誓言，红绸与金色烛光映在脸上，情绪真挚，避免夸张表演"
  },
  {
    title: "拥抱落幅",
    scene: "远山 · 婚礼午后",
    shot: "大全景",
    move: "无人机缓升",
    prompt: "新人在山水庭院中相拥，红色礼服从画面中心延展，庄重、喜悦、电影感"
  },
  {
    title: "姓名落版",
    scene: "朱砂红底 · 金线纹样",
    shot: "片尾字幕",
    move: "淡入",
    prompt: "高级中式婚礼片尾，朱砂红纸纹与金线云纹，留出姓名和婚期排版区域"
  }
];

export function normalizeProject(input = {}) {
  const duration = Number(input.duration) || 40;
  return {
    projectName: input.projectName || "我们的婚礼微电影",
    groom: String(input.groom || "").trim() || "男主角",
    bride: String(input.bride || "").trim() || "女主角",
    date: input.date || "",
    city: input.city || "杭州",
    duration,
    theme: THEME_SIGNATURES[input.theme] ? input.theme : "三生三世",
    tone: input.tone || "东方浪漫",
    aspect: input.aspect || "16:9",
    photos: input.photos || {},
    photoSources: input.photoSources || {},
    selectedLooks: input.selectedLooks || {},
    workflow: input.workflow || { currentStep: 1, approvals: {} },
    vvvStyle: input.vvvStyle || "",
    story:
      String(input.story || "").trim() ||
      "从第一次相遇到今天，我们把平凡的日常，过成了彼此最重要的故事。",
    storyBeats: input.storyBeats || {}
  };
}

export function getFramePlan(duration = 40) {
  const safeDuration = Math.max(1, Number(duration) || 40);
  const totalFrames = Math.round(safeDuration * 24);
  return {
    fps: 24,
    duration: safeDuration,
    totalFrames,
    timecode: `00:00:${String(Math.floor(safeDuration)).padStart(2, "0")}:00`
  };
}

export function buildStoryTreatment(input) {
  const project = normalizeProject(input);
  const signature = THEME_SIGNATURES[project.theme];
  const sentences = project.story
    .split(/[。！？!?\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const acts = STORY_BEATS.map((beat, index) => {
    const source = sentences.find((sentence) =>
      beat.match.some((keyword) => sentence.includes(keyword))
    );
    return {
      ...beat,
      era: signature.eras[index],
      summary:
        String(project.storyBeats?.[beat.key] || "").trim() ||
        source ||
        [
          `${project.groom}与${project.bride}在命运安排下第一次相见。`,
          `${project.groom}与${project.bride}把陪伴写进了每一个普通日常。`,
          `${project.groom}与${project.bride}决定认真走向彼此。`,
          `${project.groom}与${project.bride}在漫长生活里成为彼此最熟悉的依靠。`,
          `${project.groom}与${project.bride}在亲友祝福中许下相守一生的承诺。`
        ][index]
    };
  });

  return {
    logline: `${project.groom}与${project.bride}的真实爱情，被写成一段${signature.motif}的${project.duration}秒婚礼微电影。`,
    visualLanguage: `${signature.palette}为主色，以${project.tone}为情绪底色，人物始终是画面叙事中心。`,
    acts,
    ending: `${project.groom} × ${project.bride}，让这一刻成为余生漫长故事的第一帧。`
  };
}

export function buildStoryboard(input) {
  const project = normalizeProject(input);
  const treatment = buildStoryTreatment(project);
  const transitions = [2, 4.5, 6, 8, 9.5, 11, 12.5, 14, 15.5, 18, 20, 22, 24, 27, 35.5, 37, 40];
  const usable = transitions.filter((value) => value < project.duration);
  const boundaries = [0, ...usable, project.duration].filter(
    (value, index, list) => list.indexOf(value) === index
  );

  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1];
    const template = SHOT_TEMPLATES[index % SHOT_TEMPLATES.length];
    const act =
      treatment.acts[
        Math.min(4, Math.floor((index / Math.max(1, boundaries.length - 1)) * 5))
      ];
    return {
      id: `shot-${String(index + 1).padStart(2, "0")}`,
      number: index + 1,
      start,
      end,
      duration: Number((end - start).toFixed(1)),
      title: index === 0 ? "开场 · " + template.title : template.title,
      scene: template.scene,
      shot: template.shot,
      move: template.move,
      act: act.label,
      status: index < 2 ? "已确认" : "待生成",
      prompt: `${template.prompt}。人物：${project.groom}（男主角）与${project.bride}（女主角）。造型始终参考上传定妆照，统一保持五官、发型和服装连续性。场景氛围：${project.theme} / ${project.tone}。`
    };
  });
}
