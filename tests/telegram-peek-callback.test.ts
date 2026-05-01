import { describe, expect, it, vi } from 'vitest';
import { peekSessionPickerKeyboard } from '../src/telegram/keyboards.js';

describe('peekSessionPickerKeyboard', () => {
  it('builds keyboard with one button per session', () => {
    const sessions = [
      { id: 's1', name: 'worker', cliType: 'claude-code', workingDir: 'X:\\a', state: 'implementing' as const },
      { id: 's2', name: 'planner', cliType: 'claude-code', workingDir: 'X:\\b', state: 'idle' as const },
    ];
    const { keyboard } = peekSessionPickerKeyboard(sessions);

    const flatButtons = keyboard.flat();
    expect(flatButtons.length).toBe(2);
    expect(flatButtons[0].callback_data).toBe('peek:s1');
    expect(flatButtons[1].callback_data).toBe('peek:s2');
  });

  it('includes state emoji in button labels', () => {
    const sessions = [
      { id: 's1', name: 'worker', cliType: 'claude-code', workingDir: 'X:\\a', state: 'implementing' as const },
    ];
    const { keyboard } = peekSessionPickerKeyboard(sessions);

    expect(keyboard[0][0].text).toContain('🔨');
  });

  it('text lists all session names', () => {
    const sessions = [
      { id: 's1', name: 'worker', cliType: 'claude-code', workingDir: 'X:\\a', state: 'idle' as const },
      { id: 's2', name: 'planner', cliType: 'claude-code', workingDir: 'X:\\b', state: 'idle' as const },
    ];
    const { text } = peekSessionPickerKeyboard(sessions);

    expect(text).toContain('worker');
    expect(text).toContain('planner');
  });
});
