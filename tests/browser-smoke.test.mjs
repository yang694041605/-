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
