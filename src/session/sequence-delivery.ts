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
 * Handles nested braces (JSON, code) by tracking depth and escaping
 * the outermost unmatched group. Recognized tokens like {Send}, {NoSend},
 * {Wait 500}, {Ctrl+C} are preserved. Unrecognized groups have their outer
 * braces escaped to {{/}} so they render as literal text through the parser.
 */
function escapeUnrecognizedBraces(text: string): string {
  let result = '';
  let i = 0;

  while (i < text.length) {
    if (text[i] === '{') {
      // Find matching closing brace by tracking raw depth
      const start = i;
      let depth = 1;
      let j = i + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') depth--;
        if (depth > 0) j++;
      }

      if (depth !== 0) {
        // Unmatched brace — emit as-is
        result += text.slice(start);
        break;
      }

      const content = text.slice(start + 1, j);

      if (isRecognizedToken(content)) {
        // Recognized token — preserve as-is
        result += text.slice(start, j + 1);
      } else {
        // Escape outer braces to {{/}}, recursively process inner content
        const inner = escapeUnrecognizedBraces(content);
        result += '{{' + inner + '}}';
      }

      i = j + 1;
    } else {
      result += text[i];
      i++;
    }
  }

  return result;
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
    submit: (sid) => ptyManager.deliverText(sid, '', { submitSuffix }),
    impliedSubmit: impliedSubmit ?? true,
  });
}
