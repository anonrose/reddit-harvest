import fs from "node:fs/promises";
import path from "node:path";
import { select } from "@inquirer/prompts";
import chalk from "chalk";

/**
 * Find analysis files in a directory.
 * Returns array of { timestamp, analysisPath, opportunitiesPath, tagsPath }
 */
export async function findAnalysisFiles(dir) {
  const files = await fs.readdir(dir);

  // Find all opportunities.json files and pair with analysis.md
  const analyses = [];
  const opportunityFiles = files.filter(f => f.endsWith("-opportunities.json"));

  for (const oppFile of opportunityFiles) {
    const timestamp = oppFile.replace("-opportunities.json", "");
    const analysisFile = `${timestamp}-analysis.md`;

    if (files.includes(analysisFile)) {
      analyses.push({
        timestamp,
        analysisPath: path.join(dir, analysisFile),
        opportunitiesPath: path.join(dir, oppFile)
      });
    }
  }

  // Sort by timestamp descending (newest first)
  analyses.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return analyses;
}

/**
 * Load analysis data from files.
 */
export async function loadAnalysis(analysisInfo) {
  const [analysisContent, opportunitiesContent] = await Promise.all([
    fs.readFile(analysisInfo.analysisPath, "utf8"),
    fs.readFile(analysisInfo.opportunitiesPath, "utf8")
  ]);

  const opportunities = JSON.parse(opportunitiesContent);

  // Extract tags from the analysis markdown (they're in a JSON code block)
  let tags = null;
  const tagsMatch = analysisContent.match(/# Extracted Tags\s*\n\s*```json\n([\s\S]*?)\n```/);
  if (tagsMatch) {
    try {
      tags = JSON.parse(tagsMatch[1]);
    } catch {
      // Tags parsing failed, continue without them
    }
  }

  return {
    ...analysisInfo,
    opportunities,
    tags,
    rawAnalysis: analysisContent
  };
}

/**
 * Format an opportunity for display.
 */
function formatOpportunity(opp) {
  const lines = [
    "",
    chalk.bold.cyan(`═══ ${opp.title} ═══`),
    "",
    chalk.dim(`ID: ${opp.id}`),
    "",
    chalk.yellow("Target User:"),
    `  ${opp.targetUser}`,
    "",
    chalk.yellow("Problem:"),
    `  ${opp.problem}`,
    "",
    chalk.yellow("Current Workaround:"),
    `  ${opp.currentWorkaround}`,
    "",
    chalk.yellow("Proposed Solution:"),
    `  ${opp.proposedSolution}`,
    "",
    chalk.yellow("Confidence:"),
    `  ${formatConfidence(opp.confidence)} - ${opp.confidenceReason}`,
    ""
  ];

  if (opp.supportingQuotes?.length > 0) {
    lines.push(chalk.yellow("Supporting Quotes:"));
    for (const q of opp.supportingQuotes) {
      lines.push(chalk.dim(`  > "${q.text}"`));
      if (q.permalink) {
        lines.push(chalk.blue(`    ${q.permalink}`));
      }
    }
    lines.push("");
  }

  if (opp.risks?.length > 0) {
    lines.push(chalk.yellow("Risks:"));
    for (const r of opp.risks) {
      lines.push(chalk.red(`  • ${r}`));
    }
    lines.push("");
  }

  if (opp.mvpExperiment) {
    lines.push(chalk.yellow("MVP Experiment:"));
    lines.push(chalk.green(`  ${opp.mvpExperiment}`));
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format a pain point for display.
 */
function formatPainPoint(pp) {
  const lines = [
    "",
    chalk.bold.red(`═══ ${pp.category} ═══`),
    "",
    chalk.yellow("Description:"),
    `  ${pp.description}`,
    "",
    chalk.yellow("Frequency:"),
    `  ${formatFrequency(pp.frequency)}`,
    ""
  ];

  if (pp.quote) {
    lines.push(chalk.yellow("Quote:"));
    lines.push(chalk.dim(`  > "${pp.quote}"`));
    if (pp.permalink) {
      lines.push(chalk.blue(`    ${pp.permalink}`));
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format a persona for display.
 */
function formatPersona(persona) {
  const lines = [
    "",
    chalk.bold.magenta(`═══ ${persona.role} ═══`),
    "",
    chalk.yellow("Description:"),
    `  ${persona.description}`,
    ""
  ];

  if (persona.painPoints?.length > 0) {
    lines.push(chalk.yellow("Associated Pain Points:"));
    for (const pp of persona.painPoints) {
      lines.push(`  • ${pp}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format a competitor for display.
 */
function formatCompetitor(comp) {
  const sentimentColor = {
    positive: chalk.green,
    neutral: chalk.yellow,
    negative: chalk.red
  };

  const colorFn = sentimentColor[comp.sentiment] || chalk.white;

  const lines = [
    "",
    chalk.bold.blue(`═══ ${comp.name} ═══`),
    "",
    chalk.yellow("Sentiment:"),
    `  ${colorFn(comp.sentiment)}`,
    "",
    chalk.yellow("Mentions:"),
    `  ${comp.mentions}`,
    ""
  ];

  return lines.join("\n");
}

/**
 * Format confidence level with color.
 */
function formatConfidence(level) {
  const colors = {
    high: chalk.green,
    medium: chalk.yellow,
    low: chalk.red
  };
  return (colors[level] || chalk.white)(level.toUpperCase());
}

/**
 * Format frequency with color.
 */
function formatFrequency(freq) {
  const colors = {
    common: chalk.red,
    occasional: chalk.yellow,
    rare: chalk.green
  };
  return (colors[freq] || chalk.white)(freq);
}

/**
 * Show detail view and wait for user to go back.
 */
async function showDetail(content) {
  console.clear();
  console.log(content);

  await select({
    message: "",
    choices: [{ name: "← Back", value: "back" }]
  });
}

/**
 * Browse opportunities menu.
 */
async function browseOpportunities(opportunities) {
  while (true) {
    console.clear();

    if (opportunities.length === 0) {
      console.log(chalk.dim("\nNo opportunities found.\n"));
      await select({
        message: "",
        choices: [{ name: "← Back", value: "back" }]
      });
      return;
    }

    const choices = opportunities.map(opp => ({
      name: `${chalk.cyan(`[${opp.id}]`)} ${opp.title} ${chalk.dim(`(${opp.confidence})`)}`,
      value: opp.id
    }));

    choices.push({ name: chalk.dim("← Back to main menu"), value: "back" });

    const selected = await select({
      message: chalk.bold(`\n📊 Opportunities (${opportunities.length})\n`),
      choices,
      pageSize: 15
    });

    if (selected === "back") return;

    const opp = opportunities.find(o => o.id === selected);
    if (opp) {
      await showDetail(formatOpportunity(opp));
    }
  }
}

/**
 * Browse pain points menu.
 */
async function browsePainPoints(painPoints) {
  while (true) {
    console.clear();

    if (!painPoints || painPoints.length === 0) {
      console.log(chalk.dim("\nNo pain points found.\n"));
      await select({
        message: "",
        choices: [{ name: "← Back", value: "back" }]
      });
      return;
    }

    const choices = painPoints.map((pp, i) => ({
      name: `${formatFrequency(pp.frequency)} ${pp.category} ${chalk.dim(`- "${(pp.description || "").slice(0, 40)}..."`)}`,
      value: i
    }));

    choices.push({ name: chalk.dim("← Back to main menu"), value: "back" });

    const selected = await select({
      message: chalk.bold(`\n🔥 Pain Points (${painPoints.length})\n`),
      choices,
      pageSize: 15
    });

    if (selected === "back") return;

    const pp = painPoints[selected];
    if (pp) {
      await showDetail(formatPainPoint(pp));
    }
  }
}

/**
 * Browse personas menu.
 */
async function browsePersonas(personas) {
  while (true) {
    console.clear();

    if (!personas || personas.length === 0) {
      console.log(chalk.dim("\nNo personas found.\n"));
      await select({
        message: "",
        choices: [{ name: "← Back", value: "back" }]
      });
      return;
    }

    const choices = personas.map((p, i) => ({
      name: `${chalk.magenta(p.role)} ${chalk.dim(`- ${(p.description || "").slice(0, 50)}...`)}`,
      value: i
    }));

    choices.push({ name: chalk.dim("← Back to main menu"), value: "back" });

    const selected = await select({
      message: chalk.bold(`\n👤 Personas (${personas.length})\n`),
      choices,
      pageSize: 15
    });

    if (selected === "back") return;

    const persona = personas[selected];
    if (persona) {
      await showDetail(formatPersona(persona));
    }
  }
}

/**
 * Browse competitors menu.
 */
async function browseCompetitors(competitors) {
  while (true) {
    console.clear();

    if (!competitors || competitors.length === 0) {
      console.log(chalk.dim("\nNo competitors found.\n"));
      await select({
        message: "",
        choices: [{ name: "← Back", value: "back" }]
      });
      return;
    }

    const sentimentIcon = {
      positive: "👍",
      neutral: "😐",
      negative: "👎"
    };

    const choices = competitors.map((c, i) => ({
      name: `${sentimentIcon[c.sentiment] || "❓"} ${chalk.blue(c.name)} ${chalk.dim(`(${c.mentions} mentions)`)}`,
      value: i
    }));

    choices.push({ name: chalk.dim("← Back to main menu"), value: "back" });

    const selected = await select({
      message: chalk.bold(`\n🏢 Competitors (${competitors.length})\n`),
      choices,
      pageSize: 15
    });

    if (selected === "back") return;

    const comp = competitors[selected];
    if (comp) {
      await showDetail(formatCompetitor(comp));
    }
  }
}

/**
 * Main explorer loop.
 */
export async function explore(analysis) {
  while (true) {
    console.clear();

    const oppCount = analysis.opportunities?.length || 0;
    const painCount = analysis.tags?.painPoints?.length || 0;
    const personaCount = analysis.tags?.personas?.length || 0;
    const compCount = analysis.tags?.competitors?.length || 0;

    console.log(chalk.bold.green("\n🔍 Reddit Analysis Explorer\n"));
    console.log(chalk.dim(`Analysis: ${analysis.timestamp}\n`));

    const choice = await select({
      message: "What would you like to explore?",
      choices: [
        { name: `📊 Opportunities (${oppCount})`, value: "opportunities" },
        { name: `🔥 Pain Points (${painCount})`, value: "painpoints" },
        { name: `👤 Personas (${personaCount})`, value: "personas" },
        { name: `🏢 Competitors (${compCount})`, value: "competitors" },
        { name: chalk.dim("Exit"), value: "exit" }
      ]
    });

    switch (choice) {
      case "opportunities":
        await browseOpportunities(analysis.opportunities || []);
        break;
      case "painpoints":
        await browsePainPoints(analysis.tags?.painPoints || []);
        break;
      case "personas":
        await browsePersonas(analysis.tags?.personas || []);
        break;
      case "competitors":
        await browseCompetitors(analysis.tags?.competitors || []);
        break;
      case "exit":
        console.clear();
        console.log(chalk.green("\n👋 Goodbye!\n"));
        return;
    }
  }
}

/**
 * Run the explorer from a directory.
 * If latest is true, auto-selects the most recent analysis.
 */
export async function runExplorer({ dir = "outputs", latest = false } = {}) {
  const analyses = await findAnalysisFiles(dir);

  if (analyses.length === 0) {
    console.log(chalk.red(`\nNo analysis files found in ${dir}\n`));
    console.log(chalk.dim("Run 'reddit-harvest harvest --analyze' first to generate analysis.\n"));
    return;
  }

  let selectedAnalysis;

  if (latest || analyses.length === 1) {
    selectedAnalysis = analyses[0];
  } else {
    console.clear();
    const choice = await select({
      message: chalk.bold("\n📁 Select an analysis to explore:\n"),
      choices: analyses.map(a => ({
        name: `${a.timestamp}`,
        value: a.timestamp
      })),
      pageSize: 10
    });

    selectedAnalysis = analyses.find(a => a.timestamp === choice);
  }

  if (!selectedAnalysis) {
    console.log(chalk.red("\nAnalysis not found.\n"));
    return;
  }

  const analysis = await loadAnalysis(selectedAnalysis);
  await explore(analysis);
}

