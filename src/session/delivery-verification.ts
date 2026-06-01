import { logger } from '../utils/logger.js';

/**
 * Delivery verification status.
 *
 * - confirmed: tail's lastOutputAt advanced twice after delivery (CLI received and is generating)
 * - suspected_stuck: tail advanced once (initial echo) but never advanced again (CLI received, no progress)
 * - no_signal: tail's lastOutputAt never advanced from baseline (likely never reached the CLI)
 * - unverifiable: terminal tail accessor unavailable or empty payload, cannot determine delivery
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
  /** Legacy field — ignored by the new activity-timestamp verifier. Kept for type compatibility. */
  delayMs?: number;
  /** Legacy field — ignored. The new verifier does not perform blind retries. */
  retrySubmit?: boolean;
  submitSuffix: string;
  deliveryContext?: 'background' | 'interactive';
  ptyManager: {
    getTerminalTail?: (sessionId: string, lines: number, mode: 'raw' | 'stripped' | 'both', stripBlankLines?: boolean) => { lastOutputAt?: number } | undefined;
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

// Phase 1 — "seen": how long to wait for the first lastOutputAt advance.
const SEEN_TIMEOUT_MS = 8000;
// Phase 2 — "moved past": after the first advance, how long to wait for another advance.
const NOT_SEEN_TIMEOUT_MS = 6000;
// Poll interval used in both phases.
const POLL_INTERVAL_MS = 200;

// Minimum gap between first and second advance — a single fresh tick after the
// initial echo confirms the CLI is actually generating output, not just echoing input.
const MIN_PROGRESS_GAP_MS = 250;

// Fast-path budgets used when the caller passes delayMs === 0 (typically tests). Same
// seen→moved-past logic, compressed windows so unit tests don't stall on the full budget.
const FAST_SEEN_TIMEOUT_MS = 200;
const FAST_NOT_SEEN_TIMEOUT_MS = 600;
const FAST_POLL_INTERVAL_MS = 20;

/**
 * Activity-timestamp delivery verification.
 *
 * Phase 1 polls the tail's `lastOutputAt` until it advances past the baseline
 * (confirms *some* output happened after delivery — typically the echo of our input).
 * Phase 2 keeps polling until `lastOutputAt` advances again past the first-advance
 * timestamp (confirms the CLI moved past the echo — i.e. is generating a response).
 *
 * Why timestamps instead of substring matching: TUI CLIs (Claude Code, etc.) draw
 * user input via ANSI boxes, so the delivered text rarely appears as a literal
 * substring in the stripped tail. The lastOutputAt timestamp is a reliable signal
 * that the PTY emitted bytes — regardless of how they render.
 *
 * The `_before` and `_deliveredAt` parameters are accepted for signature stability
 * with the previous verifier but are not used in the new logic.
 */
export async function verifyDeliveryAfterDelay(
  request: DeliveryVerificationRequest,
  _before?: unknown,
  _deliveredAt?: number,
): Promise<DeliveryVerificationResult> {
  if (typeof request.ptyManager.getTerminalTail !== 'function') {
    return makeResult(request, 'unverifiable', 'terminal tail is unavailable', 0);
  }

  if (!request.text && !request.submitSuffix) {
    return makeResult(request, 'unverifiable', 'no payload delivered', 0);
  }

  const fastMode = request.delayMs === 0;
  const seenBudget = fastMode ? FAST_SEEN_TIMEOUT_MS : SEEN_TIMEOUT_MS;
  const notSeenBudget = fastMode ? FAST_NOT_SEEN_TIMEOUT_MS : NOT_SEEN_TIMEOUT_MS;
  const pollInterval = fastMode ? FAST_POLL_INTERVAL_MS : POLL_INTERVAL_MS;

  const startedAt = Date.now();
  // Baseline: default to "just before now" so any tick at-or-after startedAt counts as advanced.
  const baselineOutputAt = currentLastOutputAt(request) ?? (startedAt - 1);

  // Phase 1: wait for lastOutputAt to advance past the baseline.
  const seenAt = await pollUntil(
    () => {
      const v = currentLastOutputAt(request);
      return v !== undefined && v > baselineOutputAt;
    },
    seenBudget,
    pollInterval,
  );

  if (!seenAt) {
    const elapsed = Date.now() - startedAt;
    return makeResult(request, 'no_signal', `tail activity never advanced within ${seenBudget}ms`, elapsed);
  }

  const firstAdvanceAt = currentLastOutputAt(request) ?? seenAt;

  // Phase 2: wait for lastOutputAt to advance again, past firstAdvanceAt + MIN_PROGRESS_GAP_MS.
  const movedPastAt = await pollUntil(
    () => {
      const v = currentLastOutputAt(request);
      return v !== undefined && v > firstAdvanceAt + MIN_PROGRESS_GAP_MS;
    },
    notSeenBudget,
    pollInterval,
  );

  const elapsed = Date.now() - startedAt;

  if (!movedPastAt) {
    return makeResult(
      request,
      'suspected_stuck',
      `tail activity stalled after initial advance for ${notSeenBudget}ms`,
      elapsed,
    );
  }

  return makeResult(request, 'confirmed', 'tail activity advanced twice — CLI is producing output', elapsed);
}

/**
 * Probe the current tail's lastOutputAt timestamp. Returns undefined on probe
 * failure so the caller treats it as "no activity yet" and keeps polling.
 */
function currentLastOutputAt(request: DeliveryVerificationRequest): number | undefined {
  try {
    const tail = request.ptyManager.getTerminalTail?.(request.sessionId, 1, 'stripped', false);
    return tail?.lastOutputAt;
  } catch (err) {
    logger.warn(`[DeliveryVerification] tail probe failed for ${request.sessionId}: ${err}`);
    return undefined;
  }
}

/**
 * Poll the predicate every `intervalMs` until it returns true or the budget
 * is exhausted. Returns the timestamp at which it matched, or null on timeout.
 */
async function pollUntil(
  predicate: () => boolean,
  budgetMs: number,
  intervalMs: number,
): Promise<number | null> {
  const deadline = Date.now() + budgetMs;
  if (predicate()) return Date.now();
  while (Date.now() < deadline) {
    await wait(intervalMs);
    if (predicate()) return Date.now();
  }
  return null;
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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
