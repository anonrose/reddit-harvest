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

export async function harvestSubredditToText({
  reddit,
  subreddit,
  listing = "hot",
  time = "week",
  limit = 25,
  includeComments = false,
  commentLimit = 50,
  commentDepth = 1,
  onProgress
}) {
  const sub = reddit.getSubreddit(subreddit);
  let postsListing;

  onProgress?.({ type: "subreddit_start", subreddit, listing, time, limit });

  if (listing === "hot") postsListing = sub.getHot({ limit });
  else if (listing === "new") postsListing = sub.getNew({ limit });
  else if (listing === "top") postsListing = sub.getTop({ time, limit });
  else throw new Error(`Unknown listing: ${listing} (expected hot|new|top)`);

  const posts = await postsListing;
  onProgress?.({ type: "posts_fetched", subreddit, totalPosts: posts.length });

  const header = [
    `# Reddit corpus export`,
    `subreddit: r/${subreddit}`,
    `listing: ${listing}${listing === "top" ? ` (${time})` : ""}`,
    `limit: ${limit}`,
    `includeComments: ${includeComments}`,
    `commentLimit: ${includeComments ? commentLimit : 0}`,
    `exportedAt: ${new Date().toISOString()}`,
    ``
  ].join("\n");

  const sections = [header];

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

    sections.push(
      [
        `---`,
        `POST ${i + 1}/${posts.length}`,
        `id: ${safeText(p.id)}`,
        `title: ${safeText(p.title)}`,
        `author: ${safeText(p.author?.name ?? p.author)}`,
        `created: ${createdIso}`,
        `score: ${safeText(p.score)}`,
        `num_comments: ${safeText(p.num_comments)}`,
        `url: ${safeText(p.url)}`,
        `permalink: ${safeText(p.permalink)}`,
        ``,
        `selftext:`,
        safeText(p.selftext).trim() ? safeText(p.selftext) : "(no selftext)",
        ``
      ].join("\n")
    );

    if (!includeComments) continue;

    try {
      onProgress?.({
        type: "comments_expand_start",
        subreddit,
        index: i + 1,
        total: posts.length,
        postId: p?.id
      });
      const expanded = await p.expandReplies({ limit: commentLimit, depth: commentDepth });
      const topLevel = commentsToArray(expanded?.comments ?? p?.comments).slice(0, commentLimit);
      if (topLevel.length === 0) {
        sections.push(`comments:\n(none)\n`);
        onProgress?.({
          type: "comments_expand_done",
          subreddit,
          index: i + 1,
          total: posts.length,
          postId: p?.id,
          comments: 0
        });
        continue;
      }

      const commentLines = topLevel.map((c, idx) => {
        const body = safeText(c?.body).replaceAll("\r\n", "\n").trim();
        const author = safeText(c?.author?.name ?? c?.author);
        const score = safeText(c?.score);
        return [
          `- comment ${idx + 1}:`,
          `  author: ${author}`,
          `  score: ${score}`,
          `  body: ${body || "(empty)"}`.replaceAll("\n", "\n  ")
        ].join("\n");
      });

      sections.push(["comments:", ...commentLines, ""].join("\n"));
      onProgress?.({
        type: "comments_expand_done",
        subreddit,
        index: i + 1,
        total: posts.length,
        postId: p?.id,
        comments: topLevel.length
      });
    } catch (err) {
      sections.push(`comments:\n(error expanding replies: ${safeText(err?.message ?? err)})\n`);
      onProgress?.({
        type: "comments_expand_error",
        subreddit,
        index: i + 1,
        total: posts.length,
        postId: p?.id,
        error: safeText(err?.message ?? err)
      });
    }
  }

  onProgress?.({ type: "subreddit_done", subreddit });
  return sections.join("\n");
}

export async function harvestSubredditsToFiles({
  reddit,
  subreddits,
  outDir,
  listing,
  time,
  limit,
  includeComments,
  commentLimit,
  commentDepth,
  onProgress
}) {
  const ts = nowTimestampForFiles();
  const outputs = [];

  for (const sr of subreddits) {
    const text = await harvestSubredditToText({
      reddit,
      subreddit: sr,
      listing,
      time,
      limit,
      includeComments,
      commentLimit,
      commentDepth,
      onProgress
    });

    const fileName = `${ts}-r_${sanitizeForFilename(sr)}.txt`;
    const filePath = path.join(outDir, fileName);
    await writeTextFile(filePath, text);
    outputs.push({ subreddit: sr, filePath, textLength: text.length });

    onProgress?.({ type: "file_written", subreddit: sr, filePath, textLength: text.length });
  }

  return { timestamp: ts, outputs };
}


