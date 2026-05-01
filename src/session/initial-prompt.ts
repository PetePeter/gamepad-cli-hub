import { parseSequence } from '../input/sequence-parser.js';
import { executeSequenceString } from '../input/sequence-executor.js';
import { logger } from '../utils/logger.js';
import type { SequenceListItem } from '../config/loader.js';

export interface InitialPromptConfig {
  initialPrompt?: SequenceListItem[];
  initialPromptDelay?: number;
  helmInitialPrompt?: boolean;
  renameCommand?: string;
}

export const HELM_INIT_SEQUENCE = 'Call session_info to get Helm MCP AIAGENT state registry. Then immediately call session_set_aiagent_state for this session whenever your phase changes: planning before investigation, implementing before edits or tests, completed when done. If a Helm plan is assigned, claim it before implementation with plan_set_state status=coding and sessionId, then call session_set_working_plan. Output AIAGENT-* state as the first line of each response.{Enter}';

export function scheduleInitialPrompt(
  sessionId: string,
  config: InitialPromptConfig,
  writeToPty: (sessionId: string, data: string) => void,
  deliverTextOrOnComplete?: ((sessionId: string, text: string) => Promise<void>) | (() => void),
  onComplete?: () => void,
): (() => void) | null {
  const { initialPrompt, initialPromptDelay = 2000 } = config;
  const promptItems = [
    ...(config.helmInitialPrompt ? [{ label: 'Helm session init', sequence: HELM_INIT_SEQUENCE }] : []),
    ...(initialPrompt ?? []),
  ];

  const deliverText = onComplete
    ? (deliverTextOrOnComplete as ((sessionId: string, text: string) => Promise<void>) | undefined)
    : undefined;

  const complete = onComplete ?? (deliverTextOrOnComplete as (() => void) | undefined);
  const deliver = deliverText ?? (async (sid: string, text: string) => { writeToPty(sid, text); });

  if (promptItems.length === 0 && !config.renameCommand) {
    return null;
  }

  let cancelled = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const executeItem = async (item: SequenceListItem) => {
    if (cancelled || !item.sequence || item.sequence.trim() === '') return;

    await executeSequenceString({
      sessionId,
      input: item.sequence,
      write: writeToPty,
      deliverText: deliver,
      isCancelled: () => cancelled,
    });
  };

  const execute = async () => {
    if (cancelled) return;

    if (promptItems.length > 0) {
      logger.info(`[InitialPrompt] Pre-loading ${promptItems.length} item(s) for session ${sessionId}`);

      for (const item of promptItems) {
        if (cancelled) break;
        if (!item) continue;
        await executeItem(item);
      }
    }

    if (!cancelled && config.renameCommand) {
      logger.info(`[InitialPrompt] Sending rename command for session ${sessionId}`);
      await deliver(sessionId, config.renameCommand + '\r');
    }

    if (!cancelled) {
      logger.info(`[InitialPrompt] Complete for session ${sessionId}`);
      complete?.();
    }
  };

  timeoutId = setTimeout(execute, initialPromptDelay);

  return () => {
    cancelled = true;
    if (timeoutId) clearTimeout(timeoutId);
  };
}
