import { executeSequenceString } from '../src/input/sequence-executor.js';
import type { DeliveryContext, PtyWriteOptions } from '../src/session/delivery-context.js';
import { terminalClient } from './ipc/clients.js';
import { deliverBulkText, parseSubmitSuffix } from './paste-handler.js';
import { state } from './state.js';

function getSubmitSuffix(sessionId: string): string {
  const session = state.sessions.find(s => s.id === sessionId);
  const configured = session ? state.cliToolsCache?.[session.cliType]?.submitSuffix : undefined;
  return configured ? parseSubmitSuffix(configured) : '\r';
}

function writePty(sessionId: string, data: string, options?: PtyWriteOptions): Promise<unknown> {
  return options
    ? terminalClient.ptyWrite(sessionId, data, options)
    : terminalClient.ptyWrite(sessionId, data);
}

/**
 * Execute command-aware prompt text for a renderer terminal session.
 *
 * Text chunks flow through the configured paste provider. {Send}, {Enter}, and
 * the implied final submit use the receiving CLI's configured submit suffix.
 */
export async function deliverPromptSequence(sessionId: string, input: string, options?: { deliveryContext?: DeliveryContext }): Promise<void> {
  const deliveryContext = options?.deliveryContext ?? 'interactive';
  const ptyWriteOptions: PtyWriteOptions | undefined = deliveryContext === 'background'
    ? { inputOrigin: 'programmatic' }
    : undefined;
  await executeSequenceString({
    sessionId,
    input,
    write: (sid, data) => writePty(sid, data, ptyWriteOptions),
    deliverText: (sid, text) => deliverBulkText(sid, text, { deliveryContext }),
    submit: (sid) => writePty(sid, getSubmitSuffix(sid), ptyWriteOptions),
  });
}
