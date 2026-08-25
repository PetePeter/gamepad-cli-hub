/**
 * Tracks DEC private mode 2004 (bracketed paste) per session by watching PTY output.
 *
 * The renderer can ask xterm.js whether the mode is on, but a session that was
 * never opened in the UI has no xterm — and that is exactly the session whose
 * multi-line deliveries were being submitted line-by-line. This gives the main
 * process its own source of truth, derived from the same bytes the CLI sent.
 *
 * Scanning is incremental because node-pty chunks output wherever it likes:
 * `ESC[?2004h` genuinely arrives as `ESC[?20` + `04h`. A bounded suffix of the
 * previous chunk is carried forward so a straddling sequence still matches; a
 * per-chunk regex would silently miss it.
 */

/** `ESC[?2004h` / `ESC[?2004l` — the only sequences this scanner cares about. */
const MODE_PATTERN = /\x1b\[\?2004([hl])/g;

/**
 * Longest sequence we must be able to match, and therefore how much tail we
 * carry. Carrying one byte less than a full sequence means the carry can never
 * contain a complete match on its own, so no transition is counted twice.
 */
const SEQUENCE_LENGTH = '\x1b[?2004h'.length;
const CARRY_LENGTH = SEQUENCE_LENGTH - 1;

export class BracketedPasteTracker {
  private enabled = new Map<string, boolean>();
  private carry = new Map<string, string>();

  /** Feed a chunk of PTY output for a session. */
  observe(sessionId: string, chunk: string): void {
    if (!chunk) return;

    const scanned = (this.carry.get(sessionId) ?? '') + chunk;

    MODE_PATTERN.lastIndex = 0;
    let last: RegExpExecArray | null = null;
    let match: RegExpExecArray | null;
    while ((match = MODE_PATTERN.exec(scanned)) !== null) last = match;

    if (last) this.enabled.set(sessionId, last[1] === 'h');

    this.carry.set(sessionId, scanned.slice(-CARRY_LENGTH));
  }

  /** Whether the session's CLI currently has bracketed paste enabled. */
  isEnabled(sessionId: string): boolean {
    return this.enabled.get(sessionId) ?? false;
  }

  /** Forget a session — its id may be reused by a fresh spawn. */
  clear(sessionId: string): void {
    this.enabled.delete(sessionId);
    this.carry.delete(sessionId);
  }

  /** Forget every session. */
  clearAll(): void {
    this.enabled.clear();
    this.carry.clear();
  }

  /** Size of the retained partial sequence — exposed so tests can pin the bound. */
  getCarryLength(sessionId: string): number {
    return this.carry.get(sessionId)?.length ?? 0;
  }
}
