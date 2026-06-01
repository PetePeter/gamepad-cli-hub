import { describe, expect, it, vi } from 'vitest';
import { verifyDeliveryAfterDelay } from '../src/session/delivery-verification.js';
import type { DeliveryVerificationRequest } from '../src/session/delivery-verification.js';
import { TerminalOutputBuffer } from '../src/session/terminal-output-buffer.js';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const SESSION_ID = 's1';

function makeRequest(
  buffer: TerminalOutputBuffer,
  overrides: Partial<DeliveryVerificationRequest> = {},
): DeliveryVerificationRequest {
  return {
    sessionId: SESSION_ID,
    text: 'hello world this is a delivery',
    submitSuffix: '\r',
    delayMs: 0, // fast-mode budgets
    ptyManager: {
      getTerminalTail: (sid, lines, mode, stripBlankLines) =>
        buffer.tail(sid, lines, mode, stripBlankLines),
    },
    ...overrides,
  };
}

describe('verifyDeliveryAfterDelay — activity-timestamp polling', () => {
  it('returns confirmed when tail activity advances twice after delivery', async () => {
    const buffer = new TerminalOutputBuffer();
    // Seed baseline: one append before verification starts.
    buffer.append(SESSION_ID, 'baseline\n');

    const request = makeRequest(buffer);
    const promise = verifyDeliveryAfterDelay(request);

    // Phase 1 advance: lastOutputAt > baseline.
    setTimeout(() => buffer.append(SESSION_ID, 'echo of input\n'), 30);
    // Phase 2 advance: must be > firstAdvanceAt + 250ms (MIN_PROGRESS_GAP_MS).
    setTimeout(() => buffer.append(SESSION_ID, 'response part 1\n'), 350);

    const result = await promise;
    expect(result.status).toBe('confirmed');
    expect(result.retryAttempted).toBe(false);
  });

  it('returns no_signal when tail activity never advances', async () => {
    const buffer = new TerminalOutputBuffer();
    buffer.append(SESSION_ID, 'baseline only\n');

    const request = makeRequest(buffer);
    const result = await verifyDeliveryAfterDelay(request);
    expect(result.status).toBe('no_signal');
  });

  it('returns suspected_stuck when tail advances once but then stalls', async () => {
    const buffer = new TerminalOutputBuffer();
    buffer.append(SESSION_ID, 'baseline\n');

    const request = makeRequest(buffer);
    const promise = verifyDeliveryAfterDelay(request);

    // Single advance during phase 1 window; nothing further.
    setTimeout(() => buffer.append(SESSION_ID, 'echo of input\n'), 30);

    const result = await promise;
    expect(result.status).toBe('suspected_stuck');
  });

  it('returns unverifiable when getTerminalTail is unavailable', async () => {
    const request: DeliveryVerificationRequest = {
      sessionId: SESSION_ID,
      text: 'something',
      submitSuffix: '\r',
      delayMs: 0,
      ptyManager: {},
    };
    const result = await verifyDeliveryAfterDelay(request);
    expect(result.status).toBe('unverifiable');
  });

  it('returns unverifiable with "no payload delivered" when text and submitSuffix are empty', async () => {
    const buffer = new TerminalOutputBuffer();
    const request = makeRequest(buffer, { text: '', submitSuffix: '' });
    const result = await verifyDeliveryAfterDelay(request);
    expect(result.status).toBe('unverifiable');
    expect(result.detail).toContain('no payload delivered');
  });

  it('retryAttempted is always false', async () => {
    const buffer = new TerminalOutputBuffer();
    buffer.append(SESSION_ID, 'baseline\n');
    const request = makeRequest(buffer);
    const result = await verifyDeliveryAfterDelay(request);
    expect(result.retryAttempted).toBe(false);
  });
});
