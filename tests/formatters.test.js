import { describe, it, expect } from "vitest";
import { formatPostsToJSONL, parseJSONL } from "../src/formatters.js";

describe("formatPostsToJSONL", () => {
  it("should format posts array to JSONL", () => {
    const posts = [
      { id: "1", title: "First post", score: 10 },
      { id: "2", title: "Second post", score: 20 }
    ];

    const result = formatPostsToJSONL(posts);
    const lines = result.trim().split("\n");

    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual({ id: "1", title: "First post", score: 10 });
    expect(JSON.parse(lines[1])).toEqual({ id: "2", title: "Second post", score: 20 });
  });

  it("should handle empty array", () => {
    const result = formatPostsToJSONL([]);
    expect(result).toBe("\n");
  });

  it("should handle posts with nested objects", () => {
    const posts = [
      {
        id: "1",
        title: "Post with comments",
        comments: [
          { id: "c1", body: "Great post!" },
          { id: "c2", body: "Thanks!" }
        ]
      }
    ];

    const result = formatPostsToJSONL(posts);
    const parsed = JSON.parse(result.trim());

    expect(parsed.comments).toHaveLength(2);
    expect(parsed.comments[0].body).toBe("Great post!");
  });

  it("should handle special characters in content", () => {
    const posts = [
      { id: "1", title: "Post with \"quotes\" and\nnewlines" }
    ];

    const result = formatPostsToJSONL(posts);
    const parsed = JSON.parse(result.trim());

    expect(parsed.title).toBe("Post with \"quotes\" and\nnewlines");
  });
});

describe("parseJSONL", () => {
  it("should parse JSONL content to array", () => {
    const content = '{"id":"1","title":"First"}\n{"id":"2","title":"Second"}\n';
    const result = parseJSONL(content);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "1", title: "First" });
    expect(result[1]).toEqual({ id: "2", title: "Second" });
  });

  it("should handle empty lines", () => {
    const content = '{"id":"1"}\n\n{"id":"2"}\n\n';
    const result = parseJSONL(content);

    expect(result).toHaveLength(2);
  });

  it("should handle content without trailing newline", () => {
    const content = '{"id":"1"}\n{"id":"2"}';
    const result = parseJSONL(content);

    expect(result).toHaveLength(2);
  });

  it("should round-trip with formatPostsToJSONL", () => {
    const original = [
      { id: "1", title: "Test", score: 42, comments: [{ body: "Nice" }] },
      { id: "2", title: "Another", score: 100, comments: [] }
    ];

    const jsonl = formatPostsToJSONL(original);
    const parsed = parseJSONL(jsonl);

    expect(parsed).toEqual(original);
  });
});

