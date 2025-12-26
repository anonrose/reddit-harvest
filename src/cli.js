#!/usr/bin/env node
import path from "node:path";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

import { loadEnv } from "./env.js";
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

  const result = await harvestSubredditsToFiles({
    reddit,
    subreddits,
    outDir,
    listing,
    time,
    limit,
    includeComments,
    commentLimit,
    commentDepth
  });

  // eslint-disable-next-line no-console
  console.log(`Wrote ${result.outputs.length} file(s) to ${outDir}`);
  for (const o of result.outputs) {
    // eslint-disable-next-line no-console
    console.log(`- r/${o.subreddit}: ${o.filePath} (${o.textLength} chars)`);
  }

  if (argv.analyze) {
    // Merge all harvested text into one big corpus for synthesis.
    const texts = await Promise.all(result.outputs.map((o) => fs.readFile(o.filePath, "utf8")));
    const merged = texts.join("\n\n");
    const md = await analyzeCorpusTextToMarkdown({ inputText: merged });
    const analysisPath = path.join(outDir, `${result.timestamp}-analysis.md`);
    await fs.writeFile(analysisPath, md, "utf8");
    // eslint-disable-next-line no-console
    console.log(`Wrote analysis: ${analysisPath}`);
  }
}

async function runAnalyze(argv) {
  if (!argv.input) throw new Error(`--input is required (path to a .txt corpus file)`);
  const inputPath = path.resolve(argv.input);
  const outDir = argv.outDir ? path.resolve(argv.outDir) : path.resolve("outputs");
  const { outPath } = await analyzeFileToMarkdown({ inputPath, outDir });
  // eslint-disable-next-line no-console
  console.log(`Wrote analysis: ${outPath}`);
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
        .option("analyze", { type: "boolean", default: false, describe: "Run OpenAI synthesis after harvesting" }),
    (argv) => runHarvest(argv).catch(exitWithError)
  )
  .command(
    "analyze",
    "Run OpenAI analysis on an existing txt corpus file",
    (y) =>
      y
        .option("input", { type: "string", demandOption: true, describe: "Path to an existing .txt file" })
        .option("outDir", { type: "string", default: "outputs", describe: "Output directory" }),
    (argv) => runAnalyze(argv).catch(exitWithError)
  )
  .demandCommand(1)
  .help()
  .strict()
  .parse();


