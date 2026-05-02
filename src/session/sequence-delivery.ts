import { executeSequenceString } from '../input/sequence-executor.js';
import { parseSubmitSuffix } from '../mcp/submit-suffix.js';
import type { ConfigLoader } from '../config/loader.js';
import type { PtyManager } from './pty-manager.js';
import type { SessionManager } from './manager.js';

/** Token patterns the sequence parser recognizes as actions, not literal text. */
const RECOGNIZED_TOKEN_PATTERNS = [
  /^(NoSend|NoEnter)$/i,
  /^Wait\s+\d+$/i,
  /^\S+\s+(Down|Up)$/i,
  /.+\+.+/, // combos like Ctrl+C
];

/** Key names the sequence parser resolves to PTY escape sequences. */
const CANONICAL_KEYS = new Set([
  'enter', 'send', 'tab', 'esc', 'escape', 'space', 'backspace', 'delete',
  'up', 'down', 'right', 'left', 'arrowup', 'arrowdown', 'arrowright', 'arrowleft',
  'home', 'end', 'pageup', 'pagedown', 'insert', 'capslock', 'printscreen',
]);

/** Check whether a brace-group content string is a recognized Helm sequence token. */
function isRecognizedToken(token: string): boolean {
  if (!token) return false;
  for (const re of RECOGNIZED_TOKEN_PATTERNS) {
    if (re.test(token)) return true;
  }
  if (/^F\d+$/i.test(token)) return true;
  if (CANONICAL_KEYS.has(token.toLowerCase())) return true;
  return false;
}

/**
 * Escape brace groups that are NOT recognized Helm sequence tokens.
 * Recognized tokens like {Send}, {NoSend}, {Wait 500}, {Ctrl+C} are preserved.
 * Unrecognized groups like {"type":"test"} or {variable} have their braces
 * escaped to {{/}} so they render as literal text through the sequence parser.
 */
function escapeUnrecognizedBraces(text: string): string {
  return text.replace(/\{([^{}]*)\}/g, (match, content) => {
    return isRecognizedToken(content) ? match : '{{' + content + '}}';
  });
}

/**
 * Deliver prompt text through the sequence executor, honoring the recipient
 * CLI's configured submit suffix.
 *
 * This is the main-process counterpart of renderer/sequence-delivery.ts.
 * It enables {Send}, {NoSend}, {Wait} tokens in MCP inter-session text.
 * Literal curly braces in the text (e.g. JSON envelopes) are smart-escaped:
 * recognized tokens are preserved, unrecognized brace groups are escaped.
 */
export async function deliverPromptSequenceToSession(input: {
  sessionId: string;
  text: string;
  ptyManager: PtyManager;
  sessionManager: SessionManager;
  configLoader: ConfigLoader;
  impliedSubmit?: boolean;
}): Promise<void> {
  const { sessionId, text, ptyManager, sessionManager, configLoader, impliedSubmit } = input;
  const session = sessionManager.getSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  const cliEntry = configLoader.getCliTypeEntry(session.cliType);
  const submitSuffix = parseSubmitSuffix(cliEntry?.submitSuffix);

  const processedText = escapeUnrecognizedBraces(text);

  await executeSequenceString({
    sessionId,
    input: processedText,
    write: (sid, data) => ptyManager.write(sid, data),
    deliverText: (sid, chunk) => ptyManager.deliverText(sid, chunk),
    submit: (sid) => ptyManager.write(sid, submitSuffix),
    impliedSubmit: impliedSubmit ?? true,
  });
}
