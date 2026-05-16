import { describe, expect, it, vi } from 'vitest';
import { verifyDeliveryAfterDelay } from '../src/session/delivery-verification.js';
import type { DeliveryVerificationRequest } from '../src/session/delivery-verification.js';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const DELIVERED_AT = 1_000_000;
const TEXT = 'fix the bug in auth module please';

function makeRequest(tailLines: string[], lastOutputAt: number, overrides?: Partial<DeliveryVerificationRequest>): DeliveryVerificationRequest {
  return {
    sessionId: 's1',
    text: TEXT,
    submitSuffix: '\r',
    delayMs: 0,
    retrySubmit: false,
    ptyManager: {
      getTerminalTail: vi.fn(() => ({
        stripped: tailLines,
        raw: tailLines,
        lastOutputAt,
      })),
    },
    ...overrides,
  };
}

describe('verifyDeliveryAfterDelay — busy-session false-positive prevention', () => {
  it('returns no_signal when session was already active before delivery and text not in tail', async () => {
    // Session was generating output 500ms before delivery — classic false-positive scenario
    const before = { text: 'some earlier output', lastOutputAt: DELIVERED_AT - 500 };
    const request = makeRequest(['different output line after delivery'], DELIVERED_AT + 100);

    const result = await verifyDeliveryAfterDelay(request, before, DELIVERED_AT);

    expect(result.status).not.toBe('confirmed');
    expect(result.status).not.toBe('retry_confirmed');
  });

  it('returns confirmed when session was idle before delivery and output advances after', async () => {
    // Session was idle 10s before delivery — output advance is caused by our delivery
    const before = { text: 'idle prompt $', lastOutputAt: DELIVERED_AT - 10_000 };
    const request = makeRequest(['processing your request...'], DELIVERED_AT + 100);

    const result = await verifyDeliveryAfterDelay(request, before, DELIVERED_AT);

    expect(result.status).toBe('confirmed');
  });

  it('returns confirmed when session was active but delivered text appears then scrolls away', async () => {
    // Text was processed (appeared, then output continued past it)
    const before = { text: 'generating...', lastOutputAt: DELIVERED_AT - 500 };
    const request = makeRequest(
      ['working on the auth bug now', 'checking the module...'],
      DELIVERED_AT + 100,
      { text: TEXT },
    );
    // Simulate: after tail does NOT contain the snippet but output continued
    // The text appeared and was consumed — confirmed via output continued path
    // Provide a before tail that DID contain the snippet to trigger hadSnippetBefore=false
    const beforeWithText = { text: `> ${TEXT}`, lastOutputAt: DELIVERED_AT - 500 };
    const afterTail = ['response to your request is here'];
    const reqWithTailShift = {
      ...request,
      ptyManager: {
        getTerminalTail: vi.fn()
          .mockReturnValueOnce({ stripped: [`> ${TEXT}`], raw: [`> ${TEXT}`], lastOutputAt: DELIVERED_AT - 500 })
          .mockReturnValue({ stripped: afterTail, raw: afterTail, lastOutputAt: DELIVERED_AT + 200 }),
      },
    };

    // Use captureDeliverySnapshot to get the 'before' (first call), then verify uses second call
    const result = await verifyDeliveryAfterDelay(reqWithTailShift, beforeWithText, DELIVERED_AT);

    // Had snippet before + output advanced → confirmed (intentional — text was pre-existing, new output is real signal)
    expect(result.status).toBe('confirmed');
  });

  it('treats session as idle when lastOutputAt is just over threshold before delivery', async () => {
    // 3001ms before delivery = idle → output advance counts as confirmation
    const before = { text: 'waiting...', lastOutputAt: DELIVERED_AT - 3001 };
    const request = makeRequest(['response started'], DELIVERED_AT + 50);

    const result = await verifyDeliveryAfterDelay(request, before, DELIVERED_AT);

    expect(result.status).toBe('confirmed');
  });

  it('treats session as active when lastOutputAt is just under threshold before delivery', async () => {
    // 2999ms before delivery = still active → output advance is not proof
    const before = { text: 'previous turn output', lastOutputAt: DELIVERED_AT - 2999 };
    const request = makeRequest(['more output from previous turn'], DELIVERED_AT + 50);

    const result = await verifyDeliveryAfterDelay(request, before, DELIVERED_AT);

    expect(result.status).not.toBe('confirmed');
    expect(result.status).not.toBe('retry_confirmed');
  });

  it('allows retry_confirmed for active sessions — guard skipped on retry attempt', async () => {
    // First attempt: active session, no text in tail → no_signal
    // Retry: output advanced and tail changed → retry_confirmed (guard not applied)
    const before = { text: 'previous output', lastOutputAt: DELIVERED_AT - 500 };
    let callCount = 0;
    const request: DeliveryVerificationRequest = {
      sessionId: 's1',
      text: TEXT,
      submitSuffix: '\r',
      delayMs: 0,
      retrySubmit: true,
      ptyManager: {
        getTerminalTail: vi.fn(() => {
          callCount++;
          // callCount=1: first classifyDelivery → old output, active session → no_signal
          // callCount=2: retry classifyDelivery → new output, guard skipped → retry_confirmed
          const isRetry = callCount >= 2;
          return {
            stripped: isRetry ? ['new response after retry'] : ['previous output'],
            raw: [],
            lastOutputAt: isRetry ? DELIVERED_AT + 300 : DELIVERED_AT - 500,
          };
        }),
        deliverText: vi.fn(() => Promise.resolve()),
      },
    };

    const result = await verifyDeliveryAfterDelay(request, before, DELIVERED_AT);

    expect(result.status).toBe('retry_confirmed');
  });
});
