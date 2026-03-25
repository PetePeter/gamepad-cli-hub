export type SequenceAction =
  | { type: 'text'; value: string }
  | { type: 'key'; key: string }
  | { type: 'combo'; keys: string[] }
  | { type: 'modDown'; key: string }
  | { type: 'modUp'; key: string }
  | { type: 'wait'; ms: number };

export function parseSequence(input: string): SequenceAction[] {
  const actions: SequenceAction[] = [];
  let i = 0;

  while (i < input.length) {
    if (input[i] === '\n') {
      actions.push({ type: 'key', key: 'Enter' });
      i++;
    } else if (input[i] === '{') {
      if (input[i + 1] === '{') {
        appendText(actions, '{');
        i += 2;
      } else {
        const closeIdx = input.indexOf('}', i + 1);
        if (closeIdx === -1) {
          appendText(actions, input.slice(i));
          break;
        }
        const token = input.slice(i + 1, closeIdx);
        const action = parseToken(token);
        if (action) actions.push(action);
        i = closeIdx + 1;
      }
    } else if (input[i] === '}') {
      if (input[i + 1] === '}') {
        appendText(actions, '}');
        i += 2;
      } else {
        appendText(actions, '}');
        i++;
      }
    } else {
      appendText(actions, input[i]);
      i++;
    }
  }

  return actions;
}

function appendText(actions: SequenceAction[], char: string): void {
  const last = actions[actions.length - 1];
  if (last && last.type === 'text') {
    last.value += char;
  } else {
    actions.push({ type: 'text', value: char });
  }
}

function parseToken(token: string): SequenceAction | null {
  if (token === '') return null;

  const waitMatch = token.match(/^Wait\s+(\d+)$/i);
  if (waitMatch) {
    return { type: 'wait', ms: Math.min(parseInt(waitMatch[1], 10), 30000) };
  }

  const downMatch = token.match(/^(\S+)\s+Down$/i);
  if (downMatch) {
    return { type: 'modDown', key: downMatch[1] };
  }

  const upMatch = token.match(/^(\S+)\s+Up$/i);
  if (upMatch) {
    return { type: 'modUp', key: upMatch[1] };
  }

  if (token.includes('+')) {
    const keys = token.split('+').map(k => k.trim()).filter(k => k);
    if (keys.length === 0) return null;
    return { type: 'combo', keys };
  }

  return { type: 'key', key: token };
}

export function formatSequencePreview(actions: SequenceAction[]): string {
  return actions.map(formatAction).join(' → ');
}

function formatAction(action: SequenceAction): string {
  switch (action.type) {
    case 'text':
      return `Type "${action.value}"`;
    case 'key':
      return action.key;
    case 'combo':
      return action.keys.join('+');
    case 'modDown':
      return `${action.key} ↓`;
    case 'modUp':
      return `${action.key} ↑`;
    case 'wait':
      return `Wait ${action.ms}ms`;
  }
}
