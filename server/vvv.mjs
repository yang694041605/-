import { access, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import { projectRoot } from "./paths.mjs";
import { runProcess } from "./ark.mjs";

export async function findVvvRoot() {
  const candidates = [
    process.env.VVV_ROOT,
    resolve(projectRoot, "..", "vendor-research", "vvv"),
    resolve(process.env.USERPROFILE || "", "vvv")
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(join(candidate, "skills", "vvv", "scripts", "vvv.py"), constants.R_OK);
      await access(join(candidate, "kits", "remotion"), constants.R_OK);
      return candidate;
    } catch {
      // Try the next configured location.
    }
  }
  return "";
}

export async function createVvvProject({
  root,
  template,
  format,
  photos,
  outputDir,
  allowRepeat = false,
  projectInfo = {}
}) {
  await mkdir(outputDir, { recursive: true });
  const photoDir = join(outputDir, "source-photos");
  await mkdir(photoDir, { recursive: true });
  for (const photo of photos) {
    await cp(photo, join(photoDir, photo.split(/[\\/]/).pop()), { force: true });
  }
  const script = join(root, "skills", "vvv", "scripts", "vvv.py");
  const kit = join(root, "kits", "remotion");
  const result = await runProcess(
    process.env.PYTHON_PATH || "python",
    [
      script,
      "init",
      "--kit",
      kit,
      "--template",
      template,
      "--format",
      format,
      "--photos",
      photoDir,
      "--output",
      join(outputDir, "project"),
      ...(allowRepeat ? ["--allow-repeat"] : [])
    ],
    { cwd: root }
  );
  const projectDir = join(outputDir, "project");
  const inputsPath = join(projectDir, "inputs.json");
  const inputs = JSON.parse(await readFile(inputsPath, "utf8"));
  inputs.props.couple = {
    ...(inputs.props.couple || {}),
    groom: projectInfo.groom || inputs.props.couple?.groom || "新郎",
    bride: projectInfo.bride || inputs.props.couple?.bride || "新娘",
    groomEn: "",
    brideEn: "",
    date: projectInfo.weddingDate || inputs.props.couple?.date || "",
    tagline: projectInfo.name || "我们的婚礼"
  };
  await writeFile(inputsPath, JSON.stringify(inputs, null, 2), "utf8");
  return {
    root,
    projectDir,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

export async function checkVvv(root) {
  const script = join(root, "skills", "vvv", "scripts", "vvv.py");
  const kit = join(root, "kits", "remotion");
  const result = await runProcess(
    process.env.PYTHON_PATH || "python",
    [script, "doctor", "--kit", kit],
    { cwd: root }
  );
  return JSON.parse(result.stdout);
}
