/**
 * PTY output filter — strips escape sequences that interfere with
 * xterm.js native behaviour.
 *
 * Alternate screen stripping keeps CLI output in the normal scrollback buffer.
 * ED 3 (erase scrollback) is also stripped to preserve the buffer.
 *
 * Mouse tracking and scroll events are now handled natively by xterm.js v6 —
 * no longer stripped.
 */

// Alternate screen buffer modes to strip (both enable 'h' and disable 'l')
// 47   = original alternate screen buffer
// 1047 = alternate screen buffer (xterm)
// 1048 = save/restore cursor (often paired with 1049)
// 1049 = alternate screen buffer + save/restore cursor (most common)
const ALT_SCREEN_RE = /\x1b\[\?(?:47|104[789])[hl]/g;
const ALT_SCREEN_MODES = new Set(['47', '1047', '1048', '1049']);

// ED 3 — erase scrollback buffer
const ERASE_SCROLLBACK_RE = /\x1b\[3J/g;

// Compound DEC mode sequences (semicolon-separated) that may embed
// modes we need to strip (e.g. \x1b[?1049;1007h)
const COMPOUND_MODE_RE = /\x1b\[\?([\d;]+)[hl]/g;

// Escape sequence detection for fast-path checks
const HAS_DEC_PRIVATE = '\x1b[?';
const HAS_ED3 = '\x1b[3J';

export interface PtyFilterOptions {
  stripAltScreen?: boolean;
}

/**
 * Apply all PTY output filters in a single pass.
 * Conditionally strips alt screen sequences.
 */
export function applyPtyFilters(data: string, opts?: PtyFilterOptions): string {
  const doAltScreen = opts?.stripAltScreen ?? false;

  if (!doAltScreen) return data;

  // Fast path: if no DEC private mode or ED sequences, nothing to filter
  const hasDec = data.includes(HAS_DEC_PRIVATE);
  const hasEd3 = data.includes(HAS_ED3);

  if (!hasDec && !hasEd3) return data;

  let result = data;

  // Strip single-mode alt screen sequences
  if (hasDec) result = result.replace(ALT_SCREEN_RE, '');

  // Strip ED 3 (erase scrollback)
  if (hasEd3) result = result.replace(ERASE_SCROLLBACK_RE, '');

  // Single compound-mode pass: strip alt screen modes from compound sequences
  if (hasDec) {
    result = result.replace(COMPOUND_MODE_RE, (match, modes: string) => {
      const modeList = modes.split(';');
      const kept = modeList.filter(m => !ALT_SCREEN_MODES.has(m));
      if (kept.length === modeList.length) return match;
      if (kept.length === 0) return '';
      return `\x1b[?${kept.join(';')}${match[match.length - 1]}`;
    });
  }

  return result;
}

/**
 * Strip alternate screen buffer, scrollback-clear (ED 3).
 * Keeps CLI output in the normal buffer so xterm.js scrollback works.
 */
export function stripAltScreen(data: string): string {
  return applyPtyFilters(data, { stripAltScreen: true });
}
