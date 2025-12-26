import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { chunkStringBySize, ensureDir, nowTimestampForFiles } from "./utils.js";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function asText(x) {
  return x === null || x === undefined ? "" : String(x);
}

async function chat(client, { model, system, user }) {
  const resp = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    temperature: 0.3
  });
  return asText(resp.choices?.[0]?.message?.content).trim();
}

export function createOpenAIClient() {
  const apiKey = requireEnv("OPENAI_API_KEY");
  return new OpenAI({ apiKey });
}

export async function analyzeCorpusTextToMarkdown({
  inputText,
  model = process.env.OPENAI_MODEL || "gpt-4o-mini",
  onProgress
}) {
  const client = createOpenAIClient();

  const chunks = chunkStringBySize(inputText, 12000);
  const chunkSummaries = [];

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    onProgress?.({ type: "analyze_chunk_start", index: i + 1, total: chunks.length, chars: chunk.length });
    const summary = await chat(client, {
      model,
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
    model,
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
    `model: ${model}`,
    ``
  ].join("\n");

  return `${header}\n${final}\n`;
}

export async function analyzeFileToMarkdown({ inputPath, outDir = "outputs" }) {
  const text = await fs.readFile(inputPath, "utf8");
  const md = await analyzeCorpusTextToMarkdown({ inputText: text });

  const ts = nowTimestampForFiles();
  const base = path.basename(inputPath).replace(/\.[^.]+$/, "");
  const outPath = path.join(outDir, `${ts}-${base}-analysis.md`);
  await ensureDir(outDir);
  await fs.writeFile(outPath, md, "utf8");

  return { outPath };
}


