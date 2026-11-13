# Dual-Entry Wedding Studio 1.1 Implementation Plan

> **For agentic workers:** REQUIRED WORKFLOW: implement this plan task-by-task. Use a fresh subagent per task with review between tasks, or execute inline with checkpoints. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rebuild the wedding studio around two red festive entry points while preserving the tested generation, editing, mixing, subtitle, QC and delivery backend.

**Architecture:** Add focused navigation, prompt/report, batch-generation, estimate and replacement modules around the existing Express-free Node HTTP server and browser ES modules. Reuse the current 24 FPS timeline, model center, asset store, FFmpeg pipeline and approval hashes.

**Tech Stack:** Node.js >= 22.5, built-in `node:http`, `node:sqlite`, `node:test`, browser ES modules, CSS, FFmpeg/FFprobe, Playwright Chromium Headless Shell when installed.

## Global Constraints

- All UI copy and user-facing errors are Simplified Chinese.
- Keep the existing backend flows for generation, rendering, mixing, subtitles, approvals and delivery.
- The main page uses a professional red festive wedding-film style.
- Top navigation contains exactly `首页`, `抖音复刻`, `自我生成`, `模型中心`, `任务中心`.
- The self-generation sidebar contains 14 direct step entries and no nested step submenus.
- The Douyin sidebar contains 5 direct step entries.
- All timeline calculations use 24 FPS and integer frame boundaries.
- Batch role-image default is 24 images: 8 shots times 3 candidates per shot.
- Allowed batch counts are 12, 24, 36 and 48 images.
- Image batch submission requires confirmed model, image count, estimated cost and remaining quota.
- Paid tasks require an idempotency key and persistent submission lock.
- Unknown paid-task state keeps the original task ID and is queried, never automatically resubmitted.
- Browser requests contain project, shot and asset IDs only; arbitrary local filesystem paths are rejected.
- API keys, device tokens, refresh tokens and profile credentials never enter the browser, database, logs or UI.
- Reference-video reuse requires template-rights confirmation; real-person replacement requires couple consent.
- Technical QC success never counts as human review success.
- Failed or unavailable real models are shown honestly and are never replaced by fabricated success.
- The current Agent Plan is expired; Seedream and Seedance must remain visibly blocked until a callable Endpoint exists.
- The design source is `docs/superpowers/specs/2026-11-13-dual-entry-wedding-studio-design.md`.

---

### Task 1: Shared Studio Navigation

**Files:**
- Create: `src/studio-navigation.mjs`
- Create: `tests/studio-navigation.test.mjs`
- Modify: `src/app.js`
- Modify: `scripts/build.mjs`

**Interfaces:**
- Consumes: none.
- Produces: `TOP_NAVIGATION`, `SELF_STEPS`, `REMIX_STEPS`, `buildStudioNavigation(mode)`, `routeLabel(route)`.

- [ ] **Step 1: Write the failing navigation test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  TOP_NAVIGATION,
  SELF_STEPS,
  REMIX_STEPS,
  buildStudioNavigation
} from "../src/studio-navigation.mjs";

test("主页面只有五个一级入口和两套直接步骤", () => {
  assert.deepEqual(
    TOP_NAVIGATION.map((item) => item.label),
    ["首页", "抖音复刻", "自我生成", "模型中心", "任务中心"]
  );
  assert.equal(SELF_STEPS.length, 14);
  assert.equal(REMIX_STEPS.length, 5);
  assert.ok(SELF_STEPS.every((step) => !step.children?.length));
  assert.ok(REMIX_STEPS.every((step) => !step.children?.length));
  assert.equal(buildStudioNavigation("self")[2].children.length, 14);
  assert.equal(buildStudioNavigation("remix")[1].children.length, 5);
});
```

- [ ] **Step 2: Run test and verify failure**

Run: `node --test tests/studio-navigation.test.mjs`

Expected: FAIL because `src/studio-navigation.mjs` does not exist.

- [ ] **Step 3: Add the navigation module**

```js
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
  { id: "remix-step-1", number: 1, label: "01 链接下载与素材提取", route: "remixStep1" },
  { id: "remix-step-2", number: 2, label: "02 画面、音频、字幕与提示词解析", route: "remixStep2" },
  { id: "remix-step-3", number: 3, label: "03 男女主角色图批量生成", route: "remixStep3" },
  { id: "remix-step-4", number: 4, label: "04 人物与道具逐镜替换", route: "remixStep4" },
  { id: "remix-step-5", number: 5, label: "05 原轨道对齐、预览与交付", route: "remixStep5" }
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
  return [...TOP_NAVIGATION, ...SELF_STEPS, ...REMIX_STEPS].find(
    (item) => item.route === route
  )?.label || "婚礼微电影创作台";
}
```

- [ ] **Step 4: Integrate and verify**

In `src/app.js`, replace the old multi-tree renderer with `buildStudioNavigation(activeRouteInfo.page)`. Keep route hash recovery. In `scripts/build.mjs`, inline `src/studio-navigation.mjs` before `src/app.js`.

Run:

```powershell
node --test tests/studio-navigation.test.mjs
npm test
```

Expected: navigation test PASS; all existing tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/studio-navigation.mjs src/app.js scripts/build.mjs tests/studio-navigation.test.mjs
git commit -m "feat: add shared dual-entry navigation"
```

---

### Task 2: Structured Remix Reports and Prompt Formats

**Files:**
- Create: `src/remix-report.mjs`
- Create: `tests/remix-report.test.mjs`
- Modify: `src/prompt-library.mjs`
- Modify: `scripts/build.mjs`

**Interfaces:**
- Consumes: `WORKFLOW_SPECS`, shot and project objects already used by `prompt-library.mjs`.
- Produces: `normalizeRemixReport(template, options)`, `buildAudioAnalysisPrompt(report)`, `buildReferenceImagePrompt(shot, project)`, `buildReplacementVideoPrompt(shot, project, mapping)`.

- [ ] **Step 1: Write the failing report test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeRemixReport,
  buildAudioAnalysisPrompt,
  buildReferenceImagePrompt,
  buildReplacementVideoPrompt
} from "../src/remix-report.mjs";

test("抖音报告保留 24 FPS、音轨、字幕和替换映射", () => {
  const report = normalizeRemixReport(
    {
      title: "参考片",
      duration: 8,
      fps: 24,
      recipe: { shots: [{ start: 0, end: 4, action: "牵手" }, { start: 4, end: 8, action: "回眸" }] }
    },
    {
      audioPath: "original-audio.wav",
      transcript: [{ start: 0.2, end: 3.8, text: "今天我们结婚了" }],
      mapping: { groom: "person-1", bride: "person-2" }
    }
  );
  assert.equal(report.totalFramesAt24, 192);
  assert.equal(report.shots[0].time.framesAt24, 96);
  assert.equal(report.shots[0].mapping.groom, "person-1");
  assert.match(buildAudioAnalysisPrompt(report), /音频/);
  assert.match(buildReferenceImagePrompt(report.shots[0], { groom: "陈晨", bride: "林夏" }), /图一/);
  assert.match(buildReplacementVideoPrompt(report.shots[0], { groom: "陈晨", bride: "林夏" }, report.shots[0].mapping), /101 帧|96 帧/);
});
```

- [ ] **Step 2: Run test and verify failure**

Run: `node --test tests/remix-report.test.mjs`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the report module**

```js
import { secondsToFrames } from "./production-model.mjs";

function shotFrames(start, end) {
  return secondsToFrames(Math.max(0, Number(end) - Number(start)), 24);
}

export function normalizeRemixReport(template = {}, options = {}) {
  const shots = (template.recipe?.shots || []).map((shot, index) => ({
    shotId: `shot-${String(index + 1).padStart(3, "0")}`,
    time: {
      start: Number(shot.start || 0),
      end: Number(shot.end || template.duration || 0),
      duration: Math.max(0, Number(shot.end || 0) - Number(shot.start || 0)),
      framesAt24: shotFrames(shot.start, shot.end)
    },
    visual: {
      framing: shot.framing || "",
      action: shot.action || shot.prompt || "",
      camera: shot.camera || "",
      background: shot.scene || "",
      props: Array.isArray(shot.props) ? shot.props : []
    },
    audio: { source: options.audioPath || "", cues: [] },
    subtitles: (options.transcript || []).filter(
      (cue) => Number(cue.end) > Number(shot.start) && Number(cue.start) < Number(shot.end)
    ),
    mapping: {
      groom: options.mapping?.groom || "",
      bride: options.mapping?.bride || ""
    },
    replacement: { objects: [], backgroundPolicy: "keep" }
  }));
  return {
    title: template.title || "抖音婚礼参考片",
    duration: Number(template.duration || 0),
    fps: 24,
    totalFramesAt24: secondsToFrames(Number(template.duration || 0), 24),
    shots
  };
}

export function buildAudioAnalysisPrompt(report) {
  return [
    "【任务】拆解参考片音频，不改写、不伪造原音频。",
    "【输出】旁白区间、音乐区间、环境声、音效、节拍点、建议音量曲线。",
    `【时间基准】0–${Number(report.duration || 0).toFixed(2)} 秒，24 FPS。`,
    "【规则】保留原始时间码；人物替换不得移动原音乐和字幕的时间基准。",
    "【输出格式】JSON，包含 start、end、type、description、confidence。"
  ].join("\n");
}

export function buildReferenceImagePrompt(shot, project = {}) {
  return [
    "【任务】生成与该镜头构图一致的婚礼角色图。",
    `【参考图】图一为男主角${project.groom || "男主角"}；图二为女主角${project.bride || "女主角"}；图三为服装或场景参考。`,
    "【身份锁定】保持脸型、五官比例、眼距、鼻型、唇形、发际线、发型、肤色和身高差。",
    `【动作瞬间】${shot.visual?.action || "自然牵手"}。`,
    `【场景与光色】${shot.visual?.background || "真实婚礼场景"}；${shot.visual?.camera || "稳定机位"}。`,
    "【画幅】16:9 或 9:16。",
    "【禁止】文字、水印、黑边、换脸感、错误手指、串脸、多余人物。"
  ].join("\n");
}

export function buildReplacementVideoPrompt(shot, project = {}, mapping = {}) {
  return [
    "【任务】参考原视频运镜和动作，替换指定人物与道具。",
    `【参考区间】${shot.shotId}，${Number(shot.time.start).toFixed(2)}–${Number(shot.time.end).toFixed(2)} 秒，共 ${shot.time.framesAt24} 帧。`,
    `【人物映射】图一男主角${project.groom || "男主角"}替换${mapping.groom || "未指定"}；图二女主角${project.bride || "女主角"}替换${mapping.bride || "未指定"}。`,
    "【动作过程】从批准首帧开始，保持接触关系、重心和结束状态。",
    `【运镜】${shot.visual?.camera || "保持原机位和速度"}。`,
    "【音频字幕】不生成字幕和音乐；完成后回到原音轨和原字幕时间轴。",
    "【禁止】串脸、面部漂移、服装跳变、肢体粘连、多余手指、道具穿模。"
  ].join("\n");
}
```

- [ ] **Step 4: Run tests and build**

Run:

```powershell
node --test tests/remix-report.test.mjs
npm test
npm run build
```

Expected: all PASS; build inlines the new module.

- [ ] **Step 5: Commit**

```powershell
git add src/remix-report.mjs src/prompt-library.mjs scripts/build.mjs tests/remix-report.test.mjs
git commit -m "feat: add structured remix reports and prompt formats"
```

---

### Task 3: Model Capability Matrix and Generation Estimate

**Files:**
- Create: `server/generation-estimate.mjs`
- Create: `tests/generation-estimate.test.mjs`
- Modify: `server/model-registry.mjs`
- Modify: `server/index.mjs`
- Modify: `src/api.js`

**Interfaces:**
- Consumes: model records from `getEntity("model", id)`.
- Produces: `estimateGeneration({ category, model, count, unitCost })`, `POST /api/generation/estimate`.

- [ ] **Step 1: Write the failing estimate tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { estimateGeneration } from "../server/generation-estimate.mjs";

test("批量费用估算在缺少单价时要求报价", () => {
  const result = estimateGeneration({
    category: "image",
    model: { id: "model-image", label: "图片模型" },
    count: 24
  });
  assert.equal(result.requiresQuote, true);
  assert.equal(result.count, 24);
  assert.equal(result.unitCost, null);
});

test("配置单价后返回总价和确认提示", () => {
  const result = estimateGeneration({
    category: "image",
    model: { id: "model-image", label: "图片模型" },
    count: 24,
    unitCost: 0.2
  });
  assert.equal(result.totalCost, 4.8);
  assert.equal(result.requiresQuote, false);
  assert.match(result.confirmationText, /24 张/);
});
```

- [ ] **Step 2: Run test and verify failure**

Run: `node --test tests/generation-estimate.test.mjs`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement estimate module and endpoint**

```js
export function estimateGeneration({
  category,
  model,
  count,
  unitCost = null,
  currency = "CNY"
}) {
  const normalizedCount = Math.max(1, Math.round(Number(count) || 1));
  const normalizedUnitCost =
    unitCost == null || !Number.isFinite(Number(unitCost))
      ? null
      : Number(unitCost);
  const totalCost =
    normalizedUnitCost == null
      ? null
      : Number((normalizedUnitCost * normalizedCount).toFixed(4));
  return {
    category,
    modelId: model?.id || "",
    modelLabel: model?.label || "未选择模型",
    count: normalizedCount,
    unitCost: normalizedUnitCost,
    totalCost,
    currency,
    requiresQuote: totalCost == null,
    confirmationText:
      totalCost == null
        ? `即将使用 ${model?.label || "未选择模型"} 生成 ${normalizedCount} 张图片，当前未配置单价，请先确认报价`
        : `即将使用 ${model?.label || "未选择模型"} 生成 ${normalizedCount} 张图片，预计 ${totalCost} ${currency}`
  };
}
```

Add these exact registry entries:

```js
// MODEL_CATEGORIES
{ id: "transcription", label: "语音识别", description: "参考片口播和时间轴转写" }

// MODEL_PROVIDERS
{
  id: "whisper-local",
  label: "本地 Whisper",
  categories: ["transcription"],
  credential: "local",
  fields: ["model", "parameters"]
}
```

Register the route in `server/index.mjs`:

```js
if (path === "/api/generation/estimate" && method === "POST") {
  const body = await readJson(request);
  const model = body.modelId ? getEntity("model", body.modelId) : null;
  return sendJson(response, 200, {
    ok: true,
    item: estimateGeneration({ ...body, model })
  });
}
```

Add `api.estimateGeneration(payload)` in `src/api.js`.

- [ ] **Step 4: Verify**

Run:

```powershell
node --test tests/generation-estimate.test.mjs tests/model-registry.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add server/generation-estimate.mjs server/model-registry.mjs server/index.mjs src/api.js tests/generation-estimate.test.mjs
git commit -m "feat: add generation estimates and transcription capability"
```

---

### Task 4: Remix Report Persistence API

**Files:**
- Modify: `src/remix-report.mjs`
- Modify: `server/index.mjs`
- Modify: `src/api.js`
- Create: `tests/remix-report-server.test.mjs`

**Interfaces:**
- Consumes: template `remixAnalysis`, transcript and project mapping.
- Produces: `buildStoredRemixReport(template, project)`, `GET /api/projects/:id/remix/report`.

- [ ] **Step 1: Write the failing server test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("项目可以读取结构化抖音复刻报告", async () => {
  const temp = await mkdtemp(join(tmpdir(), "xying-report-test-"));
  const port = 5200 + Math.floor(Math.random() * 300);
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), XYING_DATA_DIR: temp, XYING_DB_PATH: join(temp, "test.db") },
    windowsHide: true
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 100; i += 1) {
      try {
        if ((await fetch(`${base}/api/health`)).ok) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const response = await fetch(`${base}/api/projects/project-default/remix/report`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(Array.isArray(payload.item.shots));
  } finally {
    child.kill();
    await rm(temp, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test and verify failure**

Run: `node --test tests/remix-report-server.test.mjs`

Expected: FAIL with status 404 because the route does not exist.

- [ ] **Step 3: Add report builder and route**

```js
export function buildStoredRemixReport(template, project = {}) {
  return normalizeRemixReport(template, {
    audioPath: template?.remixExtraction?.audioPath || "",
    transcript: template?.remixAnalysis?.transcript || [],
    mapping: {
      groom: project?.remixTargets?.groom || "",
      bride: project?.remixTargets?.bride || ""
    }
  });
}
```

In `server/index.mjs`, load the project and template, then respond:

```js
const remixReportMatch = path.match(/^\/api\/projects\/([^/]+)\/remix\/report$/);
if (remixReportMatch && method === "GET") {
  const project = getEntity("project", remixReportMatch[1]);
  const template = project?.templateId
    ? getEntity("template", project.templateId)
    : null;
  return sendJson(response, 200, {
    ok: true,
    item: buildStoredRemixReport(template || {}, project || {})
  });
}
```

Add `api.getRemixReport(projectId)`.

- [ ] **Step 4: Verify**

Run:

```powershell
node --test tests/remix-report-server.test.mjs tests/remix-report.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/remix-report.mjs server/index.mjs src/api.js tests/remix-report-server.test.mjs
git commit -m "feat: persist structured remix reports"
```

---

### Task 5: Batch Image Planning and Submission

**Files:**
- Create: `server/image-batches.mjs`
- Create: `tests/image-batches.test.mjs`
- Modify: `server/index.mjs`
- Modify: `src/api.js`

**Interfaces:**
- Consumes: project shots, approved identity references, model ID, batch size and confirmation.
- Produces: `normalizeBatchCount(value)`, `buildImageBatchPlan(input)`, `assertBatchConfirmed(confirmed, estimate)`, `findIdempotentJob(jobs, key)`, `runImageBatchJob(jobId)`, `POST /api/projects/:id/image-batches`.

- [ ] **Step 1: Write the failing batch test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeBatchCount,
  buildImageBatchPlan,
  findIdempotentJob
} from "../server/image-batches.mjs";

test("批量图片只允许 12、24、36、48 张并生成逐项任务", () => {
  assert.equal(normalizeBatchCount(25), 24);
  const plan = buildImageBatchPlan({
    projectId: "project-default",
    shotIds: ["shot-1", "shot-2"],
    versionsPerShot: 3,
    totalCount: 24
  });
  assert.equal(plan.totalCount, 24);
  assert.equal(plan.items.length, 2);
  assert.equal(plan.items[0].count, 12);
  assert.equal(plan.items[0].shotId, "shot-1");
  assert.equal(
    findIdempotentJob(
      [{ id: "job-1", input: { idempotencyKey: "batch-001" } }],
      "batch-001"
    ).id,
    "job-1"
  );
});
```

- [ ] **Step 2: Run test and verify failure**

Run: `node --test tests/image-batches.test.mjs`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement batch planning**

```js
const ALLOWED_COUNTS = [12, 24, 36, 48];

export function normalizeBatchCount(value) {
  const number = Number(value);
  return ALLOWED_COUNTS.includes(number) ? number : 24;
}

export function buildImageBatchPlan({
  projectId,
  shotIds,
  versionsPerShot = 3,
  totalCount = 24
}) {
  const shots = [...new Set(shotIds.filter(Boolean))];
  if (!shots.length) throw new Error("批量生图至少需要一个镜头");
  const count = normalizeBatchCount(totalCount);
  const base = Math.floor(count / shots.length);
  const remainder = count % shots.length;
  const items = shots.map((shotId, index) => ({
    shotId,
    count: base + (index < remainder ? 1 : 0),
    requestedVersions: Math.max(1, Number(versionsPerShot) || 1)
  }));
  return { projectId, totalCount: count, items };
}
```

Add the exact confirmation function:

```js
export function assertBatchConfirmed(confirmed, estimate) {
  if (confirmed !== true) throw new Error("批量生图必须由用户明确确认");
  if (!estimate?.modelId) throw new Error("批量生图缺少图片模型");
  if (estimate.requiresQuote) throw new Error("当前模型未配置单价，请先完成报价确认");
  return true;
}

export function findIdempotentJob(jobs, key) {
  return jobs.find((job) => job.input?.idempotencyKey === key) || null;
}
```

Register this route in `server/index.mjs`:

```js
import {
  assertBatchConfirmed,
  buildImageBatchPlan,
  findIdempotentJob
} from "./image-batches.mjs";
import { estimateGeneration } from "./generation-estimate.mjs";

const imageBatchMatch = path.match(/^\/api\/projects\/([^/]+)\/image-batches$/);
if (imageBatchMatch && method === "POST") {
  const body = await readJson(request);
  const idempotencyKey = String(request.headers["idempotency-key"] || "");
  if (!idempotencyKey) {
    return sendJson(response, 400, { ok: false, error: "缺少 Idempotency-Key" });
  }
  const existing = findIdempotentJob(listEntities("job", 5000), idempotencyKey);
  if (existing) return sendJson(response, 200, { ok: true, job: existing, reused: true });
  const model = getEntity("model", body.modelId);
  const estimate = estimateGeneration({
    category: "image",
    model,
    count: body.totalCount || 24,
    unitCost: body.unitCost ?? null
  });
  try {
    assertBatchConfirmed(body.confirmed, estimate);
  } catch (error) {
    return sendJson(response, 409, { ok: false, error: safeError(error) });
  }
  const plan = buildImageBatchPlan({
    projectId: imageBatchMatch[1],
    shotIds: body.shotIds || [],
    versionsPerShot: body.versionsPerShot || 3,
    totalCount: body.totalCount || 24
  });
  const job = createJob("image-batch", {
    modelId: model.id,
    projectId: imageBatchMatch[1],
    input: { ...plan, idempotencyKey, estimate, confirmed: true }
  });
  queueJob(job.id, () => runImageBatchJob(job.id));
  return sendJson(response, 202, { ok: true, job, estimate });
}
```

Add `runImageBatchJob(jobId)` beside `generateImageJob`. It creates one child `image-generation` job per planned item, stores the parent job ID, and passes each shot's prompt to `generateImageJob`.

- [ ] **Step 4: Verify**

Run:

```powershell
node --test tests/image-batches.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add server/image-batches.mjs server/index.mjs src/api.js tests/image-batches.test.mjs
git commit -m "feat: add confirmed batch image planning"
```

---

### Task 6: Replacement Mapping and Imported Video

**Files:**
- Create: `src/replacement-map.mjs`
- Create: `tests/replacement-map.test.mjs`
- Modify: `server/index.mjs`
- Modify: `src/api.js`
- Modify: `src/production-model.mjs`

**Interfaces:**
- Consumes: project asset IDs, shot ID, groom/bride target, prop target and imported video asset.
- Produces: `normalizeReplacementMap(input)`, `validateReplacementClip({ shot, asset, mapping })`, `bindImportedVideo(shot, asset)`, `POST /api/projects/:id/shots/:shotId/import-video`.

- [ ] **Step 1: Write the failing mapping tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeReplacementMap,
  validateReplacementClip,
  bindImportedVideo
} from "../src/replacement-map.mjs";

test("男女主替换目标不能相同，道具只能引用资产 ID", () => {
  const value = normalizeReplacementMap({
    groom: { target: "person-1", sourceAssetId: "asset-groom" },
    bride: { target: "person-2", sourceAssetId: "asset-bride" },
    props: [{ target: "prop-1", sourceAssetId: "asset-flower" }]
  });
  assert.equal(value.groom.target, "person-1");
  assert.equal(value.props[0].sourceAssetId, "asset-flower");
  assert.throws(
    () => normalizeReplacementMap({ groom: { target: "left" }, bride: { target: "left" } }),
    /不能相同/
  );
});

test("导入视频必须匹配镜头和画幅", () => {
  const result = validateReplacementClip({
    shot: { frames: 96, duration: 4 },
    asset: { id: "asset-video", media: { duration: 4.02, video: { width: 1280, height: 720 } } },
    mapping: normalizeReplacementMap({
      groom: { target: "left", sourceAssetId: "asset-groom" },
      bride: { target: "right", sourceAssetId: "asset-bride" }
    })
  });
  assert.equal(result.ok, true);
  assert.equal(result.shotFrames, 96);
  const bound = bindImportedVideo(
    { id: "shot-1", duration: 4, frames: 96, assets: {}, review: { identity: "passed" } },
    { id: "asset-video", contentHash: "hash-video" }
  );
  assert.equal(bound.assets.video.assetId, "asset-video");
  assert.equal(bound.assets.finalClip.hash, "hash-video");
  assert.equal(bound.review.identity, "pending");
});
```

- [ ] **Step 2: Run test and verify failure**

Run: `node --test tests/replacement-map.test.mjs`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement mapping and validation**

```js
const TARGETS = new Set(["left", "right", "person-1", "person-2", "person-3", "person-4"]);

export function normalizeReplacementMap(input = {}) {
  const groomTarget = String(input.groom?.target || "");
  const brideTarget = String(input.bride?.target || "");
  if (!TARGETS.has(groomTarget) || !TARGETS.has(brideTarget)) {
    throw new Error("男女主替换目标无效");
  }
  if (groomTarget === brideTarget) throw new Error("男女主替换目标不能相同");
  return {
    groom: { target: groomTarget, sourceAssetId: String(input.groom.sourceAssetId || "") },
    bride: { target: brideTarget, sourceAssetId: String(input.bride.sourceAssetId || "") },
    props: (input.props || []).map((item) => ({
      target: String(item.target || ""),
      sourceAssetId: String(item.sourceAssetId || ""),
      description: String(item.description || "")
    }))
  };
}

export function validateReplacementClip({ shot, asset, mapping }) {
  if (!asset?.id) throw new Error("缺少导入视频资产");
  const duration = Number(asset.media?.duration || 0);
  const expected = Number(shot.duration || 0);
  if (!duration || Math.abs(duration - expected) > 0.25) {
    throw new Error(`导入视频时长 ${duration.toFixed(2)} 秒与镜头 ${expected.toFixed(2)} 秒不匹配`);
  }
  normalizeReplacementMap(mapping);
  return { ok: true, shotFrames: Number(shot.frames || Math.round(expected * 24)) };
}

export function bindImportedVideo(shot, asset) {
  const binding = { assetId: asset.id, hash: asset.contentHash || "" };
  return {
    ...shot,
    assets: { ...(shot.assets || {}), video: binding, finalClip: binding },
    review: {
      identity: "pending",
      crossFace: "pending",
      hands: "pending",
      action: "pending",
      prop: "pending",
      background: "pending",
      blackBars: "pending",
      subtitleSafe: "pending",
      avSync: "pending"
    },
    status: "video_ready"
  };
}
```

Register this exact route shape:

```js
const importVideoMatch = path.match(
  /^\/api\/projects\/([^/]+)\/shots\/([^/]+)\/import-video$/
);
if (importVideoMatch && method === "POST") {
  const project = getEntity("project", importVideoMatch[1]);
  if (!project) return sendJson(response, 404, { ok: false, error: "项目不存在" });
  const shotIndex = (project.storyboard || []).findIndex(
    (shot) => shot.id === importVideoMatch[2]
  );
  if (shotIndex < 0) return sendJson(response, 404, { ok: false, error: "镜头不存在" });
  const asset = await receiveUpload(request, {
    kind: "video",
    ownerId: project.id,
    preferredName: "replacement.mp4"
  });
  const shot = project.storyboard[shotIndex];
  const mapping = normalizeReplacementMap({
    groom: {
      target: project.remixTargets?.groom || shot.characters?.groom?.target,
      sourceAssetId: project.photoAssetIds?.groom || ""
    },
    bride: {
      target: project.remixTargets?.bride || shot.characters?.bride?.target,
      sourceAssetId: project.photoAssetIds?.bride || ""
    },
    props: project.remixProps || []
  });
  validateReplacementClip({ shot, asset, mapping });
  const nextStoryboard = [...project.storyboard];
  nextStoryboard[shotIndex] = bindImportedVideo(shot, asset);
  const updated = updateEntity("project", project.id, {
    storyboard: nextStoryboard,
    remixStoryboard: nextStoryboard,
    timelineRevision: Number(project.timelineRevision || 1) + 1
  });
  return sendJson(response, 201, { ok: true, item: updated, asset });
}
```

Add `api.importReplacementVideo(projectId, shotId, file)` that posts the file to this route.

- [ ] **Step 4: Verify**

Run:

```powershell
node --test tests/replacement-map.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/replacement-map.mjs src/production-model.mjs server/index.mjs src/api.js tests/replacement-map.test.mjs
git commit -m "feat: add person prop and imported clip mapping"
```

---

### Task 7: Red Main Page and Five-Item Top Navigation

**Files:**
- Modify: `src/app.js`
- Modify: `src/styles.css`
- Modify: `index.html`
- Modify: `tests/browser-smoke.test.mjs`

**Interfaces:**
- Consumes: `TOP_NAVIGATION`, `SELF_STEPS`, `REMIX_STEPS`.
- Produces: `dualEntryHomePage()`, `renderTopNavigation()`, route navigation to `overview`, `remix`, `wizard`, `models`, `jobs`.

- [ ] **Step 1: Write the failing browser assertions**

Add assertions after loading `#/overview`:

```js
assert.match(dom, /抖音链接复刻/);
assert.match(dom, /自我生成婚礼电影/);
assert.equal((dom.match(/class="top-tab/g) || []).length, 5);
assert.doesNotMatch(dom, /婚礼项目与素材/);
```

- [ ] **Step 2: Run test and verify failure**

Run: `node --test tests/browser-smoke.test.mjs`

Expected: FAIL until the new home page and top navigation exist.

- [ ] **Step 3: Implement the red dual-entry home**

Create `dualEntryHomePage()` and use it for the `overview` route. The page must render:

```js
return `
  <main class="dual-entry-home">
    <section class="wedding-main-hero">
      <p class="eyebrow">囍映 AI · 婚礼电影首映</p>
      <h1>${esc(state.groom)} × ${esc(state.bride)}</h1>
      <p>${esc(state.date)} · ${esc(state.city)} · 24 FPS</p>
    </section>
    <section class="entry-grid">
      <button class="entry-card remix-entry" data-route="remix">
        <span class="entry-number">01</span>
        <h2>抖音链接复刻</h2>
        <p>提取画面、音频、字幕和提示词，再逐镜替换人物与道具。</p>
      </button>
      <button class="entry-card self-entry" data-route="wizard">
        <span class="entry-number">02</span>
        <h2>自我生成婚礼电影</h2>
        <p>按 14 步完成故事、旁白、图片、视频、音乐和交付。</p>
      </button>
    </section>
  </main>
`;
```

Add CSS for double-line gold borders, deep wedding red, warm ivory text, arch motifs and responsive stacking below 760px.

- [ ] **Step 4: Verify browser and visual regression**

Run:

```powershell
node --test tests/browser-smoke.test.mjs
npm run build
```

Expected: PASS; build succeeds; both entry cards appear above the fold at desktop width.

- [ ] **Step 5: Commit**

```powershell
git add src/app.js src/styles.css index.html tests/browser-smoke.test.mjs
git commit -m "feat: add red dual-entry main page"
```

---

### Task 8: Douyin Five-Step Frontend

**Files:**
- Create: `src/remix-page-specs.mjs`
- Create: `tests/remix-five-step.test.mjs`
- Modify: `src/app.js`
- Modify: `src/api.js`
- Modify: `src/styles.css`
- Modify: `scripts/build.mjs`

**Interfaces:**
- Consumes: `REMIX_STEPS`, `api.importTemplateUrl`, `api.extractRemixFrames`, `api.analyzeRemixTemplate`, `api.getRemixReport`, `api.estimateGeneration`.
- Produces: `REMIX_PAGE_SPECS`, routes `remixStep1` through `remixStep5`.

- [ ] **Step 1: Write the failing route test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { REMIX_PAGE_SPECS } from "../src/remix-page-specs.mjs";

test("抖音复刻五个页面都定义输入、操作、产物和检查", () => {
  assert.deepEqual(
    REMIX_PAGE_SPECS.map((step) => step.route),
    ["remixStep1", "remixStep2", "remixStep3", "remixStep4", "remixStep5"]
  );
  assert.ok(
    REMIX_PAGE_SPECS.every(
      (step) =>
        step.inputs.length > 0 &&
        step.actions.length > 0 &&
        step.outputs.length > 0 &&
        step.checks.length > 0
    )
  );
});
```

- [ ] **Step 2: Run test and verify failure**

Run: `node --test tests/remix-five-step.test.mjs`

Expected: FAIL because `src/remix-page-specs.mjs` does not exist.

- [ ] **Step 3: Add page specs and implement the pages**

```js
export const REMIX_PAGE_SPECS = Object.freeze([
  {
    number: 1,
    route: "remixStep1",
    title: "链接下载与素材提取",
    inputs: ["抖音链接或本地视频", "模板使用权", "男女主身份照片"],
    actions: ["下载原片", "提取 24 FPS 全帧", "提取原音频"],
    outputs: ["原片", "帧索引", "WAV 音频"],
    checks: ["授权已确认", "时长和帧数正确", "音频可播放"]
  },
  {
    number: 2,
    route: "remixStep2",
    title: "画面、音频、字幕与提示词解析",
    inputs: ["帧索引", "原始音频", "镜头切点"],
    actions: ["生成结构报告", "提取字幕", "生成音频/图片/视频提示词"],
    outputs: ["逐镜报告", "SRT", "三套提示词"],
    checks: ["时间码连续", "角色映射明确", "提示词字段完整"]
  },
  {
    number: 3,
    route: "remixStep3",
    title: "男女主角色图批量生成",
    inputs: ["身份母版", "分析报告", "批量数量"],
    actions: ["选择 12/24/36/48 张", "确认费用", "生成或上传候选"],
    outputs: ["角色图候选", "选版记录"],
    checks: ["身份一致", "服装时代正确", "候选数量正确"]
  },
  {
    number: 4,
    route: "remixStep4",
    title: "人物与道具逐镜替换",
    inputs: ["角色候选", "替换映射", "道具参考"],
    actions: ["绑定图一/图二", "生成或导入视频", "逐镜人工质检"],
    outputs: ["最终片段", "提示词版本", "审核记录"],
    checks: ["无串脸", "手部和道具正确", "背景稳定"]
  },
  {
    number: 5,
    route: "remixStep5",
    title: "原轨道对齐、预览与交付",
    inputs: ["已批准镜头", "原音频", "原字幕", "时间轴"],
    actions: ["封装当前时间轴", "检查音画同步", "导出交付包"],
    outputs: ["预览 MP4", "SRT", "交付清单"],
    checks: ["无缺口重叠", "字幕同步", "完整观看通过"]
  }
]);
```

Use these exact page capabilities:

- `remixStep1`: link input, rights checkbox, download, cover preview, duration/FPS/frame summary, audio and frame-index links.
- `remixStep2`: structured report, shot tabs, first/middle/last frame previews, audio prompt, image prompt and video prompt copy buttons.
- `remixStep3`: identity anchors, shot checkboxes, batch count 12/24/36/48, estimate, explicit confirmation and result grid.
- `remixStep4`: groom/bride target selects, prop replacement rows, imported video upload per shot and nine-item QC.
- `remixStep5`: timeline alignment status, original audio/subtitle tracks, render preview, SRT, shot table and delivery package.

Every page includes previous/next buttons and direct access to model center when required models are unavailable.

- [ ] **Step 4: Verify**

Run:

```powershell
node --test tests/remix-five-step.test.mjs tests/browser-smoke.test.mjs
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/app.js src/api.js src/styles.css tests/remix-five-step.test.mjs
git add src/remix-page-specs.mjs scripts/build.mjs
git commit -m "feat: implement five-step Douyin workflow"
```

---

### Task 9: Self-Generation Shell and Batch UI

**Files:**
- Modify: `src/app.js`
- Modify: `src/styles.css`
- Modify: `tests/browser-smoke.test.mjs`
- Modify: `tests/workflow-specs.test.mjs`

**Interfaces:**
- Consumes: `SELF_STEPS`, existing `WORKFLOW_SPECS`, current step pages.
- Produces: 14 direct sidebar routes, batch image grid, selection and binding UI.

- [ ] **Step 1: Write failing browser assertions**

```js
const selfStepIds = [
  "self-step-1", "self-step-2", "self-step-3", "self-step-4",
  "self-step-5", "self-step-6", "self-step-7", "self-step-8",
  "self-step-9", "self-step-10", "self-step-11", "self-step-12",
  "self-step-13", "self-step-14"
];
assert.equal(
  await evaluate(`document.querySelectorAll('[data-nav-id^="self-step-"]').length`),
  14
);
assert.equal(
  await evaluate(`document.querySelector('[data-nav-id="self-step-1"]').hasAttribute("aria-expanded")`),
  false
);
```

- [ ] **Step 2: Run test and verify failure**

Run: `node --test tests/browser-smoke.test.mjs`

Expected: FAIL until direct self-step IDs are rendered.

- [ ] **Step 3: Implement self shell and batch UI**

- Sidebar maps `SELF_STEPS` to direct buttons.
- Remove all remaining nested step navigation.
- Step 8 page gains batch count, estimate summary, confirm/submit button, result grid and approve/reject actions.
- Each image card shows shot, identity references, model, prompt version, seed and review state.
- Each step page keeps the existing goal/input/action/output/check sections.

- [ ] **Step 4: Verify**

Run:

```powershell
node --test tests/workflow-specs.test.mjs tests/browser-smoke.test.mjs
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/app.js src/styles.css tests/browser-smoke.test.mjs tests/workflow-specs.test.mjs
git commit -m "feat: implement direct self-generation and batch UI"
```

---

### Task 10: End-to-End Safety and Acceptance

**Files:**
- Create: `tests/dual-entry-acceptance.test.mjs`
- Modify: `tests/complete-workflow.test.mjs`
- Modify: `tests/security.test.mjs`
- Modify: `tests/render-integration.test.mjs`
- Modify: `tests/production-server.test.mjs`
- Modify: `README.md`
- Modify: `docs/模型配置与运行说明.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified build and documented 1.1 operating flow.

- [ ] **Step 1: Add exact acceptance assertions**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { estimateGeneration } from "../server/generation-estimate.mjs";
import {
  assertBatchConfirmed,
  buildImageBatchPlan,
  findIdempotentJob
} from "../server/image-batches.mjs";
import { bindImportedVideo } from "../src/replacement-map.mjs";
import { buildTimeline } from "../src/production-model.mjs";

test("双入口验收覆盖批量、幂等、替换清理和轨道保留", () => {
  const estimate = estimateGeneration({
    category: "image",
    model: { id: "model-image", label: "图片模型" },
    count: 24
  });
  assert.equal(estimate.requiresQuote, true);
  assert.throws(() => assertBatchConfirmed(true, estimate), /报价/);

  const plan = buildImageBatchPlan({
    projectId: "project-default",
    shotIds: Array.from({ length: 8 }, (_, index) => `shot-${index + 1}`),
    versionsPerShot: 3,
    totalCount: 24
  });
  assert.equal(plan.totalCount, 24);
  assert.equal(plan.items.reduce((sum, item) => sum + item.count, 0), 24);

  const jobs = [{ id: "job-one", input: { idempotencyKey: "same-key" } }];
  assert.equal(findIdempotentJob(jobs, "same-key").id, "job-one");
  assert.equal(findIdempotentJob(jobs, "other-key"), null);

  const imported = bindImportedVideo(
    {
      id: "shot-1",
      duration: 4,
      frames: 96,
      assets: { video: { assetId: "old-video", hash: "old-hash" } },
      review: { identity: "passed", crossFace: "passed" }
    },
    { id: "new-video", contentHash: "new-hash" }
  );
  assert.equal(imported.assets.finalClip.assetId, "new-video");
  assert.equal(imported.review.identity, "pending");

  const timeline = buildTimeline({
    mode: "remix",
    duration: 40,
    fps: 24,
    voice: [{ assetId: "voice-1", start: 0, end: 40 }],
    subtitle: [{ assetId: "srt-1", start: 0, end: 40 }]
  });
  assert.equal(timeline.tracks.voice[0].startFrame, 0);
  assert.equal(timeline.tracks.voice[0].endFrame, 960);
  assert.equal(timeline.tracks.subtitle[0].startFrame, 0);
  assert.equal(timeline.tracks.subtitle[0].endFrame, 960);
});
```

Add this assertion to `tests/production-server.test.mjs` using the existing fixtures:

```js
const importedProject = fixtureProject();
importedProject.storyboard[0] = bindImportedVideo(
  importedProject.storyboard[0],
  { id: "asset-imported", contentHash: "imported-hash" }
);
const importedTimeline = buildProjectTimeline(importedProject, fixtureAssets());
assert.throws(
  () => validateRenderTimeline(importedProject, importedTimeline, fixtureAssets()),
  /未批准/
);
```

- [ ] **Step 2: Run new assertions and verify failure**

Run:

```powershell
node --test tests/complete-workflow.test.mjs tests/security.test.mjs tests/render-integration.test.mjs
```

Expected: FAIL for any missing integration behavior.

- [ ] **Step 3: Complete integration and documentation**

Update README with:

- Main-page two-entry usage.
- Douyin five-step usage.
- Self-generation 14-step usage.
- Batch count and cost confirmation.
- Current model availability and blocked Seedream/Seedance state.
- Rights and consent requirements.

- [ ] **Step 4: Run full acceptance**

Run:

```powershell
npm test
npm run build
node --test tests/browser-smoke.test.mjs
```

Then open:

```text
http://127.0.0.1:4173/#/overview
```

Verify:

- Two main entries above the fold.
- Five top navigation items.
- 14 direct self steps.
- Five direct Douyin steps.
- Image and video preview, zoom, save and safe delete.
- Batch estimate and confirmation.
- No console exceptions.

- [ ] **Step 5: Commit**

```powershell
git add tests/dual-entry-acceptance.test.mjs tests/complete-workflow.test.mjs tests/security.test.mjs
git add tests/render-integration.test.mjs tests/production-server.test.mjs
git add README.md docs/模型配置与运行说明.md
git commit -m "test: verify dual-entry wedding studio end to end"
```

## Self-Review

- Spec coverage: main page, top navigation, 14 self steps, five Douyin steps, extraction report, audio/image/video prompts, batch generation, replacement targets, imported clips, original track alignment, configurable models, cost gates, safety, QC and acceptance each map to Tasks 1–10.
- Placeholder scan: no `TBD`, `TODO`, deferred requirement or unnamed function remains.
- Type consistency: task field names use `shotId`, `framesAt24`, `versionsPerShot`, `sourceAssetId`, `projectId`, `assetId`, `idempotencyKey` consistently with the design spec.
