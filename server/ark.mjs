import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ARK_ENV = {
  ARKCLI_NO_UPDATE_NOTIFIER: "1",
  ARKCLI_CALLER_TYPE: "ai_agent",
  ARKCLI_CALLER_NAME: "codex",
  ARKCLI_SKILL_NAME: "arkcli-gen"
};

export function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      windowsHide: true,
      shell: Boolean(options.shell)
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ code, stdout, stderr });
      } else {
        const error = new Error(
          stderr.trim() || stdout.trim() || `${command} exited with code ${code}`
        );
        error.code = code;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });
  });
}

function runArk(args, options = {}) {
  const configuredScript = process.env.ARKCLI_SCRIPT;
  const defaultScript = join(
    process.env.APPDATA || "",
    "npm",
    "node_modules",
    "@volcengine",
    "ark-cli",
    "scripts",
    "run.js"
  );
  const script = configuredScript || defaultScript;
  if (existsSync(script)) {
    return runProcess(process.execPath, [script, ...args], {
      ...options,
      env: {
        ...ARK_ENV,
        ...(options.skillName
          ? { ARKCLI_SKILL_NAME: options.skillName }
          : {})
      }
    });
  }
  return runProcess("arkcli.cmd", args, {
    ...options,
    env: {
      ...ARK_ENV,
      ...(options.skillName
        ? { ARKCLI_SKILL_NAME: options.skillName }
        : {})
    },
    shell: true
  });
}

function parseJsonOutput(result) {
  const text = result.stdout.trim();
  if (!text) throw new Error("模型没有返回内容");
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error(`无法解析模型返回：${text.slice(0, 500)}`);
  }
}

export async function arkAuthStatus() {
  return parseJsonOutput(await runArk(["auth", "status"]));
}

export async function arkResources(profile, modality) {
  const args = [];
  if (profile) args.push("--profile", profile);
  args.push("resources", "list", "--modality", modality, "--format", "json");
  return parseJsonOutput(await runArk(args));
}

export async function chatText({ profile, model, prompt, instructions, parameters = {} }) {
  const args = [];
  if (profile) args.push("--profile", profile);
  args.push(
    "+chat",
    "--model",
    model,
    "--format",
    "json",
    "--no-progress",
    "--max-output-tokens",
    String(parameters.maxOutputTokens || 5000),
    "--temperature",
    String(parameters.temperature ?? 0.7)
  );
  if (instructions) args.push("--instructions", instructions);
  if (parameters.reasoningEffort) {
    args.push("--reasoning-effort", parameters.reasoningEffort);
  }
  args.push(prompt);
  const raw = await runArk(args);
  const data = parseJsonOutput(raw);
  return {
    ...data,
    stderr: raw.stderr || "",
    provider: "volcengine-ark"
  };
}

export async function understandMedia({
  profile,
  model,
  subSkill,
  inputPath,
  prompt = "",
  parameters = {}
}) {
  const args = [];
  if (profile) args.push("--profile", profile);
  args.push(
    "+understand",
    subSkill,
    "--input",
    `@${inputPath}`,
    "--format",
    "json",
    "--no-progress",
    "--max-output-tokens",
    String(parameters.maxOutputTokens || 6000),
    "--temperature",
    String(parameters.temperature ?? 0.2),
    "--timeout",
    String(parameters.timeout || "2m")
  );
  if (model) args.push("--model", model);
  if (parameters.reasoningEffort) {
    args.push("--reasoning-effort", parameters.reasoningEffort);
  }
  if (prompt) args.push(prompt);
  const raw = await runArk(args, { skillName: "arkcli-understand" });
  return {
    ...parseJsonOutput(raw),
    stderr: raw.stderr || "",
    provider: "volcengine-ark"
  };
}

export async function generateImage({
  profile,
  model,
  prompt,
  outputDir,
  inputs = [],
  parameters = {}
}) {
  await mkdir(outputDir, { recursive: true });
  const args = [];
  if (profile) args.push("--profile", profile);
  args.push(
    "+gen",
    "--model",
    model,
    "--modality",
    "image",
    "--size",
    String(parameters.size || "2K"),
    "--output-format",
    String(parameters.outputFormat || "jpeg"),
    "--watermark=false",
    "--format",
    "json",
    "--no-open",
    "--save-to",
    outputDir
  );
  if (parameters.optimizePrompt === false) {
    args.push("--optimize-prompt=false");
  }
  for (const input of inputs.filter(Boolean)) {
    args.push(
      "--input",
      /^(first_frame|last_frame|reference_video|reference_image|reference_audio|first|last|ref):/.test(
        input
      )
        ? input
        : `@${input}`
    );
  }
  args.push(prompt);
  const raw = await runArk(args, { cwd: outputDir });
  const data = parseJsonOutput(raw);
  return { ...data, stderr: raw.stderr || "", provider: "volcengine-ark" };
}

export async function submitVideo({
  profile,
  model,
  prompt,
  outputDir,
  inputs = [],
  parameters = {}
}) {
  await mkdir(outputDir, { recursive: true });
  const args = [];
  if (profile) args.push("--profile", profile);
  args.push(
    "+gen",
    "--model",
    model,
    "--modality",
    "video",
    "--resolution",
    String(parameters.resolution || "720p"),
    "--duration",
    String(parameters.duration || 5),
    "--ratio",
    String(parameters.ratio || "16:9"),
    "--generate-audio=false",
    "--watermark=false",
    "--format",
    "json",
    "--no-open",
    "--save-to",
    outputDir
  );
  for (const input of inputs.filter(Boolean)) {
    args.push(
      "--input",
      /^(first_frame|last_frame|reference_video|reference_image|reference_audio|first|last|ref):/.test(
        input
      )
        ? input
        : `@${input}`
    );
  }
  args.push(prompt);
  const raw = await runArk(args, { cwd: outputDir });
  const data = parseJsonOutput(raw);
  return { ...data, stderr: raw.stderr || "", provider: "volcengine-ark" };
}

export async function queryVideoTask(taskId, outputDir) {
  const args = [
    "gen",
    "get",
    taskId,
    "--format",
    "json",
    "--no-open",
    "--save-to",
    outputDir
  ];
  const raw = await runArk(args, { cwd: outputDir });
  return { ...parseJsonOutput(raw), stderr: raw.stderr || "" };
}
