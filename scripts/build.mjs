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
const engine = (await readFile(resolve(root, "src", "story-engine.mjs"), "utf8")).replace(
  /^export\s+/gm,
  ""
);
const apiSource = (await readFile(resolve(root, "src", "api.js"), "utf8")).replace(
  /^export\s+/gm,
  ""
);
const appSource = (await readFile(resolve(root, "src", "app.js"), "utf8"))
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/story-engine\.mjs";\s*/, "")
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/api\.js";\s*/, "");
const standaloneHtml = indexHtml
  .replace(
    '<link rel="stylesheet" href="./src/styles.css" />',
    `<style>\n${styles}\n</style>`
  )
  .replace(
    '<script type="module" src="./src/app.js"></script>',
    `<script type="module">\n${apiSource}\n${engine}\n${appSource}\n</script>`
  );
await writeFile(resolve(dist, "婚礼微电影创作台.html"), standaloneHtml, "utf8");

console.log("构建完成：dist/");
