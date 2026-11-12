import {
  buildStoryTreatment,
  buildStoryboard,
  getFramePlan,
  normalizeProject
} from "./story-engine.mjs";
import { api, waitForJob } from "./api.js";

const STORAGE_KEY = "xying-wedding-film-studio-v1";

const DEFAULT_PROJECT = {
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
  },
  vvvStyle: ""
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

const NAV_TREE = [
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
          { id: "step-01", label: "01 故事采集", route: "step1" },
          { id: "step-02", label: "02 文案写作包", route: "step2" },
          { id: "step-03", label: "03 新人确认文案", route: "step3" }
        ]
      },
      {
        id: "step-phase-voice",
        label: "旁白与声音",
        symbol: "声",
        children: [
          { id: "step-04", label: "04 音色试听", route: "step4" },
          { id: "step-05", label: "05 完整旁白", route: "step5" }
        ]
      },
      {
        id: "step-phase-visual",
        label: "分镜与画面",
        symbol: "镜",
        children: [
          { id: "step-06", label: "06 分镜设计", route: "step6" },
          { id: "step-07", label: "07 重点静帧", route: "step7" },
          { id: "step-08", label: "08 剩余分镜图片", route: "step8" },
          { id: "step-09", label: "09 图生视频", route: "step9" }
        ]
      },
      {
        id: "step-phase-finish",
        label: "音乐与交付",
        symbol: "成",
        children: [
          { id: "step-10", label: "10 BGM 试听", route: "step10" },
          { id: "step-11", label: "11 配音与 BGM 试混", route: "step11" },
          { id: "step-12", label: "12 完整混音", route: "step12" },
          { id: "step-13", label: "13 字幕预览", route: "step13" },
          { id: "step-14", label: "14 正式交付", route: "step14" }
        ]
      }
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

const WIZARD_STEPS = [
  { number: 1, title: "故事采集", subtitle: "新人资料、五幕故事与补充照片", route: "step1" },
  { number: 2, title: "文案写作包", subtitle: "生成旁白初稿与事实对应", route: "step2" },
  { number: 3, title: "新人确认文案", subtitle: "新人明确确认当前版本", route: "step3" },
  { number: 4, title: "音色试听", subtitle: "生成并试听中文旁白", route: "step4" },
  { number: 5, title: "完整旁白", subtitle: "确认读音、情绪、停顿和时长", route: "step5" },
  { number: 6, title: "分镜设计", subtitle: "按旁白实际节奏确认镜头表", route: "step6" },
  { number: 7, title: "三个重点静帧", subtitle: "先确认男女主关键造型与时代", route: "step7" },
  { number: 8, title: "剩余分镜图片", subtitle: "补齐场景、服装和关键帧", route: "step8" },
  { number: 9, title: "图生视频", subtitle: "逐镜生成、检查身份与动作", route: "step9" },
  { number: 10, title: "BGM 风格试听", subtitle: "选择情绪、节奏和授权音乐", route: "step10" },
  { number: 11, title: "配音与 BGM 试混", subtitle: "确认声音层级与情绪转折", route: "step11" },
  { number: 12, title: "完整混音", subtitle: "全长检查旁白、音乐和留白", route: "step12" },
  { number: 13, title: "字幕预览", subtitle: "完整观看带字幕样片", route: "step13" },
  { number: 14, title: "正式成片交付", subtitle: "导出 MP4、SRT、工程和检查记录", route: "step14" }
];

for (const step of WIZARD_STEPS) {
  ROUTE_META[step.route] = [
    `第 ${step.number} 步 · ${step.title}`,
    step.subtitle
  ];
}

const VVV_STYLE_PRESETS = [
  {
    id: "album",
    title: "Album · 现代留白圆角画册",
    format: "16:9 / 9:16",
    description: "圆角画册式故事页，按情绪段落组织照片，适合完整爱情故事。",
    image: "./public/vvv-templates/album.jpg"
  },
  {
    id: "dv-story",
    title: "DV Story · 我们的故事",
    format: "16:9",
    description: "DV 取景框、打字字幕和胶片条，适合校园与成长记忆。",
    image: "./public/vvv-templates/dv-story.jpg"
  },
  {
    id: "comedy",
    title: "Comedy · 婚礼喜剧开场",
    format: "16:9",
    description: "轻松热场、反转和宾客互动，适合宴会开场。",
    image: "./public/vvv-templates/comedy.jpg"
  },
  {
    id: "doodle",
    title: "Doodle · 手绘我们结婚啦",
    format: "16:9",
    description: "白纸手绘与照片穿插，轻松温柔。",
    image: "./public/vvv-templates/doodle.jpg"
  },
  {
    id: "starter",
    title: "Starter · 节拍相册",
    format: "16:9 / 9:16",
    description: "短平快的婚礼照片卡点片，适合快速出片和竖屏传播。",
    image: "./public/vvv-templates/starter.jpg"
  },
  {
    id: "editorial",
    title: "Editorial · 简约杂志",
    format: "16:9",
    description: "白色杂志版面、手写标题和诗句式文案。",
    image: "./public/vvv-templates/editorial.jpg"
  },
  {
    id: "cinema",
    title: "Cinema · 黑幕影院开场",
    format: "16:9",
    description: "适合婚宴大屏的影院开场、日期线与成长照片。",
    image: "./public/vvv-templates/cinema.jpg"
  },
  {
    id: "memoir",
    title: "Memoir · 手写胶片故事",
    format: "16:9",
    description: "手写、胶片、家书和人生章节，适合长篇婚礼开场。",
    image: "./public/vvv-templates/memoir.jpg"
  }
];

let state = loadState();
let activeRoute = "overview";
let activeFocus = null;
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
  jobs: []
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
          name: state.projectName,
          groom: state.groom,
          bride: state.bride,
          weddingDate: state.date,
          city: state.city,
          story: state.story,
          storyBeats: state.storyBeats,
          duration: state.duration,
          theme: state.theme,
          tone: state.tone,
          aspect: state.aspect,
          treatment,
          storyboard,
          selectedLooks: state.selectedLooks,
          workflow: state.workflow,
          vvvStyle: state.vvvStyle
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
    const [bootstrap, health] = await Promise.all([api.bootstrap(), api.health()]);
    runtime = {
      online: true,
      health,
      projects: bootstrap.projects || [],
      templates: bootstrap.templates || [],
      models: bootstrap.models || [],
      looks: bootstrap.looks || [],
      assets: bootstrap.assets || [],
      exports: bootstrap.exports || [],
      jobs: bootstrap.jobs || []
    };
    const project =
      runtime.projects.find((item) => item.id === currentProjectId) || runtime.projects[0];
    if (project) {
      currentProjectId = project.id;
      state = normalizeProject({
        ...state,
        projectName: project.name || state.projectName,
        groom: project.groom || state.groom,
        bride: project.bride || state.bride,
        date: project.weddingDate || state.date,
        city: project.city || state.city,
        story: project.story || state.story,
        storyBeats: project.storyBeats || state.storyBeats,
        duration: project.duration || state.duration,
        theme: project.theme || state.theme,
        tone: project.tone || state.tone,
        aspect: project.aspect || state.aspect,
        photos: {
          groom: project.photos?.groom || state.photos.groom,
          bride: project.photos?.bride || state.photos.bride
        },
        photoSources: project.photoSources || state.photoSources,
        selectedLooks: project.selectedLooks || state.selectedLooks,
        workflow: project.workflow || state.workflow,
        vvvStyle: project.vvvStyle || state.vvvStyle
      });
      treatment = buildStoryTreatment(state);
      storyboard = buildStoryboard(state);
      if (project.treatment) treatment = project.treatment;
      if (Array.isArray(project.storyboard) && project.storyboard.length) {
        storyboard = project.storyboard;
      }
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

function render() {
  document.querySelectorAll(".top-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.route === activeRoute);
  });
  document.querySelector("#top-project-name").textContent = state.projectName;
  renderNav();
  const content = document.querySelector("#main-content");
  const view = getView(activeRoute);
  content.innerHTML = view;
  content.scrollTop = 0;
  window.scrollTo({ top: 0, behavior: "instant" });
  bindCurrentView();
}

function renderNav() {
  const root = document.querySelector("#nav-tree");
  root.innerHTML = NAV_TREE.map((node) => renderNavNode(node, 1)).join("");
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
        data-route="${node.route || ""}"
        data-theme="${node.theme || ""}"
        data-focus="${node.focus || ""}"
        data-scene="${node.scene || ""}"
        data-beat="${node.beat ?? ""}"
        data-asset="${node.asset || ""}"
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
    overview: overviewPage,
    wizard: wizardPage,
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
    <header class="page-heading">
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
  const uploadedCount = Number(Boolean(state.photos.groom)) + Number(Boolean(state.photos.bride));
  return `
    <div class="page">
      <section class="hero">
        <div class="hero-copy">
          <div class="hero-badge"><span class="spark"></span>真实故事 · AI 视觉 · 婚礼首映</div>
          <h1 class="hero-title">
            <span>把你们的故事，</span>
            <span>拍成一部 <em>婚礼微电影</em></span>
          </h1>
          <p>输入姓名、人物照片与爱情故事，完成模板解析、叙事、定妆、分镜、图片视频生成、语音配乐和本地成片合成。</p>
          <div class="hero-actions">
            <button class="button primary" data-route="wizard">${icon("sparkle")}开始 14 步制作</button>
            <button class="button ghost" data-route="assets">打开素材中心${icon("arrow")}</button>
          </div>
          <div class="hero-stats">
            <div class="hero-stat"><strong>${plan.totalFrames}</strong><span>总画格 / 24 FPS</span></div>
            <div class="hero-stat"><strong>03</strong><span>剧情时代 / 同一对手</span></div>
            <div class="hero-stat"><strong>${uploadedCount}/2</strong><span>人物照片已就位</span></div>
          </div>
        </div>
        <div class="hero-visual">
          <div class="film-poster">
            <div class="poster-inner">
              <div class="poster-label">A WEDDING FILM</div>
              <div class="poster-names">${esc(state.groom)}<br />& ${esc(state.bride)}</div>
              <div class="poster-date">${formatDate(state.date)} · ${esc(state.city)}</div>
            </div>
            <div class="poster-float top">${icon("sparkle")} 故事引擎已就绪</div>
            <div class="poster-float bottom">${plan.fps} FPS · ${state.duration}s</div>
          </div>
        </div>
      </section>

      ${progressStrip(0)}

      <div class="dashboard-grid">
        <div class="stack">
          <section class="card card-pad">
            <div class="section-title">
              <div><h2>先告诉我，故事里的你们是谁</h2><p>姓名会写入剧情、分镜、提示词和片尾字幕</p></div>
              <span class="badge red">第 1 步</span>
            </div>
            <div class="project-brief">
              <div class="field">
                <label for="overview-project">项目名称</label>
                <input id="overview-project" class="input" data-field="projectName" value="${esc(state.projectName)}" />
              </div>
              <div class="field">
                <label for="overview-date">婚礼日期</label>
                <input id="overview-date" class="input" type="date" data-field="date" value="${esc(state.date)}" />
              </div>
              <div class="field">
                <label for="overview-groom">男主角姓名</label>
                <input id="overview-groom" class="input" data-field="groom" value="${esc(state.groom)}" placeholder="请输入姓名" />
              </div>
              <div class="field">
                <label for="overview-bride">女主角姓名</label>
                <input id="overview-bride" class="input" data-field="bride" value="${esc(state.bride)}" placeholder="请输入姓名" />
              </div>
              <div class="field full">
                <label for="overview-story">你们的爱情故事</label>
                <textarea id="overview-story" class="textarea" data-field="story" rows="4">${esc(state.story)}</textarea>
                <span class="field-hint">越具体越好：在哪里认识、哪件小事最难忘、两个人现在的状态。</span>
              </div>
            </div>
            <div class="divider"></div>
            <div class="section-title" style="margin-bottom: 0;">
              <div><h3>婚礼电影感由故事决定，不由滤镜决定</h3><p>建议 40–60 秒，先让亲友看懂“你们是谁”，再被情绪打动。</p></div>
              <button class="button secondary small-button" data-action="build-treatment">${icon("sparkle")}重构故事大纲</button>
            </div>
          </section>

          <section class="card card-pad">
            <div class="section-title">
              <div><h2>创作路线</h2><p>从真实故事到可交付成片</p></div>
              <button class="text-button" data-route="guide">查看操作指南 →</button>
            </div>
            <div class="feature-grid">
              <div class="feature-card"><div class="feature-icon">叙</div><h4>故事共创</h4><p>提炼真实细节，生成相识、相知、确认、相伴、承诺五幕。</p></div>
              <div class="feature-card"><div class="feature-icon">容</div><h4>人物锁定</h4><p>男女主照片、身份提示词与多时代造型连续。</p></div>
              <div class="feature-card"><div class="feature-icon">帧</div><h4>24 FPS 分镜</h4><p>在镜头级对齐时长、动作和总画格。</p></div>
            </div>
          </section>
        </div>

        <div class="stack">
          <section class="project-summary card">
            <p class="eyebrow">CURRENT TREATMENT</p>
            <h3>${esc(treatment.logline.split("，")[0])}</h3>
            <div class="couple">${esc(coupleName())}</div>
            <div class="summary-meta">
              <div class="summary-meta-item"><span>叙事主题</span><strong>${esc(state.theme)}</strong></div>
              <div class="summary-meta-item"><span>情绪基调</span><strong>${esc(state.tone)}</strong></div>
              <div class="summary-meta-item"><span>成片时长</span><strong>${state.duration} 秒 / ${framePlan().totalFrames} 帧</strong></div>
              <div class="summary-meta-item"><span>画幅规格</span><strong>${esc(state.aspect)} · 24 FPS</strong></div>
            </div>
          </section>
          <section class="card card-pad">
            <div class="section-title"><div><h3>开机前检查</h3><p>当前项目进度</p></div></div>
            <div class="checklist">
              <div class="check-item"><span class="check-icon">✓</span><div class="check-copy"><strong>故事主题已选择</strong><small>${esc(state.theme)} · ${esc(state.tone)}</small></div></div>
              <div class="check-item"><span class="check-icon ${state.photos.groom ? "" : "pending"}">${state.photos.groom ? "✓" : "!"}</span><div class="check-copy"><strong>男主角照片</strong><small>${state.photos.groom ? "已上传，可用于身份参考" : "进入人物设定上传"}</small></div></div>
              <div class="check-item"><span class="check-icon ${state.photos.bride ? "" : "pending"}">${state.photos.bride ? "✓" : "!"}</span><div class="check-copy"><strong>女主角照片</strong><small>${state.photos.bride ? "已上传，可用于身份参考" : "进入人物设定上传"}</small></div></div>
              <div class="check-item"><span class="check-icon ${runtime.online ? "" : "pending"}">4</span><div class="check-copy"><strong>统一模型服务</strong><small>${runtime.online ? "本地服务在线，可提交生成任务" : "运行 npm start 后启用"}</small></div></div>
            </div>
          </section>
        </div>
      </div>
    </div>
  `;
}

function workflowReady(stepNumber) {
  const assets = runtime.assets || [];
  const count = (kind) => assets.filter((asset) => asset.kind === kind).length;
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
    return runtime.looks.some((look) => look.imagePath) || count("image") > 0;
  }
  if (stepNumber === 8) {
    return runtime.looks.filter((look) => look.imagePath).length + count("image") >= 3;
  }
  if (stepNumber === 9) {
    return count("video") > 0 || count("project-photo") >= 2 || count("export") > 0;
  }
  if (stepNumber === 10) return count("music") > 0;
  if (stepNumber === 11 || stepNumber === 12) {
    return count("voice") > 0 && count("music") > 0;
  }
  if (stepNumber >= 13) return count("export") > 0;
  return false;
}

function wizardPage() {
  const workflow = state.workflow || { currentStep: 1, approvals: {} };
  const currentStep = Math.min(14, Math.max(1, Number(workflow.currentStep || 1)));
  const current = WIZARD_STEPS[currentStep - 1];
  const ready = workflowReady(currentStep);
  const completed = Object.keys(workflow.approvals || {}).filter(
    (key) => workflow.approvals[key]
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
              const done = Boolean(workflow.approvals?.[step.number]);
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
              ${allDone ? '<button class="button primary" data-route="export">查看正式交付</button>' : `<button class="button primary" data-action="approve-workflow-step" ${ready ? "" : "disabled"}>${icon("arrow")}确认本步并继续</button>`}
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

function workflowStepPage(number) {
  const step = WIZARD_STEPS[number - 1];
  const ready = workflowReady(number);
  const completed = Boolean(state.workflow?.approvals?.[number]);
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
      ${workflowStepContent(number)}
      <section class="step-confirm card">
        <div><strong>${ready ? "本步骤的最低价材料条件已经满足" : "本步骤仍有材料缺口"}</strong><p>${ready ? "请先实际检查画面或试听，再确认进入下一步。确认记录会随项目保存。" : "返回本页上方或素材中心补齐必要材料后，确认按钮才会开放。"}</p></div>
        <div class="step-confirm-actions">
          ${number > 1 ? `<button class="button ghost small-button" data-route="step${number - 1}">上一步</button>` : ""}
          <button class="button primary" data-action="approve-workflow-step" ${ready ? "" : "disabled"}>${icon("arrow")}确认并进入第 ${Math.min(14, number + 1)} 步</button>
        </div>
      </section>
    </div>
  `;
}

function workflowStepContent(number) {
  const voiceAssets = runtime.assets.filter((asset) => asset.kind === "voice" && asset.url);
  const musicAssets = runtime.assets.filter((asset) => asset.kind === "music" && asset.url);
  const imageAssets = runtime.assets.filter((asset) =>
    ["image", "look-image", "project-photo", "outfit-reference", "scene-reference"].includes(asset.kind)
  );
  const videoAssets = runtime.assets.filter((asset) => asset.kind === "video" && asset.url);
  const exports = runtime.assets.filter((asset) => asset.kind === "export" && asset.url);
  const project = runtime.projects.find((item) => item.id === currentProjectId);
  const template = runtime.templates.find((item) => item.id === project?.templateId);

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
      </div>`,
    8: `
      <div class="content-grid">
        <section class="card card-pad"><div class="section-title"><div><h2>剩余分镜图片</h2><p>按镜号生成，不批量盲出图</p></div><span class="badge gold">${imageAssets.length} 张</span></div><button class="button primary" data-route="generate">进入图片生成中心</button></section>
        <section class="card card-pad"><div class="section-title"><div><h3>图片检查</h3><p>脸、手、服装、时代和构图</p></div></div><div class="checklist"><div class="check-item"><span class="check-icon pending">1</span><div class="check-copy"><strong>同一张脸</strong><small>跨镜保持五官比例与发际线</small></div></div><div class="check-item"><span class="check-icon pending">2</span><div class="check-copy"><strong>正确手部</strong><small>牵手动作不得粘连或增指</small></div></div><div class="check-item"><span class="check-icon pending">3</span><div class="check-copy"><strong>服装连续</strong><small>每镜绑定明确造型资产</small></div></div></div></section>
      </div>${renderImageAssets(imageAssets.slice(0,12))}`,
    9: `
      <div class="content-grid">
        <section class="card card-pad"><div class="section-title"><div><h2>参考视频人物替换</h2><p>${template ? esc(template.title) : "尚未应用抖音模板"}</p></div><span class="badge gold">4–8 秒单镜</span></div><textarea class="textarea" data-video-prompt style="min-height:150px;">保持参考视频的人物动作、机位、镜头运动和剪辑节奏；将男主角替换为上传照片中的${state.groom}，女主角替换为${state.bride}。保持面部身份、发型、服装、手部接触和身高差连续。背景保持原参考视频不变。</textarea><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;"><button class="button ghost small-button" data-action="replacement-policy" data-policy="keep">保持原背景</button><button class="button ghost small-button" data-action="replacement-policy" data-policy="change">替换背景</button></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;"><button class="button secondary" data-route="generate">打开生成中心</button><button class="button primary" data-action="generate-template-shot" ${template ? "" : "disabled"}>按模板生成替换镜头</button></div></section>
        <section class="card card-pad"><div class="section-title"><div><h3>替换提示词结构</h3><p>必须写清七项</p></div></div><div class="tag-cloud"><span class="tag">参考视频</span><span class="tag">男女主参考图</span><span class="tag">身份锁定</span><span class="tag">动作保持</span><span class="tag">镜头保持</span><span class="tag">背景保留/替换</span><span class="tag">负向约束</span></div><div class="notice" style="margin-top:14px;">${icon("shield")}<div><strong>先出首帧</strong>首帧有串脸、手部错误时先修图，不进入视频生成。</div></div></section>
      </div>
      <section class="card card-pad" style="margin-top:18px;"><div class="section-title"><div><h2>已生成视频</h2><p>${videoAssets.length} 个</p></div></div>${renderVideoAssets(videoAssets)}</section>`,
    10: `
      <div class="content-grid">
        <section class="card card-pad"><div class="section-title"><div><h2>BGM 风格试听</h2><p>从第一个画面开始铺底，为人声留出位置</p></div></div><div class="choice-grid" style="grid-template-columns:1fr;"><button class="choice-card active" data-action="music-choice"><span class="choice-symbol">弦</span><h4>东方弦乐 + 轻钢琴</h4><p>舒缓开场，誓言段抬升，最后淡出。</p></button><button class="choice-card" data-action="music-choice"><span class="choice-symbol">琴</span><h4>温暖钢琴 + 氛围垫</h4><p>适合照片和旁白较多的版本。</p></button></div><button class="button primary" style="width:100%;margin-top:14px;" data-action="generate-music">生成候选 BGM</button></section>
        <section class="card card-pad"><div class="section-title"><div><h3>音乐候选</h3><p>${musicAssets.length} 条</p></div></div>${renderAudioAssets(musicAssets)}</section>
      </div>`,
    11: `
      <div class="content-grid"><section class="card card-pad"><div class="section-title"><div><h2>代表性声音试混</h2><p>检查配音与 BGM 是否互相遮挡</p></div></div><div class="checklist"><div class="check-item"><span class="check-icon pending">1</span><div class="check-copy"><strong>旁白清楚</strong><small>字幕辅音不被鼓点遮住</small></div></div><div class="check-item"><span class="check-icon pending">2</span><div class="check-copy"><strong>音乐有抬升</strong><small>高潮段有变化但不过响</small></div></div><div class="check-item"><span class="check-icon pending">3</span><div class="check-copy"><strong>结尾收干净</strong><small>音乐随片尾落幅淡出</small></div></div></div></section><section class="card card-pad"><div class="section-title"><div><h3>当前声音资产</h3></div></div><p class="small">旁白 ${voiceAssets.length} 条 · 音乐 ${musicAssets.length} 条</p>${renderAudioAssets([...voiceAssets.slice(0,2),...musicAssets.slice(0,2)])}</section></div>`,
    12: `
      <div class="content-grid"><section class="card card-pad"><div class="section-title"><div><h2>完整混音</h2><p>目标和：旁白清楚、音乐 -14 LUFS、结尾自然</p></div></div><div class="checklist"><div class="check-item"><span class="check-icon pending">1</span><div class="check-copy"><strong>全长试听</strong><small>不能只确认 10 秒小样</small></div></div><div class="check-item"><span class="check-icon pending">2</span><div class="check-copy"><strong>响度检查</strong><small>FFmpeg loudnorm → -14 LUFS</small></div></div></div></section><section class="card card-pad"><div class="section-title"><div><h3>生成带声音样片</h3><p>在导出页合成后检查</p></div></div><button class="button primary" data-route="export">进入合成导出</button></section></div>`,
    13: `
      <div class="content-grid"><section class="card card-pad"><div class="section-title"><div><h2>字幕与预览</h2><p>微软雅黑 24pt，白字深色描边，底部安全区</p></div></div><textarea class="textarea" data-speech-text style="min-height:130px;">沈知远与林晚晴，从雨天借伞开始，一起走过旅行、搬家和异地岁月。今天，他们把余生写成同一个故事。</textarea><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;"><button class="button secondary" data-action="generate-subtitles">生成 SRT</button><button class="button primary" data-route="export">合成带字幕成片</button></div></section><section class="card card-pad"><div class="section-title"><div><h3>最近成片</h3><p>预览画面和字幕</p></div></div>${renderVideoAssets(exports.slice(0,2))}</section></div>`,
    14: `
      <section class="card card-pad"><div class="section-title"><div><h2>正式交付</h2><p>成片、SRT、可编辑工程和检查记录</p></div><span class="badge ${exports.length ? "green" : "gray"}">${exports.length} 个成片</span></div><div class="feature-grid"><article class="feature-card"><div class="feature-icon">影</div><h4>MP4 成片</h4><p>H.264 + AAC，24 FPS。</p><button class="button secondary small-button" data-route="export" style="margin-top:12px;">查看成片</button></article><article class="feature-card"><div class="feature-icon">字</div><h4>SRT 字幕</h4><p>可编辑字幕并嵌入成片。</p></article><article class="feature-card"><div class="feature-icon">程</div><h4>可编辑工程</h4><p>FFmpeg 时间线 JSON 和 VVV Remotion 工程。</p><button class="button secondary small-button" data-route="export" style="margin-top:12px;">导出设置</button></article></div>${renderVideoAssets(exports.slice(0,3))}</section>`
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
  return `<div class="stack" style="gap:8px;">${items.map((asset)=>`<div class="prompt-block"><label>${esc(asset.title || materialLabel(asset.kind))}</label>${asset.url?`<audio controls preload="metadata" src="${esc(api.mediaUrl(asset.url))}" style="width:100%;"></audio>`:'<p class="small muted">旧资产无在线地址</p>'}</div>`).join("")}</div>`;
}

function renderImageAssets(items) {
  if (!items.length) return '<div class="empty-state" style="min-height:180px;"><div><div class="empty-state-symbol">图</div><h3>还没有图片</h3><p>上传或生成后会显示在这里。</p></div></div>';
  return `<div class="asset-grid">${items.map((asset)=>`<article class="asset-card card"><div class="asset-preview">${asset.url?`<img src="${esc(api.mediaUrl(asset.url))}" alt="${esc(asset.title)}" />`:'图'}</div><div class="asset-info"><strong>${esc(asset.title)}</strong><small>${esc(asset.kind)}</small></div></article>`).join("")}</div>`;
}

function renderVideoAssets(items) {
  if (!items.length) return '<div class="empty-state" style="min-height:180px;"><div><div class="empty-state-symbol">影</div><h3>还没有视频</h3><p>完成镜头或成片后会显示在这里。</p></div></div>';
  return `<div class="asset-grid">${items.map((asset)=>`<article class="asset-card card"><div class="asset-preview"><video src="${esc(api.mediaUrl(asset.url))}" controls preload="metadata"></video></div><div class="asset-info"><strong>${esc(asset.title)}</strong><small>${Number(asset.media?.duration || 0).toFixed(1)} 秒 · ${esc(asset.kind)}</small></div></article>`).join("")}</div>`;
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
      <section class="card card-pad" style="margin-top:18px;">
        <div class="section-title">
          <div><h2>VVV · Remotion 可编辑模板库</h2><p>8 个开源婚礼模板，预览来自 actionow-ai/vvv，MIT 许可；本项目记录其风格参数，完整 Remotion 工程由外部 VVV 路由生成。</p></div>
          <span class="badge gold">可编辑工程</span>
        </div>
        <div class="asset-grid">
          ${VVV_STYLE_PRESETS.map(
            (preset) => `
            <article class="asset-card card">
              <div class="asset-preview"><img src="${preset.image}" alt="${esc(preset.title)}" /></div>
              <div class="asset-info">
                <strong>${esc(preset.title)}</strong>
                <small>${esc(preset.format)} · ${esc(preset.description)}</small>
                <div style="display:flex;gap:6px;margin-top:10px;">
                  <button class="button secondary small-button" data-action="use-vvv-style" data-vvv-id="${preset.id}">套用风格参数</button>
                  <button class="button ghost small-button" data-action="create-vvv-project" data-vvv-id="${preset.id}">生成可编辑工程</button>
                </div>
              </div>
            </article>`
          ).join("")}
        </div>
        <div class="notice" style="margin-top:14px;">${icon("shield")}<div><strong>许可说明</strong>VVV 代码与模板采用 MIT；预览媒体按 VVV 的 MEDIA_LICENSE 使用。应用内的 Final Cut 渲染仍由本地 FFmpeg 完成，不把外部模板伪装为已生成工程。</div></div>
      </section>
    </div>
  `;
}

function modelCenterPage() {
  const models = runtime.models || [];
  const categories = [
    ["text", "文字生成", "故事、剧本、分镜和提示词"],
    ["image", "图片生成", "人物定妆、服装和场景"],
    ["video", "视频生成", "动态镜头、动作与镜头替换"],
    ["vision", "视觉理解", "模板、镜头和参考素材分析"],
    ["voice", "语音合成", "旁白、誓言和角色配音"],
    ["music", "音乐生成", "原创 BGM 与情绪曲线"],
    ["editor", "剪辑引擎", "本地 FFmpeg 合成与导出"]
  ];
  return `
    <div class="page">
      ${pageHeader("models")}
      <div class="notice" style="margin-bottom:18px;">${icon("shield")}<div><strong>凭证不会进入页面</strong>模型通过本地服务读取已有登录态或环境变量。切换模型只影响后续任务，不会覆盖已经生成并通过确认的素材。</div></div>
      <section class="card card-pad">
        <div class="section-title"><div><h2>模型配置</h2><p>${runtime.online ? `本地服务在线 · 火山 ${runtime.health?.arkAuth?.loggedIn ? "已登录" : "未登录"}` : "本地服务未连接"}</p></div><button class="button secondary small-button" data-action="test-all-models">测试全部模型</button></div>
        <div class="feature-grid">
          ${categories
            .map(([category, title, description]) => {
              const items = models.filter((model) => model.category === category);
              return `
                <article class="feature-card">
                  <div class="feature-icon">${esc(title.slice(0, 1))}</div>
                  <h4>${esc(title)}</h4>
                  <p>${esc(description)}</p>
                  <div class="stack" style="gap:9px;margin-top:14px;">
                    ${
                      items.length
                        ? items
                            .map(
                              (model) => `
                              <div style="padding:10px;border:1px solid var(--line);border-radius:10px;background:rgba(255,255,255,.36);">
                                <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
                                  <div><strong style="font-size:12.5px;">${esc(model.label)}</strong><small style="display:block;color:var(--muted);font-size:12px;word-break:break-all;">${esc(model.model)}</small></div>
                                  <span class="badge ${model.status === "ready" ? "green" : model.status === "needs_setup" || model.status === "external_service_blocked" ? "gold" : "red"}">${esc(model.status)}</span>
                                </div>
                                <div style="display:flex;gap:5px;margin-top:8px;flex-wrap:wrap;">
                                  <button class="button ghost small-button" data-action="test-model" data-model-id="${model.id}">测试连接</button>
                                  <button class="button ghost small-button" data-action="edit-model" data-model-id="${model.id}">修改模型</button>
                                  <button class="button secondary small-button" data-action="set-default-model" data-model-id="${model.id}">设为默认</button>
                                </div>
                              </div>`
                            )
                            .join("")
                        : '<p class="small muted">尚未配置该模态模型。</p>'
                    }
                  </div>
                </article>`;
            })
            .join("")}
        </div>
      </section>
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
        <div class="section-title">
          <div><h2>${focus === "groom" ? "男主角" : "女主角"}造型库</h2><p>真实图片可上传，也可以直接用 Seedream 生成多种样式</p></div>
          <span class="badge gold">${runtime.looks.filter((item) => item.gender === lookGender).length} 套样式</span>
        </div>
        <div class="asset-grid">
          ${runtime.looks
            .filter((look) => look.gender === lookGender)
            .map(
              (look) => `
              <article class="asset-card card">
                <div class="asset-preview">
                  ${look.imagePath ? `<img src="${esc(api.mediaUrl(look.imagePath))}" alt="${esc(look.title)}" />` : `<span>${esc(look.title.slice(0, 1))}</span>`}
                </div>
                <div class="asset-info">
                  <strong>${esc(look.title)}</strong>
                  <small>${esc(look.era)} · ${esc(look.description)}</small>
                  <div class="chip-row" style="margin-top:9px;">
                    <span class="badge ${look.imagePath ? "green" : "gray"}">${look.imagePath ? "已生成" : "提示词已就绪"}</span>
                  </div>
                  <div style="display:flex;gap:6px;margin-top:10px;">
                    <button class="button ${state.selectedLooks?.[focus] === look.id ? "primary" : "secondary"} small-button" data-action="select-look" data-look-id="${look.id}" data-focus="${focus}">${state.selectedLooks?.[focus] === look.id ? "已选用" : "选用此项"}</button>
                    <button class="button secondary small-button" data-action="generate-look" data-look-id="${look.id}">${icon("sparkle")}Seedream</button>
                    <button class="button ghost small-button" data-action="generate-look" data-look-id="${look.id}" data-model-id="model-image-pollinations">FLUX 免费</button>
                  </div>
                </div>
              </article>`
            )
            .join("")}
        </div>
      </section>
    </div>
  `;
}

function scenesPage() {
  const scenes = [
    ["scene-a", "古代 · 东方庭院", "晨雾、廊桥、红绸、木格窗，建立前世宿命感。"],
    ["scene-b", "民国 · 长街旧巷", "暖褐街灯、石板路、细雨，承担时间转场。"],
    ["scene-c", "今生 · 婚礼正厅", "红烛、金色灯影、亲友席位，落到真实婚礼。"]
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
              ([className, title, description]) => `
              <button class="scene-card ${className}" data-action="select-scene" data-scene="${esc(title)}">
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
          <div class="section-title"><div><h2>照片电影素材</h2><p>${videos.length} 段视频 · ${photos.length} 张照片</p></div></div>
          <label class="upload-target" for="photo-movie-files" style="min-height:96px;margin-bottom:14px;">
            ${icon("upload")}
            <strong>添加婚纱照 / 婚礼照片</strong>
            <small>没有视频模型时也可以用照片加旁白和配乐生成 MP4</small>
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
          ? `<section class="card card-pad" style="margin-top:18px;"><div class="section-title"><div><h2>最近导出</h2><p>由本地 FFmpeg 合成并完成媒体检查</p></div></div><div class="asset-grid">${exports.slice(0, 6).map((asset) => `<article class="asset-card card"><div class="asset-preview"><video src="${esc(api.mediaUrl(asset.url))}" controls preload="metadata"></video></div><div class="asset-info"><strong>${esc(asset.title)}</strong><small>${Number(asset.media?.duration || 0).toFixed(1)} 秒 · MP4</small></div></article>`).join("")}</div></section>`
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
}

document.addEventListener("click", async (event) => {
  const routeButton = event.target.closest("[data-route]");
  const navButton = event.target.closest("[data-nav-id]");
  const actionButton = event.target.closest("[data-action]");
  const copyButton = event.target.closest("[data-copy]");

  createRipple(event.clientX, event.clientY);

  if (navButton) {
    const node = findNavNode(navButton.dataset.navId);
    if (node?.children?.length) {
      if (openNavIds.has(node.id)) openNavIds.delete(node.id);
      else openNavIds.add(node.id);
    }
    if (node?.theme) {
      state.theme = node.theme;
      rebuildProject();
    }
    if (node?.focus) activeFocus = node.focus;
    if (node?.route) {
      activeRoute = node.route;
      render();
    } else {
      renderNav();
    }
    document.querySelector(".sidebar").classList.remove("open");
    return;
  }

  if (routeButton) {
    activeRoute = routeButton.dataset.route;
    render();
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

function findNavNode(id, nodes = NAV_TREE) {
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
    const step = Math.min(14, Math.max(1, Number(workflow.currentStep || 1)));
    if (!workflowReady(step)) {
      showToast("本步骤素材尚未就绪，请先完成素材中心要求");
      return;
    }
    state.workflow = {
      currentStep: Math.min(15, step + 1),
      approvals: {
        ...(workflow.approvals || {}),
        [step]: {
          approved: true,
          approvedAt: new Date().toISOString()
        }
      }
    };
    saveState({ quiet: true });
    render();
    showToast(step === 14 ? "14 步制作流程已全部确认" : `第 ${step} 步已确认，进入第 ${step + 1} 步`);
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
  if (action === "generate-template-shot") {
    const project = runtime.projects.find((item) => item.id === currentProjectId);
    const template = runtime.templates.find((item) => item.id === project?.templateId);
    const model = defaultModel("video");
    if (!template || !model) {
      showToast("请先应用模板并配置视频模型");
      return;
    }
    const prompt = document.querySelector("[data-video-prompt]")?.value.trim() || "保持参考视频的构图和运镜，替换为当前项目的新郎新娘。";
    const clip = await api.createTemplateClip(template.id, {
      start: 0,
      duration: Math.min(8, Math.max(4, Number(storyboard[0]?.duration || 5)))
    });
    const inputs = [`reference_video:${clip.item.localPath}`];
    if (state.photoSources?.groom) inputs.push(`reference_image:${state.photoSources.groom}`);
    if (state.photoSources?.bride) inputs.push(`reference_image:${state.photoSources.bride}`);
    button.disabled = true;
    button.textContent = "提交人物替换镜头…";
    const result = await api.generateVideo({
      projectId: currentProjectId,
      modelId: model.id,
      shotId: "template-reference",
      prompt: `${prompt} 保持参考视频的镜头顺序、人物动作和运镜；把人物替换为男主角${state.groom}和女主角${state.bride}，保持两人面部身份、服装与手部连续，不重演片头。`,
      inputs,
      parameters: { ratio: "adaptive", duration: -1, resolution: model.parameters?.resolution || "720p" }
    });
    await trackJob(result.job.id, "模板人物替换镜头");
    await refreshRuntime();
  }
  if (action === "import-template-url") {
    const url = document.querySelector("[data-template-url]")?.value.trim();
    if (!url) {
      showToast("请先粘贴抖音视频链接");
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
    showToast("模板已应用到当前婚礼项目");
  }
  if (action === "use-vvv-style") {
    const preset = VVV_STYLE_PRESETS.find((item) => item.id === button.dataset.vvvId);
    if (!preset) return;
    state.vvvStyle = preset.id;
    saveState({ quiet: true });
    render();
    showToast(`已记录 VVV 风格：${preset.title}`);
  }
  if (action === "create-vvv-project") {
    const preset = VVV_STYLE_PRESETS.find((item) => item.id === button.dataset.vvvId);
    const photoAssets = runtime.assets.filter(
      (asset) => asset.kind === "project-photo" && asset.localPath
    );
    if (!preset || !photoAssets.length) {
      showToast("请先在素材中心上传至少一张婚礼照片");
      return;
    }
    button.disabled = true;
    button.textContent = "正在创建 Remotion 工程…";
    const payload = {
      projectId: currentProjectId,
      template: preset.id,
      format: state.aspect,
      assetIds: photoAssets.map((asset) => asset.id),
      allowRepeat: false
    };
    let result;
    try {
      result = await api.createVvvProject(payload);
    } catch (error) {
      if (/INSUFFICIENT_PHOTOS|needs at least/i.test(error.message)) {
        const allow = window.confirm(
          "当前照片数量少于该模板最低要求。是否允许重复使用已有照片来生成可编辑工程？"
        );
        if (!allow) {
          button.disabled = false;
          button.textContent = "生成可编辑工程";
          return;
        }
        result = await api.createVvvProject({ ...payload, allowRepeat: true });
      } else {
        throw error;
      }
    }
    await refreshRuntime();
    showToast(`可编辑工程已创建：${result.item.projectDir}`);
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
    const candidates = familyModels("text")
      .concat(familyModels("image"), familyModels("video"), familyModels("vision"))
      .filter((model) => model.enabled);
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
    const peers = familyModels(model.category);
    await Promise.all(
      peers.map((peer) =>
        api.updateModel(peer.id, { isDefault: peer.id === model.id }).catch(() => {})
      )
    );
    await refreshRuntime();
    showToast(`${model.label} 已设为${model.category}默认模型`);
  }
  if (action === "edit-model") {
    const model = runtime.models.find((item) => item.id === button.dataset.modelId);
    if (!model) return;
    const nextModel = window.prompt("请输入新的模型 ID 或套餐调用名", model.model);
    if (!nextModel || nextModel === model.model) return;
    const nextProfile =
      window.prompt("请输入 Profile（可留空）", model.profile || "") ?? model.profile;
    await api.updateModel(model.id, { model: nextModel.trim(), profile: nextProfile.trim() });
    await refreshRuntime();
    showToast("模型配置已更新，请重新测试连接");
  }
  if (action === "generate-look") {
    const look = runtime.looks.find((item) => item.id === button.dataset.lookId);
    if (!look) return;
    button.disabled = true;
    button.textContent = "提交中…";
    const result = await api.generateLook(look.id, {
      projectId: currentProjectId,
      referencePath: state.photos[look.gender === "male" ? "groom" : "bride"] || "",
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
    const videos = runtime.assets.filter((asset) => asset.kind === "video" && asset.localPath);
    const photos = runtime.assets.filter(
      (asset) => asset.kind === "project-photo" && asset.localPath
    );
    if (!videos.length && !photos.length) {
      showToast("请先添加照片，或在生成中心完成视频镜头");
      return;
    }
    const voice = runtime.assets.find((asset) => asset.kind === "voice" && asset.localPath);
    const music = runtime.assets.find((asset) => asset.kind === "music" && asset.localPath);
    const subtitle = runtime.assets.find(
      (asset) => asset.kind === "subtitle" && asset.localPath
    );
    button.disabled = true;
    button.textContent = "正在合成成片…";
    const result = await api.render({
      projectId: currentProjectId,
      title: state.projectName,
      duration: state.duration,
      fps: 24,
      width: 1280,
      height: 720,
      clips: [
        ...videos.map((asset) => ({ path: asset.localPath })),
        ...photos.map((asset) => ({ path: asset.localPath, duration: 4 }))
      ],
      voicePath: voice?.localPath || "",
      musicPath: music?.localPath || "",
      subtitlePath: subtitle?.localPath || "",
      autoMusic: !music,
      mood: "warm-cinematic"
    });
    await trackJob(result.job.id, "FFmpeg 成片合成");
    await refreshRuntime();
  }
  if (action === "build-treatment") {
    rebuildProject();
    showToast("故事大纲与分镜已按当前信息重新生成");
    render();
  }
  if (action === "build-storyboard") {
    storyboard = buildStoryboard(state);
    treatment = buildStoryTreatment(state);
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
    state.photos[button.dataset.gender] = "";
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
render();
refreshRuntime({ rerender: true }).then(() => {
  if (!runtime.online) {
    showToast("本地模型服务未连接，请运行 npm start");
  }
});
