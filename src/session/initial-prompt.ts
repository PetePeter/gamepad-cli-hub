import { parseSequence, type SequenceAction } from '../input/sequence-parser.js';
import { logger } from '../utils/logger.js';
import type { SequenceListItem } from '../config/loader.js';

export interface InitialPromptConfig {
  initialPrompt?: SequenceListItem[];
  initialPromptDelay?: number;
}

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
  return KEY_TO_ESCAPE[key] ?? null;
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
): (() => void) | null {
  const { initialPrompt, initialPromptDelay = 2000 } = config;

  if (!initialPrompt || initialPrompt.length === 0) {
    return null;
  }

  let cancelled = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const executeItem = async (item: SequenceListItem) => {
    if (cancelled || !item.sequence || item.sequence.trim() === '') return;

    const actions = parseSequence(item.sequence);

    for (const action of actions) {
      if (cancelled) break;

      if (action.type === 'wait') {
        await new Promise(resolve => setTimeout(resolve, action.ms));
        continue;
      }

      const data = actionToPtyData(action);
      if (data !== null) {
        writeToPty(sessionId, data);
      }
    }
  };

  const execute = async () => {
    if (cancelled) return;

    logger.info(`[InitialPrompt] Pre-loading ${initialPrompt.length} item(s) for session ${sessionId}`);

    for (const item of initialPrompt) {
      if (cancelled) break;
      if (!item) continue;
      await executeItem(item);
    }

    if (!cancelled) {
      logger.info(`[InitialPrompt] Pre-load complete for session ${sessionId}`);
    }
  };

  timeoutId = setTimeout(execute, initialPromptDelay);

  return () => {
    cancelled = true;
    if (timeoutId) clearTimeout(timeoutId);
  };
}
