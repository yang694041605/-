import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function generatePollinationsImage({
  prompt,
  outputPath,
  width = 1024,
  height = 1365,
  model = "flux"
}) {
  await mkdir(dirname(outputPath), { recursive: true });
  const url = new URL(
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`
  );
  url.searchParams.set("width", String(width));
  url.searchParams.set("height", String(height));
  url.searchParams.set("model", model);
  url.searchParams.set("nologo", "true");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Pollinations HTTP ${response.status}`);
    const content = Buffer.from(await response.arrayBuffer());
    if (content.length < 10 * 1024) throw new Error("图片文件过小，生成可能失败");
    const jpeg = content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
    const png =
      content[0] === 0x89 &&
      content[1] === 0x50 &&
      content[2] === 0x4e &&
      content[3] === 0x47;
    if (!jpeg && !png) throw new Error("返回内容不是有效图片");
    await writeFile(outputPath, content);
    return {
      provider: "pollinations",
      model,
      local_path: outputPath,
      output_url: url.toString(),
      size: content.length
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generatePollinationsText({ prompt, instructions = "" }) {
  let lastError = null;
  let data = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);
      const response = await fetch("https://text.pollinations.ai/openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: "openai",
          messages: [
            ...(instructions ? [{ role: "system", content: instructions }] : []),
            { role: "user", content: prompt }
          ],
          temperature: 0.65
        })
      }).finally(() => clearTimeout(timeout));
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `Pollinations text HTTP ${response.status}${detail ? `：${detail.slice(0, 300)}` : ""}`
        );
      }
      data = await response.json();
      break;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1800));
    }
  }
  if (!data) throw lastError || new Error("文字模型没有响应");
  const content = data.choices?.[0]?.message?.content || "";
  if (!content) throw new Error("文字模型没有返回内容");
  return {
    id: data.id,
    model: data.model || "gpt-oss-20b",
    content,
    usage: data.usage || null,
    provider: "pollinations"
  };
}
