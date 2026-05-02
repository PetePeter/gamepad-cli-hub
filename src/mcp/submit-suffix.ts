/**
 * Convert escape notation strings to actual characters.
 * Supports: \r (CR), \n (LF), \t (TAB), \r\n (CRLF)
 */
export function parseSubmitSuffix(suffix?: string): string {
  if (!suffix) return '\r';
  if (suffix === '\\r') return '\r';
  if (suffix === '\\n') return '\n';
  if (suffix === '\\t') return '\t';
  if (suffix === '\\r\\n') return '\r\n';
  return suffix;
}
