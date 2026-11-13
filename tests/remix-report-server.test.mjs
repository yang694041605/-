import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

async function startTestServer() {
  const temp = await mkdtemp(join(tmpdir(), "xying-report-test-"));
  const port = 5200 + Math.floor(Math.random() * 300);
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
      // Keep waiting for the isolated server.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  child.kill();
  throw new Error("抖音报告测试服务启动失败");
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

test("项目可以读取结构稳定的抖音复刻报告，不存在的项目返回 404", async () => {
  const { child, temp, base } = await startTestServer();
  try {
    const emptyResponse = await fetch(
      `${base}/api/projects/project-default/remix/report`
    );
    assert.equal(emptyResponse.status, 200);
    const empty = (await emptyResponse.json()).item;
    assert.equal(empty.schema, "xying-remix-report/v1");
    assert.equal(empty.fps, 24);
    assert.deepEqual(empty.shots, []);

    const missingResponse = await fetch(
      `${base}/api/projects/project-missing/remix/report`
    );
    assert.equal(missingResponse.status, 404);
  } finally {
    await stopTestServer(child, temp);
  }
});
