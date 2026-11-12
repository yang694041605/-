import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export function runPython(args, options = {}) {
  return new Promise((resolve, reject) => {
    const command = process.env.PYTHON_PATH || "python";
    const child = spawn(command, args, {
      ...options,
      windowsHide: true
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
      if (code === 0) resolve({ stdout, stderr });
      else {
        const error = new Error(stderr || `python exited with code ${code}`);
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });
  });
}

export async function synthesizeVoice({ text, voice, outputPath, rate = "-5%" }) {
  await mkdir(dirname(outputPath), { recursive: true });
  await runPython(
    [
      "-m",
      "edge_tts",
      "--voice",
      voice || "zh-CN-XiaoxiaoNeural",
      "--rate",
      rate || "-5%",
      "--text",
      text,
      "--write-media",
      outputPath
    ],
    { cwd: process.cwd() }
  );
  return outputPath;
}

export async function synthesizeSapi({ text, voice, outputPath, rate = 0 }) {
  await mkdir(dirname(outputPath), { recursive: true });
  const textPath = `${outputPath}.txt`;
  await writeFile(textPath, text, "utf8");
  const voiceName = voice || "Microsoft Yaoyao";
  const rateValue = Math.max(-10, Math.min(10, Number(rate) || 0));
  const script = [
    "Add-Type -AssemblyName System.Speech;",
    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;",
    `$s.SelectVoice('${voiceName.replaceAll("'", "''")}');`,
    `$s.Rate = ${rateValue};`,
    `$text = Get-Content -Raw -LiteralPath '${textPath.replaceAll("'", "''")}';`,
    `$s.SetOutputToWaveFile('${outputPath.replaceAll("'", "''")}');`,
    "$s.Speak($text);",
    "$s.Dispose();"
  ].join(" ");
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
        { windowsHide: true }
      );
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr || `Windows TTS exited with code ${code}`));
      });
    });
  } finally {
    await import("node:fs/promises").then(({ rm }) =>
      rm(textPath, { force: true }).catch(() => {})
    );
  }
  return outputPath;
}
