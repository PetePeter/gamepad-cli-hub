/**
 * PTY output filter — strips escape sequences that interfere with
 * xterm.js native behaviour (e.g. mouse tracking, alternate scroll mode).
 *
 * Mouse tracking sequences cause xterm.js to forward mouse events to the
 * PTY instead of handling selection locally. Alternate scroll mode (1007)
 * converts mouse wheel into Up/Down arrow keys in the alternate screen
 * buffer, preventing scrollback navigation. Since this app is gamepad-driven,
 * we strip them so text selection and mouse wheel scrolling always work natively.
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

// Compound DEC mode sequences (semicolon-separated) that embed tracked modes
// e.g. \x1b[?1049;1007h → strip just the tracked mode number from the sequence
const COMPOUND_MODE_RE = /\x1b\[\?([\d;]+)[hl]/g;
const TRACKED_MODES = new Set(['1000', '1001', '1002', '1003', '1004', '1005', '1006', '1007', '1015', '1016']);

// Alternate screen buffer modes to strip (both enable 'h' and disable 'l')
// 47   = original alternate screen buffer
// 1047 = alternate screen buffer (xterm)
// 1048 = save/restore cursor (often paired with 1049)
// 1049 = alternate screen buffer + save/restore cursor (most common)
const ALT_SCREEN_RE = /\x1b\[\?(?:47|104[789])[hl]/g;

// ED 3 — erase scrollback buffer. Stripping this prevents CLIs from
// clearing the scrollback that we're trying to preserve.
const ERASE_SCROLLBACK_RE = /\x1b\[3J/g;

const ALT_SCREEN_MODES = new Set(['47', '1047', '1048', '1049']);

/**
 * Strip alternate screen buffer sequences and scrollback-clear (ED 3).
 * Keeps CLI output in the normal buffer so xterm.js scrollback works.
 */
export function stripAltScreen(data: string): string {
  let result = data.replace(ALT_SCREEN_RE, '');
  result = result.replace(ERASE_SCROLLBACK_RE, '');

  // Handle compound sequences like \x1b[?1049;25h — strip just alt screen modes
  result = result.replace(COMPOUND_MODE_RE, (match, modes: string) => {
    const modeList = modes.split(';');
    const kept = modeList.filter((m: string) => !ALT_SCREEN_MODES.has(m));
    if (kept.length === modeList.length) return match;
    if (kept.length === 0) return '';
    return `\x1b[?${kept.join(';')}${match[match.length - 1]}`;
  });

  return result;
}

export function stripMouseTracking(data: string): string {
  // First pass: strip single-mode sequences (fast path)
  let result = data.replace(MOUSE_TRACKING_RE, '');

  // Second pass: handle compound sequences like \x1b[?1049;1007h
  result = result.replace(COMPOUND_MODE_RE, (match, modes: string, offset: number, str: string) => {
    const modeList = modes.split(';');
    const kept = modeList.filter(m => !TRACKED_MODES.has(m));
    if (kept.length === modeList.length) return match; // nothing to strip
    if (kept.length === 0) return ''; // all modes stripped
    return `\x1b[?${kept.join(';')}${match[match.length - 1]}`; // preserve h/l suffix
  });

  return result;
}
