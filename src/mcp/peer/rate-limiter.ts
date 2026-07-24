/**
 * rate-limiter — a small, dependency-free token-bucket limiter for inbound peer
 * calls.
 *
 * WHY token bucket: it allows a short burst (up to capacity) while enforcing a
 * steady long-run rate (refillPerMs), which fits interactive AI-to-AI traffic
 * better than a fixed window. The clock is injectable so tests are deterministic
 * without fake timers.
 */

/** Sensible per-peer defaults: ~30 requests/min with a burst of 30. */
export const DEFAULT_RATE_CAPACITY = 30;
export const DEFAULT_RATE_REFILL_PER_MS = 30 / 60000;

/** A single continuously-refilling bucket. */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerMs: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  /** Refill by elapsed time (capped at capacity), then consume if affordable. */
  tryConsume(count = 1): boolean {
    const t = this.now();
    const elapsed = Math.max(0, t - this.last);
    this.last = t;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }
}

export interface PeerRateLimiterOptions {
  capacity: number;
  refillPerMs: number;
  now?: () => number;
}

/** One TokenBucket per peer, created lazily on first use. */
export class PeerRateLimiter {
  private readonly buckets = new Map<string, TokenBucket>();
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly now: () => number;

  constructor(opts: PeerRateLimiterOptions) {
    this.capacity = opts.capacity;
    this.refillPerMs = opts.refillPerMs;
    this.now = opts.now ?? Date.now;
  }

  /** Attempt to consume one token for `peerId`. */
  tryConsume(peerId: string): boolean {
    let bucket = this.buckets.get(peerId);
    if (!bucket) {
      bucket = new TokenBucket(this.capacity, this.refillPerMs, this.now);
      this.buckets.set(peerId, bucket);
    }
    return bucket.tryConsume(1);
  }
}

/** Factory with the sensible per-peer defaults baked in. */
export function createDefaultPeerRateLimiter(now: () => number = Date.now): PeerRateLimiter {
  return new PeerRateLimiter({
    capacity: DEFAULT_RATE_CAPACITY,
    refillPerMs: DEFAULT_RATE_REFILL_PER_MS,
    now,
  });
}
