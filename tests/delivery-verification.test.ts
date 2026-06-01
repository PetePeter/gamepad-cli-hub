import { describe, expect, it, vi } from 'vitest';
import { verifyDeliveryAfterDelay } from '../src/session/delivery-verification.js';
import type { DeliveryVerificationRequest } from '../src/session/delivery-verification.js';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const TEXT = 'fix the bug in auth module please make sure tests pass';

/**
 * Build a request whose tail evolves through a scripted sequence of states.
 * Each call to getTerminalTail consumes the next state, sticking on the final entry.
 */
function makeScriptedRequest(states: string[][]): DeliveryVerificationRequest {
  let index = 0;
  return {
    sessionId: 's1',
    text: TEXT,
    submitSuffix: '\r',
    delayMs: 0, // fast-mode budgets for tests
    ptyManager: {
      getTerminalTail: vi.fn(() => {
        const state = states[Math.min(index, states.length - 1)];
        index += 1;
        return { stripped: state, raw: [], lastOutputAt: Date.now() };
      }),
    },
  };
}

describe('verifyDeliveryAfterDelay — seen→not-seen polling', () => {
  it('returns confirmed when snippet appears in tail and then disappears', async () => {
    // Sequence: empty → snippet present → snippet present → snippet gone
    const request = makeScriptedRequest([
      ['$ prompt'],
      [`> ${TEXT}`],
      [`> ${TEXT}`],
      ['response output now'],
    ]);

    const result = await verifyDeliveryAfterDelay(request);

    expect(result.status).toBe('confirmed');
  });

  it('returns no_signal when snippet never appears in tail (phase 1 timeout)', async () => {
    // Snippet never shows up — all probes return unrelated tail
    const request = makeScriptedRequest([['unrelated output line']]);

    const result = await verifyDeliveryAfterDelay(request);

    expect(result.status).toBe('no_signal');
  }, 15000);

  it('returns suspected_stuck when snippet appears but never leaves (phase 2 timeout)', async () => {
    // Snippet shows up immediately and sticks around forever
    const request = makeScriptedRequest([[`> ${TEXT}`]]);

    const result = await verifyDeliveryAfterDelay(request);

    expect(result.status).toBe('suspected_stuck');
  }, 15000);

  it('returns unverifiable when getTerminalTail is unavailable', async () => {
    const request: DeliveryVerificationRequest = {
      sessionId: 's1',
      text: TEXT,
      submitSuffix: '\r',
      delayMs: 0,
      ptyManager: {},
    };

    const result = await verifyDeliveryAfterDelay(request);

    expect(result.status).toBe('unverifiable');
  });

  it('retryAttempted is always false (no blind retries in new verifier)', async () => {
    const request = makeScriptedRequest([
      [`> ${TEXT}`],
      ['response output now'],
    ]);

    const result = await verifyDeliveryAfterDelay(request);

    expect(result.retryAttempted).toBe(false);
  });
});
