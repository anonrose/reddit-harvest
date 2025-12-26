## reddit-harvest

Harvest subreddit posts (and optionally comments) into corpus files for product research, with advanced filtering, deduplication, and OpenAI-powered analysis.

### Install (after publishing)

```bash
pnpm add -g reddit-harvest
```

### Setup

- **Install deps**:

```bash
pnpm install
```

- **Create your env file**:
  - Copy `env.example` → `.env`
  - Fill in the values

### Reddit credentials (snoowrap)

This project expects the **refresh-token** flow:

- `REDDIT_CLIENT_ID`
- `REDDIT_CLIENT_SECRET`
- `REDDIT_REFRESH_TOKEN`
- `REDDIT_USER_AGENT`

### OpenAI credentials (optional)

For analysis features:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default: `gpt-4o-mini`)

---

## Usage

### Basic harvest

```bash
reddit-harvest harvest --subreddits "startups,Entrepreneur" --listing hot --limit 25
```

Outputs go to `outputs/` as timestamped files (one per subreddit).

### With comments

```bash
reddit-harvest harvest --subreddits "startups" --limit 25 --includeComments --commentLimit 50
```

---

## Filtering Options

### Filter by score and comments

```bash
reddit-harvest harvest --subreddits "startups" --limit 100 --minScore 10 --minComments 5
```

### Filter by date range

```bash
reddit-harvest harvest --subreddits "startups" --limit 100 --after "2024-01-01" --before "2024-12-31"
```

### Search mode (instead of listing)

```bash
reddit-harvest harvest --subreddits "startups" --search "finding customers" --limit 50
```

When `--search` is provided, it uses Reddit's search API instead of hot/new/top listings.

---

## Deduplication

Skip posts you've already harvested:

```bash
reddit-harvest harvest --subreddits "startups" --limit 100 --dedupe
```

Reset the dedupe index:

```bash
reddit-harvest harvest --subreddits "startups" --limit 100 --resetDedupe
```

The dedupe index is stored in `outputs/.harvest-index.json`.

---

## Output Formats

### Text format (default)

```bash
reddit-harvest harvest --subreddits "startups" --limit 25 --format txt
```

### JSONL format (structured, one post per line)

```bash
reddit-harvest harvest --subreddits "startups" --limit 25 --format jsonl
```

JSONL is better for programmatic analysis. Each line contains:

```json
{
  "id": "abc123",
  "subreddit": "startups",
  "title": "Post title",
  "author": "username",
  "created": "2024-01-15T10:30:00.000Z",
  "score": 42,
  "numComments": 15,
  "url": "https://...",
  "permalink": "/r/startups/comments/...",
  "selftext": "Post body...",
  "comments": [{ "id": "...", "author": "...", "score": 5, "body": "..." }]
}
```

---

## OpenAI Analysis

### Harvest + analyze in one command

```bash
reddit-harvest harvest --subreddits "startups,Entrepreneur" --limit 50 --analyze
```

This generates:
- `outputs/<timestamp>-analysis.md` - Full research synthesis
- `outputs/<timestamp>-opportunities.json` - Structured product opportunities

### Analyze an existing corpus file

```bash
reddit-harvest analyze --input outputs/your-file.jsonl
```

Works with both `.txt` and `.jsonl` files.

---

## Analysis Features

### Two-stage analysis

When analyzing multiple subreddits, the analysis runs in two stages:
1. **Per-subreddit analysis** - Deep dive into each subreddit's pain points and themes
2. **Global synthesis** - Cross-subreddit patterns and opportunities

### Auto-tagging

The analysis extracts structured tags:
- **Pain points** with categories, descriptions, and supporting quotes
- **Personas** with roles and associated pain points
- **Urgency level** (low/medium/high)
- **Competitors** mentioned with sentiment
- **Willingness-to-pay signals**

### Structured opportunities output

`opportunities.json` contains actionable product ideas:

```json
[{
  "id": "opp-1",
  "title": "Automated customer discovery tool",
  "targetUser": "Solo founders",
  "problem": "Spending too much time on manual outreach",
  "currentWorkaround": "Cold emails and LinkedIn DMs",
  "proposedSolution": "AI-powered lead qualification",
  "confidence": "medium",
  "confidenceReason": "Multiple mentions but unclear willingness to pay",
  "supportingQuotes": [{ "text": "I spend 4 hours a day...", "permalink": "https://..." }],
  "risks": ["Crowded market", "Privacy concerns"],
  "mvpExperiment": "Landing page with email capture"
}]
```

### Quote fidelity mode

Require every claim to have supporting quotes:

```bash
reddit-harvest harvest --subreddits "startups" --limit 50 --analyze --quoteFidelity
```

In this mode:
- Every insight includes at least one quote + permalink
- Claims without direct evidence are labeled as `[HYPOTHESIS]`

---

## Interactive Explorer

After running analysis, use the interactive explorer to browse results in your terminal.

### Launch the explorer

```bash
reddit-harvest explore
```

### Auto-select latest analysis

```bash
reddit-harvest explore --latest
```

### Browse from a specific directory

```bash
reddit-harvest explore --dir ./my-outputs
```

### Explorer features

- **Arrow-key navigation** through menus
- **Browse by category**:
  - 📊 Opportunities - Product ideas with confidence levels
  - 🔥 Pain Points - Problems ranked by frequency
  - 👤 Personas - User types and their pain points
  - 🏢 Competitors - Mentioned competitors with sentiment
- **Detailed views** for each item with:
  - Color-coded confidence/frequency indicators
  - Supporting quotes with Reddit permalinks
  - Risks and MVP experiments

---

## Rate Limiting

### Adjust request delay

```bash
reddit-harvest harvest --subreddits "startups" --limit 100 --requestDelayMs 2000
```

Default is 1100ms between requests. Increase if you're hitting rate limits.

---

## CLI Reference

### harvest command

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--subreddits` | string | required | Comma-separated list of subreddits |
| `--listing` | choice | `hot` | `hot`, `new`, or `top` |
| `--time` | choice | `week` | Time range for `top`: `hour`, `day`, `week`, `month`, `year`, `all` |
| `--limit` | number | `25` | Max posts per subreddit |
| `--search` | string | - | Search query (uses Reddit search instead of listing) |
| `--minScore` | number | - | Skip posts below this score |
| `--minComments` | number | - | Skip posts with fewer comments |
| `--after` | string | - | Only posts after this date (ISO format) |
| `--before` | string | - | Only posts before this date (ISO format) |
| `--includeComments` | boolean | `false` | Include top-level comments |
| `--commentLimit` | number | `50` | Max comments per post |
| `--commentDepth` | number | `1` | Reply depth when expanding |
| `--outDir` | string | `outputs` | Output directory |
| `--format` | choice | `txt` | `txt` or `jsonl` |
| `--dedupe` | boolean | `false` | Skip previously harvested posts |
| `--resetDedupe` | boolean | `false` | Clear dedupe index first |
| `--requestDelayMs` | number | `1100` | Delay between API requests |
| `--analyze` | boolean | `false` | Run OpenAI analysis after harvest |
| `--quoteFidelity` | boolean | `false` | Require supporting quotes |
| `--verbose` | boolean | `false` | Debug logging |

### analyze command

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--input` | string | required | Path to corpus file (`.txt` or `.jsonl`) |
| `--outDir` | string | `outputs` | Output directory |
| `--quoteFidelity` | boolean | `false` | Require supporting quotes |
| `--verbose` | boolean | `false` | Debug logging |

### explore command

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--dir` | string | `outputs` | Directory containing analysis files |
| `--latest` | boolean | `false` | Auto-select the most recent analysis |

---

## Examples

### Full product research workflow

```bash
# Harvest from multiple subreddits with filters
reddit-harvest harvest \
  --subreddits "startups,Entrepreneur,SaaS,smallbusiness" \
  --listing top \
  --time month \
  --limit 100 \
  --minScore 5 \
  --includeComments \
  --commentLimit 20 \
  --format jsonl \
  --dedupe \
  --analyze \
  --quoteFidelity

# Re-run later to get new posts only
reddit-harvest harvest \
  --subreddits "startups,Entrepreneur,SaaS,smallbusiness" \
  --listing new \
  --limit 50 \
  --dedupe \
  --format jsonl
```

### Quick search for specific topics

```bash
reddit-harvest harvest \
  --subreddits "startups" \
  --search "finding first customers" \
  --limit 50 \
  --includeComments \
  --analyze
```

### Explore results interactively

```bash
# After running analysis, explore the results
reddit-harvest explore --latest

# Or browse all available analyses
reddit-harvest explore
```

---

## Notes / Safety

- **PII / sensitive info**: Be careful what you store/share from Reddit content.
- **Rate limits**: Reddit will rate limit; keep limits modest and use `--requestDelayMs` if needed.
- **API costs**: OpenAI analysis costs money. Use `--limit` to control corpus size.
- **Respect Reddit ToS**: Don't use for spam, harassment, or violating Reddit's terms.

---

## License

MIT
