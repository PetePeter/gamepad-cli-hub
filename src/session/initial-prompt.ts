import { parseSequence, type SequenceAction } from '../input/sequence-parser.js';
import { logger } from '../utils/logger.js';
import type { SequenceListItem } from '../config/loader.js';

export interface InitialPromptConfig {
  initialPrompt?: SequenceListItem[];
  initialPromptDelay?: number;
  helmInitialPrompt?: boolean;
  /** Rename command to send after initial prompt completes (template with {cliSessionName} already replaced). */
  renameCommand?: string;
}

export const HELM_INIT_SEQUENCE = 'Call session_info to get Helm MCP AIAGENT state registry. Then immediately call session_set_aiagent_state for this session whenever your phase changes: planning before investigation, implementing before edits or tests, completed when done. If a Helm plan is assigned, claim it before implementation with plan_set_state status=coding and sessionId, then call session_set_working_plan. Output AIAGENT-* state as the first line of each response.{Enter}';

/**
 * Convert a sequence action to PTY-writable data.
 */
export function actionToPtyData(action: SequenceAction): string | null {
  switch (action.type) {
    case 'text':
      return action.value;
    case 'key':
      return keyToPtySequence(action.key);
    case 'combo':
      return comboToPtySequence(action.keys);
    case 'wait':
    case 'modDown':
    case 'modUp':
      return null;
  }
}

export const KEY_TO_ESCAPE: Record<string, string> = {
  'Enter': '\r',
  'Tab': '\t',
  'Esc': '\x1b',
  'Escape': '\x1b',
  'Space': ' ',
  'Backspace': '\x7f',
  'Delete': '\x1b[3~',
  'Up': '\x1b[A',
  'Down': '\x1b[B',
  'Right': '\x1b[C',
  'Left': '\x1b[D',
  'Home': '\x1b[H',
  'End': '\x1b[F',
  'PageUp': '\x1b[5~',
  'PageDown': '\x1b[6~',
  'Insert': '\x1b[2~',
  'F1': '\x1bOP', 'F2': '\x1bOQ', 'F3': '\x1bOR', 'F4': '\x1bOS',
  'F5': '\x1b[15~', 'F6': '\x1b[17~', 'F7': '\x1b[18~', 'F8': '\x1b[19~',
  'F9': '\x1b[20~', 'F10': '\x1b[21~', 'F11': '\x1b[23~', 'F12': '\x1b[24~',
};

function keyToPtySequence(key: string): string | null {
  const canonicalEntry = Object.entries(KEY_TO_ESCAPE).find(
    ([name]) => name.toLowerCase() === key.toLowerCase(),
  );
  return canonicalEntry?.[1] ?? null;
}

function comboToPtySequence(keys: string[]): string | null {
  if (keys.length === 2 && keys[0].toLowerCase() === 'ctrl') {
    const key = keys[1].toUpperCase();
    if (key.length === 1 && key >= 'A' && key <= 'Z') {
      return String.fromCharCode(key.charCodeAt(0) - 64);
    }
  }
  return null;
}

/**
 * Schedule initial prompt pre-loading for a session.
 *
 * After initialPromptDelay ms, writes each item's sequence to the PTY stdin
 * in order. {Enter} within sequences is respected (sends \r).
 * Users control inter-item timing via {Wait N} in their sequences.
 *
 * Returns a cancel function to abort if the session is closed early,
 * or null if no prompt was configured.
 */
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

    const actions = parseSequence(item.sequence);
    let bufferedText = '';

    const flushBufferedText = async () => {
      if (!bufferedText) return;
      const text = bufferedText;
      bufferedText = '';
      await deliver(sessionId, text);
    };

    for (const action of actions) {
      if (cancelled) break;

      if (action.type === 'wait') {
        await flushBufferedText();
        await new Promise(resolve => setTimeout(resolve, action.ms));
        continue;
      }

      if (action.type === 'text') {
        bufferedText += action.value;
        continue;
      }

      if (action.type === 'key' && action.key === 'Enter') {
        bufferedText += '\r';
        continue;
      }

      if (action.type === 'key' && action.key === 'Send') {
        await flushBufferedText();
        writeToPty(sessionId, '\r');
        continue;
      }

      await flushBufferedText();

      const data = actionToPtyData(action);
      if (data !== null) {
        writeToPty(sessionId, data);
      }
    }

    await flushBufferedText();
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

    // Send rename command after initial prompt items (if configured)
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
