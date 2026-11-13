import {
  buildStoryTreatment,
  buildStoryboard,
  getFramePlan,
  normalizeProject
} from "./story-engine.mjs";
import { api, waitForJob } from "./api.js";
import {
  approvalIsCurrent,
  bindStoryboardToTemplate,
  createReviewState,
  formatTimecode,
  parseRouteHash,
  routeHash,
  shotReferenceWindow,
  shotReviewComplete
} from "./production-model.mjs";
import {
  buildCharacterSheetPrompt,
  buildImagePrompt,
  buildVideoPrompt,
  DEFAULT_CHARACTER_SHEET_DESCRIPTION
} from "./prompt-library.mjs";
import {
  WORKFLOW_SPECS,
  buildStepNavigationChildren,
  getWorkflowStep,
  workflowStepGaps
} from "./workflow-specs.mjs";
import { resolveWeddingNavigationAction } from "./wedding-navigation.mjs";
import {
  TOP_NAVIGATION,
  buildStudioNavigation
} from "./studio-navigation.mjs";
import {
  buildAudioAnalysisPrompt,
  buildReferenceImagePrompt,
  buildReplacementVideoPrompt,
  buildStoredRemixReport
} from "./remix-report.mjs";
import { REMIX_PAGE_SPECS } from "./remix-page-specs.mjs";

const STORAGE_KEY = "xying-wedding-film-studio-v1";

const DEFAULT_PROJECT = {
  mode: "story",
  projectName: "我们的婚礼微电影",
  groom: "沈知远",
  bride: "林晚晴",
  date: "2026-12-20",
  city: "杭州",
  duration: 40,
  theme: "三生三世",
  tone: "东方浪漫",
  aspect: "16:9",
  story:
    "我们从大学图书馆的一次偶遇开始。那天外面下着雨，他借给她一把伞。后来一起旅行、一起搬家，也一起度过异地最难的那两年。今天，我们决定把余生写成同一个故事。",
  storyBeats: {
    origin: "大学图书馆偶遇，雨天借伞。",
    knowing: "一起旅行、搬家，在异地最难的那两年互相陪伴。",
    confirm: "",
    companionship: "",
    promise: "今天，我们决定把余生写成同一个故事。"
  },
  photos: {
    groom: "",
    bride: ""
  },
  photoSources: {
    groom: "",
    bride: ""
  },
  selectedLooks: {
    groom: "",
    bride: ""
  },
  workflow: {
    currentStep: 1,
    approvals: {}
  }
};

const LEGACY_NAV_TREE = [
  {
    id: "workbench",
    label: "项目工作台",
    symbol: "启",
    route: "overview",
    children: [
      {
        id: "material-entry",
        label: "素材中心",
        symbol: "材",
        route: "assets",
        children: [
          { id: "material-couple", label: "新人照片与故事卡", route: "assets" },
          { id: "material-reference", label: "服装与场景参考", route: "assets" },
          { id: "material-video", label: "参考视频与成片", route: "assets" }
        ]
      },
      {
        id: "wizard-entry",
        label: "14 步制作向导",
        symbol: "引",
        route: "wizard",
        children: [
          { id: "wizard-story", label: "01–05 故事与旁白", route: "wizard" },
          { id: "wizard-visual", label: "06–09 分镜与视频", route: "wizard" },
          { id: "wizard-delivery", label: "10–14 音乐与交付", route: "wizard" }
        ]
      },
      {
        id: "template-group",
        label: "风格模板库",
        symbol: "模",
        route: "templates",
        children: [
          { id: "template-local", label: "上传模板", route: "templates" },
          { id: "template-douyin", label: "抖音链接解析", route: "templates" },
          { id: "template-analyzed", label: "已解析模板", route: "templates" }
        ]
      },
      {
        id: "story-group",
        label: "故事与人物",
        symbol: "叙",
        route: "story",
        children: [
          {
            id: "story-co-create",
            label: "故事共创",
            symbol: "文",
            route: "story",
            children: [
              {
                id: "story-theme",
                label: "主题与叙事",
                symbol: "章",
                route: "story",
                children: [
                  { id: "theme-sansheng", label: "三生三世", route: "story", theme: "三生三世" },
                  { id: "theme-letter", label: "时光回信", route: "story", theme: "时光回信" },
                  { id: "theme-stars", label: "星河约定", route: "story", theme: "星河约定" }
                ]
              },
              { id: "story-detail", label: "爱情故事输入", route: "story" }
            ]
          },
          {
            id: "character-group",
            label: "人物设定",
            symbol: "人",
            route: "characters",
            children: [
              {
                id: "male-character",
                label: "男主角",
                symbol: "郎",
                route: "characters",
                focus: "groom",
                children: [
                  {
                    id: "male-look",
                    label: "造型与一致性",
                    symbol: "衣",
                    route: "looks",
                    focus: "groom",
                    children: [
                      { id: "male-classic", label: "中式婚服", route: "looks", focus: "groom" },
                      { id: "male-modern", label: "现代礼服", route: "looks", focus: "groom" }
                    ]
                  }
                ]
              },
              {
                id: "female-character",
                label: "女主角",
                symbol: "娘",
                route: "characters",
                focus: "bride",
                children: [
                  {
                    id: "female-look",
                    label: "造型与一致性",
                    symbol: "妆",
                    route: "looks",
                    focus: "bride",
                    children: [
                      { id: "female-classic", label: "凤冠霞帔", route: "looks", focus: "bride" },
                      { id: "female-modern", label: "现代婚纱", route: "looks", focus: "bride" }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        id: "production",
        label: "分镜生产",
        symbol: "镜",
        route: "scenes",
        children: [
          {
            id: "scene-group",
            label: "场景设计",
            symbol: "景",
            route: "scenes",
            children: [
              {
                id: "scene-ancient",
                label: "东方庭院",
                route: "scenes",
                scene: "古代厅堂",
                children: [
                  { id: "scene-lantern", label: "红绸与灯笼", route: "scenes", scene: "古代厅堂" }
                ]
              },
              { id: "scene-republic", label: "民国长街", route: "scenes", scene: "民国长街" },
              { id: "scene-wedding", label: "今生婚礼", route: "scenes", scene: "今生婚礼" }
            ]
          },
          {
            id: "storyboard-group",
            label: "分镜脚本",
            symbol: "表",
            route: "storyboard",
            children: [
              {
                id: "storyboard-40",
                label: "40 秒四段式",
                route: "storyboard",
                children: [
                  { id: "beat-open", label: "开场 · 定场", route: "storyboard", beat: 0 },
                  { id: "beat-meet", label: "发展 · 相逢", route: "storyboard", beat: 1 },
                  { id: "beat-promise", label: "高潮 · 誓言", route: "storyboard", beat: 2 },
                  { id: "beat-end", label: "落幅 · 姓名", route: "storyboard", beat: 3 }
                ]
              }
            ]
          }
        ]
      },
      {
        id: "ai-production",
        label: "AI 生成",
        symbol: "生",
        route: "generate",
        children: [
          { id: "prompt-group", label: "提示词工坊", symbol: "词", route: "prompts" },
          { id: "model-center", label: "模型中心", symbol: "型", route: "models" },
          {
            id: "asset-generation",
            label: "资产生成",
            symbol: "绘",
            route: "generate",
            children: [
              {
                id: "character-stills",
                label: "人物定妆",
                route: "generate",
                children: [
                  { id: "still-front", label: "正面参考", route: "generate", asset: "front" },
                  { id: "still-side", label: "侧面参考", route: "generate", asset: "side" }
                ]
              },
              { id: "scene-stills", label: "场景图", route: "generate", asset: "scene" }
            ]
          },
          { id: "video-generation", label: "视频生成", symbol: "影", route: "generate" }
        ]
      },
      {
        id: "edit-deliver",
        label: "剪辑交付",
        symbol: "成",
        route: "edit",
        children: [
          {
            id: "edit-timeline",
            label: "时间线",
            symbol: "剪",
            route: "edit",
            children: [
              { id: "clip-manage", label: "片段管理", route: "edit" },
              { id: "subtitle-audio", label: "字幕与配乐", route: "audio" }
            ]
          },
          { id: "export-film", label: "导出成片", symbol: "出", route: "export" }
        ]
      },
      {
        id: "library-group",
        label: "资产与任务",
        symbol: "库",
        route: "assets",
        children: [
          { id: "template-assets", label: "模板与封面", route: "templates" },
          { id: "asset-library", label: "全部项目素材", route: "assets" },
          { id: "job-center", label: "生成任务中心", route: "jobs" }
        ]
      }
    ]
  },
  {
    id: "reference",
    label: "参考与方法",
    symbol: "鉴",
    route: "method",
    children: [
      { id: "video-analysis", label: "视频逐帧拆解", route: "method" },
      { id: "operation-guide", label: "完整操作指南", route: "guide" }
    ]
  }
];

const LEGACY_MAIN_NAV_TREE = () => [
  {
    id: "material-center",
    label: "素材中心",
    symbol: "材",
    route: "assets"
  },
  {
    id: "guide-14-steps",
    label: "14 步制作",
    symbol: "导",
    route: "wizard",
    children: [
      {
        id: "step-phase-story",
        label: "故事与文案",
        symbol: "文",
        children: [
          { id: "step-01", label: "01 故事采集", route: "step1", children: buildStepNavigationChildren(1) },
          { id: "step-02", label: "02 文案写作包", route: "step2", children: buildStepNavigationChildren(2) },
          { id: "step-03", label: "03 新人确认文案", route: "step3", children: buildStepNavigationChildren(3) }
        ]
      },
      {
        id: "step-phase-voice",
        label: "旁白与声音",
        symbol: "声",
        children: [
          { id: "step-04", label: "04 音色试听", route: "step4", children: buildStepNavigationChildren(4) },
          { id: "step-05", label: "05 完整旁白", route: "step5", children: buildStepNavigationChildren(5) }
        ]
      },
      {
        id: "step-phase-visual",
        label: "分镜与画面",
        symbol: "镜",
        children: [
          { id: "step-06", label: "06 分镜设计", route: "step6", children: buildStepNavigationChildren(6) },
          { id: "step-07", label: "07 重点静帧", route: "step7", children: buildStepNavigationChildren(7) },
          { id: "step-08", label: "08 剩余分镜图片", route: "step8", children: buildStepNavigationChildren(8) },
          { id: "step-09", label: "09 图生视频", route: "step9", children: buildStepNavigationChildren(9) }
        ]
      },
      {
        id: "step-phase-finish",
        label: "音乐与交付",
        symbol: "成",
        children: [
          { id: "step-10", label: "10 BGM 试听", route: "step10", children: buildStepNavigationChildren(10) },
          { id: "step-11", label: "11 配音与 BGM 试混", route: "step11", children: buildStepNavigationChildren(11) },
          { id: "step-12", label: "12 完整混音", route: "step12", children: buildStepNavigationChildren(12) },
          { id: "step-13", label: "13 字幕预览", route: "step13", children: buildStepNavigationChildren(13) },
          { id: "step-14", label: "14 正式交付", route: "step14", children: buildStepNavigationChildren(14) }
        ]
      }
    ]
  },
  {
    id: "douyin-remix-flow",
    label: "抖音复刻",
    symbol: "复",
    route: "remix",
    children: [
      { id: "remix-step-01", label: "01 下载与全帧提取", route: "remixStep1", children: buildRemixNavigationChildren(1) },
      { id: "remix-step-02", label: "02 画面声音字幕分析", route: "remixStep2", children: buildRemixNavigationChildren(2) },
      { id: "remix-step-03", label: "03 人物目标与逐镜替换", route: "remixStep3", children: buildRemixNavigationChildren(3) },
      { id: "remix-step-04", label: "04 时间轴封装与交付", route: "remixStep4", children: buildRemixNavigationChildren(4) }
    ]
  },
  {
    id: "template-resource",
    label: "模板库",
    symbol: "模",
    route: "templates"
  },
  {
    id: "model-resource",
    label: "模型中心",
    symbol: "型",
    route: "models"
  },
  {
    id: "job-resource",
    label: "任务中心",
    symbol: "单",
    route: "jobs"
  },
  {
    id: "analysis-resource",
    label: "参考片分析",
    symbol: "析",
    route: "method"
  },
  {
    id: "guide-resource",
    label: "操作说明",
    symbol: "问",
    route: "guide"
  }
];

const ROUTE_META = {
  overview: ["项目工作台", "把真实故事，拍成只属于你们的一部电影"],
  wizard: ["14 步婚礼电影向导", "每一步都有明确素材、人工确认和下一步，不会一次盲渲染到底"],
  remix: ["抖音模板复刻", "下载参考片、按 24 FPS 提取、明确替换人物，再按当前镜头时间轴封装"],
  remixStep1: ["01 链接下载与素材提取", "下载原片并保存 24 FPS 全帧索引、原始音频和媒体信息"],
  remixStep2: ["02 画面、音频、字幕与提示词解析", "生成逐镜报告和可复制的音频、图片、视频提示词"],
  remixStep3: ["03 男女主角色图批量生成", "以真实身份照片为锚点批量生成和筛选角色图"],
  remixStep4: ["04 人物与道具逐镜替换", "绑定人物与道具，生成或导入视频并完成九项审核"],
  remixStep5: ["05 原轨道对齐、预览与交付", "把替换镜头对齐原音乐、字幕和 24 FPS 时间轴"],
  templates: ["风格模板库", "上传本地视频或解析抖音链接，把参考片变成可编辑的模板配方"],
  story: ["故事共创", "从一个真实细节出发，让剧情有来处、有情绪、有落点"],
  characters: ["人物设定", "锁定男女主的脸、气质与服装，保证每个镜头都是同一个人"],
  looks: ["造型与一致性", "先定人物参考，再进入场景与镜头生成"],
  scenes: ["场景设计", "用三个时代、同一对手，形成清晰的视觉叙事"],
  storyboard: ["分镜脚本", "每一镜都有时间、动作、景别、运镜和连续性提示"],
  prompts: ["提示词工坊", "把故事语言翻译成可复核、可追溯的画面指令"],
  models: ["统一模型中心", "配置文字、图片、视频、视觉理解、语音、音乐和本地剪辑模型"],
  generate: ["AI 生成中心", "文字、图片、视频、语音和音乐统一调度，结果自动归档到资产库"],
  jobs: ["生成任务中心", "持久追踪所有模型任务；状态未知时只查询原任务，不重复提交"],
  edit: ["成片剪辑台", "把镜头放回时间线，让动作与音乐在正确的帧上相遇"],
  audio: ["字幕与配乐", "统一字幕节奏、字体层级与婚礼音乐情绪"],
  export: ["导出成片", "输出适用于婚礼现场、竖屏分享与亲友收藏的版本"],
  assets: ["素材中心", "集中管理新人照片、故事卡、服装场景参考、视频、配音、音乐、字幕和成片"],
  method: ["参考视频拆解", "把参考片的表层画面拆成可执行的生产步骤"],
  guide: ["操作指南", "从素材准备到成片交付，了解每个环节如何使用"],
  settings: ["项目设置", "管理输出规格、草稿与本地数据"]
};

const THEME_DATA = {
  "三生三世": {
    symbol: "缘",
    subtitle: "古代 · 民国 · 今生",
    description: "同一对手，用三次牵手完成宿命闭环。",
    use: "适合爱情跨度长、希望强调宿命感的新人。"
  },
  "时光回信": {
    symbol: "信",
    subtitle: "初见 · 相知 · 今天",
    description: "把真实爱情写成三封跨越时间的信。",
    use: "适合有大量照片、聊天记录和共同回忆的新人。"
  },
  "星河约定": {
    symbol: "星",
    subtitle: "夏夜 · 守候 · 团圆",
    description: "用灯火与星光纪年，从等待走向圆满。",
    use: "适合异地恋、校园恋与陪伴成长型故事。"
  }
};

const SOURCE_METHOD = [
  {
    title: "确定故事与影片风格",
    time: "00:35–00:55",
    description: "先写故事主题、叙事方式、时长和情绪，再选视觉风格；参考片采用“40秒、三生三世、三个时代同一对手”。"
  },
  {
    title: "固定男女主与服装",
    time: "00:55–01:18",
    description: "先确定角色身份和人物参考图，再为每个时代设计服装；真实照片用于身份锚点，也可以先做风格化角色底图。"
  },
  {
    title: "设计场景与分镜",
    time: "01:18–01:40",
    description: "按照同一叙事主题配置三套场景，并把总时长拆成镜头表，逐镜写画面、动作、景别和运镜。"
  },
  {
    title: "生成角色与场景资产",
    time: "01:10–01:45",
    description: "使用人物定妆参考和场景提示词生成资产；先检查脸部、手部、服装连续性，再进入视频生成。"
  },
  {
    title: "逐镜生成视频",
    time: "02:00–02:35",
    description: "视频提示词要回答人物怎么动、镜头怎么走、动作从哪里开始、在哪里结束；单镜通常生成约 4 秒。"
  },
  {
    title: "剪辑、字幕与成片",
    time: "02:35–02:43",
    description: "按分镜时间轴拼接片段，统一字幕、音乐与转场，最后导出完整婚礼微电影。"
  }
];

const ANALYSIS_SEGMENTS = [
  {
    label: "00:00–00:20",
    title: "成片钩子",
    description: "先展示婚礼微电影结果，以红妆、古镇、牵手与拥抱建立质感。",
    span: 1,
    color: "#7d141b"
  },
  {
    label: "00:20–00:40",
    title: "打开 AI 对话",
    description: "说明工具不是重点，把任务交给能拆解流程的大模型。",
    span: 1,
    color: "#a6262a"
  },
  {
    label: "00:40–01:10",
    title: "确定创意",
    description: "三生三世、40 秒、三个时代，以牵手动作建立统一视觉锚点。",
    span: 1.4,
    color: "#8b4d30"
  },
  {
    label: "01:10–01:40",
    title: "锁定人物",
    description: "男女主分别生成身份提示词、正面与侧面参考，固定脸和造型。",
    span: 1.4,
    color: "#526b55"
  },
  {
    label: "01:40–02:20",
    title: "分镜与生成",
    description: "把可用素材整理成约 17 镜的 40 秒时间表，逐镜给出场景、动作、运镜和视频提示词。",
    span: 2,
    color: "#9d2830"
  },
  {
    label: "02:20–02:43",
    title: "剪辑成片",
    description: "导入剪辑软件，按时间轴排片，统一字幕、配乐和转场后导出。",
    span: 1.1,
    color: "#b0783d"
  }
];

const WIZARD_STEPS = WORKFLOW_SPECS.map((step) => ({
  number: step.number,
  title: step.title,
  subtitle: step.subtitle,
  route: step.route
}));

for (const step of WIZARD_STEPS) {
  ROUTE_META[step.route] = [
    `第 ${step.number} 步 · ${step.title}`,
    step.subtitle
  ];
}

const REMIX_STEPS = REMIX_PAGE_SPECS.map((step) => ({
  number: step.number,
  title: step.title,
  subtitle: step.subtitle,
  route: step.route
}));

const REMIX_GUIDES = REMIX_PAGE_SPECS;

function buildRemixNavigationChildren(number) {
  const guide = REMIX_GUIDES[number - 1];
  if (!guide) return [];
  return [
    ["input", "输入清单"],
    ["actions", "操作功能"],
    ["outputs", "步骤产物"],
    ["checks", "人工检查"]
  ].map(([key, label]) => ({
    id: `remix-step-${number}-level4-${key}`,
    label,
    symbol: label.slice(0, 1),
    route: `remixStep${number}`
  }));
}

const WEDDING_REFERENCE_IMAGES = {
  ancientBride: "./public/wedding-assets/ancient-bride-reference.jpg",
  ancientCouple: "./public/wedding-assets/ancient-courtyard-couple.jpg",
  ancientLantern: "./public/wedding-assets/ancient-lantern-couple.jpg",
  ancientRoof: "./public/wedding-assets/ancient-roof.jpg",
  groomModern: "./public/wedding-assets/groom-style-reference.jpg",
  republicCouple: "./public/wedding-assets/republic-couple.jpg",
  republicStreet: "./public/wedding-assets/republic-street.jpg",
  modernCouple: "./public/wedding-assets/modern-couple.jpg",
  ancientHall: "./public/wedding-assets/ancient-courtyard.jpg"
};

function weddingLookReference(look) {
  if (look.imagePath) return { src: api.mediaUrl(look.imagePath), source: "generated" };
  if (look.era === "ancient") {
    return {
      src: look.gender === "female" ? WEDDING_REFERENCE_IMAGES.ancientBride : WEDDING_REFERENCE_IMAGES.ancientCouple,
      source: "reference"
    };
  }
  if (look.era === "republic") {
    return { src: WEDDING_REFERENCE_IMAGES.republicCouple, source: "reference" };
  }
  return {
    src: look.gender === "female" ? WEDDING_REFERENCE_IMAGES.modernCouple : WEDDING_REFERENCE_IMAGES.groomModern,
    source: "reference"
  };
}

let state = loadState();
let activeRouteInfo = parseRouteHash(window.location.hash);
let activeRoute = routeNameFromInfo(activeRouteInfo);
let activeFocus = null;
let remixSelectedShotId = "";
let remixBatchEstimate = null;
let remixBatchJobId = "";
let selectedModelCategory = "text";
let modelEditorId = "";
let modelDraftCategory = "";
let selectedMusicMood = "warm-cinematic";
let openNavIds = new Set([
  "guide-14-steps",
  "step-phase-story",
  "step-phase-voice",
  "step-phase-visual",
  "step-phase-finish"
]);
let treatment = buildStoryTreatment(state);
let storyboard = buildStoryboard(state);
let currentProjectId = "project-default";
let runtime = {
  online: false,
  health: null,
  projects: [],
  templates: [],
  models: [],
  looks: [],
  assets: [],
  exports: [],
  jobs: [],
  timeline: null,
  remixReport: null,
  approvalSnapshots: {},
  modelSchema: {
    categories: [],
    providers: []
  }
};
let mediaViewerState = {
  src: "",
  type: "image",
  title: "",
  assetId: "",
  scale: 1
};

function loadState() {
  try {
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!persisted) return structuredClone(DEFAULT_PROJECT);
    return {
      ...structuredClone(DEFAULT_PROJECT),
      ...persisted,
      photos: {
        ...DEFAULT_PROJECT.photos,
        ...(persisted.photos || {})
      }
    };
  } catch {
    return structuredClone(DEFAULT_PROJECT);
  }
}

function saveState({ quiet = false } = {}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (runtime.online) {
      api
        .updateProject(currentProjectId, {
          mode: state.mode,
          name: state.projectName,
          groom: state.groom,
          bride: state.bride,
          weddingDate: state.date,
          city: state.city,
          story: state.story,
          storyBeats: state.storyBeats,
          duration: state.duration,
          referenceDuration: state.referenceDuration,
          storyDuration: state.storyDuration,
          remixDuration: state.remixDuration,
          theme: state.theme,
          tone: state.tone,
          aspect: state.aspect,
          treatment,
          storyboard,
          ...(state.mode === "remix"
            ? { remixStoryboard: storyboard }
            : { storyStoryboard: storyboard }),
          photoAssetIds: state.photoAssetIds,
          selectedLooks: state.selectedLooks,
          workflow: state.workflow,
          remixWorkflow: state.remixWorkflow,
          remixTargets: state.remixTargets,
          remixRange: state.remixRange,
          musicLicense: state.musicLicense,
          subtitleStyle: state.subtitleStyle
        })
        .catch(() => {});
    }
    if (!quiet) showToast("草稿已保存在本机浏览器");
  } catch {
    if (!quiet) showToast("素材较大，建议先压缩人物照片再保存");
  }
}

async function refreshRuntime({ rerender = true } = {}) {
  try {
    const [bootstrap, health, modelPayload] = await Promise.all([
      api.bootstrap(),
      api.health(),
      api.getModels().catch(() => ({ schema: runtime.modelSchema }))
    ]);
    runtime = {
      online: true,
      health,
      projects: bootstrap.projects || [],
      templates: bootstrap.templates || [],
      models: bootstrap.models || [],
      looks: bootstrap.looks || [],
      assets: bootstrap.assets || [],
      exports: bootstrap.exports || [],
      jobs: bootstrap.jobs || [],
      timeline: null,
      approvalSnapshots: {},
      modelSchema: modelPayload.schema || runtime.modelSchema || {
        categories: [],
        providers: []
      }
    };
    const project =
      runtime.projects.find((item) => item.id === currentProjectId) || runtime.projects[0];
    if (project) {
      currentProjectId = project.id;
      const explicitRouteMode =
        activeRouteInfo.page === "remix"
          ? "remix"
          : activeRouteInfo.page === "story" || /^step\d+$/.test(activeRoute)
            ? "story"
            : "";
      const effectiveMode =
        explicitRouteMode || project.mode || state.mode || "story";
      const activeDuration =
        effectiveMode === "remix"
          ? Number(project.remixDuration || project.remixRange?.end - project.remixRange?.start || project.duration || 40)
          : Number(project.storyDuration || project.duration || 40);
      state = normalizeProject({
        ...state,
        projectName: project.name || state.projectName,
        mode: effectiveMode,
        groom: project.groom || state.groom,
        bride: project.bride || state.bride,
        date: project.weddingDate || state.date,
        city: project.city || state.city,
        story: project.story || state.story,
        storyBeats: project.storyBeats || state.storyBeats,
        duration: activeDuration,
        storyDuration: Number(project.storyDuration || project.duration || state.storyDuration || 40),
        remixDuration: Number(project.remixDuration || state.remixDuration || 0),
        referenceDuration:
          project.referenceDuration || state.referenceDuration || 0,
        theme: project.theme || state.theme,
        tone: project.tone || state.tone,
        aspect: project.aspect || state.aspect,
        photos: {
          groom: project.photos?.groom || state.photos.groom,
          bride: project.photos?.bride || state.photos.bride
        },
        photoAssetIds: project.photoAssetIds || state.photoAssetIds,
        photoSources: project.photoSources || state.photoSources,
        selectedLooks: project.selectedLooks || state.selectedLooks,
        workflow: project.workflow || state.workflow,
        remixWorkflow: project.remixWorkflow || state.remixWorkflow,
        remixTargets: project.remixTargets || state.remixTargets,
        remixRange: project.remixRange || state.remixRange,
        musicLicense: project.musicLicense ?? state.musicLicense,
        subtitleStyle: project.subtitleStyle || state.subtitleStyle,
        timelineRevision: project.timelineRevision || state.timelineRevision
      });
      treatment = buildStoryTreatment(state);
      storyboard = buildStoryboard(state);
      if (project.treatment) treatment = project.treatment;
      const routedStoryboard =
        effectiveMode === "remix"
          ? project.remixStoryboard
          : project.storyStoryboard;
      if (Array.isArray(routedStoryboard) && routedStoryboard.length) {
        storyboard = routedStoryboard;
      } else if (
        (project.mode || "story") === effectiveMode &&
        Array.isArray(project.storyboard) &&
        project.storyboard.length
      ) {
        storyboard = project.storyboard;
      }
      const template = runtime.templates.find((item) => item.id === project.templateId);
      storyboard = bindStoryboardToTemplate(storyboard, template);
      const timelinePayload = await api
        .getProjectTimeline(project.id, effectiveMode)
        .catch(() => null);
      const remixReportPayload = await api
        .getRemixReport(project.id)
        .catch(() => null);
      runtime.timeline = timelinePayload?.item || null;
      runtime.remixReport = remixReportPayload?.item || null;
      runtime.approvalSnapshots = timelinePayload?.approvalSnapshots || {};
    }
  } catch {
    runtime.online = false;
  }
  if (rerender) render();
}

function familyModels(category) {
  return (runtime.models || []).filter((model) => model.category === category);
}

function defaultModel(category) {
  return familyModels(category).find((model) => model.isDefault) || familyModels(category)[0] || null;
}

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function framePlan() {
  return getFramePlan(state.duration);
}

function coupleName() {
  return `${state.groom} × ${state.bride}`;
}

function formatDate(date) {
  if (!date) return "婚期待定";
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;
  return `${year} · ${month} · ${day}`;
}

function icon(name) {
  const icons = {
    upload:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v5h14v-5"/></svg>',
    replace:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2"/><path d="M20 4v5h-5M4 20v-5h5"/></svg>',
    trash:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 3h6l1 4H8l1-4ZM7 7l1 14h8l1-14M10 11v6M14 11v6"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg>',
    sparkle:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/><path d="m19 16 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z"/></svg>',
    arrow:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>',
    shield:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4.5 6v5c0 4.7 3 8.2 7.5 10 4.5-1.8 7.5-5.3 7.5-10V6L12 3Z"/><path d="m9 12 2 2 4-5"/></svg>',
    copy:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'
  };
  return icons[name] || "";
}

function ensureMediaViewer() {
  let viewer = document.querySelector("#media-viewer");
  if (viewer) return viewer;
  viewer = document.createElement("div");
  viewer.id = "media-viewer";
  viewer.className = "media-viewer";
  viewer.hidden = true;
  viewer.innerHTML = `
    <div class="media-viewer-backdrop" data-media-close></div>
    <section class="media-viewer-dialog" role="dialog" aria-modal="true" aria-labelledby="media-viewer-title">
      <header class="media-viewer-header">
        <div>
          <small>项目媒体预览</small>
          <h2 id="media-viewer-title">媒体预览</h2>
          <p data-media-meta></p>
        </div>
        <button class="media-viewer-icon-button" type="button" data-media-close aria-label="关闭预览">×</button>
      </header>
      <div class="media-viewer-toolbar">
        <div class="media-viewer-zoom" data-media-image-controls>
          <button class="media-viewer-tool" type="button" data-media-zoom="out" aria-label="缩小图片">−</button>
          <button class="media-viewer-tool media-viewer-scale" type="button" data-media-zoom="reset" aria-label="恢复原始大小"><span data-media-scale>100%</span></button>
          <button class="media-viewer-tool" type="button" data-media-zoom="in" aria-label="放大图片">＋</button>
        </div>
        <div class="media-viewer-actions">
          <a class="media-viewer-action primary" data-media-save href="#" download>${icon("upload")}保存文件</a>
          <button class="media-viewer-action danger" type="button" data-media-delete hidden>${icon("trash")}删除素材</button>
        </div>
      </div>
      <div class="media-viewer-stage" data-media-stage>
        <img data-media-image alt="" hidden />
        <video data-media-video controls playsinline preload="metadata" hidden></video>
      </div>
      <footer class="media-viewer-footer">
        <span>图片可放大、缩小并保存；视频可直接播放或保存。</span>
        <span>被镜头或项目引用的素材禁止直接删除。</span>
      </footer>
    </section>
  `;
  document.body.appendChild(viewer);
  viewer.querySelector("[data-media-stage]")?.addEventListener(
    "wheel",
    (event) => {
      if (mediaViewerState.type !== "image") return;
      event.preventDefault();
      updateMediaViewerScale(
        mediaViewerState.scale + (event.deltaY < 0 ? 0.2 : -0.2)
      );
    },
    { passive: false }
  );
  viewer.querySelector("[data-media-image]")?.addEventListener("dblclick", () => {
    updateMediaViewerScale(mediaViewerState.scale > 1 ? 1 : 2);
  });
  return viewer;
}

function normalizedMediaUrl(value) {
  if (!value) return "";
  if (String(value).startsWith("data:")) return String(value);
  try {
    const url = new URL(value, window.location.href);
    return `${url.origin}${url.pathname}`;
  } catch {
    return String(value).replaceAll("\\", "/");
  }
}

function findRuntimeAssetForSource(source) {
  const normalized = normalizedMediaUrl(source);
  if (!normalized || normalized.startsWith("data:")) return null;
  return (
    runtime.assets.find((asset) =>
      [asset.url, asset.previewUrl]
        .filter(Boolean)
        .some((value) => normalizedMediaUrl(api.mediaUrl(value)) === normalized)
    ) || null
  );
}

function isDeletableVisualAsset(asset) {
  return Boolean(
    asset &&
      [
        "image",
        "look-image",
        "photo",
        "project-photo",
        "story-card",
        "outfit-reference",
        "scene-reference",
        "video",
        "template-clip",
        "preview",
        "export"
      ].includes(asset.kind)
  );
}

function mediaFilename(title, source, type) {
  const safeTitle =
    String(title || "婚礼微电影素材")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "婚礼微电影素材";
  let extension = "";
  try {
    extension = new URL(source, window.location.href).pathname.match(/\.[a-z0-9]+$/i)?.[0] || "";
  } catch {
    extension = "";
  }
  if (!extension) extension = type === "video" ? ".mp4" : ".jpg";
  return `${safeTitle}${extension}`;
}

function updateMediaViewerScale(nextScale) {
  const viewer = ensureMediaViewer();
  mediaViewerState.scale = Math.min(4, Math.max(0.5, Number(nextScale) || 1));
  const image = viewer.querySelector("[data-media-image]");
  if (image) {
    image.style.transform = `scale(${mediaViewerState.scale})`;
  }
  const label = viewer.querySelector("[data-media-scale]");
  if (label) label.textContent = `${Math.round(mediaViewerState.scale * 100)}%`;
}

function openMediaViewer({ source, type = "image", title = "", assetId = "" }) {
  if (!source) return;
  const viewer = ensureMediaViewer();
  const asset =
    runtime.assets.find((item) => item.id === assetId) ||
    findRuntimeAssetForSource(source);
  mediaViewerState = {
    src: source,
    type,
    title: title || asset?.title || (type === "video" ? "婚礼视频" : "婚礼图片"),
    assetId: asset?.id || assetId || "",
    scale: 1
  };
  const image = viewer.querySelector("[data-media-image]");
  const video = viewer.querySelector("[data-media-video]");
  const imageControls = viewer.querySelector("[data-media-image-controls]");
  const save = viewer.querySelector("[data-media-save]");
  const deleteButton = viewer.querySelector("[data-media-delete]");

  viewer.querySelector("#media-viewer-title").textContent = mediaViewerState.title;
  viewer.querySelector("[data-media-meta]").textContent =
    type === "video" ? "视频预览 · 可播放和保存原文件" : "图片预览 · 可放大和保存原图";
  image.hidden = type !== "image";
  video.hidden = type !== "video";
  imageControls.hidden = type !== "image";
  if (type === "video") {
    video.src = source;
    video.load();
  } else {
    image.src = source;
    image.alt = mediaViewerState.title;
    image.style.transform = "scale(1)";
  }
  save.href = source;
  save.download = mediaFilename(mediaViewerState.title, source, type);
  save.setAttribute("download", save.download);
  deleteButton.hidden = !isDeletableVisualAsset(asset);
  deleteButton.disabled = false;
  deleteButton.dataset.assetId = asset?.id || "";
  deleteButton.dataset.assetTitle = asset?.title || mediaViewerState.title;
  updateMediaViewerScale(1);
  viewer.hidden = false;
  document.body.classList.add("media-viewer-open");
  window.setTimeout(() => {
    viewer.querySelector("[data-media-close]")?.focus();
  }, 0);
}

function closeMediaViewer() {
  const viewer = document.querySelector("#media-viewer");
  if (!viewer || viewer.hidden) return;
  const video = viewer.querySelector("[data-media-video]");
  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
  viewer.hidden = true;
  document.body.classList.remove("media-viewer-open");
  mediaViewerState = {
    src: "",
    type: "image",
    title: "",
    assetId: "",
    scale: 1
  };
}

function openMediaViewerFromElement(element) {
  if (!element) return;
  const source =
    element.currentSrc ||
    element.getAttribute("src") ||
    element.querySelector?.("source")?.getAttribute("src") ||
    "";
  const type = element.tagName === "VIDEO" ? "video" : "image";
  const host = element.closest(
    "[data-media-asset-id], .asset-preview, figure, .video-shell, .character-photo"
  );
  const title =
    host?.dataset.mediaTitle ||
    element.dataset.mediaTitle ||
    element.getAttribute("alt") ||
    findRuntimeAssetForSource(source)?.title ||
    (type === "video" ? "婚礼视频" : "婚礼图片");
  const assetId =
    element.dataset.mediaAssetId ||
    host?.dataset.mediaAssetId ||
    findRuntimeAssetForSource(source)?.id ||
    "";
  openMediaViewer({ source, type, title, assetId });
}

function prepareMediaPreviewElements() {
  document.querySelectorAll("#main-content img, #main-content video").forEach((element) => {
    if (element.closest("#media-viewer")) return;
    const source =
      element.currentSrc ||
      element.getAttribute("src") ||
      element.querySelector?.("source")?.getAttribute("src") ||
      "";
    const asset = findRuntimeAssetForSource(source);
    element.dataset.mediaPreview = "true";
    element.tabIndex = 0;
    element.title = `点击预览${asset ? "，可保存或安全删除" : "并保存"}`;
    if (asset?.id) element.dataset.mediaAssetId = asset.id;
    const host = element.closest(
      "[data-media-asset-id], .asset-preview, figure, .video-shell, .character-photo"
    );
    if (host) {
      host.dataset.mediaHost = "true";
      host.dataset.mediaTitle =
        element.getAttribute("alt") || asset?.title || (element.tagName === "VIDEO" ? "婚礼视频" : "婚礼图片");
      if (asset?.id) host.dataset.mediaAssetId = asset.id;
    }
  });
}

async function handleMediaViewerClick(event) {
  const viewer = event.target.closest("#media-viewer");
  if (!viewer) return false;
  if (event.target.closest("[data-media-close]")) {
    closeMediaViewer();
    return true;
  }
  const zoom = event.target.closest("[data-media-zoom]")?.dataset.mediaZoom;
  if (zoom) {
    const nextScale =
      zoom === "in"
        ? mediaViewerState.scale + 0.25
        : zoom === "out"
          ? mediaViewerState.scale - 0.25
          : 1;
    updateMediaViewerScale(nextScale);
    return true;
  }
  const deleteButton = event.target.closest("[data-media-delete]");
  if (!deleteButton || deleteButton.disabled) return false;
  const assetId = deleteButton.dataset.assetId;
  if (!assetId) return true;
  if (
    !window.confirm(
      `确认删除“${deleteButton.dataset.assetTitle || "当前素材"}”吗？被镜头或项目引用的素材不会被删除。`
    )
  ) {
    return true;
  }
  deleteButton.disabled = true;
  try {
    await api.deleteAsset(assetId);
    closeMediaViewer();
    await refreshRuntime();
    showToast("素材及本地文件已删除");
  } catch (error) {
    deleteButton.disabled = false;
    showToast(error.message || "素材删除失败，请先解除镜头引用");
  }
  return true;
}

function render() {
  document
    .querySelector("#app")
    .classList.toggle("no-sidebar", studioModeForRoute() === "home");
  document.querySelector(".top-tabs").innerHTML = TOP_NAVIGATION.map(
    (item) => `
      <button class="top-tab ${isTopNavigationActive(item) ? "active" : ""}" data-route="${item.route}">
        <span class="tab-mark"></span>${esc(item.label)}
      </button>
    `
  ).join("");
  document.querySelector("#top-project-name").textContent = state.projectName;
  renderNav();
  const content = document.querySelector("#main-content");
  const view = getView(activeRoute);
  content.innerHTML = view;
  content.scrollTop = 0;
  window.scrollTo({ top: 0, behavior: "instant" });
  bindCurrentView();
}

function routeNameFromInfo(info) {
  if (info?.page === "story" && info.step) return `step${info.step}`;
  if (info?.page === "remix" && info.step) return `remixStep${info.step}`;
  return info?.page || "overview";
}

function studioModeForRoute(route = activeRoute) {
  if (route === "wizard" || /^step\d+$/.test(route)) return "self";
  if (route === "remix" || /^remixStep\d+$/.test(route)) return "remix";
  return "home";
}

function currentStudioNavigation() {
  return buildStudioNavigation(studioModeForRoute());
}

function isTopNavigationActive(item) {
  const mode = studioModeForRoute();
  if (item.id === "self") return mode === "self";
  if (item.id === "remix") return mode === "remix";
  return item.route === activeRoute;
}

function routeInfoFromHash(hash = window.location.hash) {
  const parsed = parseRouteHash(hash);
  if (parsed.page === "story" && parsed.step) {
    return { ...parsed, route: `step${parsed.step}` };
  }
  if (parsed.page === "remix" && parsed.step) {
    return { ...parsed, route: `remixStep${parsed.step}` };
  }
  return { ...parsed, route: parsed.page };
}

function hashForRoute(route) {
  const storyStep = String(route || "").match(/^step(\d+)$/i);
  if (storyStep) return routeHash("story", { step: Number(storyStep[1]) });
  const remixStep = String(route || "").match(/^remixStep(\d+)$/i);
  if (remixStep) return routeHash("remix", { step: Number(remixStep[1]) });
  return routeHash(route || "overview");
}

function navigateTo(route, { replace = false } = {}) {
  const targetHash = hashForRoute(route);
  if (window.location.hash === targetHash) {
    activeRouteInfo = routeInfoFromHash(targetHash);
    activeRoute = activeRouteInfo.route;
    render();
    return;
  }
  if (replace) {
    window.history.replaceState(null, "", targetHash);
    activeRouteInfo = routeInfoFromHash(targetHash);
    activeRoute = activeRouteInfo.route;
    render();
  } else {
    window.location.hash = targetHash;
  }
}

function restoreRouteFromHash() {
  activeRouteInfo = routeInfoFromHash();
  activeRoute = activeRouteInfo.route;
  if (activeRouteInfo.page === "remix" || activeRouteInfo.page === "story") {
    state.mode = activeRouteInfo.mode;
    const project = runtime.projects.find((item) => item.id === currentProjectId);
    if (project) {
      const candidate =
        state.mode === "remix" ? project.remixStoryboard : project.storyStoryboard;
      if (Array.isArray(candidate) && candidate.length) storyboard = candidate;
      state.duration =
        state.mode === "remix"
          ? Number(project.remixDuration || state.remixDuration || state.duration)
          : Number(project.storyDuration || state.storyDuration || state.duration);
    }
  }
  render();
}

function renderNav() {
  const root = document.querySelector("#nav-tree");
  const mode = studioModeForRoute();
  if (mode !== "self" && mode !== "remix") {
    root.innerHTML = "";
    return;
  }
  if (mode === "self") openNavIds.add("self");
  if (mode === "remix") openNavIds.add("remix");
  root.innerHTML = buildStudioNavigation(mode)
    .map((node) => renderNavNode(node, 1))
    .join("");
}

function scrollToNavigationTarget(target, route) {
  window.setTimeout(() => {
    const element =
      (target &&
        (document.querySelector(`[data-step-target="${target}"]`) ||
          document.getElementById(target))) ||
      document.querySelector(`[data-page-route="${route}"]`) ||
      document.querySelector("#main-content");
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: target ? "center" : "start" });
    element.classList.add("nav-target-highlight");
    window.setTimeout(() => element.classList.remove("nav-target-highlight"), 1400);
  }, 140);
}

function renderNavNode(node, depth) {
  const children = node.children || [];
  const isOpen = openNavIds.has(node.id);
  const isActive =
    node.route === activeRoute &&
    (!node.focus || node.focus === activeFocus) &&
    (!node.theme || node.theme === state.theme);
  const hasChildren = children.length > 0;
  return `
    <div class="nav-group nav-depth-${depth}">
      <button
        class="nav-node ${isActive ? "active" : ""}"
        data-nav-id="${node.id}"
        data-nav-depth="${depth}"
        data-route="${node.route || ""}"
        data-theme="${node.theme || ""}"
        data-focus="${node.focus || ""}"
        data-scene="${node.scene || ""}"
        data-beat="${node.beat ?? ""}"
        data-asset="${node.asset || ""}"
        data-target="${node.target || ""}"
        ${hasChildren ? `aria-expanded="${isOpen}"` : ""}
        title="${esc(node.label)}"
      >
        ${node.symbol ? `<span class="nav-icon">${node.symbol}</span>` : ""}
        <span class="nav-label">${esc(node.label)}</span>
        ${
          hasChildren
            ? '<svg class="nav-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>'
            : ""
        }
      </button>
      ${
        hasChildren
          ? `<div class="nav-children ${isOpen ? "open" : ""}">
              ${children.map((child) => renderNavNode(child, depth + 1)).join("")}
            </div>`
          : ""
      }
    </div>
  `;
}

function getView(route) {
  const views = {
    ...Object.fromEntries(
      WIZARD_STEPS.map((step) => [step.route, () => workflowStepPage(step.number)])
    ),
    ...Object.fromEntries(
      REMIX_STEPS.map((step) => [step.route, () => remixStepPage(step.number)])
    ),
    overview: overviewPage,
    wizard: wizardPage,
    remix: remixOverviewPage,
    templates: templatesPage,
    models: modelCenterPage,
    story: storyPage,
    characters: charactersPage,
    looks: looksPage,
    scenes: scenesPage,
    storyboard: storyboardPage,
    prompts: promptsPage,
    generate: generatePage,
    jobs: jobsPage,
    edit: editPage,
    audio: audioPage,
    export: exportPage,
    assets: assetsPage,
    method: methodPage,
    guide: guidePage,
    settings: settingsPage
  };
  return (views[route] || overviewPage)();
}

function pageHeader(route, customDescription = "") {
  const [title, description] = ROUTE_META[route] || ROUTE_META.overview;
  return `
    <header class="page-heading" data-page-route="${esc(route)}">
      <div>
        <div class="page-kicker">囍映创作流程</div>
        <h1>${esc(title)}</h1>
        <p>${esc(customDescription || description)}</p>
      </div>
      <div class="chip-row">
        <span class="chip"><span class="dot"></span>24 FPS</span>
        <span class="chip">${state.duration} 秒</span>
        <span class="chip">${esc(state.theme)}</span>
      </div>
    </header>
  `;
}

function progressStrip(current = 0) {
  const steps = [
    ["story", "故事共创", "主题与真实故事"],
    ["characters", "人物设定", "姓名、照片与造型"],
    ["storyboard", "分镜脚本", "镜头、动作与运镜"],
    ["generate", "生成生产", "统一模型与任务追踪"],
    ["edit", "剪辑交付", "字幕、配乐与导出"]
  ];
  return `
    <div class="progress-strip">
      ${steps
        .map(
          ([route, title, hint], index) => `
          <button class="progress-step ${index === current ? "active" : ""}" data-route="${route}">
            <span class="step-number">${index + 1}</span>
            <span class="step-copy"><strong>${title}</strong><small>${hint}</small></span>
          </button>`
        )
        .join("")}
    </div>
  `;
}

function overviewPage() {
  const plan = framePlan();
  const uploadedCount =
    Number(Boolean(state.photos.groom)) + Number(Boolean(state.photos.bride));
  const readyModels = runtime.models.filter(
    (model) => model.enabled !== false && model.status === "ready"
  ).length;
  const latestJobs = runtime.jobs.slice(0, 3);
  const jobStatusLabels = {
    queued: "排队中",
    running: "运行中",
    succeeded: "已完成",
    failed: "失败",
    unknown: "待核对原任务"
  };
  return `
    <div class="page dual-entry-home">
      <section class="home-cinema-hero">
        <div class="home-copy">
          <div class="hero-badge"><span class="spark"></span>囍映 AI · 婚礼电影首映</div>
          <p class="home-kicker">${esc(state.projectName)}</p>
          <h1>${esc(state.groom)} <em>×</em> ${esc(state.bride)}</h1>
          <p class="home-lead">${esc(formatDate(state.date))} · ${esc(state.city)} · ${state.duration} 秒 · ${plan.totalFrames} 帧</p>
          <div class="home-seal-row">
            <span>24 FPS</span>
            <span>${esc(state.theme)}</span>
            <span>${uploadedCount}/2 真人照片</span>
          </div>
        </div>
        <div class="home-poster" aria-hidden="true">
          <span class="home-poster-mark">囍</span>
          <small>OUR WEDDING FILM</small>
          <strong>${esc(state.groom)}<br />& ${esc(state.bride)}</strong>
          <span>${esc(formatDate(state.date))}</span>
        </div>
      </section>

      <section class="entry-grid" aria-label="婚礼微电影制作入口">
        <button class="entry-card entry-remix" data-route="remix">
          <span class="entry-number">01</span>
          <span class="entry-kicker">REFERENCE REMIX · 5 STEPS</span>
          <strong>抖音链接复刻</strong>
          <span class="entry-description">提取画面、音频、字幕和提示词，再用当前新人的授权素材逐镜替换人物与道具。</span>
          <span class="entry-action">进入抖音复刻 ${icon("arrow")}</span>
        </button>
        <button class="entry-card entry-self" data-route="wizard">
          <span class="entry-number">02</span>
          <span class="entry-kicker">ORIGINAL STORY · 14 STEPS</span>
          <strong>自我生成婚礼电影</strong>
          <span class="entry-description">从真实爱情故事开始，完成五幕文案、旁白、分镜、图片、视频、音乐与正式交付。</span>
          <span class="entry-action">进入 14 步制作 ${icon("arrow")}</span>
        </button>
      </section>

      <section class="home-status-grid">
        <article class="card card-pad home-status-card">
          <div class="section-title">
            <div><h2>模型与工具</h2><p>${readyModels} 个核心模型已就绪</p></div>
            <button class="text-button" data-route="models">模型中心 →</button>
          </div>
          <div class="home-status-list">
            <div><span class="status-dot"></span><strong>${runtime.online ? "本地服务在线" : "本地服务未连接"}</strong><small>${runtime.online ? "生成与剪辑接口可用" : "运行 npm start 后启用"}</small></div>
            <div><span class="status-orb gold"></span><strong>${readyModels}</strong><small>已启用的默认模型</small></div>
            <div><span class="status-orb red"></span><strong>${runtime.templates.length}</strong><small>已导入参考模板</small></div>
          </div>
        </article>
        <article class="card card-pad home-status-card">
          <div class="section-title">
            <div><h2>最近任务</h2><p>付费任务不会自动重复提交</p></div>
            <button class="text-button" data-route="jobs">任务中心 →</button>
          </div>
          <div class="home-job-list">
            ${
              latestJobs.length
                ? latestJobs
                    .map(
                      (job) => `
                        <div class="home-job-row">
                          <div><strong>${esc(jobLabel(job.kind))}</strong><small>${esc(job.progress || 0)}% · ${esc(job.projectId || "默认项目")}</small></div>
                          <span class="badge ${job.status === "succeeded" ? "green" : job.status === "failed" ? "red" : "gold"}">${esc(jobStatusLabels[job.status] || job.status)}</span>
                        </div>`
                    )
                    .join("")
                : '<p class="small muted home-empty-copy">还没有生成任务。选择上方任一入口开始制作。</p>'
            }
          </div>
        </article>
      </section>

      <section class="home-project-strip card">
        <div>
          <span class="eyebrow">CURRENT PROJECT</span>
          <h3>${esc(state.projectName)}</h3>
          <p>${esc(treatment.logline)}</p>
        </div>
        <div class="home-project-actions">
          <button class="button ghost small-button" data-route="settings">项目设置</button>
          <button class="button secondary small-button" data-route="assets">素材管理</button>
        </div>
      </section>
    </div>
  `;
}

function currentRemixTemplate() {
  const project = runtime.projects.find((item) => item.id === currentProjectId);
  return (
    runtime.templates.find((item) => item.id === project?.templateId) ||
    runtime.templates[0] ||
    null
  );
}

function approvalIsStillCurrent(step, mode = "story") {
  const workflow =
    mode === "remix" ? state.remixWorkflow : state.workflow;
  const approval = workflow?.approvals?.[step];
  if (!approval) return false;
  return approvalIsCurrent(approval, runtime.approvalSnapshots?.[step]);
}

function remixReady(stepNumber) {
  const template = currentRemixTemplate();
  if (stepNumber === 1) {
    return Boolean(template?.remixExtraction?.totalFrames);
  }
  if (stepNumber === 2) {
    return Boolean(template?.remixAnalysis);
  }
  if (stepNumber === 3) {
    return Boolean(
      state.photoAssetIds?.groom &&
        state.photoAssetIds?.bride &&
        runtime.assets.some(
          (asset) =>
            asset.projectId === currentProjectId &&
            ["image", "look-image"].includes(asset.kind)
        )
    );
  }
  if (stepNumber === 4) {
    const expected = Math.min(8, storyboard.length);
    const approved = storyboard.filter(
      (shot) =>
        shot.status === "approved" &&
        shotReviewComplete(shot.review) &&
        shot.assets?.video?.assetId
    ).length;
    return expected > 0 && approved >= expected;
  }
  if (stepNumber === 5) {
    const project = runtime.projects.find((item) => item.id === currentProjectId);
    const since = project?.lastRemixApprovalAt || "";
    return runtime.assets.some(
      (asset) =>
        asset.kind === "export" &&
        asset.projectId === currentProjectId &&
        (!since || String(asset.createdAt || "") >= since)
    );
  }
  return false;
}

function remixOverviewPage() {
  const template = currentRemixTemplate();
  const extraction = template?.remixExtraction;
  const project = runtime.projects.find((item) => item.id === currentProjectId);
  return `
    <div class="page">
      ${pageHeader("remix")}
      <div class="content-grid">
        <section class="card card-pad">
          <div class="section-title"><div><h2>抖音视频人物替换</h2><p>原片负责节奏，角色和成片由当前项目重新生成</p></div><span class="badge ${extraction ? "green" : "gold"}">${extraction ? `${extraction.totalFrames} 帧` : "待提取"}</span></div>
          <div class="checklist">
            ${REMIX_STEPS.map((step) => `<button class="check-item" data-route="${step.route}" style="text-align:left;border:0;background:transparent;"><span class="check-icon">${String(step.number).padStart(2, "0")}</span><div class="check-copy"><strong>${esc(step.title)}</strong><small>${esc(step.subtitle)}</small></div></button>`).join("")}
          </div>
        </section>
        <section class="card card-pad">
          <div class="section-title"><div><h3>当前参考片</h3><p>${template ? esc(template.title) : "尚未导入模板"}</p></div></div>
          ${template ? `<div class="summary-meta"><div class="summary-meta-item"><span>原片时长</span><strong>${Number(template.duration || 0).toFixed(1)} 秒</strong></div><div class="summary-meta-item"><span>全帧提取</span><strong>${extraction?.totalFrames ? `${extraction.totalFrames} / ${extraction.expectedFrames} 帧` : "尚未执行"}</strong></div><div class="summary-meta-item"><span>复刻成片</span><strong>${Number(project?.duration || 0).toFixed(1)} 秒</strong></div></div>` : '<p class="small muted">请先在模板库上传视频或解析抖音链接。</p>'}
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;"><button class="button primary" data-route="remixStep1">进入五步复刻</button><button class="button ghost" data-route="templates">打开模板库</button></div>
        </section>
      </div>
    </div>`;
}

function remixStepPage(number) {
  const step = REMIX_STEPS[number - 1];
  const ready = remixReady(number);
  const approved = approvalIsStillCurrent(number, "remix");
  return `
    <div class="page">
      ${pageHeader(step.route)}
      <section class="step-context card">
        <div class="step-context-index">${String(number).padStart(2, "0")}</div>
        <div class="step-context-copy"><small>抖音复刻 · 第 ${number} / 5 步</small><strong>${esc(step.title)}</strong><span>${esc(step.subtitle)}</span></div>
        <span class="badge ${approved ? "green" : ready ? "gold" : "gray"}">${approved ? "已确认" : ready ? "可确认" : "等待当前步骤材料"}</span>
        <button class="button ghost small-button" data-route="remix">返回复刻总览</button>
      </section>
      ${remixWorkflowGuide(number)}
      ${remixStepContent(number)}
      <section class="step-confirm card">
        <div><strong>${ready ? "当前复刻步骤条件已满足" : "当前复刻步骤仍有缺口"}</strong><p>确认只绑定当前项目、当前镜头和当前时间轴版本。</p></div>
        <div class="step-confirm-actions">
          ${number > 1 ? `<button class="button ghost small-button" data-route="remixStep${number - 1}">上一步</button>` : ""}
          <button class="button primary" data-action="approve-workflow-step" data-approval-step="${number}" data-approval-mode="remix" ${ready ? "" : "disabled"}>${icon("arrow")}确认并进入第 ${Math.min(5, number + 1)} 步</button>
        </div>
      </section>
    </div>`;
}

function remixWorkflowGuide(number) {
  const guide = REMIX_GUIDES[number - 1];
  if (!guide) return "";
  return `
    <section class="card card-pad step-production-guide">
      <div class="section-title"><div><h2>本步复刻生产说明</h2><p>本页集中展示输入、操作、产物和人工检查，不再展开细分导航。</p></div><span class="badge red">复刻 ${number} / 5</span></div>
      <div class="step-guide-grid">
        <div class="step-guide-column"><span class="step-guide-index">输入</span><strong>这一步需要什么</strong>${guide.inputs.map((item, index) => `<p data-step-target="remix-${number}-input-${index + 1}"><span>${icon("check")}</span>${esc(item)}</p>`).join("")}</div>
        <div class="step-guide-column"><span class="step-guide-index">操作</span><strong>页面上要完成什么</strong>${guide.actions.map((item, index) => `<p data-step-target="remix-${number}-actions-${index + 1}"><b>${index + 1}</b>${esc(item)}</p>`).join("")}</div>
        <div class="step-guide-column"><span class="step-guide-index">产物</span><strong>完成后会得到什么</strong>${guide.outputs.map((item, index) => `<p data-step-target="remix-${number}-outputs-${index + 1}"><span>${icon("play")}</span>${esc(item)}</p>`).join("")}</div>
        <div class="step-guide-column"><span class="step-guide-index">审核</span><strong>确认前必须检查</strong>${guide.checks.map((item, index) => `<p data-step-target="remix-${number}-checks-${index + 1}"><span>${icon("shield")}</span>${esc(item)}</p>`).join("")}</div>
      </div>
    </section>`;
}

function remixTargetOptions(value = "") {
  return ["left", "right", "person-1", "person-2", "person-3", "person-4"]
    .map(
      (target) =>
        `<option value="${target}" ${value === target ? "selected" : ""}>${
          target === "left"
            ? "左侧人物"
            : target === "right"
              ? "右侧人物"
              : `人物 ${target.split("-")[1]}`
        }</option>`
    )
    .join("");
}

function remixReviewItems() {
  return [
    ["identity", "身份一致"],
    ["crossFace", "无串脸"],
    ["hands", "手部正确"],
    ["actionMatch", "动作匹配"],
    ["prop", "道具接触"],
    ["backgroundDrift", "背景稳定"],
    ["blackBars", "无黑边"],
    ["subtitleSafety", "字幕安全"],
    ["audioSync", "音画同步"]
  ];
}

function currentBatchImageAssets() {
  return runtime.assets.filter(
    (asset) =>
      (asset.projectId || asset.ownerId) === currentProjectId &&
      ["batch-image", "image"].includes(asset.kind) &&
      asset.url
  );
}

function batchJobForAsset(asset) {
  return runtime.jobs.find((job) => job.id === asset.jobId) || null;
}

function renderBatchImageResults(items) {
  if (!items.length) {
    return '<div class="empty-state" style="min-height:170px;"><div><div class="empty-state-symbol">选</div><h3>还没有批量候选</h3><p>确认模型和数量后提交，生成结果会进入这里。</p></div></div>';
  }
  const project = runtime.projects.find((item) => item.id === currentProjectId);
  const reviews = project?.batchImageReviews || {};
  return `<div class="asset-grid batch-candidate-grid">${items
    .map((asset) => {
      const job = batchJobForAsset(asset);
      const shotId = job?.input?.shotId || "";
      const variant = job?.input?.variant || asset.variant || "";
      const promptVersion =
        job?.input?.promptVersion?.version || asset.version || 1;
      const seed = job?.input?.seed || asset.seed || variant || "未记录";
      const review = reviews[asset.id] || "pending";
      return `<article class="asset-card card batch-candidate-card">
        <div class="asset-preview"><img src="${esc(api.mediaUrl(asset.url))}" alt="${esc(asset.title || "批量角色图")}" /></div>
        <div class="asset-info">
          <strong>${esc(asset.title || "批量角色图")}</strong>
          <small>镜头 ${esc(shotId || "未绑定")} · 变体 ${esc(variant || "—")}</small>
          <small>${esc(asset.model || "未记录模型")} · 提示词 v${esc(promptVersion)} · 种子/变体 ${esc(seed)}</small>
          <small>图一 ${esc(state.groom)} · 图二 ${esc(state.bride)}</small>
          <span class="badge ${review === "approved" ? "green" : review === "rejected" ? "red" : "gray"}">${
            review === "approved"
              ? "候选已批准"
              : review === "rejected"
                ? "已淘汰"
                : "待选版"
          }</span>
          <div class="batch-review-actions">
            <button class="button secondary small-button" data-action="review-batch-image" data-asset-id="${asset.id}" data-review-status="approved">批准候选</button>
            <button class="button ghost small-button danger-text" data-action="review-batch-image" data-asset-id="${asset.id}" data-review-status="rejected">淘汰</button>
            <button class="button primary small-button" data-action="bind-batch-image" data-asset-id="${asset.id}" ${shotId && review === "approved" ? "" : "disabled"}>绑定为首帧</button>
          </div>
        </div>
      </article>`;
    })
    .join("")}</div>`;
}

function renderBatchImageWorkbench({
  shots,
  includeTargets = false,
  emptyMessage = "建立镜头计划后会显示可批量生成的镜头。"
}) {
  const project = runtime.projects.find((item) => item.id === currentProjectId);
  const imageModel = defaultModel("image");
  const hasIdentities = Boolean(
    state.photoAssetIds?.groom && state.photoAssetIds?.bride
  );
  return `<section class="card card-pad batch-workbench">
    <div class="section-title">
      <div><h2>批量生成分镜图片</h2><p>选择镜头和候选数量，费用确认后才提交付费任务</p></div>
      <span class="badge ${hasIdentities && imageModel ? "green" : "red"}">${
        !hasIdentities
          ? "缺少男女主照片"
          : !imageModel
            ? "缺少图片模型"
            : "可以批量生成"
      }</span>
    </div>
    <div class="remix-identity-row">
      <div class="remix-identity-card">${state.photos.groom ? `<img src="${esc(api.mediaUrl(state.photos.groom))}" alt="${esc(state.groom)}" />` : "男"}<strong>图一 · ${esc(state.groom)}</strong></div>
      <div class="remix-identity-card">${state.photos.bride ? `<img src="${esc(api.mediaUrl(state.photos.bride))}" alt="${esc(state.bride)}" />` : "女"}<strong>图二 · ${esc(state.bride)}</strong></div>
      <div class="remix-identity-note"><strong>${esc(imageModel?.label || "未配置图片模型")}</strong><small>${imageModel?.status === "ready" ? "模型已配置，仍需确认报价" : "请到模型中心配置图片模型"}</small><button class="text-button" data-route="models">模型中心 →</button></div>
    </div>
    <div class="project-brief" style="margin-top:14px;">
      ${
        includeTargets
          ? `<div class="field"><label>男主角目标</label><select class="select" data-remix-groom-target>${remixTargetOptions(project?.remixTargets?.groom || "left")}</select></div><div class="field"><label>女主角目标</label><select class="select" data-remix-bride-target>${remixTargetOptions(project?.remixTargets?.bride || "right")}</select></div>`
          : ""
      }
      <div class="field"><label>批量总数</label><select class="select" data-batch-count><option value="12">12 张</option><option value="24" selected>24 张</option><option value="36">36 张</option><option value="48">48 张</option></select></div>
      <div class="field"><label>每张确认单价</label><input class="input" type="number" min="0" step="0.0001" data-batch-unit-cost placeholder="模型中心未配置时请填写" /></div>
    </div>
    <div class="remix-shot-picker">
      ${shots.length ? shots.map((shot) => `<label><input type="checkbox" data-batch-shot value="${shot.id}" checked /><span>${String(shot.order || shot.number).padStart(2, "0")} · ${esc(shot.title || "婚礼镜头")}</span></label>`).join("") : `<p class="small muted">${esc(emptyMessage)}</p>`}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
      <button class="button secondary" data-action="estimate-image-batch">预估费用</button>
      <span class="small muted">默认 24 张，可选 12 / 24 / 36 / 48 张</span>
    </div>
    ${remixBatchEstimate ? `<div class="remix-estimate"><strong>${esc(remixBatchEstimate.confirmationText)}</strong><small>${remixBatchEstimate.requiresQuote ? "未填写单价，不能提交" : "确认后可创建幂等批量任务"}</small></div>` : ""}
    <label class="check-item" style="margin-top:12px;"><input type="checkbox" data-batch-confirm /><div class="check-copy"><strong>我已确认模型、数量和费用</strong><small>任务不会自动重复提交。</small></div></label>
    <button class="button primary" style="width:100%;margin-top:12px;" data-action="submit-image-batch" ${hasIdentities && shots.length && imageModel ? "" : "disabled"}>${icon("sparkle")}${remixBatchJobId ? "提交另一批候选" : "提交批量生图"}</button>
  </section>`;
}

function remixStepContent(number) {
  const template = currentRemixTemplate();
  const project = runtime.projects.find((item) => item.id === currentProjectId);
  const extraction = template?.remixExtraction;
  const analysis = template?.remixAnalysis;
  const report =
    runtime.remixReport || buildStoredRemixReport(template, project);
  const remixShots = storyboard;
  const selected =
    remixShots.find((shot) => shot.id === remixSelectedShotId) ||
    remixShots[0] ||
    null;
  const imageModel = defaultModel("image");
  const videoModel = defaultModel("video");
  const roleImageAssets = runtime.assets.filter(
    (asset) =>
      (asset.projectId || asset.ownerId) === currentProjectId &&
      ["batch-image", "image", "look-image"].includes(asset.kind)
  );

  if (number === 1) {
    return `<div class="content-grid remix-workflow-grid">
      <section class="card card-pad">
        <div class="section-title"><div><h2>抖音链接下载</h2><p>下载前确认参考片使用和改编权限</p></div><span class="badge ${template ? "green" : "gold"}">${template ? "已导入" : "等待链接"}</span></div>
        <div class="field"><label for="remix-template-url">抖音短链接</label><input id="remix-template-url" class="input" data-template-url placeholder="https://v.douyin.com/..." /></div>
        <label class="check-item remix-rights-check"><input type="checkbox" data-remix-rights /><div class="check-copy"><strong>已取得参考片使用权</strong><small>下载内容只作为结构参考，不把原片直接交付给客户。</small></div></label>
        <button class="button primary" style="width:100%;margin-top:12px;" data-action="import-template-url">${icon("sparkle")}下载并建立模板</button>
        ${template ? `<div class="summary-meta" style="margin-top:16px;"><div class="summary-meta-item"><span>模板</span><strong>${esc(template.title)}</strong></div><div class="summary-meta-item"><span>画幅</span><strong>${esc(template.aspect || "未知")}</strong></div><div class="summary-meta-item"><span>时长</span><strong>${Number(template.duration || 0).toFixed(2)} 秒</strong></div></div>` : ""}
      </section>
      <section class="card card-pad">
        <div class="section-title"><div><h3>24 FPS 全帧与音频</h3><p>原片、帧索引和独立音频必须一起保留</p></div><span class="badge ${extraction ? "green" : "gray"}">${extraction ? "已提取" : "待提取"}</span></div>
        ${template ? `<button class="button primary" style="width:100%;" data-action="remix-extract" data-template-id="${template.id}">${icon("sparkle")}${extraction ? "重新提取" : "开始提取 24 FPS 全帧"}</button>` : '<button class="button primary" style="width:100%;" data-route="templates">先上传本地参考片</button>'}
        ${extraction ? `<div class="checklist" style="margin-top:14px;">
          <div class="check-item"><span class="check-icon">✓</span><div class="check-copy"><strong>${extraction.totalFrames} 帧</strong><small>${extraction.fps} FPS · ${esc(extraction.durationTimecode || "")}</small></div></div>
          <div class="check-item"><span class="check-icon">✓</span><div class="check-copy"><strong>原始音频</strong><small>${extraction.audioUrl ? `<a href="${esc(api.mediaUrl(extraction.audioUrl))}" target="_blank" rel="noreferrer">打开 WAV</a>` : "缺失"}</small></div></div>
          <div class="check-item"><span class="check-icon">✓</span><div class="check-copy"><strong>帧索引</strong><small>${extraction.indexUrl ? `<a href="${esc(api.mediaUrl(extraction.indexUrl))}" target="_blank" rel="noreferrer">打开 JSON</a>` : "缺失"}</small></div></div>
        </div>` : ""}
      </section>
    </div>`;
  }

  if (number === 2) {
    const firstShot = report.shots[0] || {};
    const imagePrompt = buildReferenceImagePrompt(firstShot, state);
    const videoPrompt = buildReplacementVideoPrompt(
      firstShot,
      state,
      firstShot.mapping || project?.remixTargets || {}
    );
    return `<div class="stack">
      <section class="card card-pad">
        <div class="section-title"><div><h2>参考片结构报告</h2><p>${report.shots.length} 个镜头 · ${report.totalFramesAt24} 帧 · 24 FPS</p></div><button class="button primary small-button" data-action="remix-analyze" data-template-id="${template?.id || ""}" ${extraction ? "" : "disabled"}>${icon("sparkle")}${analysis ? "重新分析" : "开始分析"}</button></div>
        ${analysis?.warnings?.length ? `<div class="notice red" style="margin-bottom:12px;">${icon("shield")}<div><strong>分析缺口</strong>${analysis.warnings.map(esc).join("<br />")}</div></div>` : ""}
        <div class="remix-report-list">${report.shots.length ? report.shots.map((shot) => `
          <article class="remix-report-card">
            <div class="remix-report-head"><strong>${esc(shot.shotId)}</strong><span>${Number(shot.time.start).toFixed(2)}–${Number(shot.time.end).toFixed(2)} 秒 · ${shot.time.framesAt24} 帧</span></div>
            <p>${esc(shot.visual.action || "等待画面动作分析")}</p>
            <div class="chip-row"><span class="chip">${esc(shot.visual.camera || "运镜待分析")}</span><span class="chip">${esc(shot.visual.background || "场景待分析")}</span><span class="chip">图一→${esc(shot.mapping.groom || "未绑定")}</span><span class="chip">图二→${esc(shot.mapping.bride || "未绑定")}</span></div>
            ${shot.subtitles?.length ? `<small>${shot.subtitles.map((cue) => esc(cue.text || "")).join(" / ")}</small>` : ""}
          </article>`).join("") : '<div class="empty-state"><div><div class="empty-state-symbol">析</div><h3>尚无镜头报告</h3><p>先完成提取和结构分析。</p></div></div>'}</div>
      </section>
      <div class="content-grid">
        <section class="card card-pad"><div class="section-title"><div><h3>音频分析提示词</h3><p>保留原始时间码</p></div><button class="button ghost small-button" data-action="copy-remix-prompt" data-prompt-selector="[data-remix-audio-prompt]">复制</button></div><textarea class="textarea" data-remix-audio-prompt readonly style="min-height:170px;">${esc(buildAudioAnalysisPrompt(report))}</textarea></section>
        <section class="card card-pad"><div class="section-title"><div><h3>图片生成提示词</h3><p>图一与图二身份锚点</p></div><button class="button ghost small-button" data-action="copy-remix-prompt" data-prompt-selector="[data-remix-image-prompt]">复制</button></div><textarea class="textarea" data-remix-image-prompt readonly style="min-height:170px;">${esc(imagePrompt)}</textarea>${characterSheetTemplateBlock("[data-remix-image-prompt]")}</section>
      </div>
      <section class="card card-pad"><div class="section-title"><div><h3>视频替换提示词</h3><p>人物、道具、动作和背景约束</p></div><button class="button ghost small-button" data-action="copy-remix-prompt" data-prompt-selector="[data-remix-video-prompt]">复制</button></div><textarea class="textarea" data-remix-video-prompt readonly style="min-height:200px;">${esc(videoPrompt)}</textarea></section>
    </div>`;
  }

  if (number === 3) {
    const hasIdentities = Boolean(
      state.photoAssetIds?.groom && state.photoAssetIds?.bride
    );
    return `<div class="stack">
      <section class="card card-pad">
        <div class="section-title"><div><h2>身份锚点与批量数量</h2><p>先把男女主照片和复刻镜头准备好，再提交付费批量任务</p></div><span class="badge ${hasIdentities ? "green" : "red"}">${hasIdentities ? "身份照片就绪" : "缺少身份照片"}</span></div>
        <div class="remix-identity-row">
          <div class="remix-identity-card">${state.photos.groom ? `<img src="${esc(api.mediaUrl(state.photos.groom))}" alt="${esc(state.groom)}" />` : "男" }<strong>图一 · ${esc(state.groom)}</strong></div>
          <div class="remix-identity-card">${state.photos.bride ? `<img src="${esc(api.mediaUrl(state.photos.bride))}" alt="${esc(state.bride)}" />` : "女" }<strong>图二 · ${esc(state.bride)}</strong></div>
          <div class="remix-identity-note"><strong>${imageModel?.label || "未配置图片模型"}</strong><small>${imageModel?.status === "ready" ? "模型已配置" : "请到模型中心配置图片模型"}</small><button class="text-button" data-route="models">模型中心 →</button></div>
        </div>
        ${!remixShots.length ? `<div class="notice red" style="margin-top:14px;">${icon("shield")}<div><strong>尚未建立复刻镜头</strong><p>使用下方默认人物目标建立镜头计划后，才能按镜分配 24 张候选图。</p></div></div>` : ""}
        <div class="project-brief" style="margin-top:14px;">
          <div class="field"><label>男主角目标</label><select class="select" data-remix-groom-target>${remixTargetOptions(project?.remixTargets?.groom || "left")}</select></div>
          <div class="field"><label>女主角目标</label><select class="select" data-remix-bride-target>${remixTargetOptions(project?.remixTargets?.bride || "right")}</select></div>
          <div class="field"><label>批量总数</label><select class="select" data-batch-count><option value="12">12 张</option><option value="24" selected>24 张</option><option value="36">36 张</option><option value="48">48 张</option></select></div>
          <div class="field"><label>每张确认单价</label><input class="input" type="number" min="0" step="0.0001" data-batch-unit-cost placeholder="模型中心未配置时请填写" /></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
          <button class="button ghost" data-action="prepare-remix-shots" data-template-id="${template?.id || ""}" ${analysis ? "" : "disabled"}>建立 8 个复刻镜头</button>
          <button class="button secondary" data-action="estimate-image-batch">预估费用</button>
        </div>
        <div class="remix-shot-picker">
          ${remixShots.length ? remixShots.map((shot) => `<label><input type="checkbox" data-batch-shot value="${shot.id}" checked /><span>${String(shot.order).padStart(2, "0")} · ${Number(shot.source?.referenceStart || 0).toFixed(1)}–${Number(shot.source?.referenceEnd || 0).toFixed(1)} 秒</span></label>`).join("") : '<p class="small muted">建立镜头计划后会显示可批量生成的镜头。</p>'}
        </div>
        ${remixBatchEstimate ? `<div class="remix-estimate"><strong>${esc(remixBatchEstimate.confirmationText)}</strong><small>${remixBatchEstimate.requiresQuote ? "未填写单价，不能提交" : "确认后可创建幂等批量任务"}</small></div>` : ""}
        <label class="check-item" style="margin-top:12px;"><input type="checkbox" data-batch-confirm /><div class="check-copy"><strong>我已确认模型、数量和费用</strong><small>任务不会自动重复提交。</small></div></label>
        <button class="button primary" style="width:100%;margin-top:12px;" data-action="submit-image-batch" ${hasIdentities && remixShots.length && imageModel ? "" : "disabled"}>${icon("sparkle")}${remixBatchJobId ? "提交另一批候选" : "提交批量生图"}</button>
      </section>
      <section class="card card-pad"><div class="section-title"><div><h3>角色图候选</h3><p>批准候选后才能绑定为镜头首帧；淘汰项保留追溯记录</p></div><span class="badge gold">${currentBatchImageAssets().length} 张</span></div>${renderBatchImageResults(currentBatchImageAssets().slice(0, 48))}</section>
    </div>`;
  }

  if (number === 4) {
    const review = selected?.review || {};
    const qcItems = remixReviewItems();
    const prop = project?.remixProps?.[0] || {};
    return `<div class="stack">
      <section class="card card-pad"><div class="section-title"><div><h2>人物、道具与镜头映射</h2><p>图一对应男主，图二对应女主；男女主不能绑定同一个人物目标</p></div><span class="badge gold">${remixShots.length} 镜</span></div>
        <div class="project-brief"><div class="field"><label>男主角替换目标</label><select class="select" data-remix-groom-target>${remixTargetOptions(project?.remixTargets?.groom || "left")}</select></div><div class="field"><label>女主角替换目标</label><select class="select" data-remix-bride-target>${remixTargetOptions(project?.remixTargets?.bride || "right")}</select></div><div class="field"><label>参考片开始秒</label><input class="input" type="number" min="0" step="0.1" data-remix-range-start value="${esc(project?.remixRange?.start ?? Math.max(0, Number(template?.duration || 40) - 40))}" /></div><div class="field"><label>参考片结束秒</label><input class="input" type="number" min="0.5" step="0.1" data-remix-range-end value="${esc(project?.remixRange?.end ?? template?.duration ?? 40)}" /></div></div>
        <button class="button primary" style="margin-top:14px;" data-action="save-remix-targets" data-template-id="${template?.id || ""}" ${analysis ? "" : "disabled"}>${icon("shield")}保存人物目标与复刻区间</button>
        <div class="divider"></div>
        <div class="section-title"><div><h3>道具替换</h3><p>可把伞、花、戒指或礼物替换为项目素材</p></div></div>
        <div class="project-brief"><div class="field"><label>原画面道具位置</label><input class="input" data-prop-target value="${esc(prop.target || "")}" placeholder="例如：左手红伞" /></div><div class="field"><label>项目图片资产</label><select class="select" data-prop-source><option value="">保持原道具</option>${roleImageAssets.map((asset) => `<option value="${asset.id}" ${prop.sourceAssetId === asset.id ? "selected" : ""}>${esc(asset.title || asset.id)}</option>`).join("")}</select></div><div class="field"><label>替换说明</label><input class="input" data-prop-description value="${esc(prop.description || "")}" placeholder="例如：替换为红玫瑰捧花" /></div></div>
        <button class="button secondary" style="margin-top:10px;" data-action="save-remix-props">保存道具映射</button>
      </section>
      <section class="card card-pad"><div class="section-title"><div><h2>逐镜替换</h2><p>生成视频或导入外部完成的人物替换片段</p></div></div>
        ${selected ? `<div class="project-brief"><div class="field"><label>当前镜头</label><select class="select" data-shot-select>${remixShots.map((shot) => `<option value="${shot.id}" ${shot.id === selected.id ? "selected" : ""}>${String(shot.order).padStart(2, "0")} · ${Number(shot.source?.referenceStart || 0).toFixed(1)}–${Number(shot.source?.referenceEnd || 0).toFixed(1)} 秒 · ${shot.status}</option>`).join("")}</select></div><div class="field"><label>本镜男主目标</label><select class="select" data-shot-groom-target>${remixTargetOptions(selected.characters?.groom?.target || "left")}</select></div><div class="field"><label>本镜女主目标</label><select class="select" data-shot-bride-target>${remixTargetOptions(selected.characters?.bride?.target || "right")}</select></div><div class="field"><label>背景策略</label><select class="select" data-background-policy><option value="keep">保持原模板背景</option><option value="change">替换为${esc(state.city)}婚礼场景</option></select></div></div><textarea class="textarea" data-video-prompt style="min-height:190px;margin-top:12px;">${esc(buildReplacementPrompt(selected))}</textarea><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;"><button class="button ghost small-button" data-action="build-replacement-prompt">重新生成提示词</button><button class="button primary" data-action="generate-template-shot" ${template && videoModel?.status === "ready" ? "" : "disabled"}>提交当前镜头替换</button><label class="button secondary small-button">导入替换视频<input class="visually-hidden" type="file" accept="video/mp4,video/quicktime,video/webm" data-replacement-video-input data-shot-id="${selected.id}" /></label></div>` : '<p class="small muted">请先保存人物目标与复刻区间，系统会建立最多 8 个连续镜头。</p>'}
      </section>
      ${selected ? `<section class="card card-pad"><div class="section-title"><div><h2>镜头 ${String(selected.order).padStart(2, "0")} 九项人工质检</h2><p>技术成功不等于人工审核通过</p></div><span class="badge ${shotReviewComplete(review) ? "green" : "gray"}">${shotReviewComplete(review) ? "已通过" : "待复核"}</span></div><div class="checklist">${qcItems.map(([key, label]) => `<label class="check-item"><input type="checkbox" data-qc-check="${key}" ${review[key] === "passed" ? "checked" : ""} /><div class="check-copy"><strong>${label}</strong><small>${review[key] === "passed" ? "已通过" : "请实际观看后确认"}</small></div></label>`).join("")}</div><button class="button primary" style="width:100%;margin-top:14px;" data-action="save-shot-qc" data-mode="remix" data-shot-id="${selected.id}">保存九项审核</button></section>` : ""}
    </div>`;
  }

  const exports = runtime.assets.filter(
    (asset) => asset.kind === "export" && asset.projectId === currentProjectId
  );
  const approvedShots = remixShots.filter((shot) => shot.status === "approved").length;
  return `<div class="content-grid">
    <section class="card card-pad"><div class="section-title"><div><h2>原轨道对齐与封装</h2><p>${state.duration} 秒 · ${Math.round(state.duration * 24)} 帧 · ${approvedShots}/${remixShots.length} 镜已批准</p></div><span class="badge ${approvedShots === remixShots.length && remixShots.length ? "green" : "gray"}">${approvedShots === remixShots.length && remixShots.length ? "可成片" : "等待逐镜审核"}</span></div><div class="notice red">${icon("shield")}<div><strong>原音频与原字幕是时间基准</strong>替换镜头必须回到各自区间，不能移动整片音乐和字幕。</div></div><div class="remix-track-summary"><div><strong>原音频</strong><small>${project?.timelineSelection?.musicAssetId ? "已绑定" : "待绑定"}</small></div><div><strong>字幕轨</strong><small>${project?.timelineSelection?.subtitleAssetId ? "已绑定" : "可重新生成"}</small></div><div><strong>时间轴</strong><small>${state.duration} 秒 / ${Math.round(state.duration * 24)} 帧</small></div></div><textarea class="textarea" data-speech-text style="min-height:100px;margin-top:14px;">${esc((analysis?.audio?.transcript || []).map((item) => item.text || item).join("。"))}</textarea><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;"><button class="button secondary" data-action="generate-subtitles">生成当前字幕</button><button class="button primary" data-action="render-project">${icon("play")}生成当前时间轴成片</button></div></section>
    <section class="card card-pad"><div class="section-title"><div><h3>预览与交付</h3><p>正式交付前必须完整观看</p></div></div>${renderVideoAssets(exports.slice(0, 4))}<button class="button ghost" style="width:100%;margin-top:12px;" data-route="export">打开交付中心</button></section>
  </div>`;
}

function workflowReady(stepNumber) {
  const assets = runtime.assets || [];
  const project = runtime.projects.find((item) => item.id === currentProjectId);
  const count = (kind) => assets.filter((asset) => asset.kind === kind).length;
  const imageApproved = (shot) =>
    shot.imageStatus === "approved" &&
    Boolean(shot.assets?.firstFrame?.assetId) &&
    ["identity", "sameCouple", "hands", "costume", "composition"].every(
      (key) => shot.imageReview?.[key] === "passed"
    );
  if (stepNumber === 1) {
    return Boolean(
      state.groom &&
        state.bride &&
        state.story.trim().length >= 20 &&
        ["origin", "knowing", "confirm", "companionship", "promise"].every(
          (key) => String(state.storyBeats?.[key] || "").trim().length > 0
        )
    );
  }
  if (stepNumber === 2) return treatment.acts?.length === 5;
  if (stepNumber === 3) return Boolean(state.workflow?.approvals?.[2]);
  if (stepNumber === 4 || stepNumber === 5) return count("voice") > 0;
  if (stepNumber === 6) return storyboard.length > 0;
  if (stepNumber === 7) {
    return keyImageShots().length > 0 && keyImageShots().every(imageApproved);
  }
  if (stepNumber === 8) {
    return storyboard.length > 0 && storyboard.every(imageApproved);
  }
  if (stepNumber === 9) {
    return (
      storyboard.length > 0 &&
      storyboard.every(
        (shot) =>
          shot.status === "approved" &&
          shotReviewComplete(shot.review) &&
          Boolean(shot.assets?.firstFrame?.assetId) &&
          Boolean(shot.assets?.video?.assetId)
      )
    );
  }
  if (stepNumber === 10) {
    return count("music") > 0 && Boolean(String(state.musicLicense || "").trim());
  }
  if (stepNumber === 11) {
    return runtime.assets.some(
      (asset) => asset.id === project?.mixSampleAssetId && asset.kind === "mix-sample"
    );
  }
  if (stepNumber === 12) {
    return runtime.assets.some(
      (asset) => asset.id === project?.mixAssetId && asset.kind === "mix"
    );
  }
  if (stepNumber === 13) {
    const approval = state.workflow?.approvals?.[12];
    if (!approvalIsStillCurrent(12, "story") || !approval?.approvedAt) return false;
    return runtime.assets.some(
      (asset) =>
        asset.id === project?.previewAssetId &&
        asset.kind === "preview" &&
        String(asset.createdAt || "") >= String(approval.approvedAt)
    );
  }
  if (stepNumber === 14) {
    return runtime.assets.some(
      (asset) =>
        asset.id === project?.deliveryPackageAssetId &&
        asset.kind === "delivery-package"
    );
  }
  return false;
}

function wizardPage() {
  const workflow = state.workflow || { currentStep: 1, approvals: {} };
  const currentStep = Math.min(14, Math.max(1, Number(workflow.currentStep || 1)));
  const current = WIZARD_STEPS[currentStep - 1];
  const ready = workflowReady(currentStep);
  const completed = Object.keys(workflow.approvals || {}).filter((key) =>
    approvalIsStillCurrent(Number(key), "story")
  ).length;
  const allDone = completed >= 14;
  return `
    <div class="page">
      ${pageHeader("wizard", "以真实故事为入口，先补齐素材中心，再按顺序确认旁白、静帧、视频、音乐、混音和交付。不会跳过人工确认。")}
      <section class="project-summary card" style="margin-bottom:20px;">
        <p class="eyebrow">GUIDED WEDDING FILM</p>
        <h3>${allDone ? "14 步制作流程已完成" : `第 ${currentStep} / 14 步 · ${esc(current.title)}`}</h3>
        <div class="couple">${esc(coupleName())} · 已确认 ${completed} 步</div>
        <div class="summary-meta">
          <div class="summary-meta-item"><span>当前任务</span><strong>${allDone ? "成片与工程已交付" : esc(current.subtitle)}</strong></div>
          <div class="summary-meta-item"><span>当前放行状态</span><strong>${allDone ? "全部确认完成" : ready ? "素材已就绪，可人工确认" : "等待补齐本步素材"}</strong></div>
          <div class="summary-meta-item"><span>项目模板</span><strong>${esc(runtime.templates.find((item) => item.id === runtime.projects.find((project) => project.id === currentProjectId)?.templateId)?.title || "尚未应用")}</strong></div>
          <div class="summary-meta-item"><span>项目资产</span><strong>${runtime.assets.length} 份</strong></div>
        </div>
      </section>
      <div class="wizard-layout">
        <section class="card card-pad">
          <div class="section-title"><div><h2>制作流程</h2><p>已完成和可确认步骤会显示状态</p></div><button class="text-button" data-action="reset-workflow">从头开始</button></div>
          <div class="wizard-steps">
            ${WIZARD_STEPS.map((step) => {
              const done = approvalIsStillCurrent(step.number, "story");
              const isCurrent = step.number === currentStep;
              const can = workflowReady(step.number);
              return `
                <button class="wizard-step ${done ? "done" : ""} ${isCurrent ? "current" : ""}" data-route="${step.route}">
                  <span class="wizard-step-no">${done ? "✓" : String(step.number).padStart(2, "0")}</span>
                  <span class="wizard-step-copy"><strong>${esc(step.title)}</strong><small>${esc(step.subtitle)}</small></span>
                  <span class="badge ${done ? "green" : isCurrent ? "red" : can ? "gold" : "gray"}">${done ? "已确认" : isCurrent ? "进行中" : can ? "可确认" : "待素材"}</span>
                </button>`;
            }).join("")}
          </div>
        </section>
        <div class="stack">
          <section class="card card-pad">
            <div class="section-title"><div><h2>当前步骤需要你做什么</h2><p>第 ${currentStep} 步 · ${esc(current.title)}</p></div></div>
            <div class="notice red">${icon("sparkle")}<div><strong>${esc(current.subtitle)}</strong>${ready ? "材料已满足本步最低条件。请先人工查看或试听，再确认进入下一步。" : "当前材料仍不完整。完成对应操作后按钮会自动变为可确认。"}</div></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;">
              <button class="button secondary" data-route="${current.route}">进入本步工作区</button>
              ${allDone ? '<button class="button primary" data-route="export">查看正式交付</button>' : `<button class="button primary" data-action="approve-workflow-step" data-approval-step="${currentStep}" data-approval-mode="${state.mode || "story"}" ${ready ? "" : "disabled"}>${icon("arrow")}确认本步并继续</button>`}
            </div>
          </section>
          <section class="card card-pad">
            <div class="section-title"><div><h2>素材中心检查</h2><p>没有素材就不生成画面</p></div><button class="text-button" data-route="assets">打开素材中心 →</button></div>
            <div class="checklist">
              ${[
                ["新人照片", state.photoSources?.groom && state.photoSources?.bride],
                ["故事与五幕", treatment.acts?.length === 5],
                ["模板或参考片", runtime.templates.length > 0],
                ["人物造型", runtime.looks.some((look) => look.imagePath)],
                ["旁白", runtime.assets.some((asset) => asset.kind === "voice")],
                ["音乐", runtime.assets.some((asset) => asset.kind === "music")],
                ["视频或其他镜头", runtime.assets.some((asset) => asset.kind === "video" || asset.kind === "project-photo")],
                ["字幕", runtime.assets.some((asset) => asset.kind === "subtitle")]
              ].map(([label, done]) => `<div class="check-item"><span class="check-icon ${done ? "" : "pending"}">${done ? "✓" : "!"}</span><div class="check-copy"><strong>${label}</strong><small>${done ? "已就绪" : "尚缺，请在素材中心补齐"}</small></div></div>`).join("")}
            </div>
          </section>
        </div>
      </div>
    </div>
  `;
}

function workflowStepGuide(number) {
  const spec = getWorkflowStep(number);
  if (!spec) return "";
  return `
    <section class="card card-pad step-production-guide">
      <div class="section-title"><div><h2>本步生产说明</h2><p>${esc(spec.goal)}</p></div><span class="badge red">第 ${number} / 14 步</span></div>
      <div class="step-guide-grid">
        <div class="step-guide-column"><span class="step-guide-index">输入</span><strong>这一步需要什么</strong>${spec.requiredInputs.map((item, index) => `<p data-step-target="step-${number}-input-${index + 1}"><span>${icon("check")}</span>${esc(item)}</p>`).join("")}</div>
        <div class="step-guide-column"><span class="step-guide-index">操作</span><strong>页面上要完成什么</strong>${spec.actions.map((item, index) => `<p data-step-target="step-${number}-actions-${index + 1}"><b>${index + 1}</b>${esc(item)}</p>`).join("")}</div>
        <div class="step-guide-column"><span class="step-guide-index">产物</span><strong>完成后会得到什么</strong>${spec.outputs.map((item, index) => `<p data-step-target="step-${number}-outputs-${index + 1}"><span>${icon("play")}</span>${esc(item)}</p>`).join("")}</div>
        <div class="step-guide-column"><span class="step-guide-index">审核</span><strong>确认前必须检查</strong>${spec.checks.map((item, index) => `<p data-step-target="step-${number}-checks-${index + 1}"><span>${icon("shield")}</span>${esc(item)}</p>`).join("")}</div>
      </div>
    </section>`;
}

function workflowVisualReferences(number) {
  const groups = {
    1: [
      [WEDDING_REFERENCE_IMAGES.groomModern, "男主造型参考", "仅参考构图与礼服，真人身份以客户照片为准"],
      [WEDDING_REFERENCE_IMAGES.ancientBride, "女主造型参考", "仅参考婚服和妆造，真人身份以客户照片为准"]
    ],
    6: [
      [WEDDING_REFERENCE_IMAGES.ancientCouple, "古代镜头参考", "庭院双人、牵手与家族站位"],
      [WEDDING_REFERENCE_IMAGES.republicCouple, "民国镜头参考", "民国学生装与雨巷构图"],
      [WEDDING_REFERENCE_IMAGES.republicStreet, "民国雨夜场景", "长街、路灯与雨夜氛围"],
      [WEDDING_REFERENCE_IMAGES.modernCouple, "今生镜头参考", "现代礼服与婚礼现场构图"]
    ],
    7: [
      [WEDDING_REFERENCE_IMAGES.ancientBride, "古代女主", "凤冠与红金婚服提示"],
      [WEDDING_REFERENCE_IMAGES.groomModern, "男主定妆", "人物正面与礼服参考"],
      [WEDDING_REFERENCE_IMAGES.republicCouple, "民国造型", "时代服装与颜色参考"]
    ],
    8: [
      [WEDDING_REFERENCE_IMAGES.ancientLantern, "古代夜戏", "灯笼、侧光和场景连续参考"],
      [WEDDING_REFERENCE_IMAGES.republicCouple, "民国白天", "街巷和服装参考"],
      [WEDDING_REFERENCE_IMAGES.republicStreet, "民国雨夜", "环境、灯光和道具参考"],
      [WEDDING_REFERENCE_IMAGES.modernCouple, "今生婚礼", "现代现场与礼服参考"]
    ],
    9: [
      [WEDDING_REFERENCE_IMAGES.ancientCouple, "动作起点参考", "双人站位、距离与牵手方向"],
      [WEDDING_REFERENCE_IMAGES.ancientRoof, "建筑连续性", "屋顶、透视和时代材质"]
    ],
    10: [
      [WEDDING_REFERENCE_IMAGES.ancientHall, "东方弦乐氛围", "红柱、烛光与低频氛围"],
      [WEDDING_REFERENCE_IMAGES.modernCouple, "现代抒情氛围", "真实婚礼与温暖钢琴"]
    ],
    13: [
      [WEDDING_REFERENCE_IMAGES.modernCouple, "字幕安全区参考", "字幕必须避开人物脸部和手部"],
      [WEDDING_REFERENCE_IMAGES.ancientHall, "片尾落版参考", "姓名和婚期保持可读留白"]
    ],
    14: [
      [WEDDING_REFERENCE_IMAGES.modernCouple, "成片封面参考", "用于交付缩略图和试听页"],
      [WEDDING_REFERENCE_IMAGES.ancientCouple, "婚礼电影海报参考", "用于交付清单与归档"]
    ]
  };
  const items = groups[number] || [];
  if (!items.length) return "";
  return `<section class="card card-pad workflow-visual-reference"><div class="section-title"><div><h3>本步图片参考</h3><p>现有真实参考图、客户上传和模型生成结果会在素材中心区分来源</p></div><span class="badge gold">${items.length} 张参考</span></div><div class="workflow-visual-grid">${items.map(([src, title, hint]) => `<figure><img src="${esc(src)}" alt="${esc(title)}" /><figcaption><strong>${esc(title)}</strong><small>${esc(hint)}</small></figcaption></figure>`).join("")}</div></section>`;
}

function workflowStepPage(number) {
  const step = WIZARD_STEPS[number - 1];
  const ready = workflowReady(number);
  const completed = approvalIsStillCurrent(number, activeRouteInfo.mode || "story");
  return `
    <div class="page">
      ${pageHeader(step.route)}
      <section class="step-context card">
        <div class="step-context-index">${String(number).padStart(2, "0")}</div>
        <div class="step-context-copy">
          <small>第 ${number} / 14 步</small>
          <strong>${esc(step.title)}</strong>
          <span>${esc(step.subtitle)}</span>
        </div>
        <span class="badge ${completed ? "green" : ready ? "gold" : "gray"}">${completed ? "已确认" : ready ? "素材可确认" : "等待素材"}</span>
        <button class="button ghost small-button" data-route="wizard">返回流程总览</button>
      </section>
      ${workflowStepGuide(number)}
      ${workflowVisualReferences(number)}
      ${workflowStepContent(number)}
      <section class="step-confirm card">
        <div><strong>${ready ? "本步骤最低素材条件已满足" : "本步骤仍有材料缺口"}</strong><p>${ready ? "请先实际检查画面或试听，再确认进入下一步。确认记录会随项目保存。" : "返回本页上方或素材中心补齐必要材料后，确认按钮才会开放。"}</p></div>
        <div class="step-confirm-actions">
          ${number > 1 ? `<button class="button ghost small-button" data-route="step${number - 1}">上一步</button>` : ""}
          <button class="button primary" data-action="approve-workflow-step" data-approval-step="${number}" data-approval-mode="${activeRouteInfo.mode || state.mode || "story"}" ${ready ? "" : "disabled"}>${icon("arrow")}确认并进入第 ${Math.min(14, number + 1)} 步</button>
        </div>
      </section>
    </div>
  `;
}

function shotQcCard(shot, mode = "story") {
  if (!shot) return "";
  const review = shot.review || {};
  const items = [
    ["identity", "身份一致"],
    ["crossFace", "无串脸"],
    ["hands", "手部正确"],
    ["actionMatch", "动作匹配"],
    ["prop", "道具接触"],
    ["backgroundDrift", "背景稳定"],
    ["blackBars", "无黑边"],
    ["subtitleSafety", "字幕安全"],
    ["audioSync", "音画同步"]
  ];
  return `<section class="card card-pad"><div class="section-title"><div><h2>镜头 ${String(shot.order || shot.number || 1).padStart(2, "0")} 人工质检</h2><p>技术生成成功不等于人工审核通过</p></div><span class="badge ${shotReviewComplete(review) ? "green" : "gray"}">${shotReviewComplete(review) ? "已通过" : "待复核"}</span></div><div class="checklist">${items.map(([key, label]) => `<label class="check-item"><input type="checkbox" data-qc-check="${key}" ${review[key] === "passed" ? "checked" : ""} /><div class="check-copy"><strong>${label}</strong><small>${review[key] === "passed" ? "已通过" : "请实际观看后确认"}</small></div></label>`).join("")}</div><button class="button primary" style="width:100%;margin-top:14px;" data-action="save-shot-qc" data-mode="${mode}" data-shot-id="${shot.id}">保存本镜人工审核</button></section>`;
}

function keyImageShots() {
  if (!storyboard.length) return [];
  const indexes = [
    0,
    Math.floor((storyboard.length - 1) / 2),
    storyboard.length - 1
  ];
  return [...new Set(indexes)].map((index) => storyboard[index]).filter(Boolean);
}

function shotImageWorkbench(stepNumber, candidateShots, selected) {
  const shot = selected || candidateShots[0] || storyboard[0] || null;
  if (!shot) {
    return '<div class="empty-state"><div><div class="empty-state-symbol">图</div><h3>还没有分镜</h3><p>先完成第 6 步。</p></div></div>';
  }
  const referenceAssets = [
    ["男主角参考", state.photoAssetIds?.groom],
    ["女主角参考", state.photoAssetIds?.bride],
    [
      "本镜服装参考",
      runtime.assets.find(
        (asset) =>
          ["look-image", "outfit-reference"].includes(asset.kind) &&
          [state.selectedLooks?.groom, state.selectedLooks?.bride].includes(asset.lookId)
      )?.id
    ],
    [
      "本镜场景参考",
      runtime.assets.find((asset) => asset.kind === "scene-reference")?.id
    ]
  ];
  const imageAssets = runtime.assets.filter((asset) =>
    ["batch-image", "image", "look-image", "project-photo", "outfit-reference", "scene-reference"].includes(asset.kind)
  );
  const imageReview = shot.imageReview || {};
  const prompt =
    shot.imagePrompt || buildImagePrompt(shot, state);
  const imageChecks = [
    ["identity", "像本人"],
    ["sameCouple", "同一对人物"],
    ["hands", "手部正确"],
    ["costume", "服装时代正确"],
    ["composition", "构图可继续生成视频"]
  ];
  const conceptImage = String(shot.act || "").includes("古代")
    ? WEDDING_REFERENCE_IMAGES.ancientCouple
    : String(shot.act || "").includes("民国")
      ? WEDDING_REFERENCE_IMAGES.republicCouple
      : WEDDING_REFERENCE_IMAGES.modernCouple;
  return `
    <section class="card card-pad shot-image-workbench">
      <div class="section-title"><div><h2>第 ${stepNumber} 步 · 逐镜首帧生产</h2><p>图片提示词负责稳定瞬间，批准后的图片会成为第 9 步视频首帧</p></div><span class="badge ${shot.imageStatus === "approved" ? "green" : "gold"}">${shot.imageStatus === "approved" ? "首帧已批准" : "待生成和审核"}</span></div>
      <div class="project-brief">
        <div class="field"><label>当前镜头</label><select class="select" data-shot-select>${candidateShots.map((item) => `<option value="${item.id}" ${item.id === shot.id ? "selected" : ""}>${String(item.order || item.number).padStart(2, "0")} · ${esc(item.title)} · ${item.imageStatus === "approved" ? "图片已通过" : "待图片"}</option>`).join("")}</select></div>
        <div class="field"><label>当前首帧版本</label><input class="input" readonly value="${esc(shot.assets?.firstFrame?.assetId || "尚未绑定")}" /></div>
      </div>
      <figure class="shot-concept-reference"><img src="${esc(conceptImage)}" alt="${esc(shot.title)} 风格参考" /><figcaption><strong>本镜风格参考</strong><small>参考片抽帧，仅用于构图、服装和光线；真实人物身份必须取客户照片。</small></figcaption></figure>
      <div class="shot-reference-grid">${referenceAssets.map(([label, assetId]) => `<div class="shot-reference-item ${assetId ? "ready" : "missing"}"><span>${assetId ? "✓" : "!"}</span><div><strong>${esc(label)}</strong><small>${esc(assetId || "尚缺，先到素材中心补齐")}</small></div></div>`).join("")}</div>
      <label class="field" style="margin-top:14px;"><span class="field-label">图片提示词</span><textarea class="textarea prompt-composer" data-image-prompt>${esc(prompt)}</textarea><small class="field-hint">提示词描述一个稳定画面，不写镜头运动。绑定真实男女主照片是身份一致的前提。</small></label>
      ${characterSheetTemplateBlock("[data-image-prompt]")}
      <div class="model-config-actions">
        <button class="button ghost small-button" data-action="build-shot-image-prompt" data-shot-id="${shot.id}">重新生成图片提示词</button>
        <button class="button ghost small-button" data-action="copy-image-prompt">复制图片提示词</button>
        <button class="button primary small-button" data-action="generate-shot-image" data-shot-id="${shot.id}">${icon("sparkle")}生成当前镜头图片</button>
      </div>
      <div class="divider"></div>
      <div class="field"><label>从已有图片中绑定首帧</label><select class="select" data-image-bind-asset><option value="">选择已生成或上传的图片</option>${imageAssets.map((asset) => `<option value="${asset.id}" ${shot.assets?.firstFrame?.assetId === asset.id ? "selected" : ""}>${esc(asset.title || asset.kind)} · ${asset.id}</option>`).join("")}</select></div>
      <button class="button secondary small-button" style="margin-top:10px;" data-action="bind-shot-image" data-shot-id="${shot.id}">绑定所选图片</button>
      <div class="divider"></div>
      <div class="section-title"><div><h3>首帧人工审核</h3><p>生成成功不等于可用，审核通过后才能进入视频生成</p></div><span class="badge ${shot.imageStatus === "approved" ? "green" : "gray"}">${shot.imageStatus === "approved" ? "已批准" : "待审核"}</span></div>
      <div class="checklist">${imageChecks.map(([key, label]) => `<label class="check-item"><input type="checkbox" data-image-check="${key}" ${imageReview[key] === "passed" ? "checked" : ""} /><div class="check-copy"><strong>${esc(label)}</strong><small>${imageReview[key] === "passed" ? "已通过" : "请查看实际图片后确认"}</small></div></label>`).join("")}</div>
      <button class="button primary" style="width:100%;margin-top:14px;" data-action="approve-shot-image" data-shot-id="${shot.id}" ${shot.assets?.firstFrame?.assetId ? "" : "disabled"}>保存并批准当前首帧</button>
    </section>`;
}

function workflowStepContent(number) {
  const voiceAssets = runtime.assets.filter((asset) => asset.kind === "voice" && asset.url);
  const musicAssets = runtime.assets.filter((asset) => asset.kind === "music" && asset.url);
  const imageAssets = runtime.assets.filter((asset) =>
    ["batch-image", "image", "look-image", "project-photo", "outfit-reference", "scene-reference"].includes(asset.kind)
  );
  const videoAssets = runtime.assets.filter((asset) => asset.kind === "video" && asset.url);
  const exports = runtime.assets.filter((asset) => asset.kind === "export" && asset.url);
  const mixSampleAssets = runtime.assets.filter(
    (asset) => asset.kind === "mix-sample" && asset.url
  );
  const fullMixAssets = runtime.assets.filter(
    (asset) => asset.kind === "mix" && asset.url
  );
  const previewAssets = runtime.assets.filter(
    (asset) => asset.kind === "preview" && asset.url
  );
  const deliveryAssets = runtime.assets.filter(
    (asset) => asset.kind === "delivery-package"
  );
  const subtitleAssets = runtime.assets.filter(
    (asset) => asset.kind === "subtitle" && asset.url
  );
  const project = runtime.projects.find((item) => item.id === currentProjectId);
  const selectedVoiceAsset = runtime.assets.find(
    (asset) => asset.id === project?.timelineSelection?.voiceAssetId
  );
  const selectedMusicAsset = runtime.assets.find(
    (asset) => asset.id === project?.timelineSelection?.musicAssetId
  );
  const template = runtime.templates.find((item) => item.id === project?.templateId);
  const selectedShot =
    storyboard.find((shot) => shot.id === remixSelectedShotId) ||
    storyboard[0] ||
    null;
  const keyShots = keyImageShots();
  const remainingImageShots = storyboard.filter(
    (shot) => shot.imageStatus !== "approved"
  );
  const imageCandidateShots =
    number === 7
      ? keyShots
      : remainingImageShots.length
        ? remainingImageShots
        : storyboard;
  const selectedImageShot =
    imageCandidateShots.find((shot) => shot.id === remixSelectedShotId) ||
    imageCandidateShots[0] ||
    selectedShot;

  const raw = {
    1: `
      <div class="content-grid">
        <section class="card card-pad">
          <div class="section-title"><div><h2>新人资料与五幕故事</h2><p>先收集真实事实，再进入任何图像生成</p></div><button class="button secondary small-button" data-action="copy-story-card">${icon("copy")}复制采集卡</button></div>
          <div class="project-brief">
            <div class="field"><label>男主角姓名</label><input class="input" data-field="groom" value="${esc(state.groom)}" /></div>
            <div class="field"><label>女主角姓名</label><input class="input" data-field="bride" value="${esc(state.bride)}" /></div>
            <div class="field"><label>婚礼日期</label><input class="input" type="date" data-field="date" value="${esc(state.date)}" /></div>
            <div class="field"><label>城市</label><input class="input" data-field="city" value="${esc(state.city)}" /></div>
          </div>
          <div class="story-beat-grid" style="margin-top:14px;">
            ${[
              ["origin", "01 相识", "第一次见面的地点、季节、谁先注意到谁？"],
              ["knowing", "02 相知", "哪件小事让你开始心动？"],
              ["confirm", "03 确认", "在哪、谁开的口、说了什么？"],
              ["companionship", "04 相伴", "日常里最像你们的一个画面？"],
              ["promise", "05 承诺", "婚礼场地、结尾动作、最想说的一句话？"]
            ].map(([key, title, hint]) => `<label class="field"><span class="field-label">${title}</span><textarea class="textarea" data-story-beat="${key}" placeholder="${hint}">${esc(state.storyBeats?.[key] || "")}</textarea></label>`).join("")}
          </div>
        </section>
        <div class="stack">
          ${workflowMaterialSummary()}
          <section class="card card-pad">
            <div class="section-title"><div><h3>新人素材</h3><p>人物照片决定后续换脸相似度</p></div></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="button secondary" data-route="characters">上传男女主照片</button><a class="button ghost" href="./public/story-intake.html" target="_blank" rel="noreferrer">打开故事采集卡</a></div>
          </section>
        </div>
      </div>`,
    2: `
      <div class="content-grid">
        <section class="card card-pad">
          <div class="section-title"><div><h2>生成文案写作包</h2><p>按五幕事实生成旁白，再由制作方通读</p></div><span class="badge gold">文字模型</span></div>
          <textarea class="textarea" data-field="story" style="min-height:150px;">${esc(state.story)}</textarea>
          <button class="button primary" style="width:100%;margin-top:12px;" data-action="generate-story-ai">${icon("sparkle")}生成五幕文案与分镜初稿</button>
          <button class="button secondary" style="width:100%;margin-top:8px;" data-action="build-treatment">使用本地结构快速重排</button>
        </section>
        <section class="card card-pad">
          <div class="section-title"><div><h2>五幕初稿</h2><p>只看已填写事实</p></div></div>
          <div class="treatment-list">${treatment.acts.map((act, index) => `<article class="act-card"><div class="act-index">${index + 1}</div><div><small>${esc(act.label)}</small><h4>${esc(act.title)}</h4><p>${esc(act.summary)}</p></div></article>`).join("")}</div>
        </section>
      </div>`,
    3: `
      <div class="content-grid">
        <section class="card card-pad">
          <div class="section-title"><div><h2>待新人确认版本</h2><p>确认前不进入正式分镜</p></div><span class="badge red">人工确认</span></div>
          <p class="small" style="line-height:1.85;">${esc(treatment.logline)}</p>
          ${treatment.acts.map((act, index) => `<div class="prompt-block"><label>第 ${index + 1} 幕 · ${esc(act.title)}</label><p>${esc(act.summary)}</p></div>`).join("")}
        </section>
        <section class="card card-pad">
          <div class="section-title"><div><h3>确认清单</h3><p>只有新人明确确认后才能继续</p></div></div>
          <div class="checklist"><div class="check-item"><span class="check-icon pending">1</span><div class="check-copy"><strong>姓名和日期</strong><small>${esc(coupleName())} · ${formatDate(state.date)}</small></div></div><div class="check-item"><span class="check-icon pending">2</span><div class="check-copy"><strong>事实与改编边界</strong><small>没有把想象写成真实经历</small></div></div><div class="check-item"><span class="check-icon pending">3</span><div class="check-copy"><strong>新人确认</strong><small>由制作方转达明确确认结果</small></div></div></div>
          <button class="button primary" style="width:100%;margin-top:14px;" data-action="copy-script-confirmation">${icon("copy")}复制给新人确认</button>
        </section>
      </div>`,
    4: `
      <section class="card card-pad">
        <div class="section-title"><div><h2>音色试听</h2><p>同一句文案生成多个候选，不能只看模型名</p></div><span class="badge gold">${familyModels("voice").length} 个音色</span></div>
        <textarea class="textarea" data-speech-text style="min-height:110px;">从第一次相遇，到决定一起走完余生。谢谢你，成为我故事里最重要的人。</textarea>
        <div class="feature-grid" style="margin-top:14px;">
          ${familyModels("voice").map((voice) => `<article class="feature-card"><div class="feature-icon">声</div><h4>${esc(voice.label)}</h4><p>${esc(voice.model)} · ${esc(voice.status)}</p><button class="button secondary small-button" style="margin-top:12px;" data-action="audition-voice" data-model-id="${voice.id}">生成试听</button></article>`).join("")}
        </div>
        <div class="divider"></div>
        <div class="section-title"><div><h3>试听记录</h3><p>最近生成的旁白</p></div></div>
        ${renderAudioAssets(voiceAssets)}
      </section>`,
    5: `
      <div class="content-grid">
        <section class="card card-pad"><div class="section-title"><div><h2>完整旁白</h2><p>完整试听通过后才进入分镜</p></div></div><textarea class="textarea" data-speech-text style="min-height:190px;">从第一次相遇，到一起走过漫长岁月。今天，我们终于站到彼此身边。愿余生朝朝暮暮，岁岁平安。</textarea><button class="button primary" style="width:100%;margin-top:12px;" data-action="generate-speech">${icon("play")}生成完整旁白</button><audio data-audio-preview controls hidden style="width:100%;margin-top:12px;"></audio></section>
        <section class="card card-pad"><div class="section-title"><div><h3>已生成旁白</h3><p>${voiceAssets.length} 条</p></div></div>${renderAudioAssets(voiceAssets)}</section>
      </div>`,
    6: `
      <section class="card card-pad">
        <div class="section-title"><div><h2>按旁白节奏拆镜</h2><p>${storyboard.length} 镜 · ${state.duration} 秒 · ${state.duration * 24} 帧</p></div><button class="button secondary small-button" data-action="build-storyboard">重新推导</button><button class="button primary small-button" data-route="storyboard">打开完整分镜表</button></div>
        <div class="generation-list">${storyboard.slice(0, 10).map((shot) => `<div class="generation-row"><div class="shot-number">${String(shot.number).padStart(2, "0")}</div><div class="generation-copy"><strong>${esc(shot.title)}</strong><small>${esc(shot.scene)} · ${esc(shot.shot)} · ${esc(shot.move)}</small></div><span class="generation-meta">${shot.duration}s</span><span class="generation-meta">${Math.round(shot.duration * 24)} 帧</span><span class="badge ${shot.status === "已确认" ? "green" : "gray"}">${shot.status}</span></div>`).join("")}</div>
      </section>`,
    7: `
      <div class="content-grid">
        <section class="card card-pad"><div class="section-title"><div><h2>先做三个重点静帧</h2><p>优先解决男女主正脸、时代造型和牵手动作</p></div><button class="button secondary small-button" data-route="looks">完整造型库</button></div><div class="feature-grid">${["古代婚服","民国造型","今生婚服"].map((title,index)=>`<article class="feature-card"><div class="feature-icon">${index+1}</div><h4>${title}</h4><p>先用真实照片生成身份卡，再选服装。</p><button class="button secondary small-button" data-route="looks" style="margin-top:12px;">选择造型</button></article>`).join("")}</div></section>
        <section class="card card-pad"><div class="section-title"><div><h3>静帧资产</h3><p>${imageAssets.length} 张</p></div></div>${renderImageAssets(imageAssets.slice(0,8))}</section>
      </div>
      ${shotImageWorkbench(7, imageCandidateShots, selectedImageShot)}`,
    8: `
      <div class="stack">
        ${renderBatchImageWorkbench({
          shots: imageCandidateShots,
          includeTargets: false,
          emptyMessage: "先在第 6 步建立分镜，才能批量生成镜头图片。"
        })}
        <section class="card card-pad">
          <div class="section-title"><div><h3>批量候选审核</h3><p>比较身份、手部、服装、时代和构图后再绑定首帧</p></div><span class="badge gold">${currentBatchImageAssets().length} 张</span></div>
          ${renderBatchImageResults(currentBatchImageAssets().slice(0, 48))}
        </section>
      </div>
      ${shotImageWorkbench(8, imageCandidateShots, selectedImageShot)}
      ${renderImageAssets(imageAssets.slice(0, 12))}`,
    9: `
      <div class="content-grid">
        <section class="card card-pad">
          <div class="section-title"><div><h2>参考视频人物替换</h2><p>${template ? esc(template.title) : "尚未应用抖音模板"}</p></div><span class="badge gold">4–8 秒单镜</span></div>
          <div class="project-brief">
            <div class="field"><label>选择镜头</label><select class="select" data-shot-select>${storyboard.map((shot)=>`<option value="${shot.id}" ${shot.id === selectedShot?.id ? "selected" : ""}>${String(shot.number).padStart(2,"0")} · ${esc(shot.title)} · ${shot.duration}s · ${shot.status}</option>`).join("")}</select></div>
            <div class="field"><label>男主角参考</label><input class="input" value="${esc(state.groom)}" readonly /></div>
            <div class="field"><label>女主角参考</label><input class="input" value="${esc(state.bride)}" readonly /></div>
            <div class="field"><label>背景策略</label><select class="select" data-background-policy><option value="keep">保持原模板背景</option><option value="change">替换为${esc(state.city)}婚礼场景</option></select></div>
            <div class="field"><label>本镜首帧</label><select class="select" data-first-frame-asset><option value="">选择已生成图片</option>${imageAssets.map((asset) => `<option value="${asset.id}" ${selectedShot?.assets?.firstFrame?.assetId === asset.id ? "selected" : ""}>${esc(asset.title || asset.kind)}</option>`).join("")}</select></div>
          </div>
          <textarea class="textarea" data-video-prompt style="min-height:185px;margin-top:12px;">${esc(buildReplacementPrompt(selectedShot || storyboard[0]))}</textarea>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
            <button class="button ghost small-button" data-action="build-replacement-prompt">重新生成完整提示词</button>
            <button class="button ghost small-button" data-action="copy-full-video-prompt">复制完整提示词</button>
            <button class="button ghost small-button" data-action="bind-first-frame">绑定首帧</button>
            <button class="button secondary" data-route="generate">打开生成中心</button>
            <button class="button primary" data-action="${template ? "generate-template-shot" : "generate-story-shot"}" ${selectedShot?.assets?.firstFrame?.assetId || template ? "" : "disabled"}>${template ? "按模板生成替换镜头" : "按首帧生成当前镜头"}</button>
          </div>
        </section>
        <section class="card card-pad">
          <div class="section-title"><div><h3>详细提示词必须包含</h3><p>缺一项都可能造成串脸、动作错误或背景不连续</p></div></div>
          <div class="checklist">
            ${[
              ["素材角色", "哪张图是男主、哪张图是女主，哪段视频是运动参考"],
              ["身份锁定", "脸型、五官比例、发际线、发型、肤色、身高差"],
              ["服装锁定", "每镜对应的造型编号与配饰"],
              ["时空锁定", "背景、建筑、道具、光线方向、色温和年代"],
              ["动作结构", "起始姿态、动作过程、结束姿态、手部接触"],
              ["镜头结构", "景别、机位高度、角度、运镜和速度"],
              ["切换规则", "本镜切点与下一镜接法"],
              ["声音参考", "环境声、脚步、衣料声和入声点"],
              ["负向约束", "文字、水印、换脸、漂移、多指、粘连、跳轴"]
            ].map(([title,hint])=>`<div class="check-item"><span class="check-icon pending">·</span><div class="check-copy"><strong>${title}</strong><small>${hint}</small></div></div>`).join("")}
          </div>
          <div class="notice" style="margin-top:14px;">${icon("shield")}<div><strong>先做首帧</strong>首帧出现串脸、错手或空间错误时先修图，不能把希望寄托在视频模型自动修复。</div></div>
        </section>
      </div>
      ${shotQcCard(selectedShot, "story")}
      <section class="card card-pad" style="margin-top:18px;">
        <div class="section-title"><div><h2>可复制视频提示词库</h2><p>按任务类型选择，再替换人物和背景字段</p></div></div>
        <div class="prompt-grid">
          ${[
            ["人物首帧", "生成电影级婚礼人物首帧，参考男女主照片…"],
            ["保持背景", "保持参考视频动作、机位和背景不变，替换人物身份…"],
            ["替换背景", "保持人物动作和镜头运动，替换背景并匹配阴影…"],
            ["手部特写", "双手特写，十指相扣，手指结构正确，衣袖自然垂落…"],
            ["时代转场", "在牵手动作中完成匹配剪辑，下一镜从相同手部位置开始…"]
          ].map(([title,summary])=>`<article class="prompt-card card"><div class="prompt-card-head"><h3>${title}</h3><button class="text-button" data-action="copy-video-preset" data-preset="${title}">复制模板</button></div><div class="prompt-card-body"><p class="small" style="margin:0;line-height:1.75;">${summary}</p></div></article>`).join("")}
        </div>
      </section>
      <section class="card card-pad" style="margin-top:18px;"><div class="section-title"><div><h2>已生成并回传的视频</h2><p>${videoAssets.length} 个镜头</p></div></div>${renderVideoAssets(videoAssets)}</section>`,
    10: `
      <div class="content-grid">
        <section class="card card-pad"><div class="section-title"><div><h2>BGM 风格试听</h2><p>从第一个画面开始铺底，为人声留出位置</p></div><span class="badge ${selectedMusicAsset ? "green" : "gray"}">${selectedMusicAsset ? "已选配乐" : "待选择"}</span></div><div class="choice-grid" style="grid-template-columns:1fr;"><button class="choice-card active" data-action="music-choice"><span class="choice-symbol">弦</span><h4>东方弦乐 + 轻钢琴</h4><p>舒缓开场，誓言段抬升，最后淡出。</p></button><button class="choice-card" data-action="music-choice"><span class="choice-symbol">琴</span><h4>温暖钢琴 + 氛围垫</h4><p>适合照片和旁白较多的版本。</p></button></div><button class="button primary" style="width:100%;margin-top:14px;" data-action="generate-music">生成候选 BGM</button><div class="divider"></div><div class="field"><label>音乐来源与授权备注</label><textarea class="textarea" data-field="musicLicense" style="min-height:90px;">${esc(state.musicLicense || "")}</textarea><small class="field-hint">记录原创、购买授权、客户提供或平台来源，不能只写“网上下载”。</small></div></section>
        <section class="card card-pad"><div class="section-title"><div><h3>音乐候选</h3><p>实际试听后选定一条</p></div><span class="badge gold">${selectedMusicAsset ? esc(selectedMusicAsset.title) : "未选择"}</span></div><div class="stack" style="gap:10px;">${musicAssets.map((asset) => `<div class="prompt-block"><div class="section-title"><div><strong>${esc(asset.title || "婚礼配乐")}</strong><small>${Number(asset.media?.duration || 0).toFixed(1)} 秒</small></div><button class="button secondary small-button" data-action="select-timeline-audio" data-kind="music" data-asset-id="${asset.id}" ${asset.id === selectedMusicAsset?.id ? "disabled" : ""}>${asset.id === selectedMusicAsset?.id ? "当前配乐" : "使用此配乐"}</button></div><audio controls preload="metadata" src="${esc(api.mediaUrl(asset.url))}" style="width:100%;"></audio></div>`).join("") || '<p class="small muted">暂无音乐，请先生成或上传。</p>'}</div></section>
      </div>`,
    11: `
      <div class="content-grid"><section class="card card-pad"><div class="section-title"><div><h2>代表性声音试混</h2><p>生成真实旁白＋音乐小样，检查声音关系</p></div><span class="badge ${mixSampleAssets.length ? "green" : "gray"}">${mixSampleAssets.length} 个试混</span></div><div class="project-brief"><div class="field"><label>当前旁白</label><input class="input" readonly value="${esc(selectedVoiceAsset?.title || "未选择")}" /></div><div class="field"><label>当前配乐</label><input class="input" readonly value="${esc(selectedMusicAsset?.title || "未选择")}" /></div><div class="field"><label>试混开始秒</label><input class="input" type="number" min="0" step="0.1" data-mix-start value="${Math.max(0, Number(state.duration || 40) * 0.35).toFixed(1)}" /></div><div class="field"><label>试混时长</label><input class="input" type="number" min="3" max="15" step="1" data-mix-duration value="10" /></div></div><button class="button primary" style="width:100%;margin-top:14px;" data-action="render-mix-sample" ${selectedVoiceAsset && selectedMusicAsset ? "" : "disabled"}>${icon("play")}生成真实试混</button><div class="checklist" style="margin-top:14px;"><div class="check-item"><span class="check-icon pending">1</span><div class="check-copy"><strong>旁白清楚</strong><small>音乐自动让出旁白中频</small></div></div><div class="check-item"><span class="check-icon pending">2</span><div class="check-copy"><strong>音乐有起伏</strong><small>高潮段落有抬升但不过响</small></div></div><div class="check-item"><span class="check-icon pending">3</span><div class="check-copy"><strong>结尾自然</strong><small>音乐随片尾收束</small></div></div></div></section><section class="card card-pad"><div class="section-title"><div><h3>试混结果</h3><p>保存实际混音参数</p></div></div><div class="stack" style="gap:10px;">${mixSampleAssets.map((asset) => `<div class="prompt-block"><strong>${esc(asset.title)}</strong><small>${Number(asset.mixSettings?.start || 0).toFixed(1)} 秒起 · ${Number(asset.mixSettings?.duration || 0).toFixed(1)} 秒 · ${Number(asset.media?.integratedLufs || -14).toFixed(1)} LUFS</small><audio controls preload="metadata" src="${esc(api.mediaUrl(asset.url))}" style="width:100%;"></audio></div>`).join("") || '<p class="small muted">尚未生成试混。</p>'}</div></section></div>`,
    12: `
      <div class="content-grid"><section class="card card-pad"><div class="section-title"><div><h2>完整混音</h2><p>全片旁白与音乐合成为独立主混音</p></div><span class="badge ${fullMixAssets.length ? "green" : "gray"}">${fullMixAssets.length} 个主混音</span></div><div class="notice red">${icon("shield")}<div><strong>目标响度</strong>约 -14 LUFS，True Peak ≤ -1 dBTP；旁白出现时音乐自动压低。</div></div><button class="button primary" style="width:100%;margin-top:16px;" data-action="render-full-mix" ${selectedVoiceAsset && selectedMusicAsset ? "" : "disabled"}>${icon("play")}生成完整混音</button></section><section class="card card-pad"><div class="section-title"><div><h3>完整混音结果</h3><p>必须从头到尾试听</p></div></div><div class="stack" style="gap:10px;">${fullMixAssets.map((asset) => `<div class="prompt-block"><strong>${esc(asset.title)}</strong><small>${Number(asset.media?.duration || 0).toFixed(1)} 秒 · ${Number(asset.media?.integratedLufs || -14).toFixed(1)} LUFS · True Peak ${Number(asset.media?.truePeakDb || -1).toFixed(1)} dBTP</small><audio controls preload="metadata" src="${esc(api.mediaUrl(asset.url))}" style="width:100%;"></audio></div>`).join("") || '<p class="small muted">尚未生成完整混音。</p>'}</div></section></div>`,
    13: `
      <div class="content-grid"><section class="card card-pad"><div class="section-title"><div><h2>字幕与完整预览</h2><p>逐条打轴、设置样式并渲染当前批准时间轴</p></div><span class="badge ${previewAssets.length ? "green" : "gold"}">${previewAssets.length} 个预览</span></div><textarea class="textarea" data-speech-text style="min-height:130px;">沈知远与林晚晴，从雨天借伞开始，一起走过旅行、搬家和异地岁月。今天，他们把余生写成同一个故事。</textarea><div class="project-brief" style="margin-top:12px;"><div class="field"><label>字体</label><select class="select" data-subtitle-style="font"><option value="Microsoft YaHei" ${state.subtitleStyle?.font === "Microsoft YaHei" ? "selected" : ""}>微软雅黑</option><option value="SimSun" ${state.subtitleStyle?.font === "SimSun" ? "selected" : ""}>宋体</option><option value="KaiTi" ${state.subtitleStyle?.font === "KaiTi" ? "selected" : ""}>楷体</option></select></div><div class="field"><label>字号</label><input class="input" type="number" min="16" max="72" data-subtitle-style="fontSize" value="${Number(state.subtitleStyle?.fontSize || 24)}" /></div><div class="field"><label>主色</label><input class="input" type="color" data-subtitle-style="color" value="${esc(state.subtitleStyle?.color || "#FFFFFF")}" /></div><div class="field"><label>描边</label><input class="input" type="number" min="0" max="8" data-subtitle-style="outline" value="${Number(state.subtitleStyle?.outline ?? 2)}" /></div><div class="field"><label>底部边距</label><input class="input" type="number" min="10" max="120" data-subtitle-style="margin" value="${Number(state.subtitleStyle?.margin || 30)}" /></div></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;"><button class="button ghost small-button" data-action="save-subtitle-style">保存字幕样式</button><button class="button secondary" data-action="generate-subtitles">生成 SRT</button><button class="button primary" data-action="render-preview">${icon("play")}渲染完整带字幕预览</button></div><div class="checklist" style="margin-top:14px;"><div class="check-item"><span class="check-icon pending">1</span><div class="check-copy"><strong>每行不超过约 18 字</strong><small>底部安全区内，不遮挡人物脸和手</small></div></div><div class="check-item"><span class="check-icon pending">2</span><div class="check-copy"><strong>字幕和旁白对时</strong><small>整片播放检查，而不是只看截图</small></div></div></div></section><section class="card card-pad"><div class="section-title"><div><h3>SRT 与预览</h3><p>当前字幕 ${subtitleAssets.length} 条 · 预览 ${previewAssets.length} 个</p></div></div><div class="stack" style="gap:10px;">${subtitleAssets.slice(0,4).map((asset) => `<div class="prompt-block"><strong>${esc(asset.title)}</strong><a href="${esc(api.mediaUrl(asset.url))}" target="_blank" rel="noreferrer">打开 SRT</a></div>`).join("")}</div>${renderVideoAssets(previewAssets.slice(0,3))}</section></div>`,
    14: `
      <section class="card card-pad"><div class="section-title"><div><h2>正式交付包</h2><p>成片、SRT、可编辑工程、镜头表、提示词历史和质检记录</p></div><span class="badge ${deliveryAssets.length ? "green" : "gray"}">${deliveryAssets.length} 个交付包</span></div><div class="checklist"><div class="check-item"><span class="check-icon ${previewAssets.length ? "" : "pending"}">${previewAssets.length ? "✓" : "!"}</span><div class="check-copy"><strong>完整带字幕预览</strong><small>${previewAssets.length ? "已有预览成片" : "请先在第 13 步渲染并观看完整预览"}</small></div></div><div class="check-item"><span class="check-icon ${state.musicLicense ? "" : "pending"}">${state.musicLicense ? "✓" : "!"}</span><div class="check-copy"><strong>音乐授权</strong><small>${state.musicLicense ? esc(state.musicLicense) : "请填写音乐来源与授权"}</small></div></div><div class="check-item"><span class="check-icon">✓</span><div class="check-copy"><strong>当前时间轴</strong><small>${state.duration} 秒 · ${Math.round(state.duration * 24)} 帧 · 24 FPS</small></div></div></div><button class="button primary" style="width:100%;margin-top:16px;" data-action="create-delivery" ${previewAssets.length ? "" : "disabled"}>${icon("shield")}生成正式交付包</button><div class="divider"></div><div class="stack" style="gap:10px;">${deliveryAssets.map((asset) => `<div class="prompt-block"><div class="section-title"><div><strong>${esc(asset.title)}</strong><small>${asset.manifest?.files?.length || 0} 个文件 · ${esc(asset.createdAt || "")}</small></div><a class="button ghost small-button" href="${esc(api.mediaUrl(asset.url))}" target="_blank" rel="noreferrer">打开交付清单</a></div><p class="small">${(asset.manifest?.files || []).map((file) => `${file.name} · ${file.sha256.slice(0, 12)}…`).join("<br />")}</p></div>`).join("") || '<p class="small muted">尚未生成交付包。</p>'}</div></section>
      <section class="card card-pad" style="margin-top:18px;"><div class="section-title"><div><h2>预览与正式成片</h2><p>交付前最后核对</p></div></div>${renderVideoAssets(previewAssets.slice(0,3))}</section>`
  };
  return raw[number] || "";
}

function workflowMaterialSummary() {
  const items = [
    ["男女主照片", Boolean(state.photoSources?.groom && state.photoSources?.bride)],
    ["五幕故事", ["origin","knowing","confirm","companionship","promise"].every((key) => String(state.storyBeats?.[key] || "").trim())],
    ["模板或参考片", runtime.templates.length > 0],
    ["旁白", runtime.assets.some((asset) => asset.kind === "voice")],
    ["音乐", runtime.assets.some((asset) => asset.kind === "music")],
    ["字幕", runtime.assets.some((asset) => asset.kind === "subtitle")]
  ];
  return `<section class="card card-pad"><div class="section-title"><div><h3>素材检查</h3><p>没有素材就不开始生成</p></div><button class="text-button" data-route="assets">打开素材中心 →</button></div><div class="checklist">${items.map(([label,done])=>`<div class="check-item"><span class="check-icon ${done?"":"pending"}">${done?"✓":"!"}</span><div class="check-copy"><strong>${label}</strong><small>${done?"已就绪":"尚缺"}</small></div></div>`).join("")}</div></section>`;
}

function renderAudioAssets(items) {
  if (!items.length) return '<p class="small muted">暂无音频资产。</p>';
  const project = runtime.projects.find((item) => item.id === currentProjectId);
  const selectedVoiceId = project?.timelineSelection?.voiceAssetId;
  return `<div class="stack" style="gap:8px;">${items.map((asset)=>`<div class="prompt-block"><div class="section-title"><div><label>${esc(asset.title || materialLabel(asset.kind))}</label><small>${Number(asset.media?.duration || 0).toFixed(1)} 秒</small></div>${asset.kind === "voice" ? `<button class="button ghost small-button" data-action="select-timeline-audio" data-kind="voice" data-asset-id="${asset.id}" ${asset.id === selectedVoiceId ? "disabled" : ""}>${asset.id === selectedVoiceId ? "当前旁白" : "使用此旁白"}</button>` : ""}</div>${asset.url?`<audio controls preload="metadata" src="${esc(api.mediaUrl(asset.url))}" style="width:100%;"></audio>`:'<p class="small muted">旧资产无在线地址</p>'}</div>`).join("")}</div>`;
}

function renderImageAssets(items) {
  if (!items.length) return '<div class="empty-state" style="min-height:180px;"><div><div class="empty-state-symbol">图</div><h3>还没有图片</h3><p>上传或生成后会显示在这里。</p></div></div>';
  return `<div class="asset-grid">${items.map((asset)=>`<article class="asset-card card"><div class="asset-preview">${asset.url?`<img src="${esc(api.mediaUrl(asset.url))}" alt="${esc(asset.title)}" />`:'图'}</div><div class="asset-info"><strong>${esc(asset.title)}</strong><small>${esc(asset.kind)}</small></div></article>`).join("")}</div>`;
}

function renderVideoAssets(items) {
  if (!items.length) return '<div class="empty-state" style="min-height:180px;"><div><div class="empty-state-symbol">影</div><h3>还没有视频</h3><p>完成镜头或成片后会显示在这里。</p></div></div>';
  return `<div class="asset-grid">${items.map((asset)=>`<article class="asset-card card"><div class="asset-preview"><video src="${esc(api.mediaUrl(asset.url))}" controls preload="metadata"></video></div><div class="asset-info"><strong>${esc(asset.title)}</strong><small>${Number(asset.media?.duration || 0).toFixed(1)} 秒 · ${esc(asset.kind)}</small>${asset.kind === "export" ? `<small class="badge ${asset.technicalQc?.ok ? "green" : "red"}">${asset.technicalQc?.ok ? "技术检查通过" : "技术检查未通过"}</small>` : ""}</div></article>`).join("")}</div>`;
}

function buildReplacementPrompt(shot = storyboard[0], policy = "keep") {
  return buildVideoPrompt(shot || storyboard[0] || {}, state, { policy });
}

function characterSheetTemplateBlock(targetSelector = "") {
  const prompt = buildCharacterSheetPrompt();
  return `
    <details class="character-sheet-template" data-character-sheet-template>
      <summary>
        <span>角色三视图 + 三局部特写</span>
        <small>人物设定图模板</small>
      </summary>
      <div class="character-sheet-template-body">
        <div class="field">
          <label>人物形象描述</label>
          <input class="input" data-character-sheet-description value="${esc(DEFAULT_CHARACTER_SHEET_DESCRIPTION)}" />
          <span class="field-hint">替换为当前角色年龄、身份、气质、服装和职业描述。</span>
        </div>
        <textarea class="textarea" data-character-sheet-preview readonly style="min-height:210px;">${esc(prompt)}</textarea>
        <div class="model-config-actions">
          <button class="button secondary small-button" data-action="update-character-sheet-template">刷新预览</button>
          ${
            targetSelector
              ? `<button class="button primary small-button" data-action="apply-character-sheet-template" data-target-selector="${esc(targetSelector)}">套用到图片提示词</button>`
              : ""
          }
          <button class="button ghost small-button" data-action="copy-character-sheet-template">复制模板</button>
        </div>
      </div>
    </details>
  `;
}

function videoPresetPrompt(name) {
  const presets = {
    人物首帧:
      `电影级婚礼人物定妆首帧，男主角${state.groom}与女主角${state.bride}。以真实照片为唯一身份参考，保持脸型、五官比例、发际线和发型一致；全身或七分身构图，真实皮肤、织物和金属材质，电影级暖侧光，干净背景，不出现文字、水印和拼贴。`,
    保持背景:
      buildReplacementPrompt(storyboard[0], "keep"),
    替换背景:
      buildReplacementPrompt(storyboard[0], "change"),
    手部特写:
      `双手特写，男主角${state.groom}从画面左侧伸手，女主角${state.bride}从右侧回应，指尖先接触再轻轻相扣；手指数量、关节、指甲和衣袖褶裥结构正确，动作有重量与轻微停顿，背景保持参考视频空间，电影浅景深。`,
    时代转场:
      `用牵手动作做匹配剪辑，当前时代的手部位置、运动方向和速度与下一时代起始画面完全匹配；镜头轴线不反转，服装与场景切换清晰，不依赖人物融化、光晕或换装特效。`
  };
  return presets[name] || "";
}

function templatesPage() {
  const templates = runtime.templates || [];
  const activeJobs = (runtime.jobs || []).filter(
    (job) => job.kind?.startsWith("template-") && !["succeeded", "failed"].includes(job.status)
  );
  return `
    <div class="page">
      ${pageHeader("templates")}
      <div class="notice red" style="margin-bottom:18px;">${icon("shield")}<div><strong>模板导入说明</strong>本地视频会复制到项目素材目录；抖音链接由浏览器抓取并立即下载。模板仅用于用户有权使用的项目，请自行确认视频、人物肖像和音乐授权。</div></div>
      <div class="content-grid">
        <section class="card card-pad">
          <div class="section-title"><div><h2>导入风格模板</h2><p>支持 MP4、MOV、WebM 本地文件和抖音短链接</p></div><span class="badge ${runtime.online ? "green" : "gray"}">${runtime.online ? "本地服务在线" : "服务未连接"}</span></div>
          <label class="upload-target" for="template-file" style="min-height:138px;">
            ${icon("upload")}
            <strong>选择本地视频作为模板</strong>
            <small>上传后自动读取时长、画幅、镜头切点和封面</small>
          </label>
          <input id="template-file" type="file" accept="video/mp4,video/quicktime,video/webm" data-template-input hidden />
          <div class="divider"></div>
          <div class="field">
            <label for="template-url">抖音链接</label>
            <input id="template-url" class="input" data-template-url placeholder="https://v.douyin.com/..." />
            <span class="field-hint">系统会下载原视频、封面和页面文案，再分析镜头结构。</span>
          </div>
          <button class="button primary" style="width:100%;margin-top:12px;" data-action="import-template-url">${icon("sparkle")}解析抖音链接</button>
          ${
            activeJobs.length
              ? `<div class="notice" style="margin-top:14px;">${icon("sparkle")}<div><strong>正在处理 ${activeJobs.length} 个模板任务</strong>${activeJobs.map((job) => `${job.kind} · ${job.status} · ${job.progress || 0}%`).join("<br />")}</div></div>`
              : ""
          }
        </section>
        <section class="card card-pad">
          <div class="section-title"><div><h2>模板生产流程</h2><p>下载只是第一步，真正可用的是模板配方</p></div></div>
          <div class="checklist">
            <div class="check-item"><span class="check-icon">1</span><div class="check-copy"><strong>保存原片与封面</strong><small>生成预览，不覆盖原文件。</small></div></div>
            <div class="check-item"><span class="check-icon">2</span><div class="check-copy"><strong>镜头切点与时长</strong><small>FFmpeg 检测候选切镜并计算 24 FPS 帧数。</small></div></div>
            <div class="check-item"><span class="check-icon">3</span><div class="check-copy"><strong>AI 深度分析</strong><small>视觉模型补充景别、动作、运镜和转场。</small></div></div>
            <div class="check-item"><span class="check-icon">4</span><div class="check-copy"><strong>应用模板</strong><small>把时长、画幅和镜头节奏带入婚礼项目。</small></div></div>
          </div>
        </section>
      </div>
      <section class="card card-pad" style="margin-top:18px;">
        <div class="section-title"><div><h2>模板库</h2><p>${templates.length} 个模板</p></div><button class="text-button" data-action="refresh-runtime">刷新</button></div>
        ${
          templates.length
            ? `<div class="asset-grid">
                ${templates
                  .map(
                    (template) => `
                    <article class="asset-card card">
                      <div class="asset-preview">${template.coverUrl ? `<img src="${esc(api.mediaUrl(template.coverUrl))}" alt="${esc(template.title)}" />` : "模"}</div>
                      <div class="asset-info">
                        <strong title="${esc(template.title)}">${esc(template.title || "未命名模板")}</strong>
                        <small>${Number(template.duration || 0).toFixed(1)} 秒 · ${esc(template.aspect || "")} · ${template.recipe?.shots?.length || 0} 镜</small>
                        <div class="chip-row" style="margin-top:9px;"><span class="badge ${template.status === "ready" ? "green" : "gold"}">${esc(template.status || "待分析")}</span></div>
                        <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
                          <button class="button secondary small-button" data-action="analyze-template" data-template-id="${template.id}">AI 深度分析</button>
                          <button class="button primary small-button" data-action="apply-template" data-template-id="${template.id}">应用此模板</button>
                        </div>
                      </div>
                    </article>`
                  )
                  .join("")}
              </div>`
            : `<div class="empty-state"><div><div class="empty-state-symbol">模</div><h3>还没有模板</h3><p>上传视频或粘贴抖音链接后，系统会建立可编辑的模板配方。</p></div></div>`
        }
      </section>
    </div>
  `;
}

function modelStatusLabel(status = "") {
  const labels = {
    ready: "可用",
    unverified: "待测试",
    visible_unverified: "资源可见，待实测",
    subscription_expired: "套餐已过期",
    external_service_blocked: "外部服务不可用",
    needs_setup: "待初始化",
    resource_not_found: "未发现资源",
    error: "异常"
  };
  return labels[status] || status || "未配置";
}

function modelStatusTone(status = "") {
  if (status === "ready") return "green";
  if (["unverified", "visible_unverified", "needs_setup"].includes(status)) return "gold";
  return "red";
}

function modelProviderMeta(providerId) {
  return (
    runtime.modelSchema?.providers?.find((item) => item.id === providerId) || {
      id: providerId,
      label: providerId,
      categories: [],
      credential: "",
      fields: []
    }
  );
}

function modelCategoryMeta(categoryId) {
  return (
    runtime.modelSchema?.categories?.find((item) => item.id === categoryId) || {
      id: categoryId,
      label: categoryId,
      description: ""
    }
  );
}

function modelParameterExample(category) {
  const examples = {
    text: { temperature: 0.7, maxOutputTokens: 6000 },
    image: { size: "2K", width: 1024, height: 1365 },
    video: { resolution: "720p", duration: 5, ratio: "16:9" },
    voice: { rate: -1, voice: "Microsoft Yaoyao" },
    music: { tempo: 78, mood: "warm-cinematic" },
    editor: { fps: 24, videoCodec: "libx264" }
  };
  return JSON.stringify(examples[category] || {}, null, 2);
}

function modelEditorForm(editingModel) {
  const categories = runtime.modelSchema?.categories || [];
  const providers = runtime.modelSchema?.providers || [];
  const category =
    modelDraftCategory || editingModel?.category || selectedModelCategory || "text";
  const availableProviders = providers.filter((provider) =>
    provider.categories.includes(category)
  );
  const provider =
    (editingModel &&
      availableProviders.some((item) => item.id === editingModel.provider) &&
      editingModel.provider) ||
    availableProviders[0]?.id ||
    "";
  return `
    <form class="model-editor" data-model-form data-model-editor-id="${esc(editingModel?.id || "")}">
      <div class="section-title"><div><h3>${editingModel ? "编辑模型配置" : "新增模型配置"}</h3><p>API Key 只来自本机登录态或环境变量，页面不接收密钥</p></div><span class="badge ${editingModel ? "gold" : "green"}">${editingModel ? "编辑中" : "新配置"}</span></div>
      <div class="model-editor-grid">
        <label class="field"><span class="field-label">能力类别</span><select class="select" data-model-field="category">${categories.map((item) => `<option value="${item.id}" ${item.id === category ? "selected" : ""}>${esc(item.label)}</option>`).join("")}</select><small class="field-hint">${esc(modelCategoryMeta(category).description)}</small></label>
        <label class="field"><span class="field-label">供应商</span><select class="select" data-model-field="provider">${availableProviders.map((item) => `<option value="${item.id}" ${item.id === provider ? "selected" : ""}>${esc(item.label)}</option>`).join("")}</select></label>
        <label class="field"><span class="field-label">显示名称</span><input class="input" data-model-field="label" value="${esc(editingModel?.label || "")}" placeholder="例如：Seedance 自定义 Endpoint" /></label>
        <label class="field"><span class="field-label">模型 ID / Endpoint / 调用名</span><input class="input" data-model-field="model" value="${esc(editingModel?.model || "")}" placeholder="例如：ep-... 或 doubao-seedance-2.0" /></label>
        <label class="field"><span class="field-label">Profile（火山方舟）</span><input class="input" data-model-field="profile" value="${esc(editingModel?.profile || "")}" placeholder="留空则使用当前默认 Profile" /></label>
        <div class="field"><span class="field-label">状态</span><div class="model-status-readonly"><span class="badge ${modelStatusTone(editingModel?.status || "unverified")}">${esc(modelStatusLabel(editingModel?.status || "unverified"))}</span><small>${editingModel?.lastTest?.message ? esc(editingModel.lastTest.message) : "修改连接信息后需要重新测试"}</small></div></div>
      </div>
      <label class="field" style="margin-top:14px;"><span class="field-label">模型参数 JSON</span><textarea class="textarea model-params-input" data-model-field="parameters" spellcheck="false">${esc(Object.keys(editingModel?.parameters || {}).length ? JSON.stringify(editingModel.parameters, null, 2) : modelParameterExample(category))}</textarea><small class="field-hint">示例：${esc(modelParameterExample(category))}</small></label>
      <div class="model-editor-switches">
        <label class="switch-line"><input type="checkbox" data-model-field="enabled" ${editingModel?.enabled !== false ? "checked" : ""} /><span>启用此模型</span></label>
        <label class="switch-line"><input type="checkbox" data-model-field="isDefault" ${editingModel?.isDefault ? "checked" : ""} /><span>设为该类别默认模型</span></label>
      </div>
      <div class="model-editor-actions">
        <button class="button primary" type="button" data-action="save-model-config">${icon("shield")}${editingModel ? "保存修改" : "创建模型"}</button>
        ${editingModel ? `<button class="button ghost" type="button" data-action="clone-model" data-model-id="${editingModel.id}">复制配置</button><button class="button ghost danger-text" type="button" data-action="delete-model" data-model-id="${editingModel.id}">删除模型</button>` : ""}
      </div>
    </form>`;
}

function modelCenterPage() {
  const models = runtime.models || [];
  const categories = runtime.modelSchema?.categories || [];
  const providers = runtime.modelSchema?.providers || [];
  if (!categories.some((item) => item.id === selectedModelCategory)) {
    selectedModelCategory = categories[0]?.id || "text";
  }
  const selectedMeta = modelCategoryMeta(selectedModelCategory);
  const categoryModels = models.filter(
    (model) => model.category === selectedModelCategory
  );
  const editingModel = modelEditorId
    ? models.find((model) => model.id === modelEditorId) || null
    : null;
  return `
    <div class="page">
      ${pageHeader("models")}
      <div class="notice" style="margin-bottom:18px;">${icon("shield")}<div><strong>模型配置与凭证分离</strong>这里只保存供应商、模型 ID、Profile 和执行参数。API Key、Token 和设备凭据不会进入浏览器、数据库或页面。</div></div>
      <section class="card card-pad model-overview">
        <div class="section-title"><div><h2>可配置模型中心</h2><p>${runtime.online ? `本地服务在线 · Ark ${runtime.health?.arkAuth?.loggedIn ? "已登录" : "未登录"}` : "本地服务未连接"}</p></div><div class="chip-row"><button class="button secondary small-button" data-action="test-all-models">测试全部启用模型</button><button class="button primary small-button" data-action="new-model">${icon("plus")}新增模型</button></div></div>
        <div class="model-category-tabs">
          ${categories.map((category) => {
            const items = models.filter((model) => model.category === category.id);
            const defaultModel = items.find((model) => model.isDefault);
            return `<button class="model-category-tab ${category.id === selectedModelCategory ? "active" : ""}" data-action="select-model-category" data-category="${category.id}"><strong>${esc(category.label)}</strong><span>${items.length} 个 · ${defaultModel ? `默认：${esc(defaultModel.label)}` : "未设默认"}</span></button>`;
          }).join("")}
        </div>
      </section>
      <div class="model-config-layout">
        <section class="card card-pad">
          <div class="section-title"><div><h2>${esc(selectedMeta.label)}</h2><p>${esc(selectedMeta.description)} · ${providers.filter((provider) => provider.categories.includes(selectedModelCategory)).length} 个可用供应商</p></div><span class="badge gold">${categoryModels.length} 个配置</span></div>
          <div class="model-config-list">
            ${categoryModels.length ? categoryModels.map((model) => {
              const provider = modelProviderMeta(model.provider);
              const paramSummary = Object.entries(model.parameters || {}).slice(0, 4).map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : value}`).join(" · ") || "暂无参数";
              return `<article class="model-config-card ${model.isDefault ? "is-default" : ""} ${model.id === editingModel?.id ? "is-editing" : ""}">
                <div class="model-config-head"><div><div class="model-title-row"><strong>${esc(model.label)}</strong>${model.isDefault ? '<span class="badge red">默认</span>' : ""}<span class="badge ${modelStatusTone(model.status)}">${esc(modelStatusLabel(model.status))}</span></div><small>${esc(provider.label)} · ${esc(model.model)}</small></div><span class="model-enabled-state">${model.enabled ? "已启用" : "已停用"}</span></div>
                <div class="model-config-meta"><span>Profile：${esc(model.profile || "当前默认")}</span><span>参数：${esc(paramSummary)}</span><span>最近测试：${model.lastTest?.at ? esc(new Date(model.lastTest.at).toLocaleString("zh-CN")) : "尚未测试"}</span></div>
                ${model.lastTest?.message ? `<p class="model-test-message">${esc(model.lastTest.message)}</p>` : ""}
                <div class="model-config-actions"><button class="button ghost small-button" data-action="edit-model" data-model-id="${model.id}">编辑配置</button><button class="button ghost small-button" data-action="test-model" data-model-id="${model.id}">测试连接</button><button class="button ghost small-button" data-action="clone-model" data-model-id="${model.id}">复制</button><button class="button secondary small-button" data-action="set-default-model" data-model-id="${model.id}" ${model.isDefault ? "disabled" : ""}>${model.isDefault ? "当前默认" : "设为默认"}</button></div>
              </article>`;
            }).join("") : '<div class="empty-state"><div><div class="empty-state-symbol">型</div><h3>这一类还没有模型</h3><p>右侧可以直接新增配置。</p></div></div>'}
          </div>
        </section>
        <section class="card card-pad model-editor-panel">
          ${modelEditorForm(editingModel)}
        </section>
      </div>
    </div>
  `;
}

function storyPage() {
  return `
    <div class="page">
      ${pageHeader("story")}
      ${progressStrip(0)}
      <div class="content-grid">
        <section class="card card-pad">
          <div class="section-title">
            <div><h2>选择叙事母题</h2><p>同一份爱情，可以用不同结构来讲</p></div>
            <span class="badge gold">已选：${esc(state.theme)}</span>
          </div>
          <div class="choice-grid">
            ${Object.entries(THEME_DATA)
              .map(
                ([theme, meta], index) => `
                <button class="choice-card ${state.theme === theme ? "active" : ""}" data-action="set-theme" data-theme="${theme}" data-index="${String(index + 1).padStart(2, "0")}">
                  <span class="choice-symbol">${meta.symbol}</span>
                  <h4>${theme}</h4>
                  <p>${meta.description}<br />${meta.use}</p>
                </button>`
              )
              .join("")}
          </div>
          <div class="story-length">
            <div><strong>${state.duration} 秒</strong><small>${framePlan().totalFrames} 帧 · 24 FPS</small></div>
            <div class="range-wrap">
              <input type="range" min="30" max="90" step="5" value="${state.duration}" data-field="duration" aria-label="成片时长" />
              <span class="small muted">30–90 秒</span>
            </div>
          </div>
          <div class="divider"></div>
          <div class="section-title"><div><h3>五幕故事采集</h3><p>按相识、相知、确认、相伴、承诺逐幕填写；没有发生的经历不要补写</p></div><button class="text-button" data-action="copy-story-card">复制采集卡 →</button></div>
          <div class="story-beat-grid">
            ${[
              ["origin", "第一幕 · 相识", "在哪、什么季节、谁先注意到谁？"],
              ["knowing", "第二幕 · 相知", "哪件小事让你开始心动？"],
              ["confirm", "第三幕 · 确认", "在哪、谁开的口、说了什么？"],
              ["companionship", "第四幕 · 相伴", "日常里最像你们的一个画面？"],
              ["promise", "第五幕 · 承诺", "婚礼场地、结尾动作、最想说的话？"]
            ].map(([key, title, hint]) => `<label class="field"><span class="field-label">${title}</span><textarea class="textarea" style="min-height:92px;" data-story-beat="${key}" placeholder="${hint}">${esc(state.storyBeats?.[key] || "")}</textarea></label>`).join("")}
          </div>
          <div class="divider"></div>
          <div class="field">
            <label for="story-content">爱情故事原文</label>
            <textarea id="story-content" class="textarea" data-field="story" style="min-height: 170px;">${esc(state.story)}</textarea>
            <span class="field-hint">系统会优先使用五幕填写内容，再从原文中提取补充事实；不会把无法识别的信息自动编成事实。</span>
          </div>
          <div class="section-title" style="margin-top: 16px; margin-bottom: 0;">
            <div class="chip-row"><span class="chip">真实细节优先</span><span class="chip">五幕结构</span><span class="chip">可人工调整</span></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <a class="button ghost" href="./public/story-intake.html" target="_blank" rel="noreferrer">打开故事采集卡</a>
              <button class="button ghost" data-action="copy-story-card">${icon("copy")}复制故事采集卡</button>
              <button class="button secondary" data-action="build-treatment">${icon("sparkle")}本地快速大纲</button>
              <button class="button primary" data-action="generate-story-ai">${icon("sparkle")}AI 故事与分镜</button>
            </div>
          </div>
        </section>

        <div class="stack">
          <section class="card card-pad">
            <div class="section-title">
              <div><h2>AI 故事大纲</h2><p>${esc(coupleName())}</p></div>
              <span class="badge green">可编辑底稿</span>
            </div>
            <p class="small" style="line-height:1.8; color: var(--ink-soft); margin-top:0;">${esc(treatment.logline)}</p>
            <div class="treatment-list">
              ${treatment.acts
                .map(
                  (act, index) => `
                  <article class="act-card">
                    <div class="act-index">${index + 1}</div>
                    <div><small>${esc(act.era)} · ${esc(act.label)}</small><h4>${esc(act.title)}</h4><p>${esc(act.summary)}</p></div>
                  </article>`
                )
                .join("")}
            </div>
          </section>
          <section class="card card-pad">
            <div class="section-title"><div><h3>视觉语言</h3><p>给美术、分镜和提示词一个共同标准</p></div></div>
            <p class="small" style="line-height:1.8; color:var(--ink-soft); margin:0;">${esc(treatment.visualLanguage)}</p>
            <div class="divider"></div>
            <div class="tag-cloud">
              <span class="tag">朱砂红</span><span class="tag">鎏金</span><span class="tag">暖烛光</span><span class="tag">浅景深</span><span class="tag">克制表演</span><span class="tag">同一对手</span><span class="tag">牵手闭环</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  `;
}

function characterInput(gender, title, role, symbol) {
  const photo = state.photos[gender];
  const name = gender === "groom" ? state.groom : state.bride;
  return `
    <article class="character-card card ${activeFocus && activeFocus !== gender ? "muted" : ""}">
      <div class="character-photo" data-dropzone="${gender}">
        ${
          photo
            ? `<img src="${photo}" alt="${esc(name)}的${title}照片" />
               <div class="photo-toolbar">
                 <button class="photo-tool" data-action="open-upload" data-gender="${gender}" title="替换照片">${icon("replace")}</button>
                 <button class="photo-tool" data-action="remove-photo" data-gender="${gender}" title="移除照片">${icon("trash")}</button>
               </div>`
            : `<label class="upload-target" for="photo-${gender}">
                ${icon("upload")}
                <strong>上传${title}照片</strong>
                <small>正面、清晰、无遮挡 · JPG / PNG / WEBP</small>
              </label>`
        }
        <input id="photo-${gender}" class="visually-hidden" hidden type="file" accept="image/png,image/jpeg,image/webp" data-photo-input="${gender}" />
      </div>
      <div class="character-info">
        <div class="character-title">
          <div><h3>${esc(name)}</h3><p>${role} · ${gender === "groom" ? "中式新郎 / 现代礼服" : "凤冠霞帔 / 现代婚纱"}</p></div>
          <span class="badge ${photo ? "green" : "gray"}">${photo ? "身份参考已就绪" : "等待照片"}</span>
        </div>
        <div class="field">
          <label for="character-name-${gender}">人物姓名</label>
          <input id="character-name-${gender}" class="input" data-field="${gender}" value="${esc(name)}" />
        </div>
        <div class="face-checks">
          <div class="face-check"><span></span>脸型与五官</div>
          <div class="face-check"><span></span>发型连续性</div>
          <div class="face-check"><span></span>服装统一</div>
          <div class="face-check"><span></span>手部结构</div>
        </div>
      </div>
    </article>
  `;
}

function charactersPage() {
  return `
    <div class="page">
      ${pageHeader("characters")}
      ${progressStrip(1)}
      <div class="notice red" style="margin-bottom:18px;">
        ${icon("shield")}
        <div><strong>人物素材存放在本地项目目录</strong>只能用于当前用户明确触发的造型和镜头生成；服务端不会把路径或照片写进公开日志。</div>
      </div>
      <div class="character-grid">
        ${characterInput("groom", "男主角", "新郎", "郎")}
        ${characterInput("bride", "女主角", "新娘", "娘")}
      </div>
      <div class="divider"></div>
      <section class="card card-pad">
        <div class="section-title">
          <div><h2>三种时代，三套造型</h2><p>先统一人物，再变化服装，避免每个镜头看起来换了演员</p></div>
          <button class="button secondary small-button" data-route="looks">查看造型与一致性</button>
        </div>
        <div class="look-strip">
          <button class="look-card" data-action="open-upload" data-gender="groom" data-symbol="古"><strong>古代婚服</strong><small>朱红礼服 · 金色纹样</small></button>
          <button class="look-card" data-action="open-upload" data-gender="groom" data-symbol="民"><strong>民国青年</strong><small>长衫 / 西服 · 克制书卷气</small></button>
          <button class="look-card" data-action="open-upload" data-gender="groom" data-symbol="今"><strong>现代礼服</strong><small>黑色塔士多 · 自然松弛</small></button>
          <button class="look-card" data-action="open-upload" data-gender="bride" data-symbol="囍"><strong>今生婚服</strong><small>凤冠霞帔 · 红妆金饰</small></button>
        </div>
      </section>
    </div>
  `;
}

function looksPage() {
  const focus = activeFocus || "groom";
  const name = focus === "groom" ? state.groom : state.bride;
  const lookGender = focus === "groom" ? "male" : "female";
  return `
    <div class="page">
      ${pageHeader("looks", `${name}的造型与身份一致性工作区。先在每个时代建立一张标准参考，再把同一组文字特征带入所有镜头。`)}
      <div class="two-column">
        <section class="card card-pad">
          <div class="section-title">
            <div><h2>${focus === "groom" ? "男主角" : "女主角"}身份锚点</h2><p>照片、脸型、发型与服装描述需要同时固定</p></div>
            <span class="badge ${state.photos[focus] ? "green" : "gray"}">${state.photos[focus] ? "已上传" : "未上传"}</span>
          </div>
          <div class="character-grid">
            ${characterInput(focus, focus === "groom" ? "男主角" : "女主角", focus === "groom" ? "新郎" : "新娘")}
            <div class="card card-pad" style="box-shadow:none;">
              <div class="empty-state" style="min-height:100%;padding:20px;">
                <div>
                  <div class="empty-state-symbol">容</div>
                  <h3>一致性检查</h3>
                  <p>生成人物图后，逐项检查脸型、眉眼、鼻唇、发际线、手部与服装。任何一项偏离，先修参考图，不进入视频生成。</p>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section class="card card-pad">
          <div class="section-title"><div><h2>标准造型说明</h2><p>可直接复核的基础锚点</p></div></div>
          <div class="prompt-block">
            <label>身份描述</label>
            <p>${esc(name)}，${focus === "groom" ? "面部轮廓清晰，眉眼温和，肩背自然挺拔" : "东方柔和骨相，眼神清亮，端庄而松弛"}。三套服装变化时，脸型、五官比例与发际线保持完全一致。</p>
          </div>
          <div class="prompt-block">
            <label>古代造型</label>
            <p>${focus === "groom" ? "朱红中式婚服，金色云纹，束发玉冠，礼仪坐姿" : "凤冠霞帔，正红嫁衣，金色刺绣，红唇淡妆"}</p>
          </div>
          <div class="prompt-block">
            <label>民国造型</label>
            <p>${focus === "groom" ? "深色长衫或合体西服，克制书卷气，自然短发" : "浅蓝或月白民国学生装，双麻花辫，素净妆容"}</p>
          </div>
          <div class="prompt-block">
            <label>今生造型</label>
            <p>${focus === "groom" ? "黑色塔士多礼服，白衬衫，自然松弛" : "现代简约婚纱，低盘发，珍珠耳饰，清透妆面"}</p>
          </div>
          <button class="button secondary" style="width:100%;margin-top:14px;" data-action="copy-look" data-focus="${focus}">${icon("copy")}复制整套人物锚点</button>
        </section>
      </div>
      <section class="card card-pad" style="margin-top:18px;">
        <div class="section-title"><div><h2>三生三世婚服与场景参考</h2><p>这些是现有参考片抽帧和免费生成的实际图片，只用于风格选择；客户真人身份必须上传本人照片</p></div><span class="badge gold">真实图片参考</span></div>
        <div class="wedding-reference-grid">
          ${[
            [WEDDING_REFERENCE_IMAGES.ancientBride, "古代新娘婚服", "凤冠、霞帔、红金刺绣与端庄坐姿"],
            [WEDDING_REFERENCE_IMAGES.ancientCouple, "古代双人构图", "庭院、亲属站位和牵手动作参考"],
            [WEDDING_REFERENCE_IMAGES.republicCouple, "民国情侣造型", "学生装、旗袍、雨巷和书卷气质"],
            [WEDDING_REFERENCE_IMAGES.modernCouple, "今生婚礼造型", "现代婚纱、礼服和真实婚礼现场"],
            [WEDDING_REFERENCE_IMAGES.ancientHall, "古代婚堂空间", "红柱、灯笼、烛光与对称构图"],
            [WEDDING_REFERENCE_IMAGES.ancientLantern, "古代夜景灯笼", "夜景侧光、灯笼道具与双人空间关系"]
          ].map(([image, title, description]) => `<article class="asset-card card wedding-reference-card"><div class="asset-preview"><img src="${esc(image)}" alt="${esc(title)}" /></div><div class="asset-info"><strong>${esc(title)}</strong><small>${esc(description)}</small><button class="button ghost small-button" data-route="assets" style="margin-top:10px;">上传本单替换参考</button></div></article>`).join("")}
        </div>
      </section>
      <section class="card card-pad" style="margin-top:18px;">
        <div class="section-title">
          <div><h2>${focus === "groom" ? "男主角" : "女主角"}造型库</h2><p>真实图片可上传，也可以直接用 Seedream 生成多种样式</p></div>
          <span class="badge gold">${runtime.looks.filter((item) => item.gender === lookGender).length} 套样式</span>
        </div>
        <div class="asset-grid">
          ${runtime.looks
            .filter((look) => look.gender === lookGender)
            .map(
              (look) => {
                const visual = weddingLookReference(look);
                return `
              <article class="asset-card card">
                <div class="asset-preview">
                  <img src="${esc(visual.src)}" alt="${esc(look.title)}" />
                </div>
                <div class="asset-info">
                  <strong>${esc(look.title)}</strong>
                  <small>${esc(look.era)} · ${esc(look.description)}</small>
                  <div class="chip-row" style="margin-top:9px;">
                    <span class="badge ${visual.source === "generated" ? "green" : "gold"}">${visual.source === "generated" ? "已生成" : "参考片风格图"}</span>
                  </div>
                  <div style="display:flex;gap:6px;margin-top:10px;">
                    <button class="button ${state.selectedLooks?.[focus] === look.id ? "primary" : "secondary"} small-button" data-action="select-look" data-look-id="${look.id}" data-focus="${focus}">${state.selectedLooks?.[focus] === look.id ? "已选用" : "选用此项"}</button>
                    <button class="button secondary small-button" data-action="generate-look" data-look-id="${look.id}">${icon("sparkle")}Seedream</button>
                    <button class="button ghost small-button" data-action="generate-look" data-look-id="${look.id}" data-model-id="model-image-pollinations">FLUX 免费</button>
                  </div>
                </div>
              </article>`;
              }
            )
            .join("")}
        </div>
      </section>
    </div>
  `;
}

function scenesPage() {
  const scenes = [
    ["scene-a", "古代 · 东方庭院", "晨雾、廊桥、红绸、木格窗，建立前世宿命感。", WEDDING_REFERENCE_IMAGES.ancientCouple],
    ["scene-b", "民国 · 长街旧巷", "暖褐街灯、石板路、细雨，承担时间转场。", WEDDING_REFERENCE_IMAGES.republicStreet],
    ["scene-c", "今生 · 婚礼正厅", "红烛、金色灯影、亲友席位，落到真实婚礼。", WEDDING_REFERENCE_IMAGES.modernCouple]
  ];
  return `
    <div class="page">
      ${pageHeader("scenes")}
      ${progressStrip(2)}
      <section class="card card-pad">
        <div class="section-title">
          <div><h2>三套场景，一条视觉逻辑</h2><p>每个时代只承担一个叙事任务，不堆砌无关元素</p></div>
          <span class="badge gold">同一对手 · 三次牵手</span>
        </div>
        <div class="scene-grid">
          ${scenes
            .map(
              ([className, title, description, image]) => `
              <button class="scene-card ${className}" data-action="select-scene" data-scene="${esc(title)}" style="background-image:linear-gradient(180deg,rgba(25,8,9,.08),rgba(25,8,9,.82)),url('${esc(image)}');background-size:cover;background-position:center;">
                <div class="scene-card-content"><small>SCENE DESIGN</small><strong>${title}</strong><p>${description}</p></div>
              </button>`
            )
            .join("")}
        </div>
      </section>
      <div class="content-grid" style="margin-top:18px;">
        <section class="card card-pad">
          <div class="section-title"><div><h2>场景连续性规则</h2><p>三个时代可以有不同美术，但不能让观众认不出人物</p></div></div>
          <div class="checklist">
            <div class="check-item"><span class="check-icon">1</span><div class="check-copy"><strong>固定人物动作锚点</strong><small>每次牵手的手势方向、镜头轴线保持一致。</small></div></div>
            <div class="check-item"><span class="check-icon">2</span><div class="check-copy"><strong>固定主光方向</strong><small>三个时代都以暖侧光塑造面部，转入今生后再增强红烛环境光。</small></div></div>
            <div class="check-item"><span class="check-icon">3</span><div class="check-copy"><strong>每套场景只保留一个识别物</strong><small>古代灯笼、民国长街灯、今生红绸花门，形成匹配剪辑。</small></div></div>
          </div>
        </section>
        <section class="card card-pad">
          <div class="section-title"><div><h2>场景提示词</h2><p>当前选择：${esc(state.theme)}</p></div></div>
          <div class="prompt-block">
            <label>统一美术风格</label>
            <p>东方电影质感，真实材质，朱红与鎏金点缀，克制雾感，高动态范围，避免塑料皮肤与过度磨皮。人物始终是画面主体。</p>
          </div>
          <div class="tag-cloud" style="margin-top:12px;"><span class="tag">电影级构图</span><span class="tag">真实材质</span><span class="tag">暖侧光</span><span class="tag">低饱和背景</span><span class="tag">不过度磨皮</span></div>
        </section>
      </div>
    </div>
  `;
}

function storyboardPage() {
  const totalFrames = storyboard.reduce(
    (sum, shot) => sum + Math.round(shot.duration * 24),
    0
  );
  return `
    <div class="page">
      ${pageHeader("storyboard")}
      ${progressStrip(2)}
      <section class="card card-pad">
        <div class="storyboard-toolbar">
          <div>
            <h2 style="margin:0;font-family:var(--serif);font-size:21px;">${esc(coupleName())} · ${state.duration} 秒分镜</h2>
            <p class="small muted" style="margin:5px 0 0;">按动作与叙事切镜，单镜建议 2–5 秒，先生成分镜图再进入视频。</p>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <div class="frame-readout"><div><strong>${totalFrames.toLocaleString("zh-CN")}</strong><small>总画格 · 24 FPS</small></div></div>
            <button class="button secondary small-button" data-action="build-storyboard">${icon("sparkle")}重新推导</button>
            <button class="button primary small-button" data-route="prompts">进入提示词工坊</button>
          </div>
        </div>
        <div class="table-scroll">
          <table class="storyboard-table">
            <thead><tr><th style="width:48px;">镜号</th><th style="width:26%;">镜头 / 场景</th><th style="width:12%;">时间</th><th style="width:10%;">景别</th><th style="width:11%;">运镜</th><th>画面与动作</th><th style="width:88px;">状态</th></tr></thead>
            <tbody>
              ${storyboard
                .map(
                  (shot) => `
                  <tr>
                    <td><span class="shot-number">${String(shot.number).padStart(2, "0")}</span></td>
                    <td><button class="shot-title" data-edit-shot="${shot.id}">${esc(shot.title)}</button><span class="shot-scene">${esc(shot.scene)}</span></td>
                    <td><span class="small muted">${shot.start.toFixed(1)}–${shot.end.toFixed(1)}s</span><br /><span class="small">${Math.round(shot.duration * 24)} 帧</span></td>
                    <td><span class="small">${esc(shot.shot)}</span></td>
                    <td><span class="small">${esc(shot.move)}</span></td>
                    <td><div class="prompt-preview">${esc(shot.prompt)}</div></td>
                    <td>
                      <select class="status-select" data-shot-status="${shot.id}" aria-label="镜头状态">
                        ${["待生成", "询价中", "已确认", "已生成", "需修正"]
                          .map((status) => `<option ${shot.status === status ? "selected" : ""}>${status}</option>`)
                          .join("")}
                      </select>
                    </td>
                  </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
        <div class="notice" style="margin-top:16px;">${icon("shield")}<div><strong>总帧数校验</strong>当前分镜合计 ${totalFrames} 帧；${state.duration} 秒 × 24 帧 = ${state.duration * 24} 帧。剪辑时按实际帧边界对齐，避免音画漂移。</div></div>
      </section>
    </div>
  `;
}

function promptsPage() {
  const first = storyboard[0];
  return `
    <div class="page">
      ${pageHeader("prompts")}
      ${progressStrip(2)}
      <section class="card card-pad" style="margin-bottom:18px;">
        <div class="section-title"><div><h2>图片提示词模板库</h2><p>可复制、可套用到第 7、8 步和图片生成中心</p></div><span class="badge gold">角色设定模板</span></div>
        ${characterSheetTemplateBlock()}
      </section>
      <div class="prompt-grid">
        <section class="prompt-card card">
          <div class="prompt-card-head"><h3>人物身份提示词</h3><button class="text-button" data-action="copy-identity">复制全部</button></div>
          <div class="prompt-card-body">
            <div class="prompt-block">
              <label>男主角 · ${esc(state.groom)}</label>
              <p>${esc(state.groom)}，成年东方男性，五官自然，眉眼温和，面部轮廓清晰，肩背自然挺拔。参考上传照片保持脸型、五官比例、发际线一致，真实皮肤质感，不做过度磨皮。</p>
              <button class="copy-corner" data-copy="groom-prompt">复制</button>
            </div>
            <div class="prompt-block">
              <label>女主角 · ${esc(state.bride)}</label>
              <p>${esc(state.bride)}，成年东方女性，柔和骨相，眼神清亮，端庄而松弛。参考上传照片保持脸型、五官比例、发际线一致，妆容自然，真实肤质，不做网红脸。</p>
              <button class="copy-corner" data-copy="bride-prompt">复制</button>
            </div>
            <div class="prompt-block">
              <label>全片连续性锁</label>
              <p>同一对手跨越古代、民国与今生。三套造型变化时，人物脸型、五官比例、发际线与手部特征保持一致；牵手动作作为跨时代匹配点。</p>
              <button class="copy-corner" data-copy="continuity-prompt">复制</button>
            </div>
          </div>
        </section>
        <section class="prompt-card card">
          <div class="prompt-card-head"><h3>镜头提示词 · 第 01 镜</h3><button class="text-button" data-action="copy-shot" data-shot-id="${first.id}">复制本镜</button></div>
          <div class="prompt-card-body">
            <div class="prompt-block">
              <label>画面生成提示词</label>
              <p>${esc(first.prompt)}</p>
            </div>
            <div class="prompt-block">
              <label>视频动作提示词</label>
              <p>镜头从庭院全景缓慢推进，红绸被风轻轻吹动，男主角从画面右侧进入并停步等候；动作在第 3 秒结束，女主角在画外传来脚步，镜头保持轴线稳定。</p>
            </div>
            <div class="prompt-block">
              <label>负面约束</label>
              <p>不得改变人物脸型，不得出现多余手指、肢体粘连、服装跳变、文字乱码；避免过度磨皮、塑料皮肤、夸张表情与快切。</p>
            </div>
            <div class="tag-cloud"><span class="tag">${first.duration} 秒</span><span class="tag">${Math.round(first.duration * 24)} 帧</span><span class="tag">${esc(first.shot)}</span><span class="tag">${esc(first.move)}</span></div>
          </div>
        </section>
      </div>
      <section class="card card-pad" style="margin-top:18px;">
        <div class="section-title"><div><h2>完整分镜提示词</h2><p>每镜独立修改，生成前逐条复核</p></div><button class="button primary small-button" data-action="export-task-manifest">${icon("copy")}导出生成清单</button></div>
        <div class="generation-list">
          ${storyboard
            .map(
              (shot) => `
              <div class="generation-row">
                <div class="shot-number">${String(shot.number).padStart(2, "0")}</div>
                <div class="generation-copy"><strong>${esc(shot.title)}</strong><small>${esc(shot.scene)} · ${esc(shot.shot)}</small></div>
                <span class="generation-meta">${shot.duration}s</span>
                <span class="generation-meta">${Math.round(shot.duration * 24)} 帧</span>
                <button class="button ghost small-button" data-action="copy-shot" data-shot-id="${shot.id}">复制提示词</button>
              </div>`
            )
            .join("")}
        </div>
      </section>
    </div>
  `;
}

function generatePage() {
  const imageModel = defaultModel("image");
  const videoModel = defaultModel("video");
  const videoFast = familyModels("video").find((model) => model.model.includes("fast"));
  const project = runtime.projects.find((item) => item.id === currentProjectId);
  const template = runtime.templates.find((item) => item.id === project?.templateId);
  const imageCount = runtime.assets.filter((asset) => ["image", "look-image"].includes(asset.kind)).length;
  const videoCount = runtime.assets.filter((asset) => asset.kind === "video").length;
  return `
    <div class="page">
      ${pageHeader("generate")}
      ${progressStrip(3)}
      <div class="generate-hero">
        <section class="model-gate card">
          <p class="eyebrow" style="color:#e8c78f;">UNIFIED MODEL PRODUCTION</p>
          <h2>文字、图片、视频统一生产</h2>
          <p>所有调用经过本地服务与统一任务中心。图片使用 ${esc(imageModel?.label || "未配置")}，视频使用 ${esc(videoModel?.label || "未配置")}。提交成功后自动归档到资产库，状态未知时只查询原任务。</p>
          <div class="safety-steps">
            <div class="safety-step"><span>${imageCount}</span><strong>图片资产</strong><small>已归档图片</small></div>
            <div class="safety-step"><span>${videoCount}</span><strong>视频镜头</strong><small>已归档视频</small></div>
            <div class="safety-step"><span>${runtime.models.filter((model) => model.status === "ready").length}</span><strong>可用模型</strong><small>模型中心实时状态</small></div>
            <div class="safety-step"><span>24</span><strong>FPS</strong><small>项目剪辑帧率</small></div>
          </div>
        </section>
        <section class="quote-card card">
          <div><p class="eyebrow">MODEL HEALTH</p><h3>${runtime.online ? "本地服务在线" : "等待启动本地服务"}</h3><p class="small muted" style="line-height:1.65;">${runtime.health?.arkAuth?.loggedIn ? "火山方舟登录有效，可直接提交生成任务。" : "请先在模型中心完成账号登录或模型配置。"}</p></div>
          <div class="quote-placeholder"><div><strong>${imageCount + videoCount}</strong><p>已生成媒体资产</p></div></div>
          <button class="button primary" data-route="models">${icon("sparkle")}进入模型中心</button>
        </section>
      </div>
      <div class="content-grid">
        <section class="card card-pad">
          <div class="section-title"><div><h2>生成图片</h2><p>人物定妆、服装、场景或首帧</p></div><span class="badge gold">${esc(imageModel?.model || "未配置")}</span></div>
          <div class="field"><label>图片提示词</label><textarea class="textarea" data-image-prompt style="min-height:125px;">电影级婚礼人物定妆图，成年东方男女，朱红中式婚服与凤冠霞帔，真实皮肤与织物纹理，干净中性背景，全身正面，不出现文字和水印。</textarea></div>
          ${characterSheetTemplateBlock("[data-image-prompt]")}
          <button class="button primary" style="width:100%;margin-top:12px;" data-action="generate-image-direct">${icon("sparkle")}使用 ${esc(imageModel?.label || "默认图片模型")} 生成</button>
        </section>
        <section class="card card-pad">
          <div class="section-title"><div><h2>生成视频镜头</h2><p>文生视频或图生视频，异步自动追踪</p></div><span class="badge green">${esc(videoFast?.label || videoModel?.label || "未配置")}</span></div>
          <div class="field"><label>视频动作提示词</label><textarea class="textarea" data-video-prompt style="min-height:125px;">镜头从中式婚礼庭院全景缓慢推进，新郎与新娘在红绸灯笼下相视而笑，女子抬手，男子轻轻牵住；动作自然缓慢，电影级暖侧光，人物身份和服装保持连续。</textarea></div>
          <button class="button primary" style="width:100%;margin-top:12px;" data-action="generate-video-direct">${icon("play")}提交视频生成任务</button>
          <button class="button secondary" style="width:100%;margin-top:8px;" data-action="generate-template-shot" ${template ? "" : "disabled"}>${icon("sparkle")}${template ? `按模板「${esc(template.title.slice(0, 16))}」生成人物替换镜头` : "先在模板库应用一个模板"}</button>
        </section>
      </div>
      <section class="card card-pad" style="margin-top:18px;">
        <div class="section-title"><div><h2>最近生成任务</h2><p>任务结果会自动进入资产库</p></div><button class="text-button" data-route="jobs">查看全部任务 →</button></div>
        ${
          runtime.jobs.length
            ? `<div class="generation-list">${runtime.jobs.slice(0, 8).map(renderJobRow).join("")}</div>`
            : `<div class="empty-state" style="min-height:180px;"><div><div class="empty-state-symbol">生</div><h3>还没有生成任务</h3><p>先上传人物照片和选择造型，再提交图片或视频任务。</p></div></div>`
        }
      </section>
    </div>
  `;
}

function jobsPage() {
  return `
    <div class="page">
      ${pageHeader("jobs")}
      <section class="card card-pad">
        <div class="section-title"><div><h2>全部任务</h2><p>${runtime.jobs.length} 条记录 · 持久化保存在本机数据库</p></div><button class="button secondary small-button" data-action="refresh-runtime">刷新状态</button></div>
        ${
          runtime.jobs.length
            ? `<div class="generation-list">${runtime.jobs.map(renderJobRow).join("")}</div>`
            : `<div class="empty-state"><div><div class="empty-state-symbol">生</div><h3>还没有生成任务</h3><p>模板分析、图片和视频任务会自动显示在这里。</p><button class="button primary" style="margin-top:16px;" data-route="generate">进入生成中心</button></div></div>`
        }
      </section>
      <section class="card card-pad" style="margin-top:18px;">
        <div class="section-title"><div><h2>任务状态规则</h2><p>可追溯优先于“看起来完成”</p></div></div>
        <div class="checklist">
          <div class="check-item"><span class="check-icon">1</span><div class="check-copy"><strong>提交前持久化</strong><small>创建任务后再调用模型，页面关闭后仍可查询。</small></div></div>
          <div class="check-item"><span class="check-icon">2</span><div class="check-copy"><strong>未知状态只查询原 ID</strong><small>连接中断、超时或响应异常，不创建第二份视频任务。</small></div></div>
          <div class="check-item"><span class="check-icon">3</span><div class="check-copy"><strong>下载后验证</strong><small>检查文件可播放性、分辨率、时长与镜头号，再计入资产库。</small></div></div>
        </div>
      </section>
    </div>
  `;
}

function renderJobRow(job) {
  const statusClass =
    job.status === "succeeded"
      ? "green"
      : ["failed", "unknown", "cancelled"].includes(job.status)
        ? "red"
        : "gold";
  return `
    <div class="generation-row">
      <div class="generation-thumb"></div>
      <div class="generation-copy">
        <strong>${esc(jobLabel(job.kind))}</strong>
        <small>${esc(job.modelId || job.providerTaskId || job.id)} · ${esc(job.error || "")}</small>
      </div>
      <span class="generation-meta">${job.progress || 0}%</span>
      <span class="badge ${statusClass}">${esc(job.status)}</span>
      <button class="button ghost small-button" data-action="refresh-job" data-job-id="${job.id}">查询</button>
    </div>
  `;
}

function jobLabel(kind) {
  const labels = {
    "template-import": "模板链接导入",
    "template-analysis": "模板镜头解析",
    "template-ai-analysis": "模板 AI 分析",
    "look-image": "人物造型图片",
    "text-generation": "文字与分镜生成",
    "image-generation": "图片生成",
    "video-generation": "视频镜头生成",
    render: "成片剪辑"
  };
  return labels[kind] || kind;
}

function editPage() {
  return `
    <div class="page">
      ${pageHeader("edit")}
      ${progressStrip(4)}
      <div class="two-column">
        <section class="card card-pad">
          <div class="section-title">
            <div><h2>${state.duration} 秒时间线</h2><p>24 FPS · ${framePlan().totalFrames} 帧 · ${esc(state.aspect)}</p></div>
            <span class="badge gold">剪辑预览</span>
          </div>
          <div class="timeline">
            <div class="timeline-ruler">${Array.from({ length: 8 }, (_, index) => `<span>${Math.round((state.duration / 8) * index)}s</span>`).join("")}</div>
            <div class="timeline-track">
              <span class="timeline-track-label">视频 V1</span>
              <div class="clip">开场</div><div class="clip">前世相逢</div><div class="clip">今生誓言</div><div class="clip">姓名落版</div>
            </div>
            <div class="timeline-track">
              <span class="timeline-track-label">字幕 S1</span>
              <div class="clip" style="background:#6e4c3f;">从第一眼，到这一生</div>
            </div>
            <div class="timeline-track">
              <span class="timeline-track-label">音乐 A1</span>
              <div class="audio-clip"></div>
            </div>
          </div>
          <div class="timeline" style="margin-top:15px;">
            <div class="timeline-ruler">${Array.from({ length: 8 }, (_, index) => `<span>${Math.round((state.duration / 8) * index)}s</span>`).join("")}</div>
            <div class="timeline-track" style="padding-top:21px;padding-bottom:17px;">
              <span class="timeline-track-label">逐帧视图 · 24 FPS</span>
              ${Array.from({ length: 20 }, (_, index) => `<div style="flex:1;height:28px;border-radius:3px;background:rgba(${90 + index * 4},${22 + index},${24 + index},0.84);"></div>`).join("")}
            </div>
          </div>
        </section>
        <div class="stack">
          <section class="card card-pad">
            <div class="section-title"><div><h3>剪辑检查</h3><p>成片是否能看懂，比转场是否花哨重要</p></div></div>
            <div class="checklist">
              <div class="check-item"><span class="check-icon pending">1</span><div class="check-copy"><strong>动作接动作</strong><small>检查牵手方向与人物轴线是否一致。</small></div></div>
              <div class="check-item"><span class="check-icon pending">2</span><div class="check-copy"><strong>音乐有落点</strong><small>誓言镜头落在音乐抬升点，片尾留 1–2 秒呼吸。</small></div></div>
              <div class="check-item"><span class="check-icon pending">3</span><div class="check-copy"><strong>字幕不抢脸</strong><small>人物面部区域留空，字幕避开画面底部安全区。</small></div></div>
            </div>
          </section>
          <section class="card card-pad">
            <div class="section-title"><div><h3>下一步</h3><p>${esc(state.projectName)}</p></div></div>
            <button class="button secondary" style="width:100%;" data-route="audio">进入字幕与配乐</button>
          </section>
        </div>
      </div>
    </div>
  `;
}

function audioPage() {
  return `
    <div class="page">
      ${pageHeader("audio")}
      <div class="content-grid">
        <section class="card card-pad">
          <div class="section-title"><div><h2>字幕与旁白</h2><p>文案可以本地生成旁白，再进入 FFmpeg 混音</p></div></div>
          <div class="field"><label>片名字幕</label><input class="input" value="${esc(state.groom)} & ${esc(state.bride)}" /></div>
          <div class="field" style="margin-top:12px;"><label>旁白 / 誓言语录</label><textarea class="textarea" data-speech-text style="min-height:100px;">从第一眼，到这一生。谢谢你，成为我故事里最重要的人。</textarea></div>
          <div class="field" style="margin-top:12px;"><label>片尾字幕</label><input class="input" value="${formatDate(state.date)} · ${esc(state.city)}" /></div>
          <button class="button primary" style="width:100%;margin-top:12px;" data-action="generate-speech">${icon("play")}生成中文旁白</button>
          <button class="button secondary" style="width:100%;margin-top:8px;" data-action="generate-subtitles">${icon("copy")}生成 SRT 字幕</button>
          <audio data-audio-preview controls hidden style="width:100%;margin-top:12px;"></audio>
          <div class="divider"></div>
          <div class="section-title"><div><h3>字幕安全区</h3><p>底部保留约 12% 空间，人物眼部以上不放字幕</p></div><span class="badge green">已开启</span></div>
        </section>
        <section class="card card-pad">
          <div class="section-title"><div><h2>配乐方向</h2><p>只使用有授权来源的音乐</p></div></div>
          <div class="choice-grid" style="grid-template-columns:1fr;">
            <button class="choice-card active" data-action="music-choice"><span class="choice-symbol">弦</span><h4>东方弦乐 + 轻钢琴</h4><p>开场克制，誓言段落进入弦乐抬升，片尾留出呼吸。</p></button>
            <button class="choice-card" data-action="music-choice"><span class="choice-symbol">琴</span><h4>温暖钢琴独奏</h4><p>适合照片较多、文字较多的真实故事片。</p></button>
          </div>
          <button class="button primary" style="width:100%;margin-top:14px;" data-action="generate-music">${icon("sparkle")}生成 ${state.duration} 秒原创配乐</button>
          <div class="notice" style="margin-top:14px;">${icon("shield")}<div><strong>原创本地配乐</strong>囍映原创配乐由本地程序生成，可随项目保存；上传第三方音乐时请自行确认授权范围。</div></div>
        </section>
      </div>
    </div>
  `;
}

function exportPage() {
  const videos = runtime.assets.filter((asset) => asset.kind === "video" && asset.localPath);
  const photos = runtime.assets.filter(
    (asset) => asset.kind === "project-photo" && asset.localPath
  );
  const exports = runtime.assets.filter((asset) => asset.kind === "export" && asset.url);
  return `
    <div class="page">
      ${pageHeader("export")}
      <div class="two-column">
        <section class="export-card card">
          <p class="eyebrow" style="color:#e7c48d;">READY FOR SCREENING</p>
          <h2>${esc(state.projectName)}</h2>
          <p>${esc(coupleName())} · ${formatDate(state.date)} · ${state.duration} 秒价值故事。导出前请再次检查人物脸部、手部、字幕拼写与音乐授权。</p>
          <div class="format-row">
            <span class="format-pill">婚宴横屏 · 16:9 / 4K</span>
            <span class="format-pill">手机分享 · 9:16 / 1080P</span>
            <span class="format-pill">留存母版 · ProRes</span>
          </div>
          <button class="button gold" style="margin-top:22px;" data-action="render-project">${icon("arrow")}FFmpeg 合成并导出</button>
        </section>
        <section class="card card-pad">
          <div class="section-title"><div><h2>当前时间轴素材</h2><p>${videos.length} 段视频 · ${photos.length} 张照片；成片只使用当前已批准镜头</p></div></div>
          <label class="upload-target" for="photo-movie-files" style="min-height:96px;margin-bottom:14px;">
            ${icon("upload")}
            <strong>添加婚纱照 / 婚礼照片</strong>
            <small>上传的照片必须先绑定分镜并通过人工质检，不能绕过镜头时间轴</small>
          </label>
          <input id="photo-movie-files" type="file" accept="image/png,image/jpeg,image/webp" data-photo-movie-input multiple hidden />
          <div class="section-title"><div><h2>交付清单</h2><p>建议与成片一起归档</p></div></div>
          <div class="checklist">
            <div class="check-item"><span class="check-icon ${videos.length || photos.length ? "" : "pending"}">${videos.length || photos.length ? "✓" : "!"}</span><div class="check-copy"><strong>成片 MP4</strong><small>${videos.length + photos.length} 份媒体素材可进入合成</small></div></div>
            <div class="check-item"><span class="check-icon">2</span><div class="check-copy"><strong>封面图</strong><small>横版与竖版各一张</small></div></div>
            <div class="check-item"><span class="check-icon">3</span><div class="check-copy"><strong>字幕文件</strong><small>SRT / 可编辑文案</small></div></div>
            <div class="check-item"><span class="check-icon">4</span><div class="check-copy"><strong>资产与授权记录</strong><small>人物素材、音乐授权和模型任务记录</small></div></div>
          </div>
        </section>
      </div>
      ${
        exports.length
          ? `<section class="card card-pad" style="margin-top:18px;"><div class="section-title"><div><h2>最近导出</h2><p>由本地 FFmpeg 合成并完成技术检查</p></div></div><div class="asset-grid">${exports.slice(0, 6).map((asset) => `<article class="asset-card card"><div class="asset-preview"><video src="${esc(api.mediaUrl(asset.url))}" controls preload="metadata"></video></div><div class="asset-info"><strong>${esc(asset.title)}</strong><small>${Number(asset.media?.duration || 0).toFixed(1)} 秒 · MP4</small><small class="badge ${asset.technicalQc?.ok ? "green" : "red"}">${asset.technicalQc?.ok ? "技术检查通过" : "技术检查未通过"}</small></div></article>`).join("")}</div></section>`
          : ""
      }
    </div>
  `;
}

function assetsPage() {
  const assets = (runtime.assets || []).filter((asset) => asset.kind !== "template-source");
  const visuals = runtime.looks.filter((look) => look.imagePath);
  const categories = [
    {
      kind: "project-photo",
      title: "婚礼照片",
      hint: "婚纱照、生活照、现场照",
      accept: "image/*",
      required: true
    },
    {
      kind: "story-card",
      title: "故事采集卡",
      hint: "图片、PDF 或文字资料",
      accept: "image/*,.pdf,.txt,.doc,.docx",
      required: true
    },
    {
      kind: "outfit-reference",
      title: "服装参考",
      hint: "古装、民国装、现代婚服",
      accept: "image/*",
      required: false
    },
    {
      kind: "scene-reference",
      title: "场景参考",
      hint: "庭院、老街、婚礼现场",
      accept: "image/*",
      required: false
    },
    {
      kind: "video-clip",
      title: "视频镜头",
      hint: "生成视频、现场视频或参考片段",
      accept: "video/*",
      required: false
    },
    {
      kind: "music",
      title: "音乐素材",
      hint: "有授权的 BGM 或原创配乐",
      accept: "audio/*",
      required: false
    },
    {
      kind: "voice",
      title: "旁白录音",
      hint: "新人、主持或定制配音",
      accept: "audio/*",
      required: false
    }
  ];
  return `
    <div class="page">
      ${pageHeader("assets", "素材中心是生成和剪辑的唯一入口。每份照片、故事卡、服装、场景、视频、配音、音乐和字幕都先归档，再被后续镜头引用。")}
      <div class="notice red" style="margin-bottom:18px;">${icon("shield")}<div><strong>先素材，后生成</strong>缺失人物照片或故事资料时，不应直接进入分镜和视频生成。抖音参考视频只用于学习结构与节奏，不能把原片直接当成客户成片。</div></div>
      <section class="card card-pad">
        <div class="section-title">
          <div><h2>全局资产库</h2><p>${assets.length} 份任务资产 · ${visuals.length} 套已生成造型 · ${runtime.templates.length} 个模板</p></div>
          <button class="button secondary small-button" data-route="characters">${icon("plus")}添加人物照片</button>
        </div>
        <div class="asset-grid" style="margin-bottom:18px;">
          ${categories.map((category) => {
            const count = assets.filter((asset) => asset.kind === category.kind).length;
            return `
              <article class="asset-card card">
                <div class="asset-preview">${category.title.slice(0, 1)}</div>
                <div class="asset-info">
                  <strong>${category.title}</strong>
                  <small>${category.hint} · ${count} 份</small>
                  <label class="button secondary small-button" for="material-${category.kind}" style="margin-top:9px;width:100%;">${icon("upload")}上传素材</label>
                  <input id="material-${category.kind}" type="file" accept="${category.accept}" data-material-input="${category.kind}" multiple hidden />
                </div>
              </article>`;
          }).join("")}
        </div>
        <div class="section-title"><div><h2>已归档素材</h2><p>任务生成结果会自动进入这里</p></div></div>
        <div class="asset-grid">
          ${
            assets.length
              ? assets
                  .map(
                    (asset) => `
                    <article class="asset-card card">
                      <div class="asset-preview">
                        ${
                          asset.previewUrl
                            ? `<img src="${esc(api.mediaUrl(asset.previewUrl))}" alt="${esc(asset.title)}" />`
                            : ["image", "look-image", "photo", "project-photo", "story-card", "outfit-reference", "scene-reference"].includes(asset.kind) && asset.url
                              ? `<img src="${esc(api.mediaUrl(asset.url))}" alt="${esc(asset.title)}" />`
                            : asset.kind === "video" && asset.url
                              ? `<video src="${esc(api.mediaUrl(asset.url))}" muted preload="metadata"></video>`
                              : asset.kind === "music" || asset.kind === "voice"
                                ? "声"
                                : "资"
                        }
                      </div>
                      <div class="asset-info"><strong>${esc(asset.title || asset.kind)}</strong><small>${esc(asset.kind)} · ${asset.url ? "可预览" : "仅记录"}</small></div>
                    </article>`
                  )
                  .join("")
              : `<div class="empty-state" style="grid-column:1/-1;"><div><div class="empty-state-symbol">库</div><h3>资产库还是空的</h3><p>上传模板、生成人物造型或提交图片视频任务后，结果会自动归档到这里。</p></div></div>`
          }
        </div>
      </section>
    </div>
  `;
}

function methodPage() {
  const referenceTemplate = runtime.templates.find((template) => template.videoUrl) || null;
  return `
    <div class="page">
      ${pageHeader("method", "参考视频是一段 2 分 43 秒的屏幕教程。以下将其按“成片展示、方法说明、人物定妆、分镜、视频生成、剪辑”拆解为可执行的生产链。")}
      <div class="method-grid">
        <div class="stack">
          <section class="video-shell">
            ${
              referenceTemplate
                ? `<video controls preload="metadata" poster="${esc(api.mediaUrl(referenceTemplate.coverUrl))}"><source src="${esc(api.mediaUrl(referenceTemplate.videoUrl))}" type="video/mp4" /></video>`
                : `<div class="empty-state"><div><div class="empty-state-symbol">鉴</div><h3>还没有参考模板</h3><p>在模板库中上传视频或解析抖音链接后，可在这里预览和分析。</p></div></div>`
            }
            <div class="video-meta"><strong>${esc(referenceTemplate?.title || "等待导入参考模板")}</strong><small>${referenceTemplate ? `${Number(referenceTemplate.duration).toFixed(1)} 秒 · ${esc(referenceTemplate.aspect)} · ${referenceTemplate.recipe?.shots?.length || 0} 个候选镜头` : "上传模板后自动分析"}</small></div>
          </section>
          <div class="source-facts">
            <div class="source-fact"><strong>${referenceTemplate ? Math.round(referenceTemplate.duration * referenceTemplate.fps).toLocaleString("zh-CN") : "—"}</strong><small>原片总帧 / ${referenceTemplate?.fps || 30} FPS</small></div>
            <div class="source-fact"><strong>${referenceTemplate ? Math.round(referenceTemplate.duration * 24).toLocaleString("zh-CN") : "—"}</strong><small>分析帧数 / 24 FPS</small></div>
            <div class="source-fact"><strong>${referenceTemplate?.recipe?.shots?.length || "—"}</strong><small>候选镜头配方</small></div>
          </div>
          ${
            referenceTemplate?.contactSheetUrls?.length
              ? `<section class="card card-pad"><div class="section-title"><div><h2>逐帧视图</h2><p>每 5 秒取帧，一张联系表覆盖约 80 秒</p></div></div><div class="stack" style="gap:10px;">${referenceTemplate.contactSheetUrls.map((url, index) => `<img src="${esc(api.mediaUrl(url))}" alt="逐帧视图 ${index + 1}" style="width:100%;border-radius:10px;border:1px solid var(--line);" />`).join("")}</div></section>`
              : ""
          }
          <section class="card card-pad">
            <div class="section-title"><div><h2>原视频文案</h2><p>已从页面信息与画面字幕中提取</p></div><span class="badge gold">阿泽AI</span></div>
            <p class="small" style="line-height:1.8;color:var(--ink-soft);margin:0;">“AI 婚礼微电影，拿出 AI 婚礼微电影 skill 教程，只为让你学个明白。”<br />视频把整个过程压缩成：定创意、定人物、定场景、写分镜、生成、剪辑六步。</p>
            <div class="tag-cloud" style="margin-top:13px;"><span class="tag">#AI</span><span class="tag">#AI教程</span><span class="tag">#ai科技</span><span class="tag">#这个ai教程不烧心</span><span class="tag">#ai婚礼</span></div>
          </section>
        </div>
        <section class="card card-pad">
          <div class="section-title"><div><h2>按顺序拆成 6 步</h2><p>这是参考片真正可复用的方法，不是软件按钮清单</p></div></div>
          <div class="method-steps">
            ${SOURCE_METHOD.map(
              (step, index) => `
              <article class="method-step">
                <div class="method-step-index">${index + 1}</div>
                <div><h3>${step.title}</h3><p>${step.description}</p></div>
                <span class="video-time">${step.time}</span>
              </article>`
            ).join("")}
          </div>
        </section>
      </div>
      <section class="card card-pad timeline-analysis">
        <div class="section-title"><div><h2>时间线拆解</h2><p>按实际画面内容分段；每段都有明确作用和输出物</p></div><button class="button secondary small-button" data-action="copy-analysis">${icon("copy")}复制逐帧分析摘要</button></div>
        <div class="analysis-timeline">
          ${ANALYSIS_SEGMENTS.map(
            (segment) => `
            <div class="analysis-segment" style="--span:${segment.span};--segment-color:${segment.color};">
              <small>${segment.label}</small>
              <strong>${segment.title}</strong>
              <p>${segment.description}</p>
            </div>`
          ).join("")}
        </div>
        <div class="notice" style="margin-top:14px;">${icon("sparkle")}<div><strong>逐帧文件已生成</strong>24 FPS 重采样文件、关键帧联系表与时间码清单保存在工作区的 <code>output/douyin-wedding-ai</code> 目录，方便你继续核对每一帧。</div></div>
      </section>
      <section class="card card-pad timeline-analysis">
        <div class="section-title">
          <div><h2>提示词、音乐、字幕与人物替换专项结论</h2><p>基于 113 段 OCR 字幕、43 段口播、逐帧清单和最终回放音轨</p></div>
          <a class="button secondary small-button" href="./docs/抖音参考片专项分析.md" target="_blank">查看完整分析</a>
        </div>
        <div class="feature-grid">
          <article class="feature-card">
            <div class="feature-icon">词</div>
            <h4>提示词格式</h4>
            <p>素材映射 → 画幅时长 → 首帧 → 场景光线 → 站位视线 → 起始动作 → 过程 → 结束姿态 → 机位运镜 → 连续性 → 切点 → 声音 → 负向约束。</p>
          </article>
          <article class="feature-card">
            <div class="feature-icon">乐</div>
            <h4>音乐配置</h4>
            <p>约 01:58.8 进入 BGM，final 回放从第一格即有音乐；估算约 69 BPM。前段轻、6 秒后抬升、结尾淡出。</p>
          </article>
          <article class="feature-card">
            <div class="feature-icon">字</div>
            <h4>字幕与字体</h4>
            <p>成片抽样未见烧录字幕；教程平台字幕是粗体无衬线、白字配黄色强调。精确字体名无法从像素确认。项目默认微软雅黑 24pt、白字深描边。</p>
          </article>
          <article class="feature-card">
            <div class="feature-icon">换</div>
            <h4>真人替换</h4>
            <p>切 4–8 秒单镜 → 首帧定妆 → reference_video + 男女主 reference_image → 保持动作/机位/背景透视 → 逐镜检查脸和手。</p>
          </article>
        </div>
      </section>
    </div>
  `;
}

function guidePage() {
  const guides = [
    ["1", "准备真实素材", "输入男女主姓名、婚期和爱情故事。上传双方正面清晰照片，最好再各补一张侧面照。", ["不做虚构身份", "照片只在本机预览", "故事越具体越能写出细节"]],
    ["2", "共创故事与分镜", "选择一个叙事母题，生成五幕大纲，再检查每个时代是否围绕同一对人物展开。", ["先确认故事再生成画面", "单镜 2–5 秒", "所有镜头按 24 FPS 核对总画格"]],
    ["3", "生成与复核", "在模型中心选择文字、图片、视频、语音和音乐。人物、场景和镜头逐项生成并确认。", ["未知状态只查原任务", "失败任务不重复提交", "生成结果自动归档"]]
  ];
  return `
    <div class="page">
      ${pageHeader("guide", "这是本地服务的实际使用流程：项目、模板、模型、生成、后期和导出都通过同一套数据链路运行。")}
      <div class="notice red" style="margin-bottom:18px;">${icon("shield")}<div><strong>本地服务模式</strong>使用 <code>npm start</code> 启动服务后，可上传模板、解析抖音链接、调用统一模型、生成语音与配乐、合成并导出 MP4。</div></div>
      <div class="guide-grid">
        ${guides
          .map(
            ([number, title, description, items]) => `
            <article class="guide-card card">
              <div class="guide-number">${number}</div>
              <h3>${title}</h3>
              <p>${description}</p>
              <ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>
            </article>`
          )
          .join("")}
      </div>
      <section class="card card-pad" style="margin-top:18px;">
        <div class="section-title"><div><h2>建议的生产顺序</h2><p>不要跳过人物参考直接做视频</p></div></div>
        <div class="analysis-timeline">
          <div class="analysis-segment" style="--span:1;--segment-color:#8b1b21;"><small>第 1 阶段</small><strong>故事底稿</strong><p>用户确认主题、姓名、真实故事和时长。</p></div>
          <div class="analysis-segment" style="--span:1;--segment-color:#a83b30;"><small>第 2 阶段</small><strong>人物定妆</strong><p>先锁脸、发型和三套服装，再进入场景。</p></div>
          <div class="analysis-segment" style="--span:1;--segment-color:#8e6b39;"><small>第 3 阶段</small><strong>场景与分镜</strong><p>生成场景参考，同时确认镜头时长和动作。</p></div>
          <div class="analysis-segment" style="--span:1.4;--segment-color:#5f7257;"><small>第 4 阶段</small><strong>视频生成</strong><p>逐段询价、逐份确认、提交前落库。</p></div>
          <div class="analysis-segment" style="--span:1;--segment-color:#4a1f21;"><small>第 5 阶段</small><strong>剪辑交付</strong><p>按帧对齐、校字幕、配乐、导出与归档。</p></div>
        </div>
      </section>
    </div>
  `;
}

function settingsPage() {
  return `
    <div class="page">
      ${pageHeader("settings")}
      <div class="content-grid">
        <section class="card card-pad">
          <div class="section-title"><div><h2>输出规格</h2><p>项目级默认值</p></div></div>
          <div class="project-brief">
            <div class="field"><label>画幅</label><select class="select" data-field="aspect"><option ${state.aspect === "16:9" ? "selected" : ""}>16:9</option><option ${state.aspect === "9:16" ? "selected" : ""}>9:16</option><option ${state.aspect === "1:1" ? "selected" : ""}>1:1</option></select></div>
            <div class="field"><label>帧率</label><select class="select" disabled><option>24 FPS</option></select></div>
            <div class="field"><label>情绪基调</label><select class="select" data-field="tone"><option ${state.tone === "东方浪漫" ? "selected" : ""}>东方浪漫</option><option ${state.tone === "克制电影感" ? "selected" : ""}>克制电影感</option><option ${state.tone === "轻松甜蜜" ? "selected" : ""}>轻松甜蜜</option></select></div>
            <div class="field"><label>城市</label><input class="input" data-field="city" value="${esc(state.city)}" /></div>
          </div>
        </section>
        <section class="card card-pad">
          <div class="section-title"><div><h2>本机数据</h2><p>草稿保存在当前浏览器</p></div></div>
          <div class="checklist">
            <div class="check-item"><span class="check-icon green">✓</span><div class="check-copy"><strong>项目草稿</strong><small>姓名、故事、分镜和人物照片预览</small></div></div>
            <div class="check-item"><span class="check-icon pending">!</span><div class="check-copy"><strong>清理草稿</strong><small>会移除本机浏览器保存的当前项目</small></div></div>
          </div>
          <button class="button danger-soft" style="width:100%;margin-top:14px;" data-action="reset-project">清理并恢复默认项目</button>
        </section>
      </div>
    </div>
  `;
}

function bindCurrentView() {
  prepareMediaPreviewElements();
  const homeHero = document.querySelector(".home-cinema-hero");
  if (homeHero) {
    homeHero.addEventListener("mousemove", (event) => {
      const rect = homeHero.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      const poster = homeHero.querySelector(".home-poster");
      if (poster) {
        poster.style.transform = `rotateY(${x * 7}deg) rotateX(${-y * 5}deg) translateY(-3px)`;
      }
    });
    homeHero.addEventListener("mouseleave", () => {
      const poster = homeHero.querySelector(".home-poster");
      if (poster) poster.style.transform = "";
    });
  }
  const hero = document.querySelector(".hero");
  if (hero) {
    hero.addEventListener("mousemove", (event) => {
      const rect = hero.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      const poster = hero.querySelector(".film-poster");
      if (poster) {
        poster.style.transform = `rotateY(${-7 + x * 8}deg) rotateX(${2 - y * 7}deg) translateY(-5px)`;
      }
    });
    hero.addEventListener("mouseleave", () => {
      const poster = hero.querySelector(".film-poster");
      if (poster) poster.style.transform = "";
    });
  }

  document.querySelectorAll("[data-dropzone]").forEach((zone) => {
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      const target = zone.querySelector(".upload-target");
      if (target) target.classList.add("dragging");
    });
    zone.addEventListener("dragleave", () => {
      const target = zone.querySelector(".upload-target");
      if (target) target.classList.remove("dragging");
    });
    zone.addEventListener("drop", async (event) => {
      event.preventDefault();
      const target = zone.querySelector(".upload-target");
      if (target) target.classList.remove("dragging");
      const file = event.dataTransfer.files?.[0];
      if (file) await processPhoto(file, zone.dataset.dropzone);
    });
  });

  const shotSelect = document.querySelector("[data-shot-select]");
  const backgroundPolicy = document.querySelector("[data-background-policy]");
  const promptArea = document.querySelector("[data-video-prompt]");
  const syncPrompt = () => {
    if (!shotSelect || !promptArea) return;
    const shot =
      storyboard.find((item) => item.id === shotSelect.value) || storyboard[0];
    promptArea.value = buildReplacementPrompt(
      shot,
      backgroundPolicy?.value || "keep"
    );
  };
  shotSelect?.addEventListener("change", () => {
    remixSelectedShotId = shotSelect.value;
    if (
      activeRouteInfo.mode === "remix" ||
      ["step7", "step8", "step9"].includes(activeRoute)
    ) {
      render();
      return;
    }
    syncPrompt();
  });
  backgroundPolicy?.addEventListener("change", syncPrompt);

  const modelForm = document.querySelector("[data-model-form]");
  if (modelForm) {
    const categoryField = modelForm.querySelector("[data-model-field='category']");
    const providerField = modelForm.querySelector("[data-model-field='provider']");
    const profileField = modelForm.querySelector("[data-model-field='profile']");
    categoryField?.addEventListener("change", () => {
      selectedModelCategory = categoryField.value;
      modelDraftCategory = categoryField.value;
      render();
    });
    const syncProviderFields = () => {
      if (!profileField || !providerField) return;
      const isArk = providerField.value === "volcengine-ark";
      profileField.disabled = !isArk;
      profileField.placeholder = isArk
        ? "例如：platform_cn-beijing_ark"
        : "非火山供应商不使用 Profile";
    };
    providerField?.addEventListener("change", syncProviderFields);
    syncProviderFields();
  }
}

document.addEventListener(
  "click",
  (event) => {
    const media = event.target.closest("img[data-media-preview], video[data-media-preview]");
    if (!media || media.closest("#media-viewer")) return;
    event.preventDefault();
    event.stopPropagation();
    openMediaViewerFromElement(media);
  },
  true
);

document.addEventListener("click", async (event) => {
  if (await handleMediaViewerClick(event)) return;
  const routeButton = event.target.closest("[data-route]");
  const navButton = event.target.closest("[data-nav-id]");
  const actionButton = event.target.closest("[data-action]");
  const copyButton = event.target.closest("[data-copy]");

  createRipple(event.clientX, event.clientY);

  if (navButton) {
    const navigationTree = currentStudioNavigation();
    const action = resolveWeddingNavigationAction(
      navButton.dataset.navId,
      navigationTree
    );
    const node = action?.node || findNavNode(navButton.dataset.navId);
    if (!node) return;
    if (event.target.closest(".nav-chevron") && node.children?.length) {
      if (openNavIds.has(node.id)) openNavIds.delete(node.id);
      else openNavIds.add(node.id);
      renderNav();
      return;
    }
    if (node.theme) {
      state.theme = node.theme;
      rebuildProject();
    }
    if (node.focus) activeFocus = node.focus;
    for (const id of action.expandIds || []) openNavIds.add(id);
    if (action.route) {
      navigateTo(action.route);
      scrollToNavigationTarget(action.target, action.route);
    } else {
      renderNav();
    }
    document.querySelector(".sidebar").classList.remove("open");
    return;
  }

  if (routeButton) {
    navigateTo(routeButton.dataset.route);
    document.querySelector(".sidebar").classList.remove("open");
    return;
  }

  if (copyButton) {
    const text = getCopyText(copyButton.dataset.copy);
    await copyText(text);
    return;
  }

  if (actionButton) {
    try {
      await handleAction(actionButton);
    } catch (error) {
      showToast(error.message || "操作失败，请检查模型服务和任务状态");
      await refreshRuntime({ rerender: false });
    }
    return;
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMediaViewer();
    return;
  }
  const media = event.target.closest?.("img[data-media-preview], video[data-media-preview]");
  if (media && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    openMediaViewerFromElement(media);
  }
});

document.addEventListener("input", (event) => {
  const storyBeat = event.target.dataset.storyBeat;
  if (storyBeat) {
    state.storyBeats = { ...(state.storyBeats || {}), [storyBeat]: event.target.value };
    return;
  }
  const field = event.target.dataset.field;
  if (!field) return;
  if (field === "duration") {
    state.duration = Number(event.target.value);
    updateLiveFrameDependentText();
    return;
  }
  state[field] = event.target.value;
  if (field === "projectName") {
    document.querySelector("#top-project-name").textContent = state.projectName || "未命名项目";
  }
});

document.addEventListener("change", async (event) => {
  if (event.target.matches("[data-photo-input]")) {
    const file = event.target.files?.[0];
    if (file) await processPhoto(file, event.target.dataset.photoInput);
  }

  if (event.target.matches("[data-template-input]")) {
    const file = event.target.files?.[0];
    if (file) await uploadTemplateFile(file);
  }

  if (event.target.matches("[data-photo-movie-input]")) {
    await uploadPhotoMovieFiles([...event.target.files]);
  }

  if (event.target.matches("[data-material-input]")) {
    await uploadMaterialFiles(
      event.target.dataset.materialInput,
      [...event.target.files]
    );
  }

  if (event.target.matches("[data-shot-status]")) {
    const shot = storyboard.find((item) => item.id === event.target.dataset.shotStatus);
    if (shot) {
      shot.status = event.target.value;
      showToast(`第 ${String(shot.number).padStart(2, "0")} 镜状态已更新`);
    }
  }

  if (event.target.matches("[data-replacement-video-input]")) {
    const file = event.target.files?.[0];
    const shotId = event.target.dataset.shotId;
    if (file && shotId) {
      event.target.disabled = true;
      try {
        await api.importReplacementVideo(currentProjectId, shotId, file);
        await refreshRuntime();
        showToast("替换视频已导入，旧审核已失效，请重新完成九项检查");
      } catch (error) {
        showToast(error.message || "替换视频导入失败");
      } finally {
        event.target.disabled = false;
      }
    }
  }

  if (event.target.dataset.field) {
    saveState({ quiet: true });
  }
});

document.querySelector("#save-button").addEventListener("click", () => {
  saveState();
});

document.querySelector("#fullscreen-button").addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      showToast("已进入全屏创作模式，按 Esc 退出");
    } else {
      await document.exitFullscreen();
    }
  } catch {
    showToast("当前浏览器未允许全屏，请使用浏览器全屏快捷键");
  }
});

function findNavNode(id, nodes = currentStudioNavigation()) {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNavNode(id, node.children);
      if (found) return found;
    }
  }
  return null;
}

async function handleAction(button) {
  const action = button.dataset.action;
  if (action === "approve-workflow-step") {
    const workflow = state.workflow || { currentStep: 1, approvals: {} };
    const mode = button.dataset.approvalMode || activeRouteInfo.mode || state.mode || "story";
    const maxStep = mode === "remix" ? 4 : 14;
    const step = Math.min(
      maxStep,
      Math.max(
        1,
        Number(button.dataset.approvalStep || activeRouteInfo.step || workflow.currentStep || 1)
      )
    );
    if (!runtime.online) {
      showToast("请先启动本地服务，确认记录必须写入服务端版本库");
      return;
    }
    const stepReady = mode === "remix" ? remixReady(step) : workflowReady(step);
    if (!stepReady) {
      showToast("本步骤素材尚未就绪，请先完成素材中心要求");
      return;
    }
    if (
      !window.confirm(
        `确认第 ${step} 步“${mode === "remix" ? "抖音复刻" : WIZARD_STEPS[step - 1]?.title}”当前版本吗？`
      )
    ) {
      return;
    }
    const result = await api.approveProjectStep(currentProjectId, {
      mode,
      step,
      confirmText: "确认当前版本",
      evidence: `制作方在${mode === "remix" ? "抖音复刻" : "故事"}第 ${step} 步页面确认`
    });
    if (mode === "remix") {
      state.remixWorkflow = result.workflow || result.item.remixWorkflow;
    } else {
      state.workflow = result.workflow || result.item.workflow;
    }
    state.mode = result.item.mode || mode;
    saveState({ quiet: true });
    const nextStep = Math.min(maxStep + 1, step + 1);
    if (mode === "remix") {
      navigateTo(nextStep > 4 ? "export" : `remixStep${nextStep}`);
    } else {
      navigateTo(nextStep > 14 ? "export" : `step${nextStep}`);
    }
    showToast(
      step === maxStep
        ? `${maxStep} 步制作流程已全部确认`
        : `第 ${step} 步已确认，进入第 ${step + 1} 步`
    );
  }
  if (action === "reset-workflow") {
    state.workflow = { currentStep: 1, approvals: {} };
    saveState({ quiet: true });
    render();
    showToast("制作向导已回到第 1 步，素材不会删除");
  }
  if (action === "copy-story-card") {
    await copyText(
      [
        "婚礼微电影故事采集卡",
        `新郎：${state.groom}`,
        `新娘：${state.bride}`,
        `婚期：${state.date}`,
        `画幅：${state.aspect}`,
        `目标时长：${state.duration} 秒`,
        "",
        "现有爱情故事：",
        state.story,
        "",
        "五幕补充：",
        `1. 相识：${state.storyBeats?.origin || ""}`,
        `2. 相知：${state.storyBeats?.knowing || ""}`,
        `3. 确认：${state.storyBeats?.confirm || ""}`,
        `4. 相伴：${state.storyBeats?.companionship || ""}`,
        `5. 承诺：${state.storyBeats?.promise || ""}`,
        "添加项：有意义的地点、物品、宠物、常说的话。",
        "禁忌：不想出现的人、事件、服装或画面。",
        "音乐：有授权的纯音乐，或交给制作方定制。"
      ].join("\n")
    );
  }
  if (action === "copy-script-confirmation") {
    await copyText(
      [
        `请确认婚礼微电影文案：${state.groom} × ${state.bride}`,
        treatment.logline,
        ...treatment.acts.map(
          (act, index) => `${index + 1}. ${act.label}：${act.summary}`
        ),
        "请明确回复：此版本文案可以，或指出需要修改的事实与句子。"
      ].join("\n")
    );
  }
  if (action === "replacement-policy") {
    const policy = button.dataset.policy;
    const textarea = document.querySelector("[data-video-prompt]");
    if (!textarea) return;
    textarea.value =
      policy === "change"
        ? `保持参考视频中${state.groom}和${state.bride}的人物动作、机位、镜头运动、人物占画面比例和切点不变。将背景替换为${state.city || "现代"}婚礼庭院。新背景的地平线、主光方向、色温和阴影必须与原人物动作匹配；保留脚底接触阴影、手部接触关系、服装边缘和头发轮廓。不要改变人物身份和动作，不要产生漂浮、抠图边、遮挡错误或空间方向反转。`
        : `保持参考视频的构图、景别、机位、人物动作、镜头运动和剪辑节奏。男主角替换为参考图中的${state.groom}，女主角替换为参考图中的${state.bride}。严格保持两人的脸型、五官比例、发际线、发型、肤色和身高差。保持原视频背景的建筑、道具、空间透视、光线方向和色调。不要改变镜头轴线和切点位置，不要出现文字、水印、面部漂移、服装跳变或肢体粘连。`;
    showToast(policy === "change" ? "已切换为可替换背景提示词" : "已切换为保持背景提示词");
  }
  if (action === "build-replacement-prompt") {
    const shotId = document.querySelector("[data-shot-select]")?.value;
    const policy = document.querySelector("[data-background-policy]")?.value || "keep";
    const shot = storyboard.find((item) => item.id === shotId) || storyboard[0];
    const textarea = document.querySelector("[data-video-prompt]");
    if (textarea) textarea.value = buildReplacementPrompt(shot, policy);
    showToast("已按当前镜头和背景策略生成完整提示词");
  }
  if (action === "copy-full-video-prompt") {
    const text = document.querySelector("[data-video-prompt]")?.value || "";
    await copyText(text);
  }
  if (action === "copy-video-preset") {
    await copyText(videoPresetPrompt(button.dataset.preset));
  }
  if (action === "refresh-runtime") {
    await refreshRuntime();
    showToast("本地项目与任务已刷新");
  }
  if (action === "refresh-job") {
    await api.queryJob(button.dataset.jobId).catch(() => api.getJob(button.dataset.jobId));
    await refreshRuntime();
    showToast("任务状态已刷新");
  }
  if (action === "generate-image-direct") {
    const prompt = document.querySelector("[data-image-prompt]")?.value.trim();
    const model = defaultModel("image");
    if (!prompt || !model) {
      showToast("请先输入图片提示词并配置图片模型");
      return;
    }
    button.disabled = true;
    button.textContent = "提交图片任务…";
    const result = await api.generateImage({
      projectId: currentProjectId,
      modelId: model.id,
      prompt
    });
    await trackJob(result.job.id, "图片生成");
    await refreshRuntime();
  }
  if (action === "generate-video-direct") {
    const prompt = document.querySelector("[data-video-prompt]")?.value.trim();
    const model = defaultModel("video");
    if (!prompt || !model) {
      showToast("请先输入视频提示词并配置视频模型");
      return;
    }
    button.disabled = true;
    button.textContent = "提交视频任务…";
    const result = await api.generateVideo({
      projectId: currentProjectId,
      modelId: model.id,
      prompt,
      parameters: { duration: 5, resolution: model.parameters?.resolution || "720p" }
    });
    await trackJob(result.job.id, "视频生成");
    await refreshRuntime();
  }
  if (action === "copy-remix-prompt") {
    const selector = button.dataset.promptSelector;
    const text = selector
      ? document.querySelector(selector)?.value || ""
      : "";
    if (!text) {
      showToast("当前提示词尚未生成");
      return;
    }
    await copyText(text);
  }
  if (action === "prepare-remix-shots") {
    const templateId = button.dataset.templateId || currentRemixTemplate()?.id;
    const template = currentRemixTemplate();
    const groom =
      document.querySelector("[data-remix-groom-target]")?.value || "left";
    const bride =
      document.querySelector("[data-remix-bride-target]")?.value || "right";
    if (!templateId || !template?.remixAnalysis) {
      showToast("请先完成参考片结构分析");
      return;
    }
    const result = await api.updateRemixTargets(currentProjectId, {
      templateId,
      groom,
      bride,
      remixRange: {
        start: Math.max(
          0,
          Number(runtime.projects.find((item) => item.id === currentProjectId)?.remixRange?.start) ||
            Math.max(0, Number(template.duration || 40) - 40)
        ),
        end:
          Number(runtime.projects.find((item) => item.id === currentProjectId)?.remixRange?.end) ||
          Number(template.duration || 40)
      }
    });
    state.mode = "remix";
    state.remixTargets = { groom, bride };
    state.remixRange = result.item.remixRange;
    storyboard = result.shots || [];
    remixSelectedShotId = storyboard[0]?.id || "";
    await refreshRuntime();
    showToast(`已建立 ${storyboard.length} 个复刻镜头`);
  }
  if (action === "estimate-image-batch") {
    const model = defaultModel("image");
    if (!model) {
      showToast("请先在模型中心配置图片模型");
      return;
    }
    const count = Number(
      document.querySelector("[data-batch-count]")?.value || 24
    );
    const rawUnitCost = document
      .querySelector("[data-batch-unit-cost]")
      ?.value.trim();
    const result = await api.estimateGeneration({
      category: "image",
      modelId: model.id,
      count,
      unitCost: rawUnitCost === "" ? null : Number(rawUnitCost)
    });
    remixBatchEstimate = result.item;
    render();
  }
  if (action === "submit-image-batch") {
    const model = defaultModel("image");
    const confirmed = Boolean(
      document.querySelector("[data-batch-confirm]")?.checked
    );
    const shotIds = [...document.querySelectorAll("[data-batch-shot]:checked")].map(
      (input) => input.value
    );
    const count = Number(
      document.querySelector("[data-batch-count]")?.value || 24
    );
    if (!model) {
      showToast("请先配置图片模型");
      return;
    }
    if (!confirmed) {
      showToast("请先确认模型、数量和费用");
      return;
    }
    if (!shotIds.length) {
      showToast("请至少选择一个复刻镜头");
      return;
    }
    if (!remixBatchEstimate || remixBatchEstimate.requiresQuote) {
      showToast("请先完成费用预估并填写单价");
      return;
    }
    button.dataset.idempotencyKey ||=
      globalThis.crypto?.randomUUID?.() || `batch-${Date.now()}`;
    button.disabled = true;
    const result = await api.createImageBatch(
      currentProjectId,
      {
        modelId: model.id,
        shotIds,
        totalCount: count,
        versionsPerShot: Math.max(1, Math.round(count / shotIds.length)),
        unitCost: remixBatchEstimate.unitCost,
        confirmed: true
      },
      button.dataset.idempotencyKey
    );
    remixBatchJobId = result.job.id;
    await trackJob(result.job.id, "批量角色图生成");
    await refreshRuntime();
  }
  if (action === "review-batch-image") {
    const assetId = button.dataset.assetId;
    const reviewStatus = button.dataset.reviewStatus;
    if (!assetId || !["approved", "rejected"].includes(reviewStatus)) return;
    const project = runtime.projects.find((item) => item.id === currentProjectId);
    await api.updateProject(currentProjectId, {
      batchImageReviews: {
        ...(project?.batchImageReviews || {}),
        [assetId]: reviewStatus
      }
    });
    await refreshRuntime();
    showToast(reviewStatus === "approved" ? "候选图已批准，可绑定为镜头首帧" : "候选图已淘汰");
  }
  if (action === "bind-batch-image") {
    const asset = currentBatchImageAssets().find(
      (item) => item.id === button.dataset.assetId
    );
    const project = runtime.projects.find((item) => item.id === currentProjectId);
    const job = asset ? batchJobForAsset(asset) : null;
    const shotId = job?.input?.shotId || "";
    const reviewStatus = project?.batchImageReviews?.[asset?.id];
    if (!asset || !shotId) {
      showToast("当前候选图没有绑定镜头，不能设为首帧");
      return;
    }
    if (reviewStatus !== "approved") {
      showToast("请先批准候选图，再绑定为镜头首帧");
      return;
    }
    const sourceShots =
      activeRouteInfo.mode === "remix"
        ? project?.remixStoryboard || storyboard
        : project?.storyStoryboard || storyboard;
    const shot = sourceShots.find((item) => item.id === shotId);
    if (!shot) {
      showToast("候选图对应的镜头已不存在");
      return;
    }
    await api.updateShot(currentProjectId, shotId, {
      mode: activeRouteInfo.mode || "story",
      imagePrompt: shot.imagePrompt || "",
      assets: {
        ...(shot.assets || {}),
        firstFrame: {
          assetId: asset.id,
          hash: asset.contentHash || ""
        },
        video: null,
        finalClip: null
      },
      imageStatus: "review",
      imageReview: {},
      status: "draft"
    });
    await refreshRuntime();
    showToast("候选图已绑定为本镜首帧，请继续完成首帧人工审核");
  }
  if (action === "save-remix-props") {
    const sourceAssetId =
      document.querySelector("[data-prop-source]")?.value || "";
    const target =
      document.querySelector("[data-prop-target]")?.value.trim() || "";
    const description =
      document.querySelector("[data-prop-description]")?.value.trim() || "";
    const remixProps = sourceAssetId
      ? [{ target, sourceAssetId, description }]
      : [];
    await api.updateProject(currentProjectId, { remixProps });
    await refreshRuntime();
    showToast(sourceAssetId ? "道具替换映射已保存" : "已恢复保持原道具");
  }
  if (action === "remix-extract") {
    const templateId = button.dataset.templateId;
    const project = runtime.projects.find((item) => item.id === currentProjectId);
    if (!templateId) {
      showToast("请先导入抖音视频模板");
      return;
    }
    if (project?.templateId !== templateId) {
      await api.applyTemplate(templateId, currentProjectId);
    }
    const result = await api.extractRemixFrames(templateId);
    await trackJob(result.job.id, "抖音全帧提取");
    await refreshRuntime();
    showToast("24 FPS 全帧、原音频和帧索引已完成");
  }
  if (action === "remix-analyze") {
    const templateId = button.dataset.templateId || currentRemixTemplate()?.id;
    if (!templateId) {
      showToast("请先选择并提取参考片");
      return;
    }
    const result = await api.analyzeRemixTemplate(templateId);
    await trackJob(result.job.id, "抖音画面声音字幕分析");
    await refreshRuntime();
  }
  if (action === "save-remix-targets") {
    const groom = document.querySelector("[data-remix-groom-target]")?.value;
    const bride = document.querySelector("[data-remix-bride-target]")?.value;
    const start = Number(document.querySelector("[data-remix-range-start]")?.value);
    const end = Number(document.querySelector("[data-remix-range-end]")?.value);
    const result = await api.updateRemixTargets(currentProjectId, {
      templateId: button.dataset.templateId || currentRemixTemplate()?.id,
      groom,
      bride,
      remixRange: { start, end }
    });
    state.mode = "remix";
    state.remixTargets = { groom, bride };
    state.remixRange = result.item.remixRange;
    storyboard = result.shots || [];
    remixSelectedShotId = storyboard[0]?.id || "";
    await refreshRuntime();
    showToast(`已建立 ${storyboard.length} 个连续替换镜头`);
  }
  if (action === "save-shot-qc") {
    const shot = storyboard.find((item) => item.id === button.dataset.shotId);
    if (!shot) return;
    if (!shot.assets?.video?.assetId) {
      showToast("当前镜头还没有生成视频，不能进行成片人工质检");
      return;
    }
    const mode = button.dataset.mode === "remix" ? "remix" : "story";
    const checks = {};
    document.querySelectorAll("[data-qc-check]").forEach((input) => {
      checks[input.dataset.qcCheck] = input.checked ? "passed" : "pending";
    });
    const passed = shotReviewComplete(checks);
    await api.updateShot(currentProjectId, shot.id, {
      mode,
      review: {
        ...checks,
        reviewedBy: "producer",
        reviewedAt: new Date().toISOString()
      },
      status: passed ? "approved" : "human-review"
    });
    await refreshRuntime();
    showToast(passed ? "本镜九项人工质检已通过" : "本镜仍有质检项未通过");
  }
  if (action === "build-shot-image-prompt") {
    const shot = storyboard.find((item) => item.id === button.dataset.shotId);
    if (!shot) return;
    const prompt = buildImagePrompt(shot, state);
    const textarea = document.querySelector("[data-image-prompt]");
    if (textarea) textarea.value = prompt;
    await api.updateShot(currentProjectId, shot.id, {
      mode: "story",
      imagePrompt: prompt
    });
    showToast("图片提示词已按当前镜头重新生成");
  }
  if (action === "update-character-sheet-template") {
    const container = button.closest("[data-character-sheet-template]");
    const description =
      container?.querySelector("[data-character-sheet-description]")?.value ||
      DEFAULT_CHARACTER_SHEET_DESCRIPTION;
    const preview = container?.querySelector("[data-character-sheet-preview]");
    if (preview) {
      preview.value = buildCharacterSheetPrompt({
        characterDescription: description
      });
    }
    showToast("角色三视图模板已刷新");
  }
  if (action === "apply-character-sheet-template") {
    const container = button.closest("[data-character-sheet-template]");
    const description =
      container?.querySelector("[data-character-sheet-description]")?.value ||
      DEFAULT_CHARACTER_SHEET_DESCRIPTION;
    const prompt = buildCharacterSheetPrompt({
      characterDescription: description
    });
    const target = button.dataset.targetSelector
      ? document.querySelector(button.dataset.targetSelector)
      : null;
    if (!target) {
      showToast("当前页面没有可套用的图片提示词输入框");
      return;
    }
    target.value = prompt;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    const preview = container?.querySelector("[data-character-sheet-preview]");
    if (preview) preview.value = prompt;
    target.focus();
    showToast("角色三视图模板已套用到图片提示词，可继续修改");
  }
  if (action === "copy-character-sheet-template") {
    const container = button.closest("[data-character-sheet-template]");
    const description =
      container?.querySelector("[data-character-sheet-description]")?.value ||
      DEFAULT_CHARACTER_SHEET_DESCRIPTION;
    await copyText(
      buildCharacterSheetPrompt({ characterDescription: description })
    );
  }
  if (action === "copy-image-prompt") {
    await copyText(document.querySelector("[data-image-prompt]")?.value || "");
  }
  if (action === "bind-shot-image") {
    const shot = storyboard.find((item) => item.id === button.dataset.shotId);
    const assetId = document.querySelector("[data-image-bind-asset]")?.value;
    const asset = runtime.assets.find((item) => item.id === assetId);
    if (!shot || !asset) {
      showToast("请选择要绑定的图片资产");
      return;
    }
    await api.updateShot(currentProjectId, shot.id, {
      mode: "story",
      imagePrompt:
        document.querySelector("[data-image-prompt]")?.value.trim() ||
        shot.imagePrompt ||
        "",
      assets: {
        ...(shot.assets || {}),
        firstFrame: { assetId: asset.id, hash: asset.contentHash || "" },
        video: null,
        finalClip: null
      },
      imageStatus: "review",
      imageReview: {},
      status: "draft"
    });
    await refreshRuntime();
    showToast("图片已绑定到当前镜头，请完成首帧审核");
  }
  if (action === "approve-shot-image") {
    const shot = storyboard.find((item) => item.id === button.dataset.shotId);
    if (!shot?.assets?.firstFrame?.assetId) {
      showToast("当前镜头还没有绑定首帧图片");
      return;
    }
    const imageReview = {};
    document.querySelectorAll("[data-image-check]").forEach((input) => {
      imageReview[input.dataset.imageCheck] = input.checked ? "passed" : "pending";
    });
    const passed = ["identity", "sameCouple", "hands", "costume", "composition"].every(
      (key) => imageReview[key] === "passed"
    );
    await api.updateShot(currentProjectId, shot.id, {
      mode: "story",
      imageReview: {
        ...imageReview,
        reviewedBy: "producer",
        reviewedAt: new Date().toISOString()
      },
      imageStatus: passed ? "approved" : "review",
      status: "draft"
    });
    await refreshRuntime();
    showToast(passed ? "当前首帧已通过人工审核" : "首帧仍有审核项未通过");
  }
  if (action === "generate-shot-image") {
    const shot = storyboard.find((item) => item.id === button.dataset.shotId);
    if (!shot) return;
    const prompt = document.querySelector("[data-image-prompt]")?.value.trim();
    const model = familyModels("image").find(
      (item) => item.enabled && item.provider === "volcengine-ark"
    );
    if (!prompt) {
      showToast("请先生成或填写图片提示词");
      return;
    }
    if (!model) {
      showToast("请先在模型中心配置支持人物参考的图片模型，或手动上传首帧");
      return;
    }
    if (!state.photoAssetIds?.groom || !state.photoAssetIds?.bride) {
      showToast("请先绑定当前项目的男女主照片资产");
      return;
    }
    button.disabled = true;
    button.textContent = "提交图片任务…";
    const result = await api.generateImage({
      projectId: currentProjectId,
      modelId: model.id,
      prompt,
      kind: "shot-first-frame",
      inputs: [
        `reference_image:${state.photoAssetIds.groom}`,
        `reference_image:${state.photoAssetIds.bride}`
      ]
    });
    const job = await trackJob(result.job.id, "镜头首帧生成");
    if (job?.result?.asset) {
      await api.updateShot(currentProjectId, shot.id, {
        mode: "story",
        imagePrompt: prompt,
        assets: {
          ...(shot.assets || {}),
          firstFrame: {
            assetId: job.result.asset.id,
            hash: job.result.asset.contentHash || ""
          },
          video: null,
          finalClip: null
        },
        imageStatus: "review",
        imageReview: {},
        status: "draft"
      });
    }
    await refreshRuntime();
  }
  if (action === "select-timeline-audio") {
    const project = runtime.projects.find((item) => item.id === currentProjectId);
    const asset = runtime.assets.find((item) => item.id === button.dataset.assetId);
    if (!project || !asset) return;
    const kind = button.dataset.kind;
    const selection = {
      ...(project.timelineSelection || {}),
      mixAssetId: "",
      ...(kind === "voice"
        ? { voiceAssetId: asset.id }
        : { musicAssetId: asset.id })
    };
    await api.updateProject(currentProjectId, {
      timelineSelection: selection,
      timelineRevision: Number(project.timelineRevision || 1) + 1
    });
    await refreshRuntime();
    showToast(kind === "voice" ? "已选定当前旁白" : "已选定当前配乐");
  }
  if (action === "render-mix-sample") {
    const start = Number(document.querySelector("[data-mix-start]")?.value || 0);
    const duration = Number(document.querySelector("[data-mix-duration]")?.value || 10);
    button.disabled = true;
    button.textContent = "正在生成试混…";
    const result = await api.renderMixSample(currentProjectId, { start, duration });
    await refreshRuntime();
    showToast(`试混已生成：${result.item.media.integratedLufs.toFixed(1)} LUFS`);
  }
  if (action === "render-full-mix") {
    button.disabled = true;
    button.textContent = "正在生成完整混音…";
    const result = await api.renderFullMix(currentProjectId, {});
    await refreshRuntime();
    showToast(`完整混音已生成：${result.item.media.duration.toFixed(1)} 秒`);
  }
  if (action === "save-subtitle-style") {
    const read = (name) =>
      document.querySelector(`[data-subtitle-style='${name}']`)?.value;
    const subtitleStyle = {
      font: read("font") || "Microsoft YaHei",
      fontSize: Number(read("fontSize") || 24),
      color: read("color") || "#FFFFFF",
      outlineColor: "#101010",
      outline: Number(read("outline") || 2),
      margin: Number(read("margin") || 30)
    };
    state.subtitleStyle = subtitleStyle;
    const project = runtime.projects.find((item) => item.id === currentProjectId);
    await api.updateProject(currentProjectId, {
      subtitleStyle,
      timelineRevision: Number(project?.timelineRevision || 1) + 1
    });
    await refreshRuntime();
    showToast("字幕样式已保存");
  }
  if (action === "render-preview") {
    const timelineResult = await api.getProjectTimeline(
      currentProjectId,
      state.mode || "story"
    );
    button.disabled = true;
    button.textContent = "正在渲染完整预览…";
    const result = await api.renderPreview(currentProjectId, {
      mode: state.mode || "story",
      timelineHash: timelineResult.item.hash
    });
    await trackJob(result.job.id, "带字幕完整预览");
    await refreshRuntime();
  }
  if (action === "create-delivery") {
    button.disabled = true;
    button.textContent = "正在整理交付包…";
    const result = await api.createDelivery(currentProjectId, {
      mode: state.mode || "story"
    });
    await refreshRuntime();
    showToast(`交付包已生成：${result.item.manifest.files.length} 个文件`);
  }
  if (action === "bind-first-frame") {
    const shotId = document.querySelector("[data-shot-select]")?.value;
    const assetId = document.querySelector("[data-first-frame-asset]")?.value;
    const shot = storyboard.find((item) => item.id === shotId);
    const asset = runtime.assets.find((item) => item.id === assetId);
    if (!shot || !asset) {
      showToast("请选择要绑定的首帧图片");
      return;
    }
    await api.updateShot(currentProjectId, shot.id, {
      mode: "story",
      assets: {
        ...(shot.assets || {}),
        firstFrame: {
          assetId: asset.id,
          hash: asset.contentHash || ""
        },
        video: null,
        finalClip: null
      },
      review: createReviewState(),
      status: "draft"
    });
    await refreshRuntime();
    showToast("首帧已经绑定到当前故事镜头");
  }
  if (action === "generate-story-shot") {
    const selectedShotId = document.querySelector("[data-shot-select]")?.value;
    const selectedShot = storyboard.find((item) => item.id === selectedShotId);
    const prompt = document.querySelector("[data-video-prompt]")?.value.trim();
    const model = defaultModel("video");
    if (!selectedShot || !prompt || !model) {
      showToast("请选择镜头、填写提示词并配置视频模型");
      return;
    }
    if (!selectedShot.assets?.firstFrame?.assetId) {
      showToast("当前镜头尚未绑定首帧");
      return;
    }
    const inputs = [`first_frame:${selectedShot.assets.firstFrame.assetId}`];
    if (state.photoAssetIds?.groom) {
      inputs.push(`reference_image:${state.photoAssetIds.groom}`);
    }
    if (state.photoAssetIds?.bride) {
      inputs.push(`reference_image:${state.photoAssetIds.bride}`);
    }
    button.disabled = true;
    button.textContent = "提交故事镜头…";
    const result = await api.generateVideo({
      projectId: currentProjectId,
      modelId: model.id,
      shotId: selectedShot.id,
      prompt,
      inputs,
      parameters: {
        ratio: state.aspect === "9:16" ? "9:16" : "16:9",
        duration: Math.max(0.5, Math.min(8, Number(selectedShot.duration || 4))),
        resolution: model.parameters?.resolution || "720p"
      }
    });
    await api.updateShot(currentProjectId, selectedShot.id, {
      mode: "story",
      videoPrompt: prompt
    });
    const job = await trackJob(result.job.id, "故事镜头生成");
    if (job?.result?.asset) {
      await api.updateShot(currentProjectId, selectedShot.id, {
        mode: "story",
        prompt,
        assets: {
          ...(selectedShot.assets || {}),
          video: {
            assetId: job.result.asset.id,
            hash: job.result.asset.contentHash || ""
          },
          finalClip: {
            assetId: job.result.asset.id,
            hash: job.result.asset.contentHash || ""
          }
        },
        review: createReviewState(),
        status: "human-review"
      });
    }
    await refreshRuntime();
  }
  if (action === "generate-template-shot") {
    const project = runtime.projects.find((item) => item.id === currentProjectId);
    const template = runtime.templates.find((item) => item.id === project?.templateId);
    const model = defaultModel("video");
    if (!template || !model) {
      showToast("请先应用模板并配置视频模型");
      return;
    }
    const prompt = document.querySelector("[data-video-prompt]")?.value.trim() || "保持参考视频的构图和运镜，替换为当前项目的新郎新娘。";
    const selectedShotId = document.querySelector("[data-shot-select]")?.value || "template-reference";
    const selectedShot =
      storyboard.find((item) => item.id === selectedShotId) || storyboard[0];
    if (!selectedShot) {
      showToast("请先建立故事分镜");
      return;
    }
    const groomTarget =
      document.querySelector("[data-shot-groom-target]")?.value ||
      selectedShot.characters?.groom?.target ||
      "left";
    const brideTarget =
      document.querySelector("[data-shot-bride-target]")?.value ||
      selectedShot.characters?.bride?.target ||
      "right";
    if (groomTarget === brideTarget) {
      showToast("当前镜头的男女主替换目标不能相同");
      return;
    }
    let referenceWindow;
    try {
      referenceWindow = shotReferenceWindow(selectedShot, 8);
    } catch (error) {
      showToast("当前镜头还没有绑定模板时间区间，请先应用并解析模板");
      return;
    }
    const clip = await api.createTemplateClip(template.id, {
      projectId: currentProjectId,
      start: referenceWindow.start,
      duration: referenceWindow.duration
    });
    const photoAssetIds =
      state.photoAssetIds ||
      runtime.projects.find((item) => item.id === currentProjectId)?.photoAssetIds ||
      {};
    if (!photoAssetIds.groom || !photoAssetIds.bride) {
      showToast("请先上传并绑定当前项目的男女主照片资产");
      return;
    }
    const inputs = [
      `reference_video:${clip.item.assetId}`,
      `reference_image:${photoAssetIds.groom}`,
      `reference_image:${photoAssetIds.bride}`
    ];
    await api.updateShot(currentProjectId, selectedShot.id, {
      mode: state.mode || activeRouteInfo.mode || "story",
      prompt,
      videoPrompt: prompt,
      source: {
        ...(selectedShot.source || {}),
        mode: "template",
        templateId: template.id,
        referenceStart: referenceWindow.start,
        referenceEnd: referenceWindow.start + referenceWindow.duration
      },
      characters: {
        groom: {
          referenceAssetId: photoAssetIds.groom,
          target: groomTarget
        },
        bride: {
          referenceAssetId: photoAssetIds.bride,
          target: brideTarget
        }
      }
    });
    button.disabled = true;
    button.textContent = "提交人物替换镜头…";
    const result = await api.generateVideo({
      projectId: currentProjectId,
      modelId: model.id,
      shotId: selectedShotId,
      prompt: `${prompt} 保持参考视频的镜头顺序、人物动作和运镜；把人物替换为男主角${state.groom}和女主角${state.bride}，保持两人面部身份、服装与手部连续，不重演片头。`,
      inputs,
      parameters: { ratio: "adaptive", duration: -1, resolution: model.parameters?.resolution || "720p" }
    });
    const job = await trackJob(result.job.id, "模板人物替换镜头");
    if (job?.result?.asset) {
      await api.updateShot(currentProjectId, selectedShot.id, {
        mode: state.mode || activeRouteInfo.mode || "story",
        assets: {
          ...(selectedShot.assets || {}),
          video: {
            assetId: job.result.asset.id,
            hash: job.result.asset.contentHash || ""
          },
          finalClip: {
            assetId: job.result.asset.id,
            hash: job.result.asset.contentHash || ""
          }
        },
        review: createReviewState(),
        status: "human-review"
      });
    }
    await refreshRuntime();
  }
  if (action === "import-template-url") {
    const url = document.querySelector("[data-template-url]")?.value.trim();
    if (!url) {
      showToast("请先粘贴抖音视频链接");
      return;
    }
    const rights = document.querySelector("[data-remix-rights]");
    if (rights && !rights.checked) {
      showToast("请先确认参考片使用权");
      return;
    }
    const result = await api.importTemplateUrl(url);
    showToast(`模板导入任务已创建：${result.job.id.slice(0, 12)}`);
    await trackJob(result.job.id, "模板解析");
    await refreshRuntime();
  }
  if (action === "analyze-template") {
    const result = await api.analyzeTemplate(button.dataset.templateId, true);
    showToast("模板 AI 深度分析已开始");
    await trackJob(result.job.id, "模板分析");
    await refreshRuntime();
  }
  if (action === "apply-template") {
    await api.applyTemplate(button.dataset.templateId, currentProjectId);
    await refreshRuntime();
    const project = runtime.projects.find((item) => item.id === currentProjectId);
    const template = runtime.templates.find((item) => item.id === project?.templateId);
    storyboard = bindStoryboardToTemplate(buildStoryboard(state), template);
    state.storyboard = storyboard;
    saveState({ quiet: true });
    render();
    showToast("模板已应用，项目时长保持不变，参考片时长单独记录");
  }
  if (action === "test-model") {
    button.disabled = true;
    button.textContent = "测试中…";
    try {
      const result = await api.testModel(button.dataset.modelId);
      showToast(result.result?.message || "模型连接测试完成");
    } catch (error) {
      showToast(`模型测试失败：${error.message}`);
    } finally {
      await refreshRuntime();
    }
  }
  if (action === "test-all-models") {
    const candidates = runtime.models.filter((model) => model.enabled);
    button.disabled = true;
    button.textContent = "正在测试…";
    for (const model of candidates) {
      await api.testModel(model.id).catch(() => {});
    }
    await refreshRuntime();
    showToast("模型连接测试完成");
  }
  if (action === "set-default-model") {
    const model = runtime.models.find((item) => item.id === button.dataset.modelId);
    if (!model) return;
    await api.setDefaultModel(model.id);
    await refreshRuntime();
    showToast(`${model.label} 已设为${model.category}默认模型`);
  }
  if (action === "edit-model") {
    const model = runtime.models.find((item) => item.id === button.dataset.modelId);
    if (!model) return;
    selectedModelCategory = model.category;
    modelEditorId = model.id;
    modelDraftCategory = model.category;
    render();
  }
  if (action === "new-model") {
    modelEditorId = "";
    modelDraftCategory = selectedModelCategory;
    render();
    document.querySelector("[data-model-field='label']")?.focus();
  }
  if (action === "select-model-category") {
    selectedModelCategory = button.dataset.category || "text";
    modelEditorId = "";
    modelDraftCategory = selectedModelCategory;
    render();
  }
  if (action === "clone-model") {
    const model = runtime.models.find((item) => item.id === button.dataset.modelId);
    if (!model) return;
    const created = await api.createModel({
      category: model.category,
      provider: model.provider,
      label: `${model.label} · 副本`,
      model: model.model,
      profile: model.profile || "",
      enabled: false,
      isDefault: false,
      parameters: model.parameters || {}
    });
    selectedModelCategory = model.category;
    modelEditorId = created.item.id;
    modelDraftCategory = created.item.category;
    await refreshRuntime();
    showToast("模型配置已复制，请修改名称或模型 ID 后保存");
  }
  if (action === "delete-model") {
    const model = runtime.models.find((item) => item.id === button.dataset.modelId);
    if (!model) return;
    if (!window.confirm(`确认删除模型“${model.label}”吗？已生成素材不会受影响。`)) return;
    await api.deleteModel(model.id);
    if (modelEditorId === model.id) {
      modelEditorId = "";
      modelDraftCategory = selectedModelCategory;
    }
    await refreshRuntime();
    showToast("模型配置已删除");
  }
  if (action === "save-model-config") {
    const form = document.querySelector("[data-model-form]");
    if (!form) return;
    const read = (name) => form.querySelector(`[data-model-field='${name}']`);
    let parameters;
    try {
      parameters = JSON.parse(read("parameters")?.value || "{}");
      if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
        throw new Error("参数必须是 JSON 对象");
      }
    } catch (error) {
      showToast(`模型参数格式错误：${error.message}`);
      return;
    }
    const payload = {
      category: read("category")?.value || selectedModelCategory,
      provider: read("provider")?.value || "",
      label: read("label")?.value.trim() || "",
      model: read("model")?.value.trim() || "",
      profile:
        read("provider")?.value === "volcengine-ark"
          ? read("profile")?.value.trim() || ""
          : "",
      enabled: Boolean(read("enabled")?.checked),
      isDefault: Boolean(read("isDefault")?.checked),
      parameters
    };
    const editorId = form.dataset.modelEditorId || "";
    const result = editorId
      ? await api.updateModel(editorId, payload)
      : await api.createModel(payload);
    selectedModelCategory = result.item.category;
    modelEditorId = result.item.id;
    modelDraftCategory = result.item.category;
    await refreshRuntime();
    showToast(editorId ? "模型配置已保存，请重新测试连接" : "新模型已创建");
  }
  if (action === "generate-look") {
    const look = runtime.looks.find((item) => item.id === button.dataset.lookId);
    if (!look) return;
    button.disabled = true;
    button.textContent = "提交中…";
    const result = await api.generateLook(look.id, {
      projectId: currentProjectId,
      referenceAssetId:
        state.photoAssetIds?.[look.gender === "male" ? "groom" : "bride"] || "",
      modelId: button.dataset.modelId || ""
    });
    showToast(`造型生成任务已创建：${look.title}`);
    await trackJob(result.job.id, `生成${look.title}`);
    await refreshRuntime();
  }
  if (action === "select-look") {
    const look = runtime.looks.find((item) => item.id === button.dataset.lookId);
    if (!look) return;
    state.selectedLooks = { ...(state.selectedLooks || {}), [look.gender === "male" ? "groom" : "bride"]: look.id };
    await api.updateProject(currentProjectId, { selectedLooks: state.selectedLooks }).catch(() => {});
    saveState({ quiet: true });
    render();
    showToast(`${look.title} 已选为${look.gender === "male" ? "男主角" : "女主角"}造型`);
  }
  if (action === "generate-story-ai") {
    const model = defaultModel("text");
    if (!model) {
      showToast("请先在模型中心配置文字模型");
      return;
    }
    button.disabled = true;
    button.textContent = "故事模型创作中…";
    const result = await api.generateText({
      projectId: currentProjectId,
      modelId: model.id,
      prompt: [
        `请为婚礼微电影生成五幕故事和分镜：相识、相知、确认、相伴、承诺。新郎：${state.groom}；新娘：${state.bride}。`,
        `真实故事：${state.story}`,
        `五幕资料：相识=${state.storyBeats?.origin || "未填"}；相知=${state.storyBeats?.knowing || "未填"}；确认=${state.storyBeats?.confirm || "未填"}；相伴=${state.storyBeats?.companionship || "未填"}；承诺=${state.storyBeats?.promise || "未填"}`,
        `主题：${state.theme}；时长：${state.duration} 秒；情绪：${state.tone}；画幅：${state.aspect}。`,
        "只输出 JSON，包含 logline、visualLanguage、acts 和 shots。shots 每项包含 start,end,title,scene,framing,camera,action,prompt。",
        "所有镜头加起来必须等于总时长。不要增加用户没有提供的真实亲人姓名或事故。"
      ].join("\n"),
      instructions: "你是专业婚礼电影编剧和分镜师，保持真实、克制、可执行。"
    });
    const job = await waitForJob(result.job.id, (current) => {
      button.textContent = `故事生成中 ${current.progress || 0}%`;
    });
    const content = job.result?.content || "";
    try {
      const parsed = parseJsonContent(content);
      treatment = {
        ...treatment,
        logline: parsed.logline || treatment.logline,
        visualLanguage: parsed.visualLanguage || treatment.visualLanguage,
        acts: parsed.acts || treatment.acts
      };
      if (Array.isArray(parsed.shots) && parsed.shots.length) {
        storyboard = parsed.shots.map((shot, index) => ({
          id: `shot-${String(index + 1).padStart(2, "0")}`,
          number: index + 1,
          start: Number(shot.start || 0),
          end: Number(shot.end || 0),
          duration: Math.max(0.1, Number(shot.end || 0) - Number(shot.start || 0)),
          title: shot.title || `镜头 ${index + 1}`,
          scene: shot.scene || "",
          shot: shot.framing || "中景",
          move: shot.camera || "固定镜头",
          act: treatment.acts[Math.min(2, Math.floor(index / 4))]?.label || "",
          status: "待生成",
          prompt: shot.prompt || shot.action || ""
        }));
      }
      saveState({ quiet: true });
      render();
      showToast("AI 故事与分镜已写入项目");
    } catch {
      showToast("模型已返回内容，但分镜 JSON 无法解析，可在任务中心查看原文");
    }
  }
  if (action === "generate-speech") {
    const text = document.querySelector("[data-speech-text]")?.value.trim();
    if (!text) {
      showToast("请先输入旁白文案");
      return;
    }
    button.disabled = true;
    button.textContent = "正在生成旁白…";
    const result = await api.generateVoice({
      projectId: currentProjectId,
      text,
      title: "婚礼旁白"
    });
    await refreshRuntime();
    showToast("旁白已生成并保存到资产库");
    const audio = document.querySelector("[data-audio-preview]");
    if (audio && result.url) {
      audio.src = api.mediaUrl(result.url);
      audio.hidden = false;
      audio.play().catch(() => {});
    }
  }
  if (action === "audition-voice") {
    const text = document.querySelector("[data-speech-text]")?.value.trim();
    if (!text) {
      showToast("请先输入试听文案");
      return;
    }
    button.disabled = true;
    button.textContent = "生成试听中…";
    const result = await api.generateVoice({
      projectId: currentProjectId,
      text,
      modelId: button.dataset.modelId,
      title: "音色试听"
    });
    await refreshRuntime();
    showToast("音色试听已生成");
    const audio = document.querySelector("[data-audio-preview]");
    if (audio && result.url) {
      audio.src = api.mediaUrl(result.url);
      audio.hidden = false;
      audio.play().catch(() => {});
    }
  }
  if (action === "generate-music") {
    button.disabled = true;
    button.textContent = "正在编排原创配乐…";
    const result = await api.generateMusic({
      projectId: currentProjectId,
      duration: state.duration,
      mood: selectedMusicMood,
      title: `${state.projectName} · 原创配乐`
    });
    await refreshRuntime();
    showToast("原创配乐已生成并保存到资产库");
    const audio = document.querySelector("[data-audio-preview]");
    if (audio && result.url) {
      audio.src = api.mediaUrl(result.url);
      audio.hidden = false;
      audio.play().catch(() => {});
    }
  }
  if (action === "generate-subtitles") {
    const text = document.querySelector("[data-speech-text]")?.value.trim();
    if (!text) {
      showToast("请先填写字幕或旁白文案");
      return;
    }
    const result = await api.generateSubtitles({
      projectId: currentProjectId,
      duration: state.duration,
      text,
      title: `${state.projectName} · 字幕`
    });
    await refreshRuntime();
    showToast("SRT 字幕已保存到资产库");
  }
  if (action === "render-project") {
    const timelineResult = await api.getProjectTimeline(
      currentProjectId,
      state.mode || "story"
    );
    const timeline = timelineResult.item;
    button.disabled = true;
    button.textContent = "正在合成成片…";
    const result = await api.renderProductionTimeline(currentProjectId, {
      mode: state.mode || "story",
      timelineHash: timeline.hash
    });
    await trackJob(result.job.id, "当前时间轴成片合成");
    await refreshRuntime();
  }
  if (action === "build-treatment") {
    rebuildProject();
    showToast("故事大纲与分镜已按当前信息重新生成");
    render();
  }
  if (action === "build-storyboard") {
    storyboard = buildStoryboard(state);
    const project = runtime.projects.find((item) => item.id === currentProjectId);
    const template = runtime.templates.find((item) => item.id === project?.templateId);
    storyboard = bindStoryboardToTemplate(storyboard, template);
    treatment = buildStoryTreatment(state);
    state.storyboard = storyboard;
    saveState({ quiet: true });
    showToast("已重新推导分镜，总帧数按 24 FPS 校验");
    render();
  }
  if (action === "set-theme") {
    state.theme = button.dataset.theme;
    rebuildProject();
    saveState({ quiet: true });
    render();
    showToast(`叙事主题已切换为「${state.theme}」`);
  }
  if (action === "open-upload") {
    const gender = button.dataset.gender || "groom";
    document.querySelector(`#photo-${gender}`)?.click();
  }
  if (action === "remove-photo") {
    const gender = button.dataset.gender;
    state.photos[gender] = "";
    state.photoSources[gender] = "";
    if (state.photoAssetIds) state.photoAssetIds[gender] = "";
    saveState({ quiet: true });
    render();
    showToast("人物照片已从项目草稿移除");
  }
  if (action === "copy-look") {
    const focus = button.dataset.focus;
    const name = focus === "groom" ? state.groom : state.bride;
    await copyText(`${name}人物连续性锚点：保持脸型、五官比例、发际线与手部特征一致；古代、民国与今生三套造型只改变发型和服装，不改变人物身份。`);
  }
  if (action === "copy-identity") {
    await copyText(
      `男主角：${state.groom}\n女主角：${state.bride}\n连续性：同一对手跨越三个时代，保持脸型、五官比例、发际线与手部特征一致。`
    );
  }
  if (action === "copy-shot") {
    const shot = storyboard.find((item) => item.id === button.dataset.shotId);
    if (shot) await copyText(shot.prompt);
  }
  if (action === "export-task-manifest") {
    exportTaskManifest();
  }
  if (action === "select-scene") {
    showToast(`已选择场景：${button.dataset.scene}`);
    document.querySelectorAll(".scene-card").forEach((card) => card.classList.remove("selected"));
    button.classList.add("selected");
  }
  if (action === "copy-analysis") {
    await copyText(
      `${SOURCE_METHOD.map((step, index) => `${index + 1}. ${step.title}（${step.time}）：${step.description}`).join("\n")}`
    );
  }
  if (action === "music-choice") {
    document.querySelectorAll("[data-action='music-choice']").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    selectedMusicMood = button.textContent.includes("温暖钢琴") ? "bright-romantic" : "warm-cinematic";
    showToast("配乐方向已切换");
  }
  if (action === "reset-project") {
    if (window.confirm("确认清理当前草稿并恢复默认项目吗？此操作不可撤销。")) {
      state = structuredClone(DEFAULT_PROJECT);
      localStorage.removeItem(STORAGE_KEY);
      treatment = buildStoryTreatment(state);
      storyboard = buildStoryboard(state);
      activeRoute = "overview";
      render();
      showToast("当前草稿已清理");
    }
  }
}

async function processPhoto(file, gender) {
  if (!file.type.startsWith("image/")) {
    showToast("请选择图片文件");
    return;
  }
  if (file.size > 18 * 1024 * 1024) {
    showToast("照片超过 18MB，请先压缩后再上传");
    return;
  }
  try {
    const dataUrl = await compressImage(file);
    let photoUrl = dataUrl;
    if (runtime.online) {
      const uploaded = await api.uploadProjectPhoto(currentProjectId, gender, file);
      photoUrl = api.mediaUrl(uploaded.asset.url);
      state.photoAssetIds = {
        ...(state.photoAssetIds || {}),
        [gender]: uploaded.asset.id
      };
    }
    state.photos[gender] = photoUrl;
    saveState({ quiet: true });
    render();
    showToast(`${gender === "groom" ? "男主角" : "女主角"}照片已就位`);
  } catch {
    showToast("照片读取失败，请换一张 JPG 或 PNG 图片");
  }
}

async function uploadTemplateFile(file) {
  if (!file.type.startsWith("video/")) {
    showToast("请选择视频文件");
    return;
  }
  if (!runtime.online) {
    showToast("模板上传需要先启动本地服务：npm start");
    return;
  }
  try {
    showToast("正在上传模板并建立素材副本…");
    const result = await api.uploadTemplate(file, file.name.replace(/\.[^.]+$/, ""));
    showToast(`模板已导入：${result.item.title}`);
    await trackJob(result.job.id, "模板镜头分析");
    await refreshRuntime();
  } catch (error) {
    showToast(`模板导入失败：${error.message}`);
  }
}

async function uploadPhotoMovieFiles(files) {
  if (!runtime.online || !files.length) return;
  let uploaded = 0;
  for (const file of files.filter((item) => item.type.startsWith("image/"))) {
    try {
      await api.uploadAsset(file, {
        kind: "project-photo",
        projectId: currentProjectId,
        title: file.name.replace(/\.[^.]+$/, "")
      });
      uploaded += 1;
    } catch (error) {
      showToast(`照片 ${file.name} 上传失败：${error.message}`);
    }
  }
  await refreshRuntime();
  showToast(`已加入 ${uploaded} 张照片电影素材`);
}

async function uploadMaterialFiles(kind, files) {
  if (!runtime.online || !files.length) return;
  let uploaded = 0;
  for (const file of files) {
    try {
      await api.uploadAsset(file, {
        kind,
        projectId: currentProjectId,
        title: file.name.replace(/\.[^.]+$/, "")
      });
      uploaded += 1;
    } catch (error) {
      showToast(`${file.name} 上传失败：${error.message}`);
    }
  }
  await refreshRuntime();
  showToast(`已归档 ${uploaded} 份${materialLabel(kind)}`);
}

function materialLabel(kind) {
  const labels = {
    "project-photo": "婚礼照片",
    "story-card": "故事资料",
    "outfit-reference": "服装参考",
    "scene-reference": "场景参考",
    "video-clip": "视频素材",
    music: "音乐",
    voice: "旁白"
  };
  return labels[kind] || "素材";
}

async function trackJob(jobId, label = "模型任务") {
  try {
    const job = await waitForJob(jobId, (current) => {
      const progress = document.querySelector("[data-job-progress]");
      if (progress) {
        progress.textContent = `${current.kind} · ${current.status} · ${current.progress || 0}%`;
      }
    });
    showToast(`${label}完成`);
    return job;
  } catch (error) {
    showToast(`${label}：${error.message}`);
    return null;
  }
}

function parseJsonContent(text) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error("没有合法 JSON");
  }
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      image.onerror = reject;
      image.onload = () => {
        const maxSide = 1100;
        const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * ratio);
        canvas.height = Math.round(image.height * ratio);
        const context = canvas.getContext("2d");
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.84));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function rebuildProject() {
  state = normalizeProject(state);
  treatment = buildStoryTreatment(state);
  storyboard = buildStoryboard(state);
  const project = runtime.projects.find((item) => item.id === currentProjectId);
  const template = runtime.templates.find((item) => item.id === project?.templateId);
  storyboard = bindStoryboardToTemplate(storyboard, template);
  state.storyboard = storyboard;
  saveState({ quiet: true });
}

function updateLiveFrameDependentText() {
  const readout = document.querySelector(".frame-readout strong");
  if (readout) readout.textContent = (state.duration * 24).toLocaleString("zh-CN");
}

function getCopyText(key) {
  const values = {
    "groom-prompt": `${state.groom}，成年东方男性，五官自然，眉眼温和，面部轮廓清晰，肩背自然挺拔。参考上传照片保持脸型、五官比例、发际线一致，真实皮肤质感，不做过度磨皮。`,
    "bride-prompt": `${state.bride}，成年东方女性，柔和骨相，眼神清亮，端庄而松弛。参考上传照片保持脸型、五官比例、发际线一致，妆容自然，真实肤质，不做网红脸。`,
    "continuity-prompt": "同一对手跨越古代、民国与今生。三套造型变化时，人物脸型、五官比例、发际线与手部特征保持一致；牵手动作作为跨时代匹配点。"
  };
  return values[key] || "";
}

async function copyText(text) {
  if (!text) {
    showToast("没有可复制的内容");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast("已复制到剪贴板");
  } catch {
    showToast("浏览器未允许剪贴板，请手动选择文本");
  }
}

function exportTaskManifest() {
  const manifest = {
    schema: "xying-model-task-manifest/v1",
    project: {
      name: state.projectName,
      couple: [state.groom, state.bride],
      theme: state.theme,
      duration: state.duration,
      fps: 24,
      totalFrames: getFramePlan(state.duration).totalFrames,
      aspect: state.aspect
    },
    provider: "local-model-router",
    requiresModelAvailabilityCheck: true,
    unknownStatusPolicy: "query-original-task-only",
    autoRetryPaidSubmission: false,
    items: [
      {
        id: "character-groom",
        kind: "image",
        title: `${state.groom} · 人物定妆参考`,
        prompt: `成年东方男性 ${state.groom}，正面全身与侧面参考，身份一致，真实皮肤质感。`
      },
      {
        id: "character-bride",
        kind: "image",
        title: `${state.bride} · 人物定妆参考`,
        prompt: `成年东方女性 ${state.bride}，正面全身与侧面参考，身份一致，真实皮肤质感。`
      },
      ...storyboard.map((shot) => ({
        id: shot.id,
        kind: "video",
        title: `第 ${String(shot.number).padStart(2, "0")} 镜 · ${shot.title}`,
        duration: shot.duration,
        framesAt24fps: Math.round(shot.duration * 24),
        prompt: shot.prompt
      }))
    ]
  };
  const blob = new Blob([JSON.stringify(manifest, null, 2)], {
    type: "application/json;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `模型生成清单-${state.groom}-${state.bride}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("任务单已导出，未提交任何付费任务");
}

function showToast(message) {
  const stack = document.querySelector("#toast-stack");
  const toast = document.createElement("div");
  toast.className = "toast success";
  toast.textContent = message;
  stack.appendChild(toast);
  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    window.setTimeout(() => toast.remove(), 220);
  }, 2800);
}

function createRipple(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const ripple = document.createElement("span");
  ripple.className = "click-ripple";
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  document.body.appendChild(ripple);
  window.setTimeout(() => ripple.remove(), 700);
}

function initAmbient() {
  const canvas = document.querySelector("#ambient-canvas");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!canvas || reducedMotion) return;

  const context = canvas.getContext("2d");
  const pointer = { x: 0, y: 0, lastX: 0, lastY: 0 };
  let width = 0;
  let height = 0;
  let particles = [];

  const resize = () => {
    width = canvas.width = window.innerWidth * window.devicePixelRatio;
    height = canvas.height = window.innerHeight * window.devicePixelRatio;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    context.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    const count = Math.min(42, Math.max(18, Math.floor(window.innerWidth / 34)));
    particles = Array.from({ length: count }, () => createParticle());
  };

  const createParticle = () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    size: 2.5 + Math.random() * 7,
    speedX: -0.12 + Math.random() * 0.24,
    speedY: 0.1 + Math.random() * 0.3,
    rotation: Math.random() * Math.PI * 2,
    spin: -0.006 + Math.random() * 0.012,
    alpha: 0.04 + Math.random() * 0.12,
    hue: Math.random() > 0.74 ? 35 : 354
  });

  const drawPetal = (particle) => {
    context.save();
    context.translate(particle.x, particle.y);
    context.rotate(particle.rotation);
    context.beginPath();
    context.moveTo(0, -particle.size);
    context.bezierCurveTo(
      particle.size * 0.85,
      -particle.size * 0.4,
      particle.size * 0.7,
      particle.size * 0.75,
      0,
      particle.size
    );
    context.bezierCurveTo(
      -particle.size * 0.7,
      particle.size * 0.75,
      -particle.size * 0.85,
      -particle.size * 0.4,
      0,
      -particle.size
    );
    context.fillStyle = `hsla(${particle.hue}, 66%, 50%, ${particle.alpha})`;
    context.fill();
    context.restore();
  };

  const animate = () => {
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const wind = pointer.x - pointer.lastX;
    particles.forEach((particle) => {
      particle.x += particle.speedX + wind * 0.006;
      particle.y += particle.speedY;
      particle.rotation += particle.spin;
      if (particle.y > window.innerHeight + 20) {
        particle.y = -20;
        particle.x = Math.random() * window.innerWidth;
      }
      if (particle.x > window.innerWidth + 20) particle.x = -20;
      if (particle.x < -20) particle.x = window.innerWidth + 20;
      drawPetal(particle);
    });
    pointer.lastX = pointer.x;
    pointer.lastY = pointer.y;
    window.requestAnimationFrame(animate);
  };

  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    const glow = document.querySelector("#cursor-glow");
    glow.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
  });
  document.addEventListener("mouseleave", () => {
    document.querySelector("#cursor-glow").style.opacity = "0";
  });
  document.addEventListener("mouseenter", () => {
    document.querySelector("#cursor-glow").style.opacity = "0.78";
  });

  resize();
  animate();
}

function addMobileMenu() {
  const button = document.createElement("button");
  button.className = "mobile-menu-button";
  button.innerHTML = icon("menu");
  button.setAttribute("aria-label", "打开创作导航");
  button.addEventListener("click", () => {
    document.querySelector(".sidebar").classList.toggle("open");
  });
  document.querySelector("#app").appendChild(button);
}

addMobileMenu();
initAmbient();
window.addEventListener("hashchange", restoreRouteFromHash);
if (!window.location.hash) {
  window.history.replaceState(null, "", hashForRoute("overview"));
}
restoreRouteFromHash();
refreshRuntime({ rerender: true }).then(() => {
  if (!runtime.online) {
    showToast("本地模型服务未连接，请运行 npm start");
  }
});
