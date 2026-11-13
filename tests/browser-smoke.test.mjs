import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const browserCandidates = [
  join(
    process.env.LOCALAPPDATA || "",
    "ms-playwright",
    "chromium_headless_shell-1254",
    "chrome-headless-shell-win64",
    "chrome-headless-shell.exe"
  ),
  join(
    process.env.LOCALAPPDATA || "",
    "ms-playwright",
    "chromium_headless_shell-1223",
    "chrome-headless-shell-win64",
    "chrome-headless-shell.exe"
  )
];

async function findBrowser() {
  for (const candidate of browserCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next installed browser.
    }
  }
  return "";
}

async function startServer() {
  const temp = await mkdtemp(join(tmpdir(), "xying-browser-test-"));
  const port = 5400 + Math.floor(Math.random() * 300);
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
      // Keep waiting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  child.kill();
  throw new Error("浏览器测试服务启动失败");
}

async function stopServer(child, temp) {
  child.kill();
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

async function waitForJson(url, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Browser is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`无法连接浏览器调试端口：${url}`);
}

async function openCdpPageOnce(browser, url) {
  const port = 6200 + Math.floor(Math.random() * 500);
  const child = spawn(
    browser,
    [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--remote-allow-origins=*",
      `--remote-debugging-port=${port}`,
      url
    ],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
  );
  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const pages = await waitForJson(`http://127.0.0.1:${port}/json/list`);
    const page = pages.find((item) => item.type === "page");
    if (!page?.webSocketDebuggerUrl) throw new Error("没有找到浏览器页面");
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener("open", resolveOpen, { once: true });
      socket.addEventListener("error", rejectOpen, { once: true });
    });
    let sequence = 0;
    const pending = new Map();
    const exceptions = [];
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const { resolveCommand, rejectCommand } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) rejectCommand(new Error(message.error.message));
        else resolveCommand(message.result);
      }
      if (message.method === "Runtime.exceptionThrown") {
        exceptions.push(message.params?.exceptionDetails?.text || "浏览器脚本异常");
      }
    });
    const send = (method, params = {}) =>
      new Promise((resolveCommand, rejectCommand) => {
        const id = ++sequence;
        pending.set(id, { resolveCommand, rejectCommand });
        socket.send(JSON.stringify({ id, method, params }));
      });
    await send("Runtime.enable");
    const evaluate = async (expression) => {
      const result = await send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || "浏览器执行表达式失败");
      }
      return result.result?.value;
    };
    return {
      child,
      evaluate,
      exceptions,
      close: () => socket.close()
    };
  } catch (error) {
    child.kill();
    throw error;
  }
}

async function openCdpPage(browser, url) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await openCdpPageOnce(browser, url);
    } catch (error) {
      lastError = error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 300));
    }
  }
  throw lastError;
}

async function waitForBrowser(evaluate, expression, timeout = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`等待浏览器状态超时：${expression}`);
}

test("造型页在浏览器中完成挂载且没有未捕获异常", { timeout: 30000 }, async (t) => {
  const browser = await findBrowser();
  if (!browser) {
    t.skip("未找到 Playwright Chromium Headless Shell");
    return;
  }
  const { child, temp, base } = await startServer();
  try {
    const result = await new Promise((resolveRun, reject) => {
      const process = spawn(browser, [
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--virtual-time-budget=5000",
        "--dump-dom",
        `${base}/#/looks`
      ], { windowsHide: true });
      let stdout = "";
      let stderr = "";
      process.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      process.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      process.on("error", reject);
      process.on("close", () => resolveRun({ stdout, stderr }));
    });
    assert.doesNotMatch(result.stderr, /Uncaught (ReferenceError|TypeError|SyntaxError)/);
    assert.match(result.stdout, /造型与一致性/);
    assert.match(result.stdout, /三生三世婚服与场景参考/);
  } finally {
    await stopServer(child, temp);
  }
});

test("主页显示红色双入口、五个顶部导航且不重复侧栏", { timeout: 30000 }, async (t) => {
  const browser = await findBrowser();
  if (!browser) {
    t.skip("未找到 Playwright Chromium Headless Shell");
    return;
  }
  const { child, temp, base } = await startServer();
  try {
    const result = await new Promise((resolveRun, reject) => {
      const process = spawn(browser, [
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--virtual-time-budget=5000",
        "--dump-dom",
        `${base}/#/overview`
      ], { windowsHide: true });
      let stdout = "";
      let stderr = "";
      process.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      process.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      process.on("error", reject);
      process.on("close", () => resolveRun({ stdout, stderr }));
    });
    assert.doesNotMatch(result.stderr, /Uncaught (ReferenceError|TypeError|SyntaxError)/);
    assert.match(result.stdout, /抖音链接复刻/);
    assert.match(result.stdout, /自我生成婚礼电影/);
    assert.match(result.stdout, /dual-entry-home/);
    assert.match(result.stdout, /app-shell no-sidebar/);
    assert.equal((result.stdout.match(/class="top-tab /g) || []).length, 5);
    assert.doesNotMatch(result.stdout, /婚礼项目与素材/);
  } finally {
    await stopServer(child, temp);
  }
});

test("三级至五级导航可跳转，图片可放大预览并显示保存删除入口", { timeout: 40000 }, async (t) => {
  const browser = await findBrowser();
  if (!browser) {
    t.skip("未找到 Playwright Chromium Headless Shell");
    return;
  }
  const { child: server, temp, base } = await startServer();
  let page = null;
  try {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0YQAAAAASUVORK5CYII=",
      "base64"
    );
    const upload = await fetch(
      `${base}/api/assets/upload?kind=project-photo&projectId=project-default&name=preview-test.png`,
      {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: png
      }
    );
    assert.equal(upload.status, 201);
    page = await openCdpPage(browser, `${base}/#/looks`);
    await waitForBrowser(
      page.evaluate,
      `Boolean(document.querySelector('.top-tab[data-route="wizard"]'))`
    );

    await page.evaluate(
      `document.querySelector('.top-tab[data-route="wizard"]').click(); true`
    );
    await waitForBrowser(
      page.evaluate,
      `Boolean(document.querySelector('[data-nav-id="self-step-7"]'))`
    );
    await page.evaluate(
      `document.querySelector('[data-nav-id="self-step-7"]').click(); true`
    );
    await waitForBrowser(
      page.evaluate,
      `location.hash.includes('/story/step/7') &&
       !document.querySelector('[data-nav-id="self-step-7"]').hasAttribute('aria-expanded') &&
       document.body.innerText.includes('本步生产说明') &&
       document.body.innerText.includes('本步图片参考')`
    );

    await page.evaluate(`location.hash = '#/assets'; true`);
    await waitForBrowser(
      page.evaluate,
      `document.querySelectorAll('#main-content img[data-media-asset-id]').length > 0`
    );
    await page.evaluate(
      `document.querySelector('#main-content img[data-media-asset-id]').click(); true`
    );
    await waitForBrowser(
      page.evaluate,
      `document.querySelector('#media-viewer') && !document.querySelector('#media-viewer').hidden`
    );
    const viewerState = await page.evaluate(`(() => {
      const viewer = document.querySelector('#media-viewer');
      const save = viewer.querySelector('[data-media-save]');
      const remove = viewer.querySelector('[data-media-delete]');
      viewer.querySelector('[data-media-zoom="in"]').click();
      return {
        title: viewer.querySelector('#media-viewer-title').textContent,
        saveReady: Boolean(save.href && save.download),
        deleteVisible: !remove.hidden,
        scale: viewer.querySelector('[data-media-scale]').textContent
      };
    })()`);
    assert.ok(viewerState.title);
    assert.equal(viewerState.saveReady, true);
    assert.equal(viewerState.deleteVisible, true);
    assert.equal(viewerState.scale, "125%");
    await page.evaluate(`(() => {
      window.confirm = () => true;
      document.querySelector('#media-viewer [data-media-delete]').click();
      return true;
    })()`);
    await waitForBrowser(
      page.evaluate,
      `document.querySelector('#media-viewer').hidden === true && document.querySelectorAll('#main-content img[data-media-asset-id]').length === 0`
    );
    assert.deepEqual(page.exceptions, []);
    page.close();
  } finally {
    page?.child?.kill();
    await stopServer(server, temp);
  }
});
