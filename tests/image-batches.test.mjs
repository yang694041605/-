import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  normalizeBatchCount,
  buildImageBatchPlan,
  assertBatchConfirmed,
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
  assert.equal(findIdempotentJob([], "missing"), null);
});

test("批量确认要求明确确认、模型和已知报价", () => {
  assert.throws(
    () => assertBatchConfirmed(false, { modelId: "model-image", requiresQuote: false }),
    /明确确认/
  );
  assert.throws(
    () => assertBatchConfirmed(true, { modelId: "", requiresQuote: false }),
    /缺少图片模型/
  );
  assert.throws(
    () => assertBatchConfirmed(true, { modelId: "model-image", requiresQuote: true }),
    /报价/
  );
  assert.equal(
    assertBatchConfirmed(true, {
      modelId: "model-image",
      requiresQuote: false
    }),
    true
  );
});

async function startTestServer() {
  const temp = await mkdtemp(join(tmpdir(), "xying-image-batch-test-"));
  const port = 5600 + Math.floor(Math.random() * 300);
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: resolve("."),
    env: {
      ...process.env,
      PORT: String(port),
      XYING_DATA_DIR: temp,
      XYING_DB_PATH: join(temp, "test.db")
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return { child, temp, base };
    } catch {
      // Server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  child.kill();
  throw new Error("批量生图测试服务启动失败");
}

async function stopTestServer(child, temp) {
  child.kill();
  await new Promise((resolveWait) => {
    if (child.exitCode !== null) return resolveWait();
    child.once("exit", resolveWait);
    setTimeout(resolveWait, 2000);
  });
  await rm(temp, { recursive: true, force: true });
}

test("批量接口在缺少幂等键、未确认或缺少报价时不创建任务", async () => {
  const { child, temp, base } = await startTestServer();
  try {
    const missingKey = await fetch(
      `${base}/api/projects/project-default/image-batches`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      }
    );
    assert.equal(missingKey.status, 400);

    const unconfirmed = await fetch(
      `${base}/api/projects/project-default/image-batches`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "batch-unconfirmed"
        },
        body: JSON.stringify({
          modelId: "model-image-pro",
          shotIds: ["shot-1"],
          totalCount: 24,
          unitCost: 0.2,
          confirmed: false
        })
      }
    );
    assert.equal(unconfirmed.status, 409);

    const noQuote = await fetch(
      `${base}/api/projects/project-default/image-batches`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "batch-no-quote"
        },
        body: JSON.stringify({
          modelId: "model-image-pro",
          shotIds: ["shot-1"],
          totalCount: 24,
          confirmed: true
        })
      }
    );
    assert.equal(noQuote.status, 409);

    const jobs = await (await fetch(`${base}/api/jobs`)).json();
    assert.equal(
      jobs.items.filter((job) => job.kind === "image-batch").length,
      0
    );
  } finally {
    await stopTestServer(child, temp);
  }
});

test("批量规划拒绝空镜头列表并保持总张数", () => {
  assert.throws(
    () =>
      buildImageBatchPlan({
        projectId: "project-default",
        shotIds: [],
        totalCount: 24
      }),
    /至少需要一个镜头/
  );
  const plan = buildImageBatchPlan({
    projectId: "project-default",
    shotIds: Array.from({ length: 8 }, (_, index) => `shot-${index + 1}`),
    totalCount: 24
  });
  assert.equal(
    plan.items.reduce((sum, item) => sum + item.count, 0),
    24
  );
});
