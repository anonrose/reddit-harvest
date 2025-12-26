import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { chunkStringBySize, ensureDir, nowTimestampForFiles } from "./utils.js";
import { parseJSONL } from "./formatters.js";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function asText(x) {
  return x === null || x === undefined ? "" : String(x);
}

async function chat(client, { model, system, user, jsonMode = false }) {
  const resp = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    temperature: 0.3,
    ...(jsonMode ? { response_format: { type: "json_object" } } : {})
  });
  return asText(resp.choices?.[0]?.message?.content).trim();
}

export function createOpenAIClient() {
  const apiKey = requireEnv("OPENAI_API_KEY");
  return new OpenAI({ apiKey });
}

/**
 * Convert posts array to text for analysis.
 */
function postsToText(posts) {
  return posts.map((p, i) => {
    const lines = [
      `--- POST ${i + 1} ---`,
      `id: ${p.id}`,
      `subreddit: r/${p.subreddit}`,
      `title: ${p.title}`,
      `author: ${p.author}`,
      `score: ${p.score}`,
      `permalink: https://reddit.com${p.permalink}`,
      ``,
      p.selftext || "(no body)",
      ``
    ];

    if (p.comments?.length > 0) {
      lines.push("COMMENTS:");
      for (const c of p.comments) {
        lines.push(`  - [${c.author}, score: ${c.score}]: ${c.body}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }).join("\n\n");
}

/**
 * Build the quote fidelity instruction addition.
 */
function getQuoteFidelityInstruction(enabled) {
  if (!enabled) return "";
  return `

IMPORTANT - Quote Fidelity Mode:
- Every claim, pain point, or insight MUST include at least one supporting quote from the source material.
- Include the permalink (Reddit URL) for each quote.
- If you cannot find a direct supporting quote, label the insight as "[HYPOTHESIS]" and explain your reasoning.
- Format quotes as: > "quote text" (permalink)`;
}

/**
 * Analyze posts from a single subreddit.
 */
async function analyzeSubredditPosts({ client, model, posts, subreddit, quoteFidelity, onProgress }) {
  const text = postsToText(posts);
  const chunks = chunkStringBySize(text, 12000);
  const chunkSummaries = [];

  const quoteFidelityNote = getQuoteFidelityInstruction(quoteFidelity);

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    onProgress?.({ type: "analyze_chunk_start", index: i + 1, total: chunks.length, chars: chunk.length, subreddit });

    const summary = await chat(client, {
      model,
      system: `You are a product researcher analyzing Reddit content from r/${subreddit}. Extract pain points, unmet needs, repeated complaints, workarounds, and willingness-to-pay signals. Be concrete and do not invent facts.${quoteFidelityNote}`,
      user: [
        `Chunk ${i + 1}/${chunks.length} from r/${subreddit}.`,
        `Return markdown with:`,
        `- Key pain points (bullets, each with 1 short quote snippet + permalink if available)`,
        `- Who has the problem (persona/role)`,
        `- Context/triggers (when it happens)`,
        `- Existing alternatives/workarounds mentioned`,
        `- Willingness-to-pay signals (if any)`,
        ``,
        `CONTENT:`,
        chunk
      ].join("\n")
    });

    chunkSummaries.push(summary);
    onProgress?.({ type: "analyze_chunk_done", index: i + 1, total: chunks.length, subreddit });
  }

  // Synthesize subreddit-level summary
  const subredditSynthesis = await chat(client, {
    model,
    system: `You synthesize product research from r/${subreddit}. Be specific and include evidence.${quoteFidelityNote}`,
    user: [
      `Synthesize these chunk summaries into a cohesive analysis of r/${subreddit}:`,
      ``,
      `## Summary for r/${subreddit}`,
      `Include:`,
      `- Top 3-5 pain points (with quotes)`,
      `- Primary personas`,
      `- Key triggers/contexts`,
      `- Notable workarounds`,
      `- Market signals`,
      ``,
      `CHUNK SUMMARIES:`,
      chunkSummaries.join("\n\n---\n\n")
    ].join("\n")
  });

  return { subreddit, synthesis: subredditSynthesis, postCount: posts.length };
}

/**
 * Extract structured tags from analyzed content.
 */
async function extractTags({ client, model, subredditSummaries, quoteFidelity, onProgress }) {
  onProgress?.({ type: "tagging_start" });

  const allSummaries = subredditSummaries.map(s => `## r/${s.subreddit}\n${s.synthesis}`).join("\n\n");

  const response = await chat(client, {
    model,
    system: `You are a product researcher. Extract structured data from research summaries. Return valid JSON only.`,
    user: [
      `Extract structured tags from this research:`,
      ``,
      allSummaries,
      ``,
      `Return JSON with this structure:`,
      `{`,
      `  "painPoints": [{ "category": "string", "description": "string", "quote": "string or null", "permalink": "string or null", "frequency": "common|occasional|rare" }],`,
      `  "personas": [{ "role": "string", "description": "string", "painPoints": ["category refs"] }],`,
      `  "urgency": "low|medium|high",`,
      `  "urgencyReason": "string",`,
      `  "competitors": [{ "name": "string", "sentiment": "positive|neutral|negative", "mentions": number }],`,
      `  "willingnessToPay": { "signals": ["string"], "confidence": "low|medium|high" }`,
      `}`
    ].join("\n"),
    jsonMode: true
  });

  try {
    return JSON.parse(response);
  } catch {
    return { error: "Failed to parse tags", raw: response };
  }
}

/**
 * Generate structured product opportunities.
 */
async function generateOpportunities({ client, model, subredditSummaries, tags, quoteFidelity, onProgress }) {
  onProgress?.({ type: "opportunities_start" });

  const allSummaries = subredditSummaries.map(s => `## r/${s.subreddit}\n${s.synthesis}`).join("\n\n");
  const quoteFidelityNote = getQuoteFidelityInstruction(quoteFidelity);

  const response = await chat(client, {
    model,
    system: `You are a product strategist identifying actionable product opportunities from research. Return valid JSON only.${quoteFidelityNote}`,
    user: [
      `Based on this research, generate 5-10 product opportunities:`,
      ``,
      allSummaries,
      ``,
      `Tags extracted:`,
      JSON.stringify(tags, null, 2),
      ``,
      `Return JSON array with this structure:`,
      `[{`,
      `  "id": "opp-1",`,
      `  "title": "Short descriptive title",`,
      `  "targetUser": "Primary persona",`,
      `  "problem": "Clear problem statement",`,
      `  "currentWorkaround": "How they solve it now",`,
      `  "proposedSolution": "High-level solution idea",`,
      `  "confidence": "low|medium|high",`,
      `  "confidenceReason": "Why this confidence level",`,
      `  "supportingQuotes": [{ "text": "quote", "permalink": "url" }],`,
      `  "risks": ["potential risks"],`,
      `  "mvpExperiment": "Quick way to test this"`,
      `}]`
    ].join("\n"),
    jsonMode: true
  });

  try {
    return JSON.parse(response);
  } catch {
    return [{ error: "Failed to parse opportunities", raw: response }];
  }
}

/**
 * Generate final synthesis markdown.
 */
async function generateFinalSynthesis({ client, model, subredditSummaries, tags, opportunities, quoteFidelity, onProgress }) {
  onProgress?.({ type: "analyze_synthesis_start" });

  const allSummaries = subredditSummaries.map(s => `## r/${s.subreddit} (${s.postCount} posts)\n${s.synthesis}`).join("\n\n");
  const quoteFidelityNote = getQuoteFidelityInstruction(quoteFidelity);

  const synthesis = await chat(client, {
    model,
    system: `You synthesize product opportunities from multiple subreddit analyses. Be specific, propose testable ideas, and include risks/unknowns.${quoteFidelityNote}`,
    user: [
      `Create a final research synthesis from these subreddit analyses:`,
      ``,
      allSummaries,
      ``,
      `Also consider these extracted opportunities:`,
      JSON.stringify(opportunities.slice(0, 5), null, 2),
      ``,
      `Return markdown with these sections:`,
      `## Executive Summary`,
      `## Cross-Subreddit Themes`,
      `## Top Pain Points (ranked by frequency and severity)`,
      `## Target Personas`,
      `## Product Opportunity Ideas (top 5, with confidence levels)`,
      `## MVP Experiments (fast tests for top ideas)`,
      `## Messaging Angles`,
      `## Red Flags / Unknowns`,
      `## Recommended Next Steps`
    ].join("\n")
  });

  onProgress?.({ type: "analyze_synthesis_done" });
  return synthesis;
}

/**
 * Main analysis function for structured posts data.
 */
export async function analyzeCorpus({
  posts,
  subreddits,
  quoteFidelity = false,
  outDir = "outputs",
  timestamp = null,
  onProgress
}) {
  const client = createOpenAIClient();
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const ts = timestamp || nowTimestampForFiles();

  await ensureDir(outDir);

  // Group posts by subreddit
  const postsBySubreddit = {};
  for (const p of posts) {
    const sr = p.subreddit || "unknown";
    if (!postsBySubreddit[sr]) postsBySubreddit[sr] = [];
    postsBySubreddit[sr].push(p);
  }

  // Stage 1: Per-subreddit analysis
  const subredditSummaries = [];
  for (const sr of Object.keys(postsBySubreddit)) {
    onProgress?.({ type: "subreddit_analysis_start", subreddit: sr });
    const summary = await analyzeSubredditPosts({
      client,
      model,
      posts: postsBySubreddit[sr],
      subreddit: sr,
      quoteFidelity,
      onProgress
    });
    subredditSummaries.push(summary);
  }

  // Stage 2: Extract structured tags
  const tags = await extractTags({ client, model, subredditSummaries, quoteFidelity, onProgress });

  // Stage 3: Generate opportunities
  const opportunities = await generateOpportunities({ client, model, subredditSummaries, tags, quoteFidelity, onProgress });

  // Stage 4: Final synthesis
  const finalSynthesis = await generateFinalSynthesis({ client, model, subredditSummaries, tags, opportunities, quoteFidelity, onProgress });

  // Build final markdown
  const header = [
    `# Reddit Product Research Synthesis`,
    ``,
    `**Generated:** ${new Date().toISOString()}`,
    `**Model:** ${model}`,
    `**Subreddits:** ${subreddits.join(", ")}`,
    `**Total Posts Analyzed:** ${posts.length}`,
    `**Quote Fidelity Mode:** ${quoteFidelity ? "Enabled" : "Disabled"}`,
    ``,
    `---`,
    ``
  ].join("\n");

  const perSubredditSection = [
    `# Per-Subreddit Analysis`,
    ``,
    ...subredditSummaries.map(s => `## r/${s.subreddit}\n\n${s.synthesis}`),
    ``,
    `---`,
    ``
  ].join("\n");

  const tagsSection = [
    `# Extracted Tags`,
    ``,
    "```json",
    JSON.stringify(tags, null, 2),
    "```",
    ``,
    `---`,
    ``
  ].join("\n");

  const fullMarkdown = [
    header,
    finalSynthesis,
    ``,
    `---`,
    ``,
    perSubredditSection,
    tagsSection
  ].join("\n");

  // Write outputs
  const analysisPath = path.join(outDir, `${ts}-analysis.md`);
  await fs.writeFile(analysisPath, fullMarkdown, "utf8");

  const opportunitiesPath = path.join(outDir, `${ts}-opportunities.json`);
  await fs.writeFile(opportunitiesPath, JSON.stringify(opportunities, null, 2), "utf8");

  return {
    analysisPath,
    opportunitiesPath,
    tags,
    opportunities,
    subredditSummaries
  };
}

/**
 * Analyze from a file (backward compatible + enhanced).
 */
export async function analyzeFileToMarkdown({ inputPath, outDir = "outputs", quoteFidelity = false, onProgress }) {
  const content = await fs.readFile(inputPath, "utf8");

  // Detect format
  let posts;
  if (inputPath.endsWith(".jsonl")) {
    posts = parseJSONL(content);
  } else {
    // For txt files, we need to pass the raw text through the old chunking approach
    // but wrap it in a pseudo-post structure
    posts = [{
      id: "corpus",
      subreddit: path.basename(inputPath).replace(/\.[^.]+$/, ""),
      title: "Corpus file",
      author: "",
      score: 0,
      numComments: 0,
      url: "",
      permalink: "",
      selftext: content,
      comments: []
    }];
  }

  // Infer subreddits from posts
  const subreddits = [...new Set(posts.map(p => p.subreddit).filter(Boolean))];

  const result = await analyzeCorpus({
    posts,
    subreddits: subreddits.length > 0 ? subreddits : ["unknown"],
    quoteFidelity,
    outDir,
    onProgress
  });

  return {
    outPath: result.analysisPath,
    analysisPath: result.analysisPath,
    opportunitiesPath: result.opportunitiesPath
  };
}

/**
 * Legacy function for simple text analysis.
 */
export async function analyzeCorpusTextToMarkdown({ inputText, model, onProgress }) {
  const client = createOpenAIClient();
  const actualModel = model || process.env.OPENAI_MODEL || "gpt-4o-mini";

  const chunks = chunkStringBySize(inputText, 12000);
  const chunkSummaries = [];

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    onProgress?.({ type: "analyze_chunk_start", index: i + 1, total: chunks.length, chars: chunk.length });
    const summary = await chat(client, {
      model: actualModel,
      system:
        "You are a product researcher. Extract pain points, unmet needs, repeated complaints, workarounds, and willingness-to-pay signals from Reddit content. Be concrete and do not invent facts.",
      user: [
        `Chunk ${i + 1}/${chunks.length}.`,
        `Return markdown with:`,
        `- Key pain points (bullets, each with 1 short quote snippet if available)`,
        `- Who has the problem (persona/role)`,
        `- Context/triggers (when it happens)`,
        `- Existing alternatives/workarounds mentioned`,
        ``,
        `CONTENT:`,
        chunk
      ].join("\n")
    });
    chunkSummaries.push(summary);
    onProgress?.({ type: "analyze_chunk_done", index: i + 1, total: chunks.length });
  }

  onProgress?.({ type: "analyze_synthesis_start" });
  const final = await chat(client, {
    model: actualModel,
    system:
      "You synthesize product opportunities from multiple summaries. Be specific, propose testable product ideas, and include risks/unknowns. Do not invent sources.",
    user: [
      `Synthesize the following chunk summaries into a single concise research doc.`,
      ``,
      `Return markdown with these sections:`,
      `## Themes`,
      `## Top pain points (ranked)`,
      `## Product opportunity ideas (5-10)`,
      `## MVP experiments (fast tests)`,
      `## Messaging angles`,
      `## Red flags / unknowns`,
      ``,
      `CHUNK SUMMARIES:`,
      chunkSummaries.map((s, idx) => `### Chunk ${idx + 1}\n${s}`).join("\n\n")
    ].join("\n")
  });
  onProgress?.({ type: "analyze_synthesis_done" });

  const header = [
    `# Reddit → product research synthesis`,
    `generatedAt: ${new Date().toISOString()}`,
    `model: ${actualModel}`,
    ``
  ].join("\n");

  return `${header}\n${final}\n`;
}
