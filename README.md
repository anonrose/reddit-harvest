# reddit-harvest

[![npm version](https://img.shields.io/npm/v/reddit-harvest.svg)](https://www.npmjs.com/package/reddit-harvest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/reddit-harvest.svg)](https://nodejs.org)

Harvest subreddit posts and comments into structured corpus files for product research, with advanced filtering, deduplication, OpenAI-powered analysis, and an interactive terminal explorer.

## Features

- 📥 **Harvest** posts from multiple subreddits (hot, new, top, or search)
- 🔍 **Filter** by score, comments, date range
- 🔄 **Deduplicate** across runs to avoid re-harvesting
- 📄 **Export** as plain text or structured JSONL
- 🤖 **Analyze** with OpenAI to extract pain points, personas, and product opportunities
- 🧭 **Explore** results interactively in your terminal

---

## Installation

```bash
npm install -g reddit-harvest
```

Or with pnpm:

```bash
pnpm add -g reddit-harvest
```

---

## Quick Start

### 1. Set up credentials

Create a `.env` file (or copy from `env.example`):

```bash
# Reddit API (required)
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_REFRESH_TOKEN=your_refresh_token
REDDIT_USER_AGENT=reddit-harvest/1.0

# OpenAI (optional, for analysis)
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4o-mini
```

### 2. Harvest posts

```bash
reddit-harvest harvest --subreddits "startups,Entrepreneur" --limit 50
```

### 3. Analyze with OpenAI

```bash
reddit-harvest harvest --subreddits "startups" --limit 50 --analyze
```

### 4. Explore results

```bash
reddit-harvest explore --latest
```

---

## Commands

### `harvest` - Download subreddit content

```bash
reddit-harvest harvest --subreddits "startups,SaaS" --listing top --time week --limit 100
```

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `--subreddits` | required | Comma-separated list of subreddits |
| `--listing` | `hot` | `hot`, `new`, or `top` |
| `--time` | `week` | Time range for top: `hour`, `day`, `week`, `month`, `year`, `all` |
| `--limit` | `25` | Max posts per subreddit |
| `--search` | - | Search query (uses Reddit search instead of listing) |
| `--minScore` | - | Skip posts below this score |
| `--minComments` | - | Skip posts with fewer comments |
| `--after` | - | Only posts after this date (ISO format) |
| `--before` | - | Only posts before this date (ISO format) |
| `--includeComments` | `false` | Include top-level comments |
| `--commentLimit` | `50` | Max comments per post |
| `--format` | `txt` | Output format: `txt` or `jsonl` |
| `--dedupe` | `false` | Skip previously harvested posts |
| `--analyze` | `false` | Run OpenAI analysis after harvest |
| `--quoteFidelity` | `false` | Require supporting quotes for all claims |

### `analyze` - Analyze existing corpus

```bash
reddit-harvest analyze --input outputs/corpus.jsonl
```

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `--input` | required | Path to corpus file (`.txt` or `.jsonl`) |
| `--outDir` | `outputs` | Output directory |
| `--quoteFidelity` | `false` | Require supporting quotes |

### `explore` - Interactive browser

```bash
reddit-harvest explore --latest
```

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `--dir` | `outputs` | Directory containing analysis files |
| `--latest` | `false` | Auto-select most recent analysis |

---

## Output Files

After running with `--analyze`, you get:

| File | Description |
|------|-------------|
| `<timestamp>-r_<subreddit>.txt` | Raw corpus (or `.jsonl`) |
| `<timestamp>-analysis.md` | Full research synthesis |
| `<timestamp>-opportunities.json` | Structured product opportunities |

### Opportunities JSON structure

```json
[{
  "id": "opp-1",
  "title": "Automated customer discovery tool",
  "targetUser": "Solo founders",
  "problem": "Spending too much time on manual outreach",
  "currentWorkaround": "Cold emails and LinkedIn DMs",
  "proposedSolution": "AI-powered lead qualification",
  "confidence": "medium",
  "supportingQuotes": [{ "text": "I spend 4 hours a day...", "permalink": "..." }],
  "risks": ["Crowded market"],
  "mvpExperiment": "Landing page with email capture"
}]
```

---

## Examples

### Full product research workflow

```bash
# Harvest with filters and analysis
reddit-harvest harvest \
  --subreddits "startups,Entrepreneur,SaaS" \
  --listing top \
  --time month \
  --limit 100 \
  --minScore 5 \
  --includeComments \
  --format jsonl \
  --dedupe \
  --analyze \
  --quoteFidelity

# Explore the results
reddit-harvest explore --latest
```

### Daily harvesting with deduplication

```bash
# First run
reddit-harvest harvest --subreddits "startups" --limit 100 --dedupe --format jsonl

# Later runs skip already-harvested posts
reddit-harvest harvest --subreddits "startups" --limit 100 --dedupe --format jsonl
```

### Search for specific topics

```bash
reddit-harvest harvest \
  --subreddits "startups" \
  --search "finding first customers" \
  --limit 50 \
  --analyze
```

---

## Programmatic Usage

```javascript
import {
  createRedditClient,
  harvestSubredditsToFiles,
  analyzeCorpus
} from 'reddit-harvest';

// Harvest
const reddit = createRedditClient();
const result = await harvestSubredditsToFiles({
  reddit,
  subreddits: ['startups'],
  outDir: './outputs',
  limit: 50,
  format: 'jsonl'
});

// Analyze
const analysis = await analyzeCorpus({
  posts: result.allPosts,
  subreddits: ['startups'],
  outDir: './outputs'
});

console.log(analysis.opportunities);
```

---

## Reddit API Setup

1. Go to [Reddit Apps](https://www.reddit.com/prefs/apps)
2. Create a "script" type application
3. Note your `client_id` and `client_secret`
4. Generate a refresh token using the OAuth flow

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `REDDIT_CLIENT_ID` | Yes | Reddit app client ID |
| `REDDIT_CLIENT_SECRET` | Yes | Reddit app client secret |
| `REDDIT_REFRESH_TOKEN` | Yes | OAuth refresh token |
| `REDDIT_USER_AGENT` | Yes | User agent string |
| `OPENAI_API_KEY` | For analysis | OpenAI API key |
| `OPENAI_MODEL` | No | Model to use (default: `gpt-4o-mini`) |

---

## Notes

- **Rate limits**: Reddit rate limits API requests. The default delay is 1100ms between requests.
- **API costs**: OpenAI analysis costs money. Use `--limit` to control corpus size.
- **PII**: Be careful what you store/share from Reddit content.
- **Reddit ToS**: Don't use for spam, harassment, or violating Reddit's terms.

---

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

---

## License

MIT © [anonrose](https://github.com/anonrose)
