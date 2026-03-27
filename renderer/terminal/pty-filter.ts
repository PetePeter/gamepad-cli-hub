/**
 * PTY output filter — strips escape sequences that interfere with
 * xterm.js native behaviour (e.g. mouse tracking).
 *
 * Mouse tracking sequences cause xterm.js to forward mouse events to the
 * PTY instead of handling selection locally. Since this app is gamepad-driven,
 * we strip them so text selection always works natively.
 */

// Mouse tracking DEC private mode codes to strip (both enable 'h' and disable 'l')
// 1000 = X10 mouse reporting
// 1001 = VT200 highlight tracking
// 1002 = Button-event tracking
// 1003 = Any-event tracking
// 1004 = Focus event reporting
// 1005 = UTF-8 mouse mode
// 1006 = SGR mouse mode
// 1015 = URXVT mouse mode
// 1016 = SGR pixel mouse mode
const MOUSE_TRACKING_RE = /\x1b\[\?(?:100[0-6]|101[56])[hl]/g;

export function stripMouseTracking(data: string): string {
  return data.replace(MOUSE_TRACKING_RE, '');
}
