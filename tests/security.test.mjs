import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

async function startTestServer() {
  const temp = await mkdtemp(join(tmpdir(), "xying-security-test-"));
  const port = 4600 + Math.floor(Math.random() * 300);
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
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return { child, base, temp };
    } catch {
      // Server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  child.kill();
  await rm(temp, { recursive: true, force: true });
  throw new Error(`测试服务启动失败：${output}`);
}

async function stopTestServer(child, temp) {
  if (!child.killed) child.kill();
  await new Promise((resolveWait) => {
    if (child.exitCode !== null) return resolveWait();
    child.once("exit", resolveWait);
    setTimeout(resolveWait, 2000);
  });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await rm(temp, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
}

test("跨站页面不能读取本地制作服务", async () => {
  const { child, base, temp } = await startTestServer();
  try {
    const response = await fetch(`${base}/api/health`, {
      headers: { Origin: "https://evil.example" }
    });
    assert.equal(response.headers.get("access-control-allow-origin"), null);

    const preflight = await fetch(`${base}/api/generate/video`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Method": "POST"
      }
    });
    assert.equal(preflight.status, 403);
  } finally {
    await stopTestServer(child, temp);
  }
});

test("可信本机页面获得精确 Origin 的 CORS", async () => {
  const { child, base, temp } = await startTestServer();
  try {
    const origin = base;
    const response = await fetch(`${base}/api/health`, {
      headers: { Origin: origin }
    });
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
  } finally {
    await stopTestServer(child, temp);
  }
});

test("每个模型类别只有一个默认项", async () => {
  const { child, base, temp } = await startTestServer();
  try {
    const payload = await (await fetch(`${base}/api/models`)).json();
    const groups = new Map();
    for (const model of payload.items) {
      const current = groups.get(model.category) || [];
      current.push(model);
      groups.set(model.category, current);
    }
    for (const models of groups.values()) {
      assert.equal(models.filter((model) => model.isDefault).length, 1);
    }
  } finally {
    await stopTestServer(child, temp);
  }
});

test("渲染与生成接口拒绝浏览器提交文件路径", async () => {
  const { child, base, temp } = await startTestServer();
  try {
    const response = await fetch(`${base}/api/render`, {
      method: "POST",
      headers: {
        Origin: base,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        projectId: "project-default",
        clips: [{ path: "C:\\Windows\\win.ini" }]
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.match(payload.error, /路径/);

    const generation = await fetch(`${base}/api/generate/video`, {
      method: "POST",
      headers: {
        Origin: base,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        projectId: "project-default",
        prompt: "测试",
        inputs: ["reference_image:C:\\Windows\\win.ini"]
      })
    });
    assert.equal(generation.status, 400);
    const generationPayload = await generation.json();
    assert.match(generationPayload.error, /资产 ID/);
  } finally {
    await stopTestServer(child, temp);
  }
});
