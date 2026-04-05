/**
 * Strip ANSI escape sequences from text.
 * Shared between main process (notifications) and renderer (output buffer).
 */
const ANSI_RE = /\x1b(?:\[[0-9;]*[a-zA-Z]|\][^\x07]*\x07|\[[?][0-9;]*[hlsru]|\(B)/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}
