#!/usr/bin/env node
import path from "node:path";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

import { loadEnv } from "./env.js";
import { createLogger } from "./logger.js";
import { createRedditClient } from "./redditClient.js";
import { harvestSubredditsToFiles } from "./redditHarvest.js";
import { normalizeSubredditsArg } from "./utils.js";
import { analyzeCorpusTextToMarkdown, analyzeFileToMarkdown } from "./openaiAnalyze.js";
import fs from "node:fs/promises";

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

  const reddit = createRedditClient();

  const outDir = argv.outDir ? path.resolve(argv.outDir) : path.resolve("outputs");
  const listing = argv.listing;
  const time = argv.time;
  const limit = Number(argv.limit);
  const includeComments = Boolean(argv.includeComments);
  const commentLimit = Number(argv.commentLimit);
  const commentDepth = Number(argv.commentDepth);

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
    includeComments,
    commentLimit,
    commentDepth,
    onProgress: (e) => {
      if (e.type === "subreddit_start") {
        spinForSubreddit(e.subreddit, `Fetching r/${e.subreddit} (${e.listing}${e.listing === "top" ? `/${e.time}` : ""})…`);
        return;
      }
      if (e.type === "posts_fetched") {
        spinForSubreddit(e.subreddit, `r/${e.subreddit}: fetched ${e.totalPosts} post(s)…`);
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
          activeSpinner.succeed(`r/${e.subreddit}: wrote ${e.filePath}`);
          activeSpinner = null;
          activeSubreddit = null;
        } else {
          logger.success(`r/${e.subreddit}: wrote ${e.filePath}`);
        }
      }
    }
  });

  logger.success(`Wrote ${result.outputs.length} file(s) to ${outDir}`);
  for (const o of result.outputs) logger.info(`r/${o.subreddit}: ${o.filePath} (${o.textLength} chars)`);

  if (argv.analyze) {
    const analyzeSpinner = logger.spinner("Preparing corpus for analysis…").start();
    // Merge all harvested text into one big corpus for synthesis.
    const texts = await Promise.all(result.outputs.map((o) => fs.readFile(o.filePath, "utf8")));
    const merged = texts.join("\n\n");
    analyzeSpinner.text = "Analyzing corpus with OpenAI…";
    const md = await analyzeCorpusTextToMarkdown({
      inputText: merged,
      onProgress: (e) => {
        if (e.type === "analyze_chunk_start") {
          analyzeSpinner.text = `OpenAI: chunk ${e.index}/${e.total}…`;
        } else if (e.type === "analyze_synthesis_start") {
          analyzeSpinner.text = "OpenAI: synthesizing…";
        }
      }
    });
    const analysisPath = path.join(outDir, `${result.timestamp}-analysis.md`);
    await fs.writeFile(analysisPath, md, "utf8");
    analyzeSpinner.succeed(`Wrote analysis: ${analysisPath}`);
  }
}

async function runAnalyze(argv) {
  const logger = createLogger({ verbose: Boolean(argv.verbose) });
  if (!argv.input) throw new Error(`--input is required (path to a .txt corpus file)`);
  const inputPath = path.resolve(argv.input);
  const outDir = argv.outDir ? path.resolve(argv.outDir) : path.resolve("outputs");
  const sp = logger.spinner("Analyzing corpus with OpenAI…").start();
  const { outPath } = await analyzeFileToMarkdown({ inputPath, outDir });
  sp.succeed(`Wrote analysis: ${outPath}`);
}

yargs(hideBin(process.argv))
  .scriptName("reddit-analysis")
  .command(
    "harvest",
    "Download subreddit content and write .txt corpus files",
    (y) =>
      y
        .option("subreddits", { type: "string", demandOption: true, describe: "Comma-separated list, e.g. startups,Entrepreneur" })
        .option("listing", { choices: ["hot", "new", "top"], default: "hot", describe: "Which listing to pull" })
        .option("time", { choices: ["hour", "day", "week", "month", "year", "all"], default: "week", describe: "Time range (top only)" })
        .option("limit", { type: "number", default: 25, describe: "Posts per subreddit" })
        .option("includeComments", { type: "boolean", default: false, describe: "Include top-level comments" })
        .option("commentLimit", { type: "number", default: 50, describe: "Max comments per post (best-effort)" })
        .option("commentDepth", { type: "number", default: 1, describe: "Reply depth when expanding comments" })
        .option("outDir", { type: "string", default: "outputs", describe: "Output directory" })
        .option("analyze", { type: "boolean", default: false, describe: "Run OpenAI synthesis after harvesting" })
        .option("verbose", { type: "boolean", default: false, describe: "Verbose debug logging" }),
    (argv) => runHarvest(argv).catch(exitWithError)
  )
  .command(
    "analyze",
    "Run OpenAI analysis on an existing txt corpus file",
    (y) =>
      y
        .option("input", { type: "string", demandOption: true, describe: "Path to an existing .txt file" })
        .option("outDir", { type: "string", default: "outputs", describe: "Output directory" })
        .option("verbose", { type: "boolean", default: false, describe: "Verbose debug logging" }),
    (argv) => runAnalyze(argv).catch(exitWithError)
  )
  .demandCommand(1)
  .help()
  .strict()
  .parse();


