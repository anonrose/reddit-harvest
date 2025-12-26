import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  loadDedupeIndex,
  saveDedupeIndex,
  resetDedupeIndex,
  createDedupeTracker
} from "../src/dedupe.js";

describe("dedupe module", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "reddit-harvest-test-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("loadDedupeIndex", () => {
    it("should return empty Set when no index exists", async () => {
      const result = await loadDedupeIndex(tempDir);
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });

    it("should load existing index", async () => {
      const indexPath = path.join(tempDir, ".harvest-index.json");
      await fs.writeFile(
        indexPath,
        JSON.stringify({
          posts: {
            abc123: { harvestedAt: "2024-01-01" },
            def456: { harvestedAt: "2024-01-02" }
          }
        })
      );

      const result = await loadDedupeIndex(tempDir);
      expect(result.size).toBe(2);
      expect(result.has("abc123")).toBe(true);
      expect(result.has("def456")).toBe(true);
      expect(result.has("ghi789")).toBe(false);
    });
  });

  describe("saveDedupeIndex", () => {
    it("should save post IDs to index", async () => {
      await saveDedupeIndex(tempDir, new Set(["post1", "post2"]));

      const indexPath = path.join(tempDir, ".harvest-index.json");
      const content = await fs.readFile(indexPath, "utf8");
      const data = JSON.parse(content);

      expect(Object.keys(data.posts)).toHaveLength(2);
      expect(data.posts.post1).toBeDefined();
      expect(data.posts.post2).toBeDefined();
      expect(data.posts.post1.harvestedAt).toBeDefined();
    });

    it("should merge with existing index", async () => {
      // Create initial index
      const indexPath = path.join(tempDir, ".harvest-index.json");
      await fs.writeFile(
        indexPath,
        JSON.stringify({
          posts: { existing: { harvestedAt: "2024-01-01" } }
        })
      );

      // Save new posts
      await saveDedupeIndex(tempDir, new Set(["new1", "new2"]));

      const content = await fs.readFile(indexPath, "utf8");
      const data = JSON.parse(content);

      expect(Object.keys(data.posts)).toHaveLength(3);
      expect(data.posts.existing).toBeDefined();
      expect(data.posts.new1).toBeDefined();
      expect(data.posts.new2).toBeDefined();
    });
  });

  describe("resetDedupeIndex", () => {
    it("should delete the index file", async () => {
      const indexPath = path.join(tempDir, ".harvest-index.json");
      await fs.writeFile(indexPath, "{}");

      await resetDedupeIndex(tempDir);

      const exists = await fs
        .access(indexPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });

    it("should not throw if index doesn't exist", async () => {
      await expect(resetDedupeIndex(tempDir)).resolves.not.toThrow();
    });
  });

  describe("createDedupeTracker", () => {
    it("should create tracker with empty existing index", async () => {
      const tracker = await createDedupeTracker(tempDir);

      expect(tracker.existingCount).toBe(0);
      expect(tracker.newCount).toBe(0);
      expect(tracker.has("anything")).toBe(false);
    });

    it("should load existing posts", async () => {
      const indexPath = path.join(tempDir, ".harvest-index.json");
      await fs.writeFile(
        indexPath,
        JSON.stringify({
          posts: { existing: { harvestedAt: "2024-01-01" } }
        })
      );

      const tracker = await createDedupeTracker(tempDir);

      expect(tracker.existingCount).toBe(1);
      expect(tracker.has("existing")).toBe(true);
      expect(tracker.has("new")).toBe(false);
    });

    it("should track new posts", async () => {
      const tracker = await createDedupeTracker(tempDir);

      tracker.add("new1");
      tracker.add("new2");

      expect(tracker.newCount).toBe(2);
      // Note: has() only checks existing, not new
      expect(tracker.has("new1")).toBe(false);
    });

    it("should save new posts on save()", async () => {
      const tracker = await createDedupeTracker(tempDir);

      tracker.add("post1");
      tracker.add("post2");
      await tracker.save();

      const indexPath = path.join(tempDir, ".harvest-index.json");
      const content = await fs.readFile(indexPath, "utf8");
      const data = JSON.parse(content);

      expect(Object.keys(data.posts)).toHaveLength(2);
    });

    it("should not save if no new posts", async () => {
      const tracker = await createDedupeTracker(tempDir);
      await tracker.save();

      const indexPath = path.join(tempDir, ".harvest-index.json");
      const exists = await fs
        .access(indexPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });
  });
});

