import { describe, it, expect } from "vitest";
import {
  nowTimestampForFiles,
  sanitizeForFilename,
  chunkStringBySize,
  normalizeSubredditsArg
} from "../src/utils.js";

describe("nowTimestampForFiles", () => {
  it("should return ISO-like timestamp with dashes instead of colons", () => {
    const date = new Date("2024-06-15T14:30:45.000Z");
    const result = nowTimestampForFiles(date);
    expect(result).toBe("2024-06-15T14-30-45.000Z");
  });

  it("should use current date when no argument provided", () => {
    const result = nowTimestampForFiles();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z$/);
  });
});

describe("sanitizeForFilename", () => {
  it("should replace special characters with underscores", () => {
    expect(sanitizeForFilename("hello/world")).toBe("hello_world");
    expect(sanitizeForFilename("test:file")).toBe("test_file");
    expect(sanitizeForFilename("a b c")).toBe("a_b_c");
  });

  it("should collapse multiple underscores", () => {
    expect(sanitizeForFilename("hello///world")).toBe("hello_world");
    expect(sanitizeForFilename("a   b")).toBe("a_b");
  });

  it("should trim leading and trailing underscores", () => {
    expect(sanitizeForFilename("  test  ")).toBe("test");
    expect(sanitizeForFilename("__test__")).toBe("test");
  });

  it("should preserve valid characters", () => {
    expect(sanitizeForFilename("hello-world.txt")).toBe("hello-world.txt");
    expect(sanitizeForFilename("test_123")).toBe("test_123");
  });

  it("should handle empty input", () => {
    expect(sanitizeForFilename("")).toBe("");
    expect(sanitizeForFilename("   ")).toBe("");
  });
});

describe("chunkStringBySize", () => {
  it("should return single chunk for short strings", () => {
    const result = chunkStringBySize("hello", 100);
    expect(result).toEqual(["hello"]);
  });

  it("should split long strings into chunks", () => {
    const input = "a".repeat(30);
    const result = chunkStringBySize(input, 10);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe("a".repeat(10));
    expect(result[1]).toBe("a".repeat(10));
    expect(result[2]).toBe("a".repeat(10));
  });

  it("should handle exact chunk size", () => {
    const result = chunkStringBySize("abcdef", 3);
    expect(result).toEqual(["abc", "def"]);
  });

  it("should handle partial last chunk", () => {
    const result = chunkStringBySize("abcdefg", 3);
    expect(result).toEqual(["abc", "def", "g"]);
  });

  it("should handle null/undefined input", () => {
    expect(chunkStringBySize(null, 10)).toEqual([""]);
    expect(chunkStringBySize(undefined, 10)).toEqual([""]);
  });

  it("should use default max chars of 12000", () => {
    const input = "a".repeat(12001);
    const result = chunkStringBySize(input);
    expect(result).toHaveLength(2);
    expect(result[0].length).toBe(12000);
    expect(result[1].length).toBe(1);
  });
});

describe("normalizeSubredditsArg", () => {
  it("should parse comma-separated string", () => {
    expect(normalizeSubredditsArg("startups,Entrepreneur,SaaS")).toEqual([
      "startups",
      "Entrepreneur",
      "SaaS"
    ]);
  });

  it("should trim whitespace", () => {
    expect(normalizeSubredditsArg("startups , Entrepreneur , SaaS")).toEqual([
      "startups",
      "Entrepreneur",
      "SaaS"
    ]);
  });

  it("should filter empty values", () => {
    expect(normalizeSubredditsArg("startups,,Entrepreneur,")).toEqual([
      "startups",
      "Entrepreneur"
    ]);
  });

  it("should handle array input", () => {
    expect(normalizeSubredditsArg(["startups", "Entrepreneur"])).toEqual([
      "startups",
      "Entrepreneur"
    ]);
  });

  it("should handle array with comma-separated values", () => {
    expect(normalizeSubredditsArg(["startups,Entrepreneur", "SaaS"])).toEqual([
      "startups",
      "Entrepreneur",
      "SaaS"
    ]);
  });

  it("should return empty array for null/undefined", () => {
    expect(normalizeSubredditsArg(null)).toEqual([]);
    expect(normalizeSubredditsArg(undefined)).toEqual([]);
    expect(normalizeSubredditsArg("")).toEqual([]);
  });
});

