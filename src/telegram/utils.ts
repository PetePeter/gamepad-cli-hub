/** Shared utility functions for the Telegram integration modules. */

/** Escape HTML special characters for Telegram HTML parse mode. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Strip ANSI escape codes and carriage returns from text. */
export function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')    // CSI sequences (colors, cursor)
    .replace(/\x1b\][^\x07]*\x07/g, '')         // OSC sequences (title changes)
    .replace(/\x1b[^[\]]/g, '')                  // Other escape sequences
    .replace(/\r/g, '');                          // Carriage returns
}
