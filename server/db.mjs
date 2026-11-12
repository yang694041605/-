import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { dbPath, ensureDataDirs } from "./paths.mjs";

await ensureDataDirs();

const database = new DatabaseSync(dbPath);
database.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS entities (
    type TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (type, id)
  );
  CREATE INDEX IF NOT EXISTS idx_entities_type_updated
  ON entities(type, updated_at DESC);
`);

export function id(prefix) {
  return `${prefix}-${randomUUID()}`;
}

export function saveEntity(type, entity, forcedId = null) {
  const now = new Date().toISOString();
  const entityId = forcedId || entity.id || id(type);
  const existing = getEntity(type, entityId);
  const value = {
    ...entity,
    id: entityId,
    createdAt: existing?.createdAt || entity.createdAt || now,
    updatedAt: now
  };
  database
    .prepare(
      `INSERT INTO entities (type, id, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(type, id) DO UPDATE SET
         data = excluded.data,
         updated_at = excluded.updated_at`
    )
    .run(type, entityId, JSON.stringify(value), value.createdAt, value.updatedAt);
  return value;
}

export function getEntity(type, entityId) {
  const row = database
    .prepare("SELECT data FROM entities WHERE type = ? AND id = ?")
    .get(type, entityId);
  return row ? JSON.parse(row.data) : null;
}

export function listEntities(type, limit = 200) {
  const rows = database
    .prepare(
      "SELECT data FROM entities WHERE type = ? ORDER BY updated_at DESC LIMIT ?"
    )
    .all(type, Number(limit) || 200);
  return rows.map((row) => JSON.parse(row.data));
}

export function updateEntity(type, entityId, patch) {
  const existing = getEntity(type, entityId);
  if (!existing) return null;
  return saveEntity(type, {
    ...existing,
    ...(typeof patch === "function" ? patch(existing) : patch),
    id: entityId
  });
}

export function deleteEntity(type, entityId) {
  return database
    .prepare("DELETE FROM entities WHERE type = ? AND id = ?")
    .run(type, entityId).changes;
}

export function seedDefaults() {
  const modelCount = listEntities("model", 1).length;
  if (modelCount === 0) {
    const models = [
      {
        id: "model-text-pro",
        category: "text",
        provider: "volcengine-ark",
        profile: "agent-plan_cn-beijing_personal",
        model: "doubao-seed-2-1-pro-260915",
        label: "Doubao Seed 2.1 Pro",
        enabled: true,
        isDefault: false,
        status: "ready",
        parameters: { reasoningEffort: "medium", temperature: 0.72 }
      },
      {
        id: "model-text-lite",
        category: "text",
        provider: "volcengine-ark",
        profile: "agent-plan_cn-beijing_personal",
        model: "doubao-seed-2-1-lite-260915",
        label: "Doubao Seed 2.1 Lite",
        enabled: true,
        isDefault: false,
        status: "ready",
        parameters: { reasoningEffort: "low", temperature: 0.65 }
      },
      {
        id: "model-text-pollinations",
        category: "text",
        provider: "pollinations",
        profile: "",
        model: "openai",
        label: "GPT-OSS 20B 免费兜底",
        enabled: true,
        isDefault: true,
        status: "ready",
        parameters: { temperature: 0.65 }
      },
      {
        id: "model-vision-lite",
        category: "vision",
        provider: "volcengine-ark",
        profile: "agent-plan_cn-beijing_personal",
        model: "doubao-seed-2-0-lite-260428",
        label: "Doubao Seed 2.0 Lite 视觉理解",
        enabled: true,
        isDefault: true,
        status: "ready",
        parameters: {}
      },
      {
        id: "model-image-pro",
        category: "image",
        provider: "volcengine-ark",
        profile: "agent-plan_cn-beijing_personal",
        model: "doubao-seedream-5.0-pro",
        label: "Seedream 5.0 Pro",
        enabled: true,
        isDefault: true,
        status: "ready",
        parameters: {
          size: "2K",
          outputFormat: "jpeg",
          watermark: false,
          optimizePrompt: true
        }
      },
      {
        id: "model-image-lite",
        category: "image",
        provider: "volcengine-ark",
        profile: "agent-plan_cn-beijing_personal",
        model: "doubao-seedream-5.0-lite",
        label: "Seedream 5.0 Lite",
        enabled: true,
        isDefault: false,
        status: "ready",
        parameters: {
          size: "2K",
          outputFormat: "jpeg",
          watermark: false
        }
      },
      {
        id: "model-image-pollinations",
        category: "image",
        provider: "pollinations",
        profile: "",
        model: "flux",
        label: "FLUX 免费试片（质量有限）",
        enabled: true,
        isDefault: false,
        status: "ready",
        parameters: { width: 1024, height: 1365 }
      },
      {
        id: "model-video-pro",
        category: "video",
        provider: "volcengine-ark",
        profile: "agent-plan_cn-beijing_personal",
        model: "doubao-seedance-2.0",
        label: "Seedance 2.0",
        enabled: true,
        isDefault: true,
        status: "ready",
        parameters: {
          resolution: "1080p",
          duration: 5,
          ratio: "16:9",
          generateAudio: false,
          watermark: false
        }
      },
      {
        id: "model-video-fast",
        category: "video",
        provider: "volcengine-ark",
        profile: "agent-plan_cn-beijing_personal",
        model: "doubao-seedance-2.0-fast",
        label: "Seedance 2.0 Fast",
        enabled: true,
        isDefault: false,
        status: "ready",
        parameters: {
          resolution: "720p",
          duration: 5,
          ratio: "16:9",
          generateAudio: false,
          watermark: false
        }
      },
      {
        id: "model-voice-edge",
        category: "voice",
        provider: "edge-tts",
        profile: "",
        model: "zh-CN-XiaoxiaoNeural",
        label: "晓晓 · 中文情感旁白",
        enabled: false,
        isDefault: false,
        status: "external_service_blocked",
        parameters: { rate: "-5%", volume: "+0%", pitch: "+0Hz" }
      },
      {
        id: "model-voice-sapi",
        category: "voice",
        provider: "windows-sapi",
        profile: "",
        model: "Microsoft Yaoyao",
        label: "瑶瑶 · 本地中文旁白",
        enabled: true,
        isDefault: true,
        status: "ready",
        parameters: { rate: -1 }
      },
      {
        id: "model-voice-sapi-male",
        category: "voice",
        provider: "windows-sapi",
        profile: "",
        model: "Microsoft Kangkang",
        label: "康康 · 本地中文男声",
        enabled: true,
        isDefault: false,
        status: "ready",
        parameters: { rate: -1 }
      },
      {
        id: "model-music-local",
        category: "music",
        provider: "xying-original",
        profile: "",
        model: "xying-wedding-score-v1",
        label: "囍映原创婚礼配乐",
        enabled: true,
        isDefault: true,
        status: "ready",
        parameters: { tempo: 78, mood: "warm-cinematic" }
      },
      {
        id: "model-music-beatra",
        category: "music",
        provider: "beatra",
        profile: "",
        model: "suno-5.5",
        label: "Beatra / Suno 5.5",
        enabled: false,
        isDefault: false,
        status: "needs_setup",
        parameters: { instrumental: true }
      },
      {
        id: "model-editor-ffmpeg",
        category: "editor",
        provider: "ffmpeg",
        profile: "",
        model: "ffmpeg-9",
        label: "FFmpeg 9 本地剪辑",
        enabled: true,
        isDefault: true,
        status: "ready",
        parameters: { fps: 24, videoCodec: "libx264", audioCodec: "aac" }
      },
      {
        id: "model-editor-vvv",
        category: "editor",
        provider: "vvv-remotion",
        profile: "",
        model: "remotion-4.0.534",
        label: "VVV Remotion · 可编辑工程",
        enabled: true,
        isDefault: false,
        status: "needs_node26",
        parameters: { defaultTemplate: "starter", format: "16:9" }
      }
    ];
    models.forEach((model) => saveEntity("model", model, model.id));
  }

  if (!getEntity("model", "model-voice-sapi")) {
    saveEntity(
      "model",
      {
        id: "model-voice-sapi",
        category: "voice",
        provider: "windows-sapi",
        profile: "",
        model: "Microsoft Yaoyao",
        label: "瑶瑶 · 本地中文旁白",
        enabled: true,
        isDefault: true,
        status: "ready",
        parameters: { rate: -1 }
      },
      "model-voice-sapi"
    );
    updateEntity("model", "model-voice-edge", {
      enabled: false,
      isDefault: false,
      status: "external_service_blocked"
    });
  }

  if (!getEntity("model", "model-image-pollinations")) {
    saveEntity(
      "model",
      {
        id: "model-image-pollinations",
        category: "image",
        provider: "pollinations",
        profile: "",
        model: "flux",
        label: "FLUX 免费试片（质量有限）",
        enabled: true,
        isDefault: false,
        status: "ready",
        parameters: { width: 1024, height: 1365 }
      },
      "model-image-pollinations"
    );
  }

  if (!getEntity("model", "model-editor-vvv")) {
    saveEntity(
      "model",
      {
        id: "model-editor-vvv",
        category: "editor",
        provider: "vvv-remotion",
        profile: "",
        model: "remotion-4.0.534",
        label: "VVV Remotion · 可编辑工程",
        enabled: true,
        isDefault: false,
        status: "needs_node26",
        parameters: { defaultTemplate: "starter", format: "16:9" }
      },
      "model-editor-vvv"
    );
  }

  if (!getEntity("model", "model-text-pollinations")) {
    saveEntity(
      "model",
      {
        id: "model-text-pollinations",
        category: "text",
        provider: "pollinations",
        profile: "",
        model: "openai",
        label: "GPT-OSS 20B 免费兜底",
        enabled: true,
        isDefault: false,
        status: "ready",
        parameters: { temperature: 0.65 }
      },
      "model-text-pollinations"
    );
  }

  if (listEntities("look", 1).length === 0) {
    const looks = [
      ["male", "ancient", "朱红云纹婚服", "正红圆领袍 · 金线云纹 · 束发玉冠", "majestic, ceremonial, crimson and gold"],
      ["male", "ancient", "墨红龙纹喜服", "深墨红婚服 · 暗金龙纹 · 黑色官帽", "solemn, cinematic, subtle heritage"],
      ["male", "republic", "民国书卷长衫", "深灰长衫 · 布鞋 · 自然短发", "quiet scholar, warm sepia, restrained"],
      ["male", "republic", "民国西式青年", "棕色三件套西服 · 金丝眼镜 · 复古油头", "elegant republican era, nostalgic"],
      ["male", "modern", "黑色塔士多礼服", "黑色塔士多 · 白衬衫 · 黑领结", "modern wedding, clean, cinematic"],
      ["male", "modern", "象牙白新郎礼服", "象牙白礼服 · 香槟领结 · 自然发型", "bright wedding, romantic, soft light"],
      ["female", "ancient", "凤冠霞帔", "正红嫁衣 · 凤冠 · 金线刺绣 · 珍珠流苏", "ornate bridal, crimson and gold"],
      ["female", "ancient", "红金団扇婚服", "朱红霞帔 · 金绣云纹 · 团扇 · 红妆", "classic chinese bridal, dignified"],
      ["female", "republic", "浅蓝学生装", "浅蓝盘扣上衣 · 黑长裙 · 双麻花辫", "republican student, gentle, nostalgic"],
      ["female", "republic", "月白旗袍", "月白旗袍 · 珍珠耳饰 · 手推波纹", "vintage elegance, ivory, soft"],
      ["female", "modern", "缎面挂脖婚纱", "象牙白缎面挂脖婚纱 · 低盘发 · 珍珠耳饰", "modern bridal, sculptural, clean"],
      ["female", "modern", "蕾丝长袖婚纱", "香槟白蕾丝长袖婚纱 · 头纱 · 花瓣妆", "romantic lace wedding, warm daylight"]
    ].map(([gender, era, title, description, prompt], index) => ({
      id: `look-${gender}-${era}-${String(index + 1).padStart(2, "0")}`,
      kind: "look",
      gender,
      era,
      title,
      description,
      prompt,
      status: "prompt-only",
      imagePath: "",
      tags: [era, gender === "male" ? "新郎" : "新娘"],
      createdAt: new Date().toISOString()
    }));
    looks.forEach((look) => saveEntity("look", look, look.id));
  }

  if (listEntities("project", 1).length === 0) {
    const project = {
      id: "project-default",
      name: "我们的婚礼微电影",
      groom: "沈知远",
      bride: "林晚晴",
      weddingDate: "2026-12-20",
      city: "杭州",
      story:
        "我们从大学图书馆的一次偶遇开始。那天外面下着雨，他借给她一把伞。后来一起旅行、一起搬家，也一起度过异地最难的那两年。今天，我们决定把余生写成同一个故事。",
      storyBeats: {
        origin: "大学图书馆偶遇，雨天借伞。",
        knowing: "一起旅行、搬家，在异地最难的那两年互相陪伴。",
        confirm: "",
        companionship: "",
        promise: "今天，我们决定把余生写成同一个故事。"
      },
      templateId: "",
      duration: 40,
      fps: 24,
      aspect: "16:9",
      status: "draft",
      photos: { groom: "", bride: "" },
      photoSources: { groom: "", bride: "" },
      selectedLooks: { groom: "", bride: "" },
      workflow: { currentStep: 1, approvals: {} },
      vvvStyle: ""
    };
    saveEntity("project", project, project.id);
  }
}
