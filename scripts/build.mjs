import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const dist = resolve(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(resolve(root, "index.html"), resolve(dist, "index.html"));
await cp(resolve(root, "src"), resolve(dist, "src"), { recursive: true });
await cp(resolve(root, "public"), resolve(dist, "public"), { recursive: true });
await cp(resolve(root, "docs"), resolve(dist, "docs"), { recursive: true });
await writeFile(
  resolve(dist, "build-info.json"),
  JSON.stringify(
    {
      name: "囍映 AI 婚礼微电影创作台",
      version: "1.0.0",
      builtAt: new Date().toISOString(),
      frameRate: 24,
      generationBoundary: "生成通过统一模型中心执行，昂贵任务需用户确认"
    },
    null,
    2
  ),
  "utf8"
);

const indexHtml = await readFile(resolve(root, "index.html"), "utf8");
const styles = await readFile(resolve(root, "src", "styles.css"), "utf8");
const productionModel = (
  await readFile(resolve(root, "src", "production-model.mjs"), "utf8")
).replace(/^export\s+/gm, "");
const workflowSpecs = (
  await readFile(resolve(root, "src", "workflow-specs.mjs"), "utf8")
).replace(/^export\s+/gm, "");
const remixReport = (
  await readFile(resolve(root, "src", "remix-report.mjs"), "utf8")
)
  .replace(
    /import\s*\{[\s\S]*?\}\s*from\s*"\.\/production-model\.mjs";\s*/,
    ""
  )
  .replace(/^export\s+/gm, "");
const studioNavigation = (
  await readFile(resolve(root, "src", "studio-navigation.mjs"), "utf8")
)
  .replace(
    /import\s*\{[\s\S]*?\}\s*from\s*"\.\/workflow-specs\.mjs";\s*/,
    ""
  )
  .replace(/^export\s+/gm, "");
const weddingNavigation = (
  await readFile(resolve(root, "src", "wedding-navigation.mjs"), "utf8")
)
  .replace(
    /import\s*\{[\s\S]*?\}\s*from\s*"\.\/workflow-specs\.mjs";\s*/,
    ""
  )
  .replace(/^export\s+/gm, "");
const promptLibrary = (
  await readFile(resolve(root, "src", "prompt-library.mjs"), "utf8")
).replace(/^export\s+/gm, "");
const engine = (await readFile(resolve(root, "src", "story-engine.mjs"), "utf8"))
  .replace(
    /import\s*\{[\s\S]*?\}\s*from\s*"\.\/production-model\.mjs";\s*/,
    ""
  )
  .replace(/^export\s+/gm, "");
const apiSource = (await readFile(resolve(root, "src", "api.js"), "utf8")).replace(
  /^export\s+/gm,
  ""
);
const appSource = (await readFile(resolve(root, "src", "app.js"), "utf8"))
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/story-engine\.mjs";\s*/, "")
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/production-model\.mjs";\s*/, "")
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/prompt-library\.mjs";\s*/, "")
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/workflow-specs\.mjs";\s*/, "")
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/wedding-navigation\.mjs";\s*/, "")
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/studio-navigation\.mjs";\s*/, "")
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/api\.js";\s*/, "");
const standaloneHtml = indexHtml
  .replace(
    '<link rel="stylesheet" href="./src/styles.css" />',
    `<style>\n${styles}\n</style>`
  )
  .replace(
    '<script type="module" src="./src/app.js"></script>',
    `<script type="module">\n${apiSource}\n${productionModel}\n${workflowSpecs}\n${remixReport}\n${studioNavigation}\n${weddingNavigation}\n${promptLibrary}\n${engine}\n${appSource}\n</script>`
  );
await writeFile(resolve(dist, "婚礼微电影创作台.html"), standaloneHtml, "utf8");

console.log("构建完成：dist/");
