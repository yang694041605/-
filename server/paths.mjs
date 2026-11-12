import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const root = projectRoot;
export const dataRoot = resolve(process.env.XYING_DATA_DIR || resolve(root, "data"));
export const mediaRoot = resolve(dataRoot, "media");
export const dbPath = resolve(process.env.XYING_DB_PATH || resolve(dataRoot, "xying.db"));

export async function ensureDataDirs() {
  await mkdir(dataRoot, { recursive: true });
  await mkdir(mediaRoot, { recursive: true });
  await mkdir(resolve(mediaRoot, "templates"), { recursive: true });
  await mkdir(resolve(mediaRoot, "projects"), { recursive: true });
  await mkdir(resolve(mediaRoot, "assets"), { recursive: true });
  await mkdir(resolve(mediaRoot, "generated"), { recursive: true });
  await mkdir(resolve(mediaRoot, "renders"), { recursive: true });
  await mkdir(resolve(mediaRoot, "audio"), { recursive: true });
}
