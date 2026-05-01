import { parseSequence, type SequenceAction } from './sequence-parser.js';

export type SequenceWrite = (sessionId: string, data: string) => void | Promise<void>;
export type SequenceDeliverText = (sessionId: string, text: string) => Promise<void>;

export interface ExecuteSequenceOptions {
  sessionId: string;
  input: string;
  write: SequenceWrite;
  deliverText: SequenceDeliverText;
  isCancelled?: () => boolean;
}

export const KEY_TO_PTY_ESCAPE: Record<string, string> = {
  Enter: '\r', Tab: '\t', Esc: '\x1b', Escape: '\x1b', Space: ' ', Backspace: '\x7f', Delete: '\x1b[3~',
  Up: '\x1b[A', Down: '\x1b[B', Right: '\x1b[C', Left: '\x1b[D', ArrowUp: '\x1b[A', ArrowDown: '\x1b[B', ArrowRight: '\x1b[C', ArrowLeft: '\x1b[D',
  Home: '\x1b[H', End: '\x1b[F', PageUp: '\x1b[5~', PageDown: '\x1b[6~', Insert: '\x1b[2~',
  F1: '\x1bOP', F2: '\x1bOQ', F3: '\x1bOR', F4: '\x1bOS', F5: '\x1b[15~', F6: '\x1b[17~', F7: '\x1b[18~', F8: '\x1b[19~', F9: '\x1b[20~', F10: '\x1b[21~', F11: '\x1b[23~', F12: '\x1b[24~',
};

export function keyToPtySequence(key: string): string | null {
  const entry = Object.entries(KEY_TO_PTY_ESCAPE).find(([name]) => name.toLowerCase() === key.toLowerCase());
  return entry?.[1] ?? null;
}

export function comboToPtySequence(keys: string[]): string | null {
  if (keys.length === 2 && keys[0].toLowerCase() === 'ctrl') {
    const key = keys[1].toUpperCase();
    if (key.length === 1 && key >= 'A' && key <= 'Z') return String.fromCharCode(key.charCodeAt(0) - 64);
    if (key === '[') return '\x1b';
  }
  return null;
}

export function actionToPtyData(action: SequenceAction): string | null {
  switch (action.type) {
    case 'text': return action.value;
    case 'key': return keyToPtySequence(action.key);
    case 'combo': return comboToPtySequence(action.keys);
    case 'wait': case 'modDown': case 'modUp': return null;
  }
}

export async function executeSequenceString(options: ExecuteSequenceOptions): Promise<void> {
  const { sessionId, input, write, deliverText, isCancelled } = options;
  const actions = parseSequence(input);
  let bufferedText = '';

  const flush = async () => {
    if (!bufferedText) return;
    const text = bufferedText;
    bufferedText = '';
    await deliverText(sessionId, text);
  };

  let sentExplicitSubmit = false;

  for (const action of actions) {
    if (isCancelled?.()) break;

    if (action.type === 'text') {
      bufferedText += action.value;
      continue;
    }

    if (action.type === 'key' && action.key === 'Enter') {
      bufferedText += '\r';
      sentExplicitSubmit = true;
      continue;
    }

    if (action.type === 'key' && action.key === 'Send') {
      await flush();
      await write(sessionId, '\r');
      sentExplicitSubmit = true;
      continue;
    }

    if (action.type === 'wait') {
      await flush();
      await new Promise(resolve => setTimeout(resolve, action.ms));
      continue;
    }

    await flush();
    const data = actionToPtyData(action);
    if (data !== null) await write(sessionId, data);
  }

  await flush();

  // implied send if none occurred
  if (!sentExplicitSubmit) {
    await write(sessionId, '\r');
  }
}
