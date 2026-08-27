import type { TerminalView } from './terminal-view.js';

export interface PtyResize {
  (sessionId: string, cols: number, rows: number): unknown;
}

export interface FitAndSyncOptions {
  /** Number of delayed retries when the host is still not measurable. */
  maxRetries?: number;
  /** Delay between retries after the layout has produced zero dimensions. */
  retryDelayMs?: number;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 100;

function afterLayout(callback: () => void): number {
  return requestAnimationFrame(() => requestAnimationFrame(callback));
}

/**
 * Fit a terminal after its host has settled and keep the PTY dimensions in
 * lockstep with xterm. TerminalView registers its onResize listener before
 * fitting, so changed dimensions are sent by xterm; unchanged dimensions are
 * explicitly sent here because the PTY may still hold the other window's size.
 *
 * The returned cancel function invalidates all scheduled work. This matters
 * when a rapid session switch or snap-back supersedes an older fit request.
 */
export function fitAndSyncPty(
  sessionId: string,
  view: TerminalView,
  ptyResize: PtyResize,
  options: FitAndSyncOptions = {},
): () => void {
  const maxRetries = Math.max(0, options.maxRetries ?? DEFAULT_MAX_RETRIES);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
  let cancelled = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const run = (attempt: number): void => {
    if (cancelled) return;

    const beforeFit = view.getDimensions();
    view.fit();
    const afterFit = view.getDimensions();

    if (afterFit.cols > 0 && afterFit.rows > 0) {
      // A changed fit already invokes TerminalView's onResize callback. Force
      // only the unchanged case so normal resize does not produce duplicate
      // PTY resizes while snap-back still receives an unconditional sync.
      if (beforeFit.cols === afterFit.cols && beforeFit.rows === afterFit.rows) {
        ptyResize(sessionId, afterFit.cols, afterFit.rows);
      }
      return;
    }

    if (attempt >= maxRetries) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (cancelled) return;
      afterLayout(() => run(attempt + 1));
    }, retryDelayMs);
  };

  afterLayout(() => run(0));

  return () => {
    cancelled = true;
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };
}
