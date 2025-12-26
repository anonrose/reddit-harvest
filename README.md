## reddit-harvest

Harvest subreddit posts (and optionally comments) into `.txt` corpus files for product research, with optional OpenAI synthesis.

### Setup

- **Install deps**:

```bash
npm install
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

### Usage

### Harvest into a txt corpus

```bash
npm run harvest -- --subreddits "startups,Entrepreneur" --listing hot --limit 25 --includeComments --commentLimit 50
```

Outputs go to `outputs/` as timestamped files (one per subreddit).

### Use a specific env file

```bash
npm run harvest -- --env ./my.env --subreddits "startups" --limit 10
```

You can also set `ENV_FILE` instead of passing `--env`.

### Harvest + OpenAI analysis (optional)

```bash
npm run harvest:analyze -- --subreddits "startups,Entrepreneur" --listing top --time week --limit 25
```

This will also create a single `outputs/<timestamp>-analysis.md` file synthesizing product opportunities, pain points, and themes across the harvested text.

### Analyze an existing txt file

```bash
npm run analyze -- --input outputs/your-file.txt
```

### CLI options (high level)

- **--subreddits**: Comma-separated list, e.g. `"startups,Entrepreneur"`
- **--listing**: `hot|new|top` (default: `hot`)
- **--time**: For `top` only: `hour|day|week|month|year|all`
- **--limit**: Number of posts per subreddit
- **--includeComments**: Include top-level comments
- **--commentLimit**: Max comments per post (best-effort)
- **--outDir**: Output directory (default: `outputs`)
- **--analyze**: Run OpenAI synthesis after harvesting (requires `OPENAI_API_KEY`)

### Notes / safety

- **PII / sensitive info**: be careful what you store/share from Reddit content.
- **Rate limits**: Reddit will rate limit; keep limits modest.


