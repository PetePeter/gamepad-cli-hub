import { parseSequence, type SequenceAction } from '../input/sequence-parser.js';
import { logger } from '../utils/logger.js';

export interface InitialPromptConfig {
  initialPrompt?: string;
  initialPromptDelay?: number;
}

/**
 * Convert a sequence action to PTY-writable data.
 * Skips Enter — the prompt stays in the input buffer for the user to review.
 */
export function actionToPtyData(action: SequenceAction): string | null {
  switch (action.type) {
    case 'text':
      return action.value;
    case 'key':
      if (action.key === 'Enter') return null;
      return keyToPtySequence(action.key);
    case 'combo':
      return comboToPtySequence(action.keys);
    case 'wait':
    case 'modDown':
    case 'modUp':
      return null;
  }
}

function keyToPtySequence(key: string): string | null {
  const keyMap: Record<string, string> = {
    'Tab': '\t',
    'Escape': '\x1b',
    'Backspace': '\x7f',
    'Delete': '\x1b[3~',
    'Up': '\x1b[A',
    'Down': '\x1b[B',
    'Right': '\x1b[C',
    'Left': '\x1b[D',
    'Home': '\x1b[H',
    'End': '\x1b[F',
    'Space': ' ',
  };
  return keyMap[key] ?? null;
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
 * After initialPromptDelay ms, writes the prompt text to the PTY stdin
 * without sending Enter — the user reviews and submits manually.
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

  if (!initialPrompt || initialPrompt.trim() === '') {
    return null;
  }

  let cancelled = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const execute = async () => {
    if (cancelled) return;

    const actions = parseSequence(initialPrompt);
    logger.info(`[InitialPrompt] Pre-loading ${actions.length} actions for session ${sessionId}`);

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
