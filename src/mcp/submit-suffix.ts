import { parseSequence } from '../input/sequence-parser.js';
import { actionToPtyData } from '../input/sequence-executor.js';

/** Convert escape notation (\r, \n, \t, \r\n) or sequence syntax ({Send}, {Enter}, {Ctrl+C}) to PTY bytes. */
export function parseSubmitSuffix(suffix?: string): string {
  if (!suffix) return '\r';

  if (suffix === '\\r') return '\r';
  if (suffix === '\\n') return '\n';
  if (suffix === '\\t') return '\t';
  if (suffix === '\\r\\n') return '\r\n';

  if (suffix.includes('{')) {
    const actions = parseSequence(suffix);
    let result = '';
    for (const action of actions) {
      let data: string | null = null;
      if (action.type === 'text') {
        data = action.value;
      } else if (action.type === 'key') {
        data = (action.key === 'Enter' || action.key === 'Send') ? '\r' : actionToPtyData(action);
      } else if (action.type === 'combo') {
        data = actionToPtyData(action);
      }
      if (data !== null) result += data;
    }
    if (result) return result;
  }

  return suffix;
}
