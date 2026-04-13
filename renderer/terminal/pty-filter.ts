/**
 * PTY output filter — strips escape sequences that interfere with
 * xterm.js native behaviour (e.g. mouse tracking, alternate scroll mode).
 *
 * Mouse tracking sequences cause xterm.js to forward mouse events to the
 * PTY instead of handling selection locally. Alternate scroll mode (1007)
 * converts mouse wheel into Up/Down arrow keys in the alternate screen
 * buffer, preventing scrollback navigation. Since this app is gamepad-driven,
 * we strip them so text selection and mouse wheel scrolling always work natively.
 *
 * Alternate screen stripping keeps CLI output in the normal scrollback buffer.
 * ED 3 (erase scrollback) is also stripped to preserve the buffer.
 * TerminalView tracks alt screen enter/exit BEFORE stripping via
 * updateVirtualAltScreen() — this lets scroll input route to the CLI
 * (PageUp/Down) during TUI mode instead of scrolling the viewport.
 */

// DEC private mode codes to strip (both enable 'h' and disable 'l')
// 1000 = X10 mouse reporting
// 1001 = VT200 highlight tracking
// 1002 = Button-event tracking
// 1003 = Any-event tracking
// 1004 = Focus event reporting
// 1005 = UTF-8 mouse mode
// 1006 = SGR mouse mode
// 1007 = Alternate scroll mode (wheel → arrow keys in alt buffer)
// 1015 = URXVT mouse mode
// 1016 = SGR pixel mouse mode
const MOUSE_TRACKING_RE = /\x1b\[\?(?:100[0-7]|101[56])[hl]/g;
const MOUSE_MODES = new Set(['1000', '1001', '1002', '1003', '1004', '1005', '1006', '1007', '1015', '1016']);

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
 * Always strips mouse tracking. Conditionally strips alt screen sequences.
 */
export function applyPtyFilters(data: string, opts?: PtyFilterOptions): string {
  const doAltScreen = opts?.stripAltScreen ?? false;

  // Fast path: if no DEC private mode or ED sequences, nothing to filter
  const hasDec = data.includes(HAS_DEC_PRIVATE);
  const hasEd3 = doAltScreen && data.includes(HAS_ED3);

  if (!hasDec && !hasEd3) return data;

  let result = data;

  // Strip single-mode mouse tracking sequences
  if (hasDec) result = result.replace(MOUSE_TRACKING_RE, '');

  // Strip single-mode alt screen sequences
  if (doAltScreen && hasDec) result = result.replace(ALT_SCREEN_RE, '');

  // Strip ED 3 (erase scrollback)
  if (hasEd3) result = result.replace(ERASE_SCROLLBACK_RE, '');

  // Single compound-mode pass: strip both mouse AND alt screen modes
  if (hasDec) {
    result = result.replace(COMPOUND_MODE_RE, (match, modes: string) => {
      const modeList = modes.split(';');
      const kept = modeList.filter(m =>
        !MOUSE_MODES.has(m) && !(doAltScreen && ALT_SCREEN_MODES.has(m))
      );
      if (kept.length === modeList.length) return match;
      if (kept.length === 0) return '';
      return `\x1b[?${kept.join(';')}${match[match.length - 1]}`;
    });
  }

  return result;
}

/** Strip mouse tracking sequences only. */
export function stripMouseTracking(data: string): string {
  return applyPtyFilters(data);
}

/**
 * Strip alternate screen buffer, scrollback-clear (ED 3), and mouse tracking.
 * Keeps CLI output in the normal buffer so xterm.js scrollback works.
 */
export function stripAltScreen(data: string): string {
  return applyPtyFilters(data, { stripAltScreen: true });
}
