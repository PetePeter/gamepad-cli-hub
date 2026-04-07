/** Shared utility functions for the Telegram integration modules. */

/** Escape HTML special characters for Telegram HTML parse mode. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Strip ANSI escape codes from raw terminal data. */
export function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')    // CSI sequences (colors, cursor)
    .replace(/\x1b\[[?][0-9;]*[a-zA-Z]/g, '') // Private-mode CSI (?25h, ?25l etc.)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '') // Complete OSC sequences
    .replace(/\x1b\][^\x07\x1b]*/g, '')       // Incomplete/partial OSC
    .replace(/\x1b[^[\]]/g, '');               // Other escape sequences
}

/** Noise patterns to remove from terminal output before sending to Telegram. */
const NOISE_PATTERNS: RegExp[] = [
  /^.*esc to cancel.*$/gim,
  /^.*press escape to cancel.*$/gim,
  /^.*\bthinking\b\.{0,3}\s*$/gim,
  /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏].*$/gm,              // Braille spinner lines (must start with spinner char)
  /^[-\\|/]\s*$/gm,                            // ASCII spinner frames (single char lines)
  /^AIAGENT-\w+\s*$/gm,                        // State tags (already handled by StateDetector)
];

/**
 * Clean raw terminal output for Telegram display.
 *
 * 1. Strip ANSI escape codes
 * 2. Normalize \r\n to \n (Windows line endings)
 * 3. Simulate standalone \r as line overwrite (collapses spinner frames)
 * 4. Handle backspace characters
 * 5. Strip control characters (BEL, etc.)
 * 6. Remove known CLI noise lines (spinners, "thinking", "esc to cancel")
 * 7. Collapse excessive blank lines
 */
export function cleanTerminalOutput(raw: string): string {
  let text = stripAnsi(raw);

  // Normalize Windows line endings before simulating standalone \r
  text = text.replace(/\r\n/g, '\n');

  // Simulate standalone \r as line overwriting: \r discards everything before it
  // Trailing \r (no content after) preserves the line content
  text = text.split('\n').map(line => {
    if (!line.includes('\r')) return line;
    const parts = line.split('\r');
    // Take last non-empty segment (trailing \r leaves empty last part)
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i] !== '') return parts[i];
    }
    return '';
  }).join('\n');

  // Simulate backspace: each \b deletes one preceding character
  while (text.includes('\b')) {
    text = text.replace(/[^\b]\b/g, '');
    text = text.replace(/\b/g, '');
  }

  // Strip remaining control characters (BEL, NUL, etc.) but keep \n and \t
  text = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');

  // Remove noise lines
  for (const pattern of NOISE_PATTERNS) {
    text = text.replace(pattern, '');
  }

  // Collapse runs of 3+ blank lines into 2
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}
