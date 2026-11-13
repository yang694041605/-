import { WORKFLOW_SPECS } from "./workflow-specs.mjs";

export const TOP_NAVIGATION = Object.freeze([
  { id: "home", label: "首页", route: "overview" },
  { id: "remix", label: "抖音复刻", route: "remix" },
  { id: "self", label: "自我生成", route: "wizard" },
  { id: "models", label: "模型中心", route: "models" },
  { id: "jobs", label: "任务中心", route: "jobs" }
]);

export const SELF_STEPS = Object.freeze(
  WORKFLOW_SPECS.map((step) => ({
    id: `self-step-${step.number}`,
    number: step.number,
    label: `${String(step.number).padStart(2, "0")} ${step.title}`,
    route: step.route
  }))
);

export const REMIX_STEPS = Object.freeze([
  {
    id: "remix-step-1",
    number: 1,
    label: "01 链接下载与素材提取",
    route: "remixStep1"
  },
  {
    id: "remix-step-2",
    number: 2,
    label: "02 画面、音频、字幕与提示词解析",
    route: "remixStep2"
  },
  {
    id: "remix-step-3",
    number: 3,
    label: "03 男女主角色图批量生成",
    route: "remixStep3"
  },
  {
    id: "remix-step-4",
    number: 4,
    label: "04 人物与道具逐镜替换",
    route: "remixStep4"
  },
  {
    id: "remix-step-5",
    number: 5,
    label: "05 原轨道对齐、预览与交付",
    route: "remixStep5"
  }
]);

export function buildStudioNavigation(mode = "home") {
  return TOP_NAVIGATION.map((item) => {
    if (item.id === "self" && mode === "self") {
      return { ...item, children: SELF_STEPS };
    }
    if (item.id === "remix" && mode === "remix") {
      return { ...item, children: REMIX_STEPS };
    }
    return { ...item, children: [] };
  });
}

export function routeLabel(route) {
  return (
    [...TOP_NAVIGATION, ...SELF_STEPS, ...REMIX_STEPS].find(
      (item) => item.route === route
    )?.label || "婚礼微电影创作台"
  );
}
