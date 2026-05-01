import { executeSequenceString } from '../src/input/sequence-executor.js';
import { deliverBulkText, parseSubmitSuffix } from './paste-handler.js';
import { state } from './state.js';

function getSubmitSuffix(sessionId: string): string {
  const session = state.sessions.find(s => s.id === sessionId);
  const configured = session ? state.cliToolsCache?.[session.cliType]?.submitSuffix : undefined;
  return configured ? parseSubmitSuffix(configured) : '\r';
}

/**
 * Execute command-aware prompt text for a renderer terminal session.
 *
 * Text chunks flow through the configured paste provider. {Send}, {Enter}, and
 * the implied final submit use the receiving CLI's configured submit suffix.
 */
export async function deliverPromptSequence(sessionId: string, input: string): Promise<void> {
  await executeSequenceString({
    sessionId,
    input,
    write: (sid, data) => window.gamepadCli.ptyWrite(sid, data),
    deliverText: (sid, text) => deliverBulkText(sid, text),
    submit: (sid) => window.gamepadCli.ptyWrite(sid, getSubmitSuffix(sid)),
  });
}
