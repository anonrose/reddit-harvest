import path from "node:path";
import { nowTimestampForFiles, sanitizeForFilename, writeTextFile } from "./utils.js";

function commentsToArray(comments) {
  if (!comments) return [];
  if (Array.isArray(comments)) return comments;
  if (typeof comments.toArray === "function") return comments.toArray();
  if (typeof comments[Symbol.iterator] === "function") return [...comments];
  return [];
}

function safeText(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

/**
 * Parse a date string to Unix timestamp (seconds).
 * Accepts ISO strings or Unix timestamps.
 */
function parseDateToUnix(dateStr) {
  if (!dateStr) return null;
  const n = Number(dateStr);
  if (!Number.isNaN(n) && n > 1e9 && n < 1e12) return n; // Already unix seconds
  if (!Number.isNaN(n) && n > 1e12) return Math.floor(n / 1000); // Unix ms
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor(d.getTime() / 1000);
}

/**
 * Apply filters to posts array.
 */
function applyFilters(posts, { minScore, minComments, after, before }) {
  let filtered = posts;

  if (minScore != null && !Number.isNaN(minScore)) {
    filtered = filtered.filter((p) => (p.score ?? 0) >= minScore);
  }

  if (minComments != null && !Number.isNaN(minComments)) {
    filtered = filtered.filter((p) => (p.num_comments ?? 0) >= minComments);
  }

  const afterTs = parseDateToUnix(after);
  if (afterTs != null) {
    filtered = filtered.filter((p) => (p.created_utc ?? 0) >= afterTs);
  }

  const beforeTs = parseDateToUnix(before);
  if (beforeTs != null) {
    filtered = filtered.filter((p) => (p.created_utc ?? 0) <= beforeTs);
  }

  return filtered;
}

/**
 * Fetch posts from a subreddit (listing or search).
 */
async function fetchPosts({ reddit, subreddit, listing, time, limit, search }) {
  const sub = reddit.getSubreddit(subreddit);

  if (search) {
    // Search mode
    return sub.search({ query: search, time, sort: listing === "top" ? "top" : listing, limit });
  }

  if (listing === "hot") return sub.getHot({ limit });
  if (listing === "new") return sub.getNew({ limit });
  if (listing === "top") return sub.getTop({ time, limit });
  throw new Error(`Unknown listing: ${listing} (expected hot|new|top)`);
}

/**
 * Expand comments for a post and return structured comment data.
 */
async function expandPostComments(post, { commentLimit, commentDepth }) {
  const expanded = await post.expandReplies({ limit: commentLimit, depth: commentDepth });
  const topLevel = commentsToArray(expanded?.comments ?? post?.comments).slice(0, commentLimit);
  return topLevel.map((c) => ({
    id: safeText(c?.id),
    author: safeText(c?.author?.name ?? c?.author),
    score: c?.score ?? 0,
    body: safeText(c?.body),
    created: c?.created_utc ? new Date(c.created_utc * 1000).toISOString() : ""
  }));
}

/**
 * Harvest posts from a subreddit and return structured data.
 */
export async function harvestSubreddit({
  reddit,
  subreddit,
  listing = "hot",
  time = "week",
  limit = 25,
  search = null,
  minScore = null,
  minComments = null,
  after = null,
  before = null,
  includeComments = false,
  commentLimit = 50,
  commentDepth = 1,
  dedupeIndex = null,
  onProgress
}) {
  onProgress?.({ type: "subreddit_start", subreddit, listing, time, limit, search });

  const rawPosts = await fetchPosts({ reddit, subreddit, listing, time, limit, search });
  onProgress?.({ type: "posts_fetched", subreddit, totalPosts: rawPosts.length });

  // Apply filters
  let posts = applyFilters(rawPosts, { minScore, minComments, after, before });

  // Dedupe if index provided
  if (dedupeIndex) {
    const beforeCount = posts.length;
    posts = posts.filter((p) => !dedupeIndex.has(p.id));
    const skipped = beforeCount - posts.length;
    if (skipped > 0) {
      onProgress?.({ type: "dedupe_skipped", subreddit, skipped });
    }
  }

  onProgress?.({ type: "posts_filtered", subreddit, totalPosts: posts.length });

  const results = [];

  for (let i = 0; i < posts.length; i += 1) {
    const p = posts[i];
    const createdIso = p?.created_utc ? new Date(p.created_utc * 1000).toISOString() : "";

    onProgress?.({
      type: "post_progress",
      subreddit,
      index: i + 1,
      total: posts.length,
      postId: p?.id,
      title: p?.title
    });

    const postData = {
      id: safeText(p.id),
      subreddit,
      title: safeText(p.title),
      author: safeText(p.author?.name ?? p.author),
      created: createdIso,
      score: p.score ?? 0,
      numComments: p.num_comments ?? 0,
      url: safeText(p.url),
      permalink: safeText(p.permalink),
      selftext: safeText(p.selftext),
      comments: []
    };

    if (includeComments) {
      try {
        onProgress?.({
          type: "comments_expand_start",
          subreddit,
          index: i + 1,
          total: posts.length,
          postId: p?.id
        });
        postData.comments = await expandPostComments(p, { commentLimit, commentDepth });
        onProgress?.({
          type: "comments_expand_done",
          subreddit,
          index: i + 1,
          total: posts.length,
          postId: p?.id,
          comments: postData.comments.length
        });
      } catch (err) {
        postData.commentsError = safeText(err?.message ?? err);
        onProgress?.({
          type: "comments_expand_error",
          subreddit,
          index: i + 1,
          total: posts.length,
          postId: p?.id,
          error: postData.commentsError
        });
      }
    }

    results.push(postData);

    // Record in dedupe index
    if (dedupeIndex) {
      dedupeIndex.add(p.id);
    }
  }

  onProgress?.({ type: "subreddit_done", subreddit });
  return results;
}

/**
 * Format posts array to plain text corpus.
 */
export function formatPostsToText(posts, { subreddit, listing, time, limit, includeComments, commentLimit, search }) {
  const header = [
    `# Reddit corpus export`,
    `subreddit: r/${subreddit}`,
    search ? `search: "${search}"` : `listing: ${listing}${listing === "top" ? ` (${time})` : ""}`,
    `limit: ${limit}`,
    `includeComments: ${includeComments}`,
    `commentLimit: ${includeComments ? commentLimit : 0}`,
    `postsHarvested: ${posts.length}`,
    `exportedAt: ${new Date().toISOString()}`,
    ``
  ].join("\n");

  const sections = [header];

  for (let i = 0; i < posts.length; i += 1) {
    const p = posts[i];

    sections.push(
      [
        `---`,
        `POST ${i + 1}/${posts.length}`,
        `id: ${p.id}`,
        `title: ${p.title}`,
        `author: ${p.author}`,
        `created: ${p.created}`,
        `score: ${p.score}`,
        `num_comments: ${p.numComments}`,
        `url: ${p.url}`,
        `permalink: ${p.permalink}`,
        ``,
        `selftext:`,
        p.selftext.trim() || "(no selftext)",
        ``
      ].join("\n")
    );

    if (!includeComments) continue;

    if (p.commentsError) {
      sections.push(`comments:\n(error: ${p.commentsError})\n`);
      continue;
    }

    if (p.comments.length === 0) {
      sections.push(`comments:\n(none)\n`);
      continue;
    }

    const commentLines = p.comments.map((c, idx) => {
      const body = c.body.replaceAll("\r\n", "\n").trim();
      return [
        `- comment ${idx + 1}:`,
        `  author: ${c.author}`,
        `  score: ${c.score}`,
        `  body: ${body || "(empty)"}`.replaceAll("\n", "\n  ")
      ].join("\n");
    });

    sections.push(["comments:", ...commentLines, ""].join("\n"));
  }

  return sections.join("\n");
}

/**
 * Legacy function for backward compatibility.
 */
export async function harvestSubredditToText(opts) {
  const posts = await harvestSubreddit(opts);
  return formatPostsToText(posts, opts);
}

/**
 * Harvest multiple subreddits and write to files.
 */
export async function harvestSubredditsToFiles({
  reddit,
  subreddits,
  outDir,
  listing,
  time,
  limit,
  search,
  minScore,
  minComments,
  after,
  before,
  includeComments,
  commentLimit,
  commentDepth,
  dedupeIndex,
  format = "txt",
  onProgress
}) {
  const ts = nowTimestampForFiles();
  const outputs = [];
  const allPosts = [];

  for (const sr of subreddits) {
    const posts = await harvestSubreddit({
      reddit,
      subreddit: sr,
      listing,
      time,
      limit,
      search,
      minScore,
      minComments,
      after,
      before,
      includeComments,
      commentLimit,
      commentDepth,
      dedupeIndex,
      onProgress
    });

    allPosts.push(...posts);

    const ext = format === "jsonl" ? "jsonl" : "txt";
    const fileName = `${ts}-r_${sanitizeForFilename(sr)}.${ext}`;
    const filePath = path.join(outDir, fileName);

    let content;
    if (format === "jsonl") {
      // Import formatter dynamically to avoid circular deps
      const { formatPostsToJSONL } = await import("./formatters.js");
      content = formatPostsToJSONL(posts);
    } else {
      content = formatPostsToText(posts, {
        subreddit: sr,
        listing,
        time,
        limit,
        includeComments,
        commentLimit,
        search
      });
    }

    await writeTextFile(filePath, content);
    outputs.push({ subreddit: sr, filePath, textLength: content.length, postCount: posts.length });

    onProgress?.({ type: "file_written", subreddit: sr, filePath, textLength: content.length, postCount: posts.length });
  }

  return { timestamp: ts, outputs, allPosts };
}
