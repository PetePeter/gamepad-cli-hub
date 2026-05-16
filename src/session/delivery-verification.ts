import { logger } from '../utils/logger.js';
import type { TerminalTail } from './terminal-output-buffer.js';

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
  delayMs?: number;
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
  retryAttempted: boolean;
  delayMs: number;
}

interface VerificationSnapshot {
  text: string;
  lastOutputAt?: number;
}

const DEFAULT_VERIFY_DELAY_MS = 4000;
const VERIFY_TAIL_LINES = 25;
// Sessions with output within this window before delivery are considered "already active".
// In that case, output advancing after delivery is not proof the text was received as a new turn.
const SESSION_ACTIVE_THRESHOLD_MS = 3000;

export function captureDeliverySnapshot(request: Pick<DeliveryVerificationRequest, 'sessionId' | 'ptyManager'>): VerificationSnapshot | null {
  if (typeof request.ptyManager.getTerminalTail !== 'function') return null;
  const tail = request.ptyManager.getTerminalTail(request.sessionId, VERIFY_TAIL_LINES, 'both', false);
  return {
    text: tailToText(tail),
    lastOutputAt: tail.lastOutputAt,
  };
}

export async function verifyDeliveryAfterDelay(
  request: DeliveryVerificationRequest,
  before: VerificationSnapshot | null,
  deliveredAt = Date.now(),
): Promise<DeliveryVerificationResult> {
  const delayMs = request.delayMs ?? DEFAULT_VERIFY_DELAY_MS;
  if (typeof request.ptyManager.getTerminalTail !== 'function') {
    return makeResult(request, 'unverifiable', 'terminal tail is unavailable', false, delayMs);
  }

  await wait(delayMs);

  let result = classifyDelivery(request, before, deliveredAt, false, delayMs);
  if (result.status === 'confirmed' || !request.retrySubmit) return result;

  await retrySubmit(request);
  await wait(delayMs === 0 ? 0 : Math.max(750, Math.min(delayMs, 1500)));

  const retryResult = classifyDelivery(request, before, deliveredAt, true, delayMs);
  result = retryResult.status === 'confirmed'
    ? { ...retryResult, status: 'retry_confirmed', retryAttempted: true }
    : { ...retryResult, status: 'retry_failed', retryAttempted: true };

  return result;
}

function classifyDelivery(
  request: DeliveryVerificationRequest,
  before: VerificationSnapshot | null,
  deliveredAt: number,
  retryAttempted: boolean,
  delayMs: number,
): DeliveryVerificationResult {
  if (typeof request.ptyManager.getTerminalTail !== 'function') {
    return makeResult(request, 'unverifiable', 'terminal tail is unavailable', retryAttempted, delayMs);
  }

  const after = captureDeliverySnapshot(request);
  if (!after) {
    return makeResult(request, 'unverifiable', 'terminal tail returned no data', retryAttempted, delayMs);
  }

  const snippets = deliverySnippets(request.text);
  const containsDeliveredText = snippets.some((snippet) => after.text.includes(snippet));
  const hadSnippetBefore = snippets.some((snippet) => before?.text.includes(snippet));
  const deliveredTextAtTail = snippets.some((snippet) => isSnippetNearTail(after.text, snippet));
  const outputAdvanced = typeof after.lastOutputAt === 'number' && after.lastOutputAt >= deliveredAt;
  const tailChanged = before ? after.text !== before.text : after.text.trim().length > 0;
  const sessionWasAlreadyActive = typeof before?.lastOutputAt === 'number'
    && (deliveredAt - before.lastOutputAt) < SESSION_ACTIVE_THRESHOLD_MS;

  if ((outputAdvanced || tailChanged) && (!containsDeliveredText || hadSnippetBefore)) {
    if (sessionWasAlreadyActive && !hadSnippetBefore && !retryAttempted) {
      return makeResult(request, 'no_signal', 'session was already active; delivered text never confirmed in tail', retryAttempted, delayMs);
    }
    return makeResult(request, 'confirmed', 'terminal output advanced after delivery', retryAttempted, delayMs);
  }

  if (containsDeliveredText) {
    if (tailChanged && !deliveredTextAtTail) {
      return makeResult(request, 'confirmed', 'terminal output continued after delivered text', retryAttempted, delayMs);
    }
    return makeResult(request, 'suspected_stuck', 'delivered text is still visible in terminal tail', retryAttempted, delayMs);
  }

  if (tailChanged) {
    return makeResult(request, 'confirmed', 'terminal tail changed after delivery', retryAttempted, delayMs);
  }

  return makeResult(request, 'no_signal', 'no terminal output change after delivery', retryAttempted, delayMs);
}

async function retrySubmit(request: DeliveryVerificationRequest): Promise<void> {
  try {
    if (typeof request.ptyManager.deliverText === 'function') {
      await request.ptyManager.deliverText(request.sessionId, '', {
        submitSuffix: request.submitSuffix,
        ...(request.deliveryContext ? { deliveryContext: request.deliveryContext } : {}),
      });
      logger.warn(`[DeliveryVerification] Retried submit suffix for ${request.sessionId} (${request.label ?? 'delivery'})`);
      return;
    }
    request.ptyManager.write?.(request.sessionId, request.submitSuffix);
  } catch (error) {
    logger.warn(`[DeliveryVerification] Submit retry failed for ${request.sessionId}: ${error}`);
  }
}

function makeResult(
  request: DeliveryVerificationRequest,
  status: DeliveryVerificationStatus,
  detail: string,
  retryAttempted: boolean,
  delayMs: number,
): DeliveryVerificationResult {
  return {
    status,
    sessionId: request.sessionId,
    ...(request.label ? { label: request.label } : {}),
    detail,
    retryAttempted,
    delayMs,
  };
}

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

function isSnippetNearTail(text: string, snippet: string): boolean {
  const index = text.lastIndexOf(snippet);
  if (index < 0) return false;
  const rawTrailing = text.slice(index + snippet.length);
  if (/\n\s*\S/.test(rawTrailing)) return false;
  const trailing = rawTrailing.replace(/\s+/g, ' ').trim();
  return trailing.length < 80;
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
