/**
 * In-memory sliding-window rate limiter for public API keys.
 *
 * Note: Vercel Functions do not share this memory across instances. The map is
 * bounded to prevent an attacker from turning arbitrary API keys into an
 * unbounded memory allocation. Platform-wide enforcement should be configured
 * with Vercel Firewall when a project plan supports custom rate-limit rules.
 */

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
  remaining?: number;
}

export interface RateLimiterOptions {
  windowMs?: number;
  maxRequests?: number;
  maxKeys?: number;
}

export class SlidingWindowRateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly maxKeys: number;
  private readonly storage = new Map<string, number[]>();

  constructor(options: RateLimiterOptions = {}) {
    this.windowMs = options.windowMs ?? 60 * 1000;
    this.maxRequests = options.maxRequests ?? 60;
    this.maxKeys = options.maxKeys ?? 10_000;
  }

  /**
   * Checks if a request for the given key is allowed under the sliding window rate limit.
   * Inputs: key - unique API key or client identifier, now - timestamp in milliseconds.
   * Outputs: RateLimitResult with allowed status, retryAfter in seconds, and remaining count.
   * Side effects: records current request timestamp in memory.
   * Failure modes: returns allowed=false with calculated retryAfter when limit is exceeded.
   */
  check(key: string, now = Date.now()): RateLimitResult {
    const windowStart = now - this.windowMs;
    const timestamps = (this.storage.get(key) ?? []).filter((t) => t > windowStart);

    if (timestamps.length >= this.maxRequests) {
      const oldestInWindow = timestamps[0];
      const retryAfterMs = oldestInWindow + this.windowMs - now;
      const retryAfter = Math.max(1, Math.ceil(retryAfterMs / 1000));
      this.storage.set(key, timestamps);
      return { allowed: false, retryAfter, remaining: 0 };
    }

    timestamps.push(now);
    if (!this.storage.has(key) && this.storage.size >= this.maxKeys) {
      const oldestKey = this.storage.keys().next().value;
      if (oldestKey !== undefined) this.storage.delete(oldestKey);
    }
    this.storage.set(key, timestamps);
    return {
      allowed: true,
      remaining: this.maxRequests - timestamps.length,
    };
  }

  /**
   * Resets rate limit records for a single key or all keys.
   * Inputs: key - optional specific API key to clear.
   * Outputs: none.
   * Side effects: removes entries from memory map.
   * Failure modes: none.
   */
  reset(key?: string): void {
    if (key) {
      this.storage.delete(key);
    } else {
      this.storage.clear();
    }
  }
}

export const publicApiRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
});
