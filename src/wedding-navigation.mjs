import {
  WORKFLOW_SPECS,
  buildStepNavigationChildren
} from "./workflow-specs.mjs";

function actionLeaf(id, label, route, options = {}) {
  return {
    id,
    label,
    route,
    focus: options.focus || "",
    target: options.target || ""
  };
}

function taskNode(id, label, route, tasks, options = {}) {
  return {
    id,
    label,
    symbol: label.slice(0, 1),
    focus: options.focus || "",
    children: tasks.map((task, index) =>
      actionLeaf(`${id}-action-${index + 1}`, task, route, {
        focus: options.focus,
        target: options.target
      })
    )
  };
}

function itemNode(id, label, route, tasks, options = {}) {
  return {
    id,
    label,
    route,
    focus: options.focus || "",
    target: options.target || "",
    children: [
      taskNode(`${id}-task`, "本项操作", route, tasks, options)
    ]
  };
}

function groupNode(id, label, items, route, options = {}) {
  return {
    id,
    label,
    symbol: label.slice(0, 1),
    children: items.map((item, index) =>
      itemNode(
        `${id}-item-${index + 1}`,
        item.label,
        item.route || route,
        item.tasks,
        { focus: item.focus || options.focus, target: item.target || options.target }
      )
    )
  };
}

function sectionNode(id, label, groups) {
  return {
    id,
    label,
    symbol: label.slice(0, 1),
    children: groups
  };
}

function utilityRoot(id, label, symbol, route, sections) {
  return {
    id,
    label,
    symbol,
    route,
    children: sections
  };
}

const projectSections = [
  sectionNode("project-basics-section", "项目基础", [
    groupNode("project-couple-group", "新人档案", [
      {
        label: "姓名、婚期与城市",
        tasks: ["编辑新人姓名", "设置婚礼日期", "设置婚礼城市", "保存项目基础信息"]
      },
      {
        label: "婚礼电影规格",
        tasks: ["设置目标时长", "设置 24 FPS", "选择横屏或竖屏", "检查总帧数"]
      }
    ], "overview"),
    groupNode("project-style-group", "婚礼叙事风格", [
      {
        label: "三生三世",
        tasks: ["查看故事结构", "应用古代民国今生时代", "查看主题说明"]
      },
      {
        label: "时光回信",
        tasks: ["查看故事结构", "应用书信叙事", "查看主题说明"]
      },
      {
        label: "星河约定",
        tasks: ["查看故事结构", "应用异地守候叙事", "查看主题说明"]
      }
    ], "story")
  ]),
  sectionNode("materials-section", "婚礼素材", [
    groupNode("people-material-group", "新人素材", [
      { label: "男主角照片", route: "characters", tasks: ["上传正面照", "预览照片", "更换照片", "绑定角色参考"] },
      { label: "女主角照片", route: "characters", tasks: ["上传正面照", "预览照片", "更换照片", "绑定角色参考"] },
      { label: "双人合照", route: "assets", tasks: ["上传合照", "预览合照", "绑定故事素材"] }
    ], "assets"),
    groupNode("reference-material-group", "婚服与场景参考", [
      { label: "古代婚服参考", route: "assets", tasks: ["上传参考图", "预览参考图", "关联古代镜头"] },
      { label: "民国造型参考", route: "assets", tasks: ["上传参考图", "预览参考图", "关联民国镜头"] },
      { label: "现代婚服参考", route: "assets", tasks: ["上传参考图", "预览参考图", "关联今生镜头"] },
      { label: "婚礼场景参考", route: "assets", tasks: ["上传场景图", "预览场景图", "关联分镜场景"] }
    ], "assets"),
    groupNode("audio-material-group", "声音素材", [
      { label: "旁白录音", route: "assets", tasks: ["上传旁白", "试听旁白", "绑定旁白轨"] },
      { label: "婚礼配乐", route: "assets", tasks: ["上传音乐", "试听音乐", "记录授权", "绑定音乐轨"] },
      { label: "字幕文件", route: "assets", tasks: ["上传 SRT", "预览字幕", "绑定字幕轨"] }
    ], "assets")
  ])
];

const castSections = [
  sectionNode("groom-wardrobe-section", "新郎婚服", [
    groupNode("groom-ancient-group", "古代婚服", [
      { label: "朱红云纹婚服", tasks: ["查看婚服说明", "生成定妆图", "选择造型", "锁定为古代新郎"] },
      { label: "墨红龙纹喜服", tasks: ["查看婚服说明", "生成定妆图", "选择造型", "锁定为古代新郎"] }
    ], "looks", { focus: "groom" }),
    groupNode("groom-republic-group", "民国青年", [
      { label: "民国书卷长衫", tasks: ["查看服装说明", "生成定妆图", "选择造型", "锁定为民国新郎"] },
      { label: "民国西式青年", tasks: ["查看服装说明", "生成定妆图", "选择造型", "锁定为民国新郎"] }
    ], "looks", { focus: "groom" }),
    groupNode("groom-modern-group", "现代与今生礼服", [
      { label: "黑色塔士多礼服", tasks: ["查看礼服说明", "生成定妆图", "选择造型", "锁定时装镜头"] },
      { label: "象牙白新郎礼服", tasks: ["查看礼服说明", "生成定妆图", "选择造型", "绑定今生婚礼"] }
    ], "looks", { focus: "groom" })
  ]),
  sectionNode("bride-wardrobe-section", "新娘婚服", [
    groupNode("bride-ancient-group", "凤冠霞帔", [
      { label: "红金团扇婚服", tasks: ["查看婚服说明", "生成定妆图", "选择造型", "锁定为古代新娘"] },
      { label: "凤冠霞帔", tasks: ["查看婚服说明", "生成定妆图", "选择造型", "锁定为古代新娘"] }
    ], "looks", { focus: "bride" }),
    groupNode("bride-republic-group", "民国造型", [
      { label: "浅蓝学生装", tasks: ["查看服装说明", "生成定妆图", "选择造型", "锁定为民国新娘"] },
      { label: "月白旗袍", tasks: ["查看服装说明", "生成定妆图", "选择造型", "锁定为民国新娘"] }
    ], "looks", { focus: "bride" }),
    groupNode("bride-modern-group", "现代婚纱", [
      { label: "缎面挂脖婚纱", tasks: ["查看婚纱说明", "生成定妆图", "选择造型", "绑定今生婚礼"] },
      { label: "蕾丝长袖婚纱", tasks: ["查看婚纱说明", "生成定妆图", "选择造型", "绑定今生婚礼"] }
    ], "looks", { focus: "bride" })
  ]),
  sectionNode("identity-section", "人物一致性", [
    groupNode("identity-anchor-group", "身份锚点", [
      { label: "五官与发际线", tasks: ["查看身份说明", "检查当前照片", "锁定人物身份"] },
      { label: "身高差与手部", tasks: ["查看连续性规则", "检查双人合照", "记录身体特征"] },
      { label: "服装连续性", tasks: ["检查每套婚服", "标记时代", "绑定到镜头"] }
    ], "looks")
  ])
];

const sceneSections = [
  sectionNode("ancient-scene-section", "古代婚礼场景", [
    groupNode("ancient-scene-group", "庭院与厅堂", [
      { label: "东方庭院晨雾", tasks: ["查看场景说明", "生成场景图", "绑定古代镜头"] },
      { label: "红烛厅堂", tasks: ["查看场景说明", "生成场景图", "绑定誓言镜头"] },
      { label: "灯笼长廊", tasks: ["查看道具规则", "生成牵手场景", "绑定匹配剪辑"] }
    ], "scenes")
  ]),
  sectionNode("republic-scene-section", "民国婚礼场景", [
    groupNode("republic-scene-group", "长街与旧巷", [
      { label: "民国长街夜雨", tasks: ["查看场景说明", "生成雨夜场景", "绑定民国镜头"] },
      { label: "旧式婚帖与书信", tasks: ["查看道具说明", "生成书信特写", "绑定故事线索"] }
    ], "scenes")
  ]),
  sectionNode("modern-scene-section", "今生婚礼场景", [
    groupNode("modern-scene-group", "真实婚礼现场", [
      { label: "婚礼正厅", tasks: ["查看场景说明", "生成正厅画面", "绑定誓言镜头"] },
      { label: "红绸花门", tasks: ["查看道具说明", "生成片尾场景", "绑定姓名落版"] }
    ], "scenes")
  ])
];

const productionSections = [
  sectionNode("storyboard-section", "婚礼分镜", [
    groupNode("storyboard-design-group", "分镜设计", [
      { label: "五幕镜头表", tasks: ["打开分镜表", "编辑当前镜头", "检查总帧数"] },
      { label: "人物与服装绑定", tasks: ["绑定新郎", "绑定新娘", "绑定婚服"] },
      { label: "桥接与转场", tasks: ["设置动作匹配", "设置硬切", "检查镜头轴线"] }
    ], "storyboard")
  ]),
  sectionNode("image-video-section", "图像与视频", [
    groupNode("image-production-group", "图片生产", [
      { label: "重点静帧", tasks: ["生成图片提示词", "生成图片", "上传图片", "绑定首帧"] },
      { label: "剩余静帧", tasks: ["按镜生成提示词", "逐镜生成", "审核并选版"] }
    ], "generate"),
    groupNode("video-production-group", "视频生产", [
      { label: "首帧图生视频", tasks: ["选择首帧", "生成视频提示词", "提交视频任务"] },
      { label: "镜头质检", tasks: ["检查身份", "检查手部", "检查动作", "检查背景"] }
    ], "generate")
  ]),
  sectionNode("prompt-section", "提示词工作区", [
    groupNode("prompt-library-group", "婚礼提示词库", [
      { label: "图片提示词", tasks: ["打开图片提示词", "复制提示词", "保存提示词版本"] },
      { label: "视频提示词", tasks: ["打开视频提示词", "复制提示词", "保存提示词版本"] }
    ], "prompts")
  ])
];

const postSections = [
  sectionNode("sound-section", "婚礼声音", [
    groupNode("voice-group", "旁白", [
      { label: "试听与选择音色", tasks: ["生成试听", "播放试听", "选择旁白"] },
      { label: "完整旁白", tasks: ["生成完整旁白", "完整试听", "绑定旁白轨"] }
    ], "audio"),
    groupNode("music-group", "音乐与混音", [
      { label: "BGM 试听", tasks: ["生成音乐", "播放音乐", "选择配乐"] },
      { label: "试混", tasks: ["设置试混区间", "生成试混", "试听试混"] },
      { label: "完整混音", tasks: ["生成完整混音", "检查 LUFS", "检查 True Peak"] }
    ], "audio")
  ]),
  sectionNode("subtitle-section", "字幕与预览", [
    groupNode("subtitle-edit-group", "字幕设计", [
      { label: "字幕打轴", tasks: ["生成 SRT", "编辑时间和文本", "检查每行字数"] },
      { label: "字幕样式", tasks: ["选择字体", "设置字号", "设置描边和边距"] },
      { label: "完整预览", tasks: ["渲染预览", "完整观看", "修正字幕问题"] }
    ], "audio")
  ]),
  sectionNode("delivery-section", "婚礼交付", [
    groupNode("delivery-group", "正式成片", [
      { label: "MP4 成片", tasks: ["检查技术质检", "查看正式成片", "确认文件哈希"] },
      { label: "工程与资产", tasks: ["下载 SRT", "查看剪辑工程", "查看镜头表", "查看提示词历史"] },
      { label: "客户验收", tasks: ["登记制作方验收", "登记新人验收", "生成交付清单"] }
    ], "export")
  ])
];

const templateModelSections = [
  sectionNode("template-section", "婚礼模板库", [
    groupNode("template-import-group", "模板来源", [
      { label: "本地婚礼视频", tasks: ["上传模板", "检查视频信息", "分析切镜"] },
      { label: "抖音婚礼视频", tasks: ["粘贴抖音链接", "下载视频", "预览原片"] }
    ], "templates")
  ]),
  sectionNode("model-section", "模型配置", [
    groupNode("model-category-group", "模型能力", [
      { label: "文字模型", tasks: ["新增模型", "编辑模型", "测试连接"] },
      { label: "图片模型", tasks: ["新增模型", "编辑参数", "设置默认"] },
      { label: "视频模型", tasks: ["新增模型", "编辑参数", "测试连接"] },
      { label: "语音与音乐模型", tasks: ["检查供应商", "设置默认", "测试本地服务"] }
    ], "models")
  ])
];

const operationSections = [
  sectionNode("jobs-section", "生成任务", [
    groupNode("job-status-group", "任务状态", [
      { label: "运行中任务", tasks: ["查看进度", "查看供应商状态"] },
      { label: "失败任务", tasks: ["查看错误原因", "打开原任务"] },
      { label: "已完成任务", tasks: ["查看产物", "绑定到镜头"] }
    ], "jobs")
  ]),
  sectionNode("method-section", "参考方法", [
    groupNode("method-group", "婚礼参考", [
      { label: "抖音参考片分析", tasks: ["查看提示词结构", "查看音乐结构", "查看字幕结构"] },
      { label: "完整操作指南", tasks: ["查看 14 步说明", "查看证据记录规则"] }
    ], "method")
  ])
];

function remixRoot() {
  const remixSteps = [
    ["下载与全帧提取", "remixStep1", ["抖音链接或本地视频", "模板使用权", "新人照片"], ["下载原片", "提取 24 FPS 全帧", "提取音频"]],
    ["画面声音字幕分析", "remixStep2", ["全帧索引", "原音频", "切镜结果"], ["逐镜画面理解", "字幕转写", "人物目标识别"]],
    ["人物目标与逐镜替换", "remixStep3", ["男女主照片", "替换目标", "复刻区间"], ["绑定左侧或右侧人物", "生成替换提示词", "逐镜生成与质检"]],
    ["时间轴封装与交付", "remixStep4", ["批准镜头", "原声音", "字幕", "时间轴"], ["渲染预览", "检查原音乐", "生成交付包"]]
  ];
  return {
    id: "douyin-remix-flow",
    label: "抖音婚礼替换",
    symbol: "复",
    route: "remix",
    children: remixSteps.map(([label, route, inputs, actions], stepIndex) =>
      sectionNode(`remix-level2-${stepIndex + 1}`, label, [
        {
          id: `remix-level3-${stepIndex + 1}-input`,
          label: "输入清单",
          symbol: "输",
          route
        },
        {
          id: `remix-level3-${stepIndex + 1}-action`,
          label: "操作功能",
          symbol: "操",
          route
        }
      ])
    )
  };
}

export function buildWeddingNavigationTree() {
  return [
    utilityRoot("project-materials", "婚礼项目与素材", "项", "overview", projectSections),
    {
      id: "guide-14-steps",
      label: "14 步婚礼电影",
      symbol: "导",
      route: "wizard",
      children: [
        {
          id: "step-phase-story",
          label: "故事与文案",
          symbol: "文",
          children: WORKFLOW_SPECS.slice(0, 3).map((step) => ({
            id: `step-${String(step.number).padStart(2, "0")}`,
            label: `${String(step.number).padStart(2, "0")} ${step.title}`,
            route: step.route,
            children: buildStepNavigationChildren(step.number)
          }))
        },
        {
          id: "step-phase-voice",
          label: "旁白与声音",
          symbol: "声",
          children: WORKFLOW_SPECS.slice(3, 5).map((step) => ({
            id: `step-${String(step.number).padStart(2, "0")}`,
            label: `${String(step.number).padStart(2, "0")} ${step.title}`,
            route: step.route,
            children: buildStepNavigationChildren(step.number)
          }))
        },
        {
          id: "step-phase-visual",
          label: "分镜与画面",
          symbol: "镜",
          children: WORKFLOW_SPECS.slice(5, 9).map((step) => ({
            id: `step-${String(step.number).padStart(2, "0")}`,
            label: `${String(step.number).padStart(2, "0")} ${step.title}`,
            route: step.route,
            children: buildStepNavigationChildren(step.number)
          }))
        },
        {
          id: "step-phase-finish",
          label: "音乐与交付",
          symbol: "成",
          children: WORKFLOW_SPECS.slice(9).map((step) => ({
            id: `step-${String(step.number).padStart(2, "0")}`,
            label: `${String(step.number).padStart(2, "0")} ${step.title}`,
            route: step.route,
            children: buildStepNavigationChildren(step.number)
          }))
        }
      ]
    },
    remixRoot(),
    utilityRoot("cast-scenes", "婚礼人物与场景", "服", "looks", castSections),
    utilityRoot("scene-design", "婚礼场景与道具", "景", "scenes", sceneSections),
    utilityRoot("production", "婚礼分镜与生成", "拍", "storyboard", productionSections),
    utilityRoot("post-production", "音乐字幕与交付", "成", "audio", postSections),
    utilityRoot("templates-models", "模板与模型", "型", "templates", templateModelSections),
    utilityRoot("operations", "任务与参考方法", "事", "jobs", operationSections)
  ];
}

export function flattenWeddingNavigation(tree = buildWeddingNavigationTree()) {
  const result = [];
  const walk = (node, path = [], depth = 1) => {
    const currentPath = [...path, node.label];
    result.push({ node, path: currentPath, depth });
    for (const child of node.children || []) walk(child, currentPath, depth + 1);
  };
  tree.forEach((node) => walk(node));
  return result;
}

function findNavigationPath(nodeId, nodes, path = []) {
  for (const node of nodes || []) {
    const nextPath = [...path, node];
    if (node.id === nodeId) return nextPath;
    const nested = findNavigationPath(nodeId, node.children, nextPath);
    if (nested.length) return nested;
  }
  return [];
}

function firstNavigationTarget(node) {
  if (node.target) return node.target;
  for (const child of node.children || []) {
    const target = firstNavigationTarget(child);
    if (target) return target;
  }
  return "";
}

export function resolveWeddingNavigationAction(
  nodeId,
  tree = buildWeddingNavigationTree()
) {
  const path = findNavigationPath(nodeId, tree);
  if (!path.length) return null;
  const node = path[path.length - 1];
  const route =
    [...path]
      .reverse()
      .find((item) => item.route)?.route || "";
  return {
    node,
    path,
    route,
    target: firstNavigationTarget(node),
    expandIds: path.map((item) => item.id)
  };
}
