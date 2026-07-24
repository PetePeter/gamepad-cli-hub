/**
 * rate-limiter — TokenBucket + PeerRateLimiter. Real classes, injected clock
 * (no fake timers needed). Covers burst-to-capacity, rejection, and refill.
 */

import { describe, it, expect } from 'vitest';
import { TokenBucket, PeerRateLimiter } from '../src/mcp/peer/rate-limiter.js';

describe('TokenBucket', () => {
  it('allows a burst up to capacity then rejects', () => {
    let t = 1000;
    const bucket = new TokenBucket(3, 1 / 1000, () => t); // 1 token/sec
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(false); // empty
  });

  it('refills over time and caps at capacity', () => {
    let t = 0;
    const bucket = new TokenBucket(2, 1 / 1000, () => t); // 1 token/sec
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(false);
    t += 1000; // 1 token refilled
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(false);
    // long idle should not overfill beyond capacity
    t += 10_000;
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(false);
  });

  it('can consume more than one token at once', () => {
    let t = 0;
    const bucket = new TokenBucket(5, 1 / 1000, () => t);
    expect(bucket.tryConsume(5)).toBe(true);
    expect(bucket.tryConsume(1)).toBe(false);
  });
});

describe('PeerRateLimiter', () => {
  it('gives each peer an independent bucket', () => {
    let t = 0;
    const limiter = new PeerRateLimiter({ capacity: 1, refillPerMs: 1 / 1000, now: () => t });
    expect(limiter.tryConsume('a')).toBe(true);
    expect(limiter.tryConsume('a')).toBe(false); // a exhausted
    expect(limiter.tryConsume('b')).toBe(true);  // b independent
  });

  it('refills a peer bucket after the clock advances', () => {
    let t = 0;
    const limiter = new PeerRateLimiter({ capacity: 1, refillPerMs: 1 / 1000, now: () => t });
    expect(limiter.tryConsume('a')).toBe(true);
    expect(limiter.tryConsume('a')).toBe(false);
    t += 1000;
    expect(limiter.tryConsume('a')).toBe(true);
  });
});
