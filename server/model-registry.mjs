export const MODEL_CATEGORIES = [
  { id: "text", label: "文字生成", description: "故事、剧本、分镜和提示词" },
  { id: "image", label: "图片生成", description: "人物定妆、服装和场景" },
  { id: "video", label: "视频生成", description: "动态镜头、动作与镜头替换" },
  { id: "vision", label: "视觉理解", description: "模板、镜头和参考素材分析" },
  { id: "voice", label: "语音合成", description: "旁白、誓言和角色配音" },
  { id: "music", label: "音乐生成", description: "原创 BGM 与情绪曲线" },
  { id: "editor", label: "剪辑引擎", description: "本地 FFmpeg 与可编辑工程" }
];

export const MODEL_PROVIDERS = [
  {
    id: "volcengine-ark",
    label: "火山方舟 Ark",
    categories: ["text", "image", "video", "vision"],
    credential: "arkcli-profile",
    fields: ["model", "profile", "parameters"]
  },
  {
    id: "pollinations",
    label: "Pollinations",
    categories: ["text", "image"],
    credential: "service",
    fields: ["model", "parameters"]
  },
  {
    id: "windows-sapi",
    label: "Windows 本地语音",
    categories: ["voice"],
    credential: "local",
    fields: ["model", "parameters"]
  },
  {
    id: "xying-original",
    label: "囍映本地配乐",
    categories: ["music"],
    credential: "local",
    fields: ["model", "parameters"]
  },
  {
    id: "ffmpeg",
    label: "FFmpeg",
    categories: ["editor"],
    credential: "local",
    fields: ["model", "parameters"]
  }
];

const FORBIDDEN_SECRET_KEYS = new Set([
  "apiKey",
  "api_key",
  "token",
  "secret",
  "accessKey",
  "secretKey",
  "deviceToken",
  "refreshToken"
]);

export function schemaForClient() {
  return {
    categories: MODEL_CATEGORIES,
    providers: MODEL_PROVIDERS
  };
}

export function providerSupports(providerId, category) {
  return Boolean(
    MODEL_PROVIDERS.find(
      (provider) =>
        provider.id === providerId && provider.categories.includes(category)
    )
  );
}

export function normalizeParameters(value, fallback = {}) {
  if (value == null || value === "") return { ...fallback };
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("模型参数必须是 JSON 对象");
  }
  return { ...fallback, ...parsed };
}

export function normalizeModelConfiguration(input = {}, existing = null) {
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_SECRET_KEYS.has(key)) {
      throw new Error("模型配置不接受 API Key、Token 或 Secret 字段");
    }
  }

  const category = String(input.category ?? existing?.category ?? "").trim();
  if (!MODEL_CATEGORIES.some((item) => item.id === category)) {
    throw new Error("模型类别无效");
  }
  const provider = String(input.provider ?? existing?.provider ?? "").trim();
  if (!MODEL_PROVIDERS.some((item) => item.id === provider)) {
    throw new Error("模型供应商无效");
  }
  if (!providerSupports(provider, category)) {
    const providerLabel =
      MODEL_PROVIDERS.find((item) => item.id === provider)?.label || provider;
    const categoryLabel =
      MODEL_CATEGORIES.find((item) => item.id === category)?.label || category;
    throw new Error(`${providerLabel} 不支持${categoryLabel}`);
  }

  const label = String(input.label ?? existing?.label ?? "").trim();
  if (!label) throw new Error("模型显示名称不能为空");
  const model = String(input.model ?? existing?.model ?? "").trim();
  if (!model) throw new Error("模型 ID 或调用名不能为空");

  let parameters;
  try {
    parameters = normalizeParameters(
      input.parameters === undefined ? existing?.parameters || {} : input.parameters,
      existing?.parameters || {}
    );
  } catch (error) {
    throw new Error(`模型参数格式无效：${error.message}`);
  }

  const profile =
    provider === "volcengine-ark"
      ? String(input.profile ?? existing?.profile ?? "").trim()
      : "";
  return {
    ...(existing || {}),
    category,
    provider,
    label,
    model,
    profile,
    enabled:
      input.enabled === undefined
        ? Boolean(existing?.enabled ?? true)
        : Boolean(input.enabled),
    isDefault:
      input.isDefault === undefined
        ? Boolean(existing?.isDefault ?? false)
        : Boolean(input.isDefault),
    parameters,
    status: existing?.status || "unverified"
  };
}

export function chooseDefaultModel(models) {
  return (
    models.find((model) => model.isDefault && model.enabled && model.status === "ready") ||
    models.find((model) => model.enabled && model.status === "ready") ||
    models.find((model) => model.enabled) ||
    models[0] ||
    null
  );
}
