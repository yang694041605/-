import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { generatePollinationsImage } from "../server/pollinations.mjs";

const outputDir = resolve("public", "wedding-assets");
const manifestPath = resolve(outputDir, "manifest.json");
await mkdir(outputDir, { recursive: true });

const assets = [
  {
    file: "ancient-courtyard.jpg",
    title: "古代婚礼庭院参考",
    prompt:
      "Cinematic ancient Chinese wedding courtyard at misty dawn, red silk ribbons, palace lanterns, wooden corridor, stone bridge, elegant floral decoration, warm crimson and gold, photorealistic wedding film background, no people, no text, no watermark"
  },
  {
    file: "republic-street.jpg",
    title: "民国婚礼长街参考",
    prompt:
      "Cinematic Republic-era Chinese street in gentle rain at dusk, stone pavement, vintage street lamps, wooden shop signs without readable text, umbrellas, warm brown and muted teal, romantic wedding film background, no people, no text, no watermark"
  },
  {
    file: "modern-hall.jpg",
    title: "今生婚礼正厅参考",
    prompt:
      "Luxury modern Chinese wedding hall, red and gold decorations, floral aisle, candlelight, elegant stage, cinematic warm lighting, photorealistic wedding film background, no people, no text, no watermark"
  },
  {
    file: "hanfu-reference.jpg",
    title: "古代婚服参考",
    prompt:
      "Museum-quality traditional Chinese wedding hanfu displayed on an elegant mannequin, crimson silk, gold cloud embroidery, jade hair ornaments, front view, clean warm studio background, photorealistic fabric detail, no person, no text, no watermark"
  },
  {
    file: "republic-costume-reference.jpg",
    title: "民国青年造型参考",
    prompt:
      "Republic-era Chinese wedding attire reference display, male dark changshan and female pale blue student outfit with black skirt, period-accurate fabric, neutral warm studio, elegant mannequins without faces, no text, no watermark"
  },
  {
    file: "modern-wedding-reference.jpg",
    title: "现代婚礼礼服参考",
    prompt:
      "Modern Chinese wedding formalwear reference display, ivory bridal gown with lace and a black tuxedo, elegant mannequins without faces, warm editorial studio lighting, clean background, no text, no watermark"
  }
];

const manifest = existsSync(manifestPath)
  ? JSON.parse(await readFile(manifestPath, "utf8"))
  : { provider: "pollinations", model: "flux", assets: [] };

for (const asset of assets) {
  const outputPath = resolve(outputDir, asset.file);
  if (existsSync(outputPath)) continue;
  try {
    const result = await generatePollinationsImage({
      prompt: asset.prompt,
      outputPath,
      width: 1280,
      height: 720,
      model: "flux"
    });
    manifest.assets.push({
      file: asset.file,
      path: `/wedding-assets/${asset.file}`,
      title: asset.title,
      prompt: asset.prompt,
      source: "pollinations-flux",
      provider: result.provider,
      model: result.model,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    manifest.failures = [
      ...(manifest.failures || []).filter((item) => item.file !== asset.file),
      {
        file: asset.file,
        title: asset.title,
        prompt: asset.prompt,
        error: String(error.message || error),
        failedAt: new Date().toISOString()
      }
    ];
  }
}

await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
console.log(JSON.stringify({ outputDir, manifestPath, assets: manifest.assets }, null, 2));
