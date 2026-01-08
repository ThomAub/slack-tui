/**
 * Rate limiter for Slack Web API
 * Implements per-method token bucket with Retry-After support
 */

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  refillRate: number; // tokens per minute
  maxTokens: number;
  pausedUntil: number;
}

// Slack API tier limits (requests per minute)
// https://api.slack.com/docs/rate-limits
const TIER_LIMITS: Record<string, number> = {
  // Tier 1: ~1 req/sec = 60/min (special methods)
  'chat.postMessage': 60,
  'chat.update': 60,
  'chat.delete': 60,

  // Tier 2: ~20 req/min
  'conversations.list': 20,
  'users.list': 20,

  // Tier 3: ~50 req/min
  'conversations.history': 50,
  'conversations.replies': 50,
  'conversations.info': 50,
  'users.info': 50,
  'reactions.add': 50,
  'reactions.remove': 50,
  'reactions.get': 50,

  // Tier 4: ~100 req/min
  'auth.test': 100,
};

const DEFAULT_LIMIT = 50; // Default for unknown methods

export class RateLimiter {
  private buckets = new Map<string, TokenBucket>();
  private globalPausedUntil = 0;

  /**
   * Acquire a token for a method (waits if necessary)
   */
  async acquire(method: string): Promise<void> {
    // Check global pause (severe rate limiting)
    const now = Date.now();
    if (now < this.globalPausedUntil) {
      const waitTime = this.globalPausedUntil - now;
      await this.sleep(waitTime);
    }

    const bucket = this.getOrCreateBucket(method);

    // Check method-specific pause
    if (now < bucket.pausedUntil) {
      const waitTime = bucket.pausedUntil - now;
      await this.sleep(waitTime);
    }

    // Refill tokens based on time elapsed
    this.refillBucket(bucket);

    // Wait if no tokens available
    while (bucket.tokens < 1) {
      const waitTime = (60 * 1000) / bucket.refillRate; // Time for 1 token
      await this.sleep(waitTime);
      this.refillBucket(bucket);
    }

    // Consume a token
    bucket.tokens -= 1;
  }

  /**
   * Handle a 429 rate limit response
   */
  handleRateLimit(method: string, retryAfter: number): void {
    const bucket = this.getOrCreateBucket(method);
    const pauseUntil = Date.now() + retryAfter * 1000;

    bucket.pausedUntil = pauseUntil;
    bucket.tokens = 0;

    // If retry is very long, apply globally
    if (retryAfter > 60) {
      this.globalPausedUntil = pauseUntil;
    }
  }

  /**
   * Get rate limit status for monitoring
   */
  getStatus(): { method: string; tokens: number; paused: boolean }[] {
    const now = Date.now();
    const status: { method: string; tokens: number; paused: boolean }[] = [];

    for (const [method, bucket] of this.buckets) {
      this.refillBucket(bucket);
      status.push({
        method,
        tokens: Math.floor(bucket.tokens),
        paused: now < bucket.pausedUntil,
      });
    }

    return status;
  }

  private getOrCreateBucket(method: string): TokenBucket {
    let bucket = this.buckets.get(method);
    if (!bucket) {
      const limit = TIER_LIMITS[method] ?? DEFAULT_LIMIT;
      bucket = {
        tokens: limit,
        lastRefill: Date.now(),
        refillRate: limit,
        maxTokens: limit,
        pausedUntil: 0,
      };
      this.buckets.set(method, bucket);
    }
    return bucket;
  }

  private refillBucket(bucket: TokenBucket): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = (elapsed / (60 * 1000)) * bucket.refillRate;

    bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
let rateLimiter: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!rateLimiter) {
    rateLimiter = new RateLimiter();
  }
  return rateLimiter;
}
