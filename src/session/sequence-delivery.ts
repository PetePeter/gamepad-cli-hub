import { executeSequenceString } from '../input/sequence-executor.js';
import { parseSubmitSuffix } from '../mcp/submit-suffix.js';
import type { ConfigLoader } from '../config/loader.js';
import type { PtyManager } from './pty-manager.js';
import type { SessionManager } from './manager.js';

/**
 * Escape curly braces that are part of literal text (e.g. JSON) so the
 * sequence parser does not interpret them as sequence tokens.
 * The parser treats {{ and }} as literal braces.
 */
function escapeLiteralBraces(text: string): string {
  // Only escape { and } that are NOT already part of {{ or }} sequences,
  // and are NOT part of recognized tokens like {Enter}, {Wait 500}, etc.
  // Safe approach: escape all { and } that are NOT followed/preceded by
  // the same brace (which would be the escape sequence itself).
  return text
    .replace(/(?<!\{)\{(?!\{)/g, '{{')
    .replace(/(?<!\})\}(?!\})/g, '}}');
}

/**
 * Deliver prompt text through the sequence executor, honoring the recipient
 * CLI's configured submit suffix.
 *
 * This is the main-process counterpart of renderer/sequence-delivery.ts.
 * It enables {Send}, {NoSend}, {Wait} tokens in MCP inter-session text.
 * Literal curly braces in the text (e.g. JSON envelopes) are escaped to
 * prevent the sequence parser from consuming them.
 */
export async function deliverPromptSequenceToSession(input: {
  sessionId: string;
  text: string;
  ptyManager: PtyManager;
  sessionManager: SessionManager;
  configLoader: ConfigLoader;
  impliedSubmit?: boolean;
  /** When true, skip brace escaping (caller handles it). */
  rawInput?: boolean;
}): Promise<void> {
  const { sessionId, text, ptyManager, sessionManager, configLoader, impliedSubmit, rawInput } = input;
  const session = sessionManager.getSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  const cliEntry = configLoader.getCliTypeEntry(session.cliType);
  const submitSuffix = parseSubmitSuffix(cliEntry?.submitSuffix);

  // Escape literal braces so JSON and other content isn't consumed by the
  // sequence parser. Skip when the caller provides pre-parsed sequence input.
  const processedText = rawInput ? text : escapeLiteralBraces(text);

  await executeSequenceString({
    sessionId,
    input: processedText,
    write: (sid, data) => ptyManager.write(sid, data),
    deliverText: (sid, chunk) => ptyManager.deliverText(sid, chunk),
    submit: (sid) => ptyManager.write(sid, submitSuffix),
    impliedSubmit: impliedSubmit ?? true,
  });
}
