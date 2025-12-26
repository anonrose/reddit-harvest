import fs from "node:fs/promises";
import path from "node:path";

export function nowTimestampForFiles(date = new Date()) {
  // 2025-12-26T21-09-05Z (safe for filenames across OSes)
  return date.toISOString().replaceAll(":", "-");
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export function sanitizeForFilename(name) {
  return String(name)
    .trim()
    .replaceAll(/[^\w.-]+/g, "_")
    .replaceAll(/_+/g, "_")
    .replaceAll(/^_+|_+$/g, "");
}

export function chunkStringBySize(input, maxChars = 12000) {
  const s = String(input ?? "");
  if (s.length <= maxChars) return [s];
  const chunks = [];
  let i = 0;
  while (i < s.length) {
    chunks.push(s.slice(i, i + maxChars));
    i += maxChars;
  }
  return chunks;
}

export function normalizeSubredditsArg(subreddits) {
  if (!subreddits) return [];
  if (Array.isArray(subreddits)) {
    return subreddits.flatMap((s) => String(s).split(",")).map((s) => s.trim()).filter(Boolean);
  }
  return String(subreddits)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function writeTextFile(filePath, contents) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, contents, "utf8");
}


