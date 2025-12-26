/**
 * Format posts array to JSONL (one JSON object per line).
 */
export function formatPostsToJSONL(posts) {
  return posts.map((p) => JSON.stringify(p)).join("\n") + "\n";
}

/**
 * Parse JSONL content back to posts array.
 */
export function parseJSONL(content) {
  return content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

