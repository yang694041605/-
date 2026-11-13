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

test("模型配置接口支持新增、编辑、测试、设默认和删除", async () => {
  const { child, base, temp } = await startTestServer();
  try {
    const schemaPayload = await (await fetch(`${base}/api/models`)).json();
    assert.ok(schemaPayload.schema.categories.length >= 7);

    const invalid = await fetch(`${base}/api/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "video",
        provider: "pollinations",
        label: "错误模型",
        model: "x",
        parameters: {}
      })
    });
    assert.equal(invalid.status, 400);

    const createdResponse = await fetch(`${base}/api/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "music",
        provider: "xying-original",
        label: "验收模型",
        model: "acceptance-score",
        enabled: true,
        isDefault: false,
        parameters: { tempo: 88, mood: "bright-romantic" }
      })
    });
    const createdText = await createdResponse.text();
    assert.equal(createdResponse.status, 201, createdText);
    const created = JSON.parse(createdText).item;

    const updatedResponse = await fetch(`${base}/api/models/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...created,
        label: "验收模型 v2",
        parameters: { tempo: 92 }
      })
    });
    assert.equal(updatedResponse.status, 200);
    const updated = (await updatedResponse.json()).item;
    assert.equal(updated.label, "验收模型 v2");
    assert.equal(updated.parameters.tempo, 92);

    const testedResponse = await fetch(`${base}/api/models/${created.id}/test`, {
      method: "POST"
    });
    assert.equal(testedResponse.status, 200);
    assert.equal((await testedResponse.json()).result.ok, true);

    const defaultResponse = await fetch(
      `${base}/api/models/${created.id}/default`,
      { method: "POST" }
    );
    assert.equal(defaultResponse.status, 200);
    const afterDefault = await (await fetch(`${base}/api/models`)).json();
    const musicModels = afterDefault.items.filter((model) => model.category === "music");
    assert.equal(musicModels.filter((model) => model.isDefault).length, 1);
    assert.equal(musicModels.find((model) => model.isDefault).id, created.id);

    const deleted = await fetch(`${base}/api/models/${created.id}`, {
      method: "DELETE"
    });
    assert.equal(deleted.status, 200);
    const afterDelete = await (await fetch(`${base}/api/models`)).json();
    const remainingMusic = afterDelete.items.filter((model) => model.category === "music");
    assert.equal(remainingMusic.filter((model) => model.isDefault).length, 1);
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

test("图片素材未被引用时可以删除记录和本地文件，被镜头或项目引用时必须拒绝", async () => {
  const { child, base, temp } = await startTestServer();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0YQAAAAASUVORK5CYII=",
    "base64"
  );
  try {
    const uploadResponse = await fetch(
      `${base}/api/assets/upload?kind=project-photo&projectId=project-default&name=delete-me.png`,
      {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: png
      }
    );
    assert.equal(uploadResponse.status, 201);
    const uploaded = (await uploadResponse.json()).item;

    const deleteResponse = await fetch(`${base}/api/assets/${uploaded.id}`, {
      method: "DELETE"
    });
    assert.equal(deleteResponse.status, 200);
    const deletePayload = await deleteResponse.json();
    assert.equal(deletePayload.fileDeleted, true);
    assert.notEqual((await fetch(`${base}${uploaded.url}`)).status, 200);

    const projectPhotoResponse = await fetch(
      `${base}/api/projects/project-default/photos?role=groom&name=referenced.png`,
      {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: png
      }
    );
    assert.equal(projectPhotoResponse.status, 201);
    const projectPhoto = (await projectPhotoResponse.json()).asset;
    const blockedResponse = await fetch(
      `${base}/api/assets/${projectPhoto.id}`,
      { method: "DELETE" }
    );
    assert.equal(blockedResponse.status, 409);
    const blocked = await blockedResponse.json();
    assert.match(blocked.error, /已被/);
    assert.equal((await fetch(`${base}${projectPhoto.url}`)).status, 200);
  } finally {
    await stopTestServer(child, temp);
  }
});
