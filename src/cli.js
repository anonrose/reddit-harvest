#!/usr/bin/env node
import path from "node:path";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import fs from "node:fs/promises";

import { loadEnv } from "./env.js";
import { createLogger } from "./logger.js";
import { createRedditClient } from "./redditClient.js";
import { harvestSubredditsToFiles, formatPostsToText } from "./redditHarvest.js";
import { normalizeSubredditsArg, ensureDir } from "./utils.js";
import { analyzeCorpus, analyzeFileToMarkdown } from "./openaiAnalyze.js";
import { createDedupeTracker, resetDedupeIndex } from "./dedupe.js";

loadEnv({ argv: hideBin(process.argv) });

function exitWithError(err) {
  // eslint-disable-next-line no-console
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
}

async function runHarvest(argv) {
  const logger = createLogger({ verbose: Boolean(argv.verbose) });
  const subreddits = normalizeSubredditsArg(argv.subreddits);
  if (subreddits.length === 0) throw new Error(`--subreddits is required (e.g. "startups,Entrepreneur")`);

  const outDir = argv.outDir ? path.resolve(argv.outDir) : path.resolve("outputs");
  await ensureDir(outDir);

  // Handle --resetDedupe
  if (argv.resetDedupe) {
    await resetDedupeIndex(outDir);
    logger.success("Dedupe index reset");
  }

  const reddit = createRedditClient({ requestDelayMs: Number(argv.requestDelayMs) || 1100 });

  const listing = argv.listing;
  const time = argv.time;
  const limit = Number(argv.limit);
  const includeComments = Boolean(argv.includeComments);
  const commentLimit = Number(argv.commentLimit);
  const commentDepth = Number(argv.commentDepth);
  const format = argv.format || "txt";

  // Filters
  const minScore = argv.minScore != null ? Number(argv.minScore) : null;
  const minComments = argv.minComments != null ? Number(argv.minComments) : null;
  const after = argv.after || null;
  const before = argv.before || null;
  const search = argv.search || null;

  // Dedupe
  let dedupeIndex = null;
  if (argv.dedupe) {
    dedupeIndex = await createDedupeTracker(outDir);
    if (dedupeIndex.existingCount > 0) {
      logger.info(`Dedupe index loaded: ${dedupeIndex.existingCount} existing post(s)`);
    }
  }

  let activeSpinner = null;
  let activeSubreddit = null;
  const spinForSubreddit = (sr, text) => {
    if (!activeSpinner || activeSubreddit !== sr) {
      if (activeSpinner) activeSpinner.stop();
      activeSubreddit = sr;
      activeSpinner = logger.spinner(text).start();
    } else {
      activeSpinner.text = text;
    }
  };

  const result = await harvestSubredditsToFiles({
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
    format,
    onProgress: (e) => {
      if (e.type === "subreddit_start") {
        const mode = e.search ? `search: "${e.search}"` : `${e.listing}${e.listing === "top" ? `/${e.time}` : ""}`;
        spinForSubreddit(e.subreddit, `Fetching r/${e.subreddit} (${mode})…`);
        return;
      }
      if (e.type === "posts_fetched") {
        spinForSubreddit(e.subreddit, `r/${e.subreddit}: fetched ${e.totalPosts} post(s)…`);
        return;
      }
      if (e.type === "posts_filtered") {
        spinForSubreddit(e.subreddit, `r/${e.subreddit}: ${e.totalPosts} post(s) after filtering…`);
        return;
      }
      if (e.type === "dedupe_skipped") {
        logger.debug(`Skipped ${e.skipped} duplicate post(s) in r/${e.subreddit}`);
        return;
      }
      if (e.type === "post_progress") {
        spinForSubreddit(e.subreddit, `r/${e.subreddit}: post ${e.index}/${e.total}${includeComments ? " (+comments)" : ""}`);
        logger.debug(`post ${e.index}/${e.total}: ${String(e.title || "").slice(0, 120)}`);
        return;
      }
      if (e.type === "comments_expand_start") {
        spinForSubreddit(e.subreddit, `r/${e.subreddit}: post ${e.index}/${e.total}: loading comments…`);
        return;
      }
      if (e.type === "comments_expand_error") {
        logger.debug(`comments error on post ${e.index}/${e.total}: ${e.error}`);
        return;
      }
      if (e.type === "file_written") {
        if (activeSpinner) {
          activeSpinner.succeed(`r/${e.subreddit}: wrote ${e.filePath} (${e.postCount} posts)`);
          activeSpinner = null;
          activeSubreddit = null;
        } else {
          logger.success(`r/${e.subreddit}: wrote ${e.filePath} (${e.postCount} posts)`);
        }
      }
    }
  });

  // Save dedupe index
  if (dedupeIndex) {
    await dedupeIndex.save();
    if (dedupeIndex.newCount > 0) {
      logger.info(`Dedupe index updated: +${dedupeIndex.newCount} new post(s)`);
    }
  }

  const totalPosts = result.outputs.reduce((sum, o) => sum + o.postCount, 0);
  logger.success(`Wrote ${result.outputs.length} file(s) to ${outDir} (${totalPosts} total posts)`);
  for (const o of result.outputs) {
    logger.info(`  r/${o.subreddit}: ${o.filePath} (${o.postCount} posts, ${o.textLength} chars)`);
  }

  if (argv.analyze) {
    const analyzeSpinner = logger.spinner("Preparing corpus for analysis…").start();

    // Use structured posts for better analysis
    const analysisOpts = {
      posts: result.allPosts,
      subreddits,
      quoteFidelity: Boolean(argv.quoteFidelity),
      outDir,
      timestamp: result.timestamp,
      onProgress: (e) => {
        if (e.type === "subreddit_analysis_start") {
          analyzeSpinner.text = `OpenAI: analyzing r/${e.subreddit}…`;
        } else if (e.type === "analyze_chunk_start") {
          analyzeSpinner.text = `OpenAI: chunk ${e.index}/${e.total}…`;
        } else if (e.type === "analyze_synthesis_start") {
          analyzeSpinner.text = "OpenAI: synthesizing…";
        } else if (e.type === "tagging_start") {
          analyzeSpinner.text = "OpenAI: extracting tags…";
        } else if (e.type === "opportunities_start") {
          analyzeSpinner.text = "OpenAI: generating opportunities…";
        }
      }
    };

    const analysisResult = await analyzeCorpus(analysisOpts);

    analyzeSpinner.succeed(`Analysis complete!`);
    logger.info(`  Analysis: ${analysisResult.analysisPath}`);
    if (analysisResult.opportunitiesPath) {
      logger.info(`  Opportunities: ${analysisResult.opportunitiesPath}`);
    }
  }
}

async function runAnalyze(argv) {
  const logger = createLogger({ verbose: Boolean(argv.verbose) });
  if (!argv.input) throw new Error(`--input is required (path to a .txt or .jsonl corpus file)`);
  const inputPath = path.resolve(argv.input);
  const outDir = argv.outDir ? path.resolve(argv.outDir) : path.resolve("outputs");
  const quoteFidelity = Boolean(argv.quoteFidelity);

  const sp = logger.spinner("Analyzing corpus with OpenAI…").start();
  const result = await analyzeFileToMarkdown({
    inputPath,
    outDir,
    quoteFidelity,
    onProgress: (e) => {
      if (e.type === "analyze_chunk_start") {
        sp.text = `OpenAI: chunk ${e.index}/${e.total}…`;
      } else if (e.type === "analyze_synthesis_start") {
        sp.text = "OpenAI: synthesizing…";
      } else if (e.type === "tagging_start") {
        sp.text = "OpenAI: extracting tags…";
      } else if (e.type === "opportunities_start") {
        sp.text = "OpenAI: generating opportunities…";
      }
    }
  });

  sp.succeed(`Analysis complete!`);
  logger.info(`  Analysis: ${result.analysisPath}`);
  if (result.opportunitiesPath) {
    logger.info(`  Opportunities: ${result.opportunitiesPath}`);
  }
}

yargs(hideBin(process.argv))
  .scriptName("reddit-harvest")
  .command(
    "harvest",
    "Download subreddit content and write corpus files",
    (y) =>
      y
        .option("subreddits", { type: "string", demandOption: true, describe: "Comma-separated list, e.g. startups,Entrepreneur" })
        .option("listing", { choices: ["hot", "new", "top"], default: "hot", describe: "Which listing to pull" })
        .option("time", { choices: ["hour", "day", "week", "month", "year", "all"], default: "week", describe: "Time range (top only)" })
        .option("limit", { type: "number", default: 25, describe: "Posts per subreddit" })
        .option("search", { type: "string", describe: "Search query (uses Reddit search instead of listing)" })
        .option("minScore", { type: "number", describe: "Skip posts below this score" })
        .option("minComments", { type: "number", describe: "Skip posts with fewer comments" })
        .option("after", { type: "string", describe: "Only posts after this date (ISO format)" })
        .option("before", { type: "string", describe: "Only posts before this date (ISO format)" })
        .option("includeComments", { type: "boolean", default: false, describe: "Include top-level comments" })
        .option("commentLimit", { type: "number", default: 50, describe: "Max comments per post (best-effort)" })
        .option("commentDepth", { type: "number", default: 1, describe: "Reply depth when expanding comments" })
        .option("outDir", { type: "string", default: "outputs", describe: "Output directory" })
        .option("format", { choices: ["txt", "jsonl"], default: "txt", describe: "Output format" })
        .option("dedupe", { type: "boolean", default: false, describe: "Skip previously harvested posts" })
        .option("resetDedupe", { type: "boolean", default: false, describe: "Clear the dedupe index before harvesting" })
        .option("requestDelayMs", { type: "number", default: 1100, describe: "Delay between Reddit API requests (ms)" })
        .option("analyze", { type: "boolean", default: false, describe: "Run OpenAI synthesis after harvesting" })
        .option("quoteFidelity", { type: "boolean", default: false, describe: "Require supporting quotes for all claims" })
        .option("verbose", { type: "boolean", default: false, describe: "Verbose debug logging" }),
    (argv) => runHarvest(argv).catch(exitWithError)
  )
  .command(
    "analyze",
    "Run OpenAI analysis on an existing corpus file",
    (y) =>
      y
        .option("input", { type: "string", demandOption: true, describe: "Path to a .txt or .jsonl corpus file" })
        .option("outDir", { type: "string", default: "outputs", describe: "Output directory" })
        .option("quoteFidelity", { type: "boolean", default: false, describe: "Require supporting quotes for all claims" })
        .option("verbose", { type: "boolean", default: false, describe: "Verbose debug logging" }),
    (argv) => runAnalyze(argv).catch(exitWithError)
  )
  .demandCommand(1)
  .help()
  .strict()
  .parse();

