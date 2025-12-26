import Snoowrap from "snoowrap";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

/**
 * Sleep for ms milliseconds.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff.
 */
export async function withRetry(fn, { maxRetries = 3, baseDelayMs = 1000, onRetry } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isRateLimit = err?.statusCode === 429 || /rate.?limit/i.test(err?.message);
      const isRetryable = isRateLimit || err?.statusCode >= 500;

      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }

      const delayMs = baseDelayMs * Math.pow(2, attempt);
      onRetry?.({ attempt: attempt + 1, maxRetries, delayMs, error: err });
      await sleep(delayMs);
    }
  }
  throw lastError;
}

/**
 * Create a configured Snoowrap Reddit client.
 */
export function createRedditClient({ requestDelayMs = 1100 } = {}) {
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
    requestDelay: Math.max(requestDelayMs, 1000), // Minimum 1s to be safe
    continueAfterRatelimitError: true,
    warnOnRateLimit: true,
    maxRetryAttempts: 3
  });

  return reddit;
}
