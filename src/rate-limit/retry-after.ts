export interface ParsedRateLimitHeaders {
  limit?: number;
  remaining?: number;
  resetAt?: number;
  retryAfterMs?: number;
}

export function parseRetryAfter(
  value: string | null | undefined,
  now = Date.now()
): number | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const seconds = Number(trimmed);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1_000);
  }

  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) {
    return null;
  }

  return Math.max(0, date - now);
}

export function parseRateLimitHeaders(
  headers: Record<string, string | string[] | undefined> | Headers
): ParsedRateLimitHeaders {
  const result: ParsedRateLimitHeaders = {};

  const getHeader = (name: string): string | null => {
    if ("get" in headers && typeof headers.get === "function") {
      return headers.get(name);
    }
    const record = headers as Record<string, string | string[] | undefined>;
    const lowerName = name.toLowerCase();
    for (const key of Object.keys(record)) {
      if (key.toLowerCase() === lowerName) {
        const val = record[key];
        return Array.isArray(val) ? val[0] : val || null;
      }
    }
    return null;
  };

  const retryAfterVal = getHeader("retry-after");
  if (retryAfterVal) {
    const parsedMs = parseRetryAfter(retryAfterVal);
    if (parsedMs !== null) {
      result.retryAfterMs = parsedMs;
    }
  }

  const limitVal = getHeader("x-ratelimit-limit") || getHeader("ratelimit-limit");
  if (limitVal) {
    const parsedLimit = Number(limitVal);
    if (Number.isFinite(parsedLimit)) result.limit = parsedLimit;
  }

  const remainingVal =
    getHeader("x-ratelimit-remaining") || getHeader("ratelimit-remaining");
  if (remainingVal) {
    const parsedRem = Number(remainingVal);
    if (Number.isFinite(parsedRem)) result.remaining = parsedRem;
  }

  const resetVal = getHeader("x-ratelimit-reset") || getHeader("ratelimit-reset");
  if (resetVal) {
    const parsedReset = Number(resetVal);
    if (Number.isFinite(parsedReset)) {
      // If reset is in seconds (e.g. 10), convert to ms timestamp or delta
      result.resetAt =
        parsedReset < 1_000_000_000_00 ? Date.now() + parsedReset * 1000 : parsedReset;
    }
  }

  return result;
}
