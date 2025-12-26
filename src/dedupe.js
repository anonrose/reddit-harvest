import fs from "node:fs/promises";
import path from "node:path";

const INDEX_FILENAME = ".harvest-index.json";

/**
 * Load the dedupe index from disk.
 * Returns a Set of post IDs.
 */
export async function loadDedupeIndex(outDir) {
  const indexPath = path.join(outDir, INDEX_FILENAME);
  try {
    const content = await fs.readFile(indexPath, "utf8");
    const data = JSON.parse(content);
    return new Set(Object.keys(data.posts || {}));
  } catch {
    return new Set();
  }
}

/**
 * Save the dedupe index to disk.
 */
export async function saveDedupeIndex(outDir, postIds, metadata = {}) {
  const indexPath = path.join(outDir, INDEX_FILENAME);
  const posts = {};
  for (const id of postIds) {
    posts[id] = { harvestedAt: new Date().toISOString(), ...metadata };
  }

  // Merge with existing
  let existing = {};
  try {
    const content = await fs.readFile(indexPath, "utf8");
    existing = JSON.parse(content).posts || {};
  } catch {
    // No existing index
  }

  const merged = { ...existing, ...posts };
  await fs.writeFile(indexPath, JSON.stringify({ posts: merged }, null, 2), "utf8");
}

/**
 * Reset (clear) the dedupe index.
 */
export async function resetDedupeIndex(outDir) {
  const indexPath = path.join(outDir, INDEX_FILENAME);
  try {
    await fs.unlink(indexPath);
  } catch {
    // File didn't exist, that's fine
  }
}

/**
 * Create a trackable dedupe index that can be used during harvesting.
 * Returns an object with Set-like interface plus save method.
 */
export async function createDedupeTracker(outDir) {
  const existingIds = await loadDedupeIndex(outDir);
  const newIds = new Set();

  return {
    has(id) {
      return existingIds.has(id);
    },
    add(id) {
      newIds.add(id);
    },
    async save() {
      if (newIds.size > 0) {
        await saveDedupeIndex(outDir, newIds);
      }
    },
    get newCount() {
      return newIds.size;
    },
    get existingCount() {
      return existingIds.size;
    }
  };
}

