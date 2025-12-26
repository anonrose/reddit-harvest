import Snoowrap from "snoowrap";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function createRedditClient() {
  const userAgent = requireEnv("REDDIT_USER_AGENT");
  const clientId = requireEnv("REDDIT_CLIENT_ID");
  const clientSecret = requireEnv("REDDIT_CLIENT_SECRET");
  const refreshToken = requireEnv("REDDIT_REFRESH_TOKEN");

  const reddit = new Snoowrap({
    userAgent,
    clientId,
    clientSecret,
    refreshToken
  });

  // Be polite to Reddit's API.
  reddit.config({
    requestDelay: 1100,
    continueAfterRatelimitError: true,
    warnOnRateLimit: true
  });

  return reddit;
}


