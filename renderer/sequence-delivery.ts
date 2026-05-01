import { executeSequenceString } from '../src/input/sequence-executor.js';
import { deliverBulkText } from './paste-handler.js';

/**
 * Execute command-aware prompt text for a renderer terminal session.
 *
 * This is the renderer bridge between UI-authored PromptTextarea content and
 * the shared sequence executor. Plain text still flows through deliverBulkText;
 * syntax tokens such as {Send}, {Wait 500}, and {Ctrl+C} are handled by the
 * common executor.
 */
export async function deliverPromptSequence(sessionId: string, input: string): Promise<void> {
  await executeSequenceString({
    sessionId,
    input,
    write: (sid, data) => window.gamepadCli.ptyWrite(sid, data),
    deliverText: (sid, text) => deliverBulkText(sid, text),
  });
}
