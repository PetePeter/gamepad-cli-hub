import { logger } from '../utils/logger.js';
import type { TerminalTail } from './terminal-output-buffer.js';

/**
 * Delivery verification status.
 *
 * - confirmed: snippet appeared in tail and then disappeared (CLI consumed it and produced new output)
 * - suspected_stuck: snippet appeared but never left the tail within the budget (CLI received but hasn't responded)
 * - no_signal: snippet never appeared in the tail within the budget (likely never reached the CLI)
 * - unverifiable: terminal tail accessor unavailable, cannot determine delivery
 *
 * Retained legacy statuses (retry_confirmed/retry_failed) are no longer produced by this verifier but
 * remain in the union for downstream type compatibility during migration.
 */
export type DeliveryVerificationStatus =
  | 'confirmed'
  | 'suspected_stuck'
  | 'no_signal'
  | 'unverifiable'
  | 'retry_confirmed'
  | 'retry_failed';

export interface DeliveryVerificationRequest {
  sessionId: string;
  text: string;
  label?: string;
  /** Legacy field — ignored by the new seen→not-seen verifier. Kept for type compatibility. */
  delayMs?: number;
  /** Legacy field — ignored. The new verifier does not perform blind retries. */
  retrySubmit?: boolean;
  submitSuffix: string;
  deliveryContext?: 'background' | 'interactive';
  ptyManager: {
    getTerminalTail?: (sessionId: string, lines: number, mode: 'raw' | 'stripped' | 'both', stripBlankLines?: boolean) => TerminalTail;
    deliverText?: (sessionId: string, text: string, options?: { submitSuffix?: string; deliveryContext?: 'background' | 'interactive' }) => Promise<void>;
    write?: (sessionId: string, data: string) => void;
  };
}

export interface DeliveryVerificationResult {
  status: DeliveryVerificationStatus;
  sessionId: string;
  label?: string;
  detail: string;
  /** Legacy field — always false; the new verifier never retries blindly. */
  retryAttempted: boolean;
  /** Legacy field — represents total elapsed verification time. */
  delayMs: number;
}

interface VerificationSnapshot {
  text: string;
  lastOutputAt?: number;
}

// Number of tail lines to sample. Wider than the legacy 25 to give the snippet
// a better chance of being visible before busy output scrolls it away.
const VERIFY_TAIL_LINES = 50;

// Phase 1 — "seen": how long to wait for the snippet to appear in the tail.
const SEEN_TIMEOUT_MS = 8000;
// Phase 2 — "not seen": once seen, how long to wait for the snippet to scroll past / be consumed.
const NOT_SEEN_TIMEOUT_MS = 6000;
// Poll interval used in both phases.
const POLL_INTERVAL_MS = 200;

// Fast-path budgets used when the caller passes delayMs === 0 (typically tests). The verifier
// still runs the same seen→not-seen logic, but compresses the wait windows so unit tests don't
// stall on the full 14-second budget when their fake tails never change.
const FAST_SEEN_TIMEOUT_MS = 200;
const FAST_NOT_SEEN_TIMEOUT_MS = 200;
const FAST_POLL_INTERVAL_MS = 20;

/**
 * Capture a tail snapshot prior to delivery. The new verifier does not depend on this
 * for correctness (it polls live state), but the helper is retained so callers like
 * sequence-delivery can still pass a baseline through unchanged.
 */
export function captureDeliverySnapshot(request: Pick<DeliveryVerificationRequest, 'sessionId' | 'ptyManager'>): VerificationSnapshot | null {
  if (typeof request.ptyManager.getTerminalTail !== 'function') return null;
  const tail = request.ptyManager.getTerminalTail(request.sessionId, VERIFY_TAIL_LINES, 'stripped', false);
  return { text: tailToText(tail), lastOutputAt: tail.lastOutputAt };
}

/**
 * Seen→not-seen verification.
 *
 * Phase 1 polls the tail until the snippet appears (confirms the CLI's prompt buffer
 * actually echoed our text). Phase 2 keeps polling until the snippet has scrolled out
 * of the tail (confirms the CLI moved past our input — i.e. is generating a response).
 *
 * The `before` snapshot and `deliveredAt` parameters are accepted for signature stability
 * with the previous verifier but are not used in the new logic.
 */
export async function verifyDeliveryAfterDelay(
  request: DeliveryVerificationRequest,
  _before: VerificationSnapshot | null = null,
  _deliveredAt: number = Date.now(),
): Promise<DeliveryVerificationResult> {
  if (typeof request.ptyManager.getTerminalTail !== 'function') {
    return makeResult(request, 'unverifiable', 'terminal tail is unavailable', 0);
  }

  const snippets = deliverySnippets(request.text);
  if (snippets.length === 0) {
    return makeResult(request, 'unverifiable', 'no usable snippet derived from delivered text', 0);
  }

  const startedAt = Date.now();
  const fastMode = request.delayMs === 0;
  const seenBudget = fastMode ? FAST_SEEN_TIMEOUT_MS : SEEN_TIMEOUT_MS;
  const notSeenBudget = fastMode ? FAST_NOT_SEEN_TIMEOUT_MS : NOT_SEEN_TIMEOUT_MS;
  const pollInterval = fastMode ? FAST_POLL_INTERVAL_MS : POLL_INTERVAL_MS;

  // Phase 1: wait for the snippet to appear in the tail.
  const seenAt = await pollUntil(
    () => snippetPresent(request, snippets),
    true,
    seenBudget,
    pollInterval,
  );

  if (!seenAt) {
    const elapsed = Date.now() - startedAt;
    return makeResult(request, 'no_signal', `snippet never appeared in tail within ${seenBudget}ms`, elapsed);
  }

  // Phase 2: wait for the snippet to disappear from the tail.
  const goneAt = await pollUntil(
    () => snippetPresent(request, snippets),
    false,
    notSeenBudget,
    pollInterval,
  );

  const elapsed = Date.now() - startedAt;

  if (!goneAt) {
    return makeResult(
      request,
      'suspected_stuck',
      `snippet still visible in tail ${notSeenBudget}ms after being seen`,
      elapsed,
    );
  }

  return makeResult(request, 'confirmed', 'snippet appeared in tail and then moved past it', elapsed);
}

/**
 * Poll the predicate every `intervalMs` until it matches `expected` or the budget
 * is exhausted. Returns the timestamp at which the match occurred, or null on timeout.
 */
async function pollUntil(
  predicate: () => boolean,
  expected: boolean,
  budgetMs: number,
  intervalMs: number,
): Promise<number | null> {
  const deadline = Date.now() + budgetMs;
  // Always do an immediate first check before any sleep.
  if (predicate() === expected) return Date.now();
  while (Date.now() < deadline) {
    await wait(intervalMs);
    if (predicate() === expected) return Date.now();
  }
  return null;
}

/**
 * Probe the current tail for any of the candidate snippets.
 * Returns false on errors so the caller treats the probe as "not present" and keeps polling.
 */
function snippetPresent(request: DeliveryVerificationRequest, snippets: string[]): boolean {
  try {
    const tail = request.ptyManager.getTerminalTail?.(request.sessionId, VERIFY_TAIL_LINES, 'stripped', false);
    if (!tail) return false;
    const text = tailToText(tail);
    return snippets.some((snippet) => text.includes(snippet));
  } catch (err) {
    logger.warn(`[DeliveryVerification] tail probe failed for ${request.sessionId}: ${err}`);
    return false;
  }
}

function makeResult(
  request: DeliveryVerificationRequest,
  status: DeliveryVerificationStatus,
  detail: string,
  delayMs: number,
): DeliveryVerificationResult {
  return {
    status,
    sessionId: request.sessionId,
    ...(request.label ? { label: request.label } : {}),
    detail,
    retryAttempted: false,
    delayMs,
  };
}

/**
 * Build a small set of candidate snippets from the delivered text. Snippets are normalized
 * (control-token stripped, whitespace collapsed, capped at 96 chars) and filtered to those
 * long enough to be reasonably distinctive (>=18 chars).
 */
function deliverySnippets(text: string): string[] {
  const normalized = text
    .replace(/\{(?:Enter|Send|NoSend|NoEnter|Wait\s+\d+)\}/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return [];

  const candidates = [
    normalized.slice(0, 96),
    ...normalized.split(/(?<=\.)\s+|\n+/).map((part) => part.trim()).filter(Boolean),
  ];

  return [...new Set(candidates)]
    .map((candidate) => candidate.slice(0, 96))
    .filter((candidate) => candidate.length >= 18)
    .slice(0, 4);
}

function tailToText(tail: TerminalTail): string {
  return [
    ...(tail.stripped ?? []),
    ...(tail.raw ?? []),
  ].join('\n');
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
