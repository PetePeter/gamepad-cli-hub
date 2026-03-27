import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scheduleInitialPrompt, actionToPtyData, KEY_TO_ESCAPE } from '../src/session/initial-prompt';
import type { SequenceAction } from '../src/input/sequence-parser';
import type { SequenceListItem } from '../src/config/loader';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('actionToPtyData', () => {
  it('returns text value for text actions', () => {
    const action: SequenceAction = { type: 'text', value: 'hello world' };
    expect(actionToPtyData(action)).toBe('hello world');
  });

  it('maps Enter key to \\r (carriage return)', () => {
    const action: SequenceAction = { type: 'key', key: 'Enter' };
    expect(actionToPtyData(action)).toBe('\r');
  });

  it('maps Tab to \\t', () => {
    const action: SequenceAction = { type: 'key', key: 'Tab' };
    expect(actionToPtyData(action)).toBe('\t');
  });

  it('maps Escape to \\x1b', () => {
    const action: SequenceAction = { type: 'key', key: 'Escape' };
    expect(actionToPtyData(action)).toBe('\x1b');
  });

  it('maps Backspace to \\x7f', () => {
    const action: SequenceAction = { type: 'key', key: 'Backspace' };
    expect(actionToPtyData(action)).toBe('\x7f');
  });

  it('maps Space to literal space', () => {
    const action: SequenceAction = { type: 'key', key: 'Space' };
    expect(actionToPtyData(action)).toBe(' ');
  });

  it('maps arrow keys to ANSI escape sequences', () => {
    expect(actionToPtyData({ type: 'key', key: 'Up' })).toBe('\x1b[A');
    expect(actionToPtyData({ type: 'key', key: 'Down' })).toBe('\x1b[B');
    expect(actionToPtyData({ type: 'key', key: 'Right' })).toBe('\x1b[C');
    expect(actionToPtyData({ type: 'key', key: 'Left' })).toBe('\x1b[D');
  });

  it('returns null for unknown keys', () => {
    const action: SequenceAction = { type: 'key', key: 'F99' };
    expect(actionToPtyData(action)).toBeNull();
  });

  it('maps Ctrl+C combo to \\x03', () => {
    const action: SequenceAction = { type: 'combo', keys: ['Ctrl', 'C'] };
    expect(actionToPtyData(action)).toBe('\x03');
  });

  it('maps Ctrl+A combo to \\x01', () => {
    const action: SequenceAction = { type: 'combo', keys: ['Ctrl', 'A'] };
    expect(actionToPtyData(action)).toBe('\x01');
  });

  it('maps Ctrl+Z combo to \\x1a', () => {
    const action: SequenceAction = { type: 'combo', keys: ['Ctrl', 'Z'] };
    expect(actionToPtyData(action)).toBe('\x1a');
  });

  it('maps Ctrl+L combo to \\x0c (case-insensitive ctrl)', () => {
    const action: SequenceAction = { type: 'combo', keys: ['ctrl', 'L'] };
    expect(actionToPtyData(action)).toBe('\x0c');
  });

  it('returns null for non-Ctrl combos', () => {
    const action: SequenceAction = { type: 'combo', keys: ['Alt', 'F4'] };
    expect(actionToPtyData(action)).toBeNull();
  });

  it('returns null for wait actions', () => {
    const action: SequenceAction = { type: 'wait', ms: 500 };
    expect(actionToPtyData(action)).toBeNull();
  });

  it('returns null for modDown actions', () => {
    const action: SequenceAction = { type: 'modDown', key: 'Ctrl' };
    expect(actionToPtyData(action)).toBeNull();
  });

  it('returns null for modUp actions', () => {
    const action: SequenceAction = { type: 'modUp', key: 'Ctrl' };
    expect(actionToPtyData(action)).toBeNull();
  });

  it('maps Esc alias to \\x1b', () => {
    expect(actionToPtyData({ type: 'key', key: 'Esc' })).toBe('\x1b');
  });

  it('maps F1-F12 to escape sequences', () => {
    expect(actionToPtyData({ type: 'key', key: 'F1' })).toBe('\x1bOP');
    expect(actionToPtyData({ type: 'key', key: 'F2' })).toBe('\x1bOQ');
    expect(actionToPtyData({ type: 'key', key: 'F3' })).toBe('\x1bOR');
    expect(actionToPtyData({ type: 'key', key: 'F4' })).toBe('\x1bOS');
    expect(actionToPtyData({ type: 'key', key: 'F5' })).toBe('\x1b[15~');
    expect(actionToPtyData({ type: 'key', key: 'F6' })).toBe('\x1b[17~');
    expect(actionToPtyData({ type: 'key', key: 'F7' })).toBe('\x1b[18~');
    expect(actionToPtyData({ type: 'key', key: 'F8' })).toBe('\x1b[19~');
    expect(actionToPtyData({ type: 'key', key: 'F9' })).toBe('\x1b[20~');
    expect(actionToPtyData({ type: 'key', key: 'F10' })).toBe('\x1b[21~');
    expect(actionToPtyData({ type: 'key', key: 'F11' })).toBe('\x1b[23~');
    expect(actionToPtyData({ type: 'key', key: 'F12' })).toBe('\x1b[24~');
  });

  it('maps PageUp/PageDown to escape sequences', () => {
    expect(actionToPtyData({ type: 'key', key: 'PageUp' })).toBe('\x1b[5~');
    expect(actionToPtyData({ type: 'key', key: 'PageDown' })).toBe('\x1b[6~');
  });

  it('maps Insert to escape sequence', () => {
    expect(actionToPtyData({ type: 'key', key: 'Insert' })).toBe('\x1b[2~');
  });
});

describe('KEY_TO_ESCAPE', () => {
  it('contains Enter mapping to \\r', () => {
    expect(KEY_TO_ESCAPE['Enter']).toBe('\r');
  });

  it('contains all expected keys', () => {
    const expectedKeys = [
      'Enter', 'Tab', 'Esc', 'Escape', 'Space', 'Backspace', 'Delete',
      'Up', 'Down', 'Right', 'Left', 'Home', 'End',
      'PageUp', 'PageDown', 'Insert',
      'F1', 'F2', 'F3', 'F4', 'F5', 'F6',
      'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
    ];
    for (const key of expectedKeys) {
      expect(KEY_TO_ESCAPE).toHaveProperty(key);
    }
  });
});

describe('scheduleInitialPrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for empty initialPrompt array', () => {
    const result = scheduleInitialPrompt('s1', { initialPrompt: [] }, vi.fn());
    expect(result).toBeNull();
  });

  it('returns null for undefined initialPrompt', () => {
    const result = scheduleInitialPrompt('s1', {}, vi.fn());
    expect(result).toBeNull();
  });

  it('returns a cancel function for valid prompt', () => {
    const cancel = scheduleInitialPrompt('s1', { initialPrompt: [{ label: 'Test', sequence: 'hello' }] }, vi.fn());
    expect(cancel).toBeTypeOf('function');
    cancel!();
  });

  it('writes text to PTY after delay', async () => {
    const writeFn = vi.fn();
    scheduleInitialPrompt('s1', {
      initialPrompt: [{ label: 'Test', sequence: 'hello world' }],
      initialPromptDelay: 1000,
    }, writeFn);

    expect(writeFn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(writeFn).toHaveBeenCalledWith('s1', 'hello world');
  });

  it('uses default delay of 2000ms', async () => {
    const writeFn = vi.fn();
    scheduleInitialPrompt('s1', { initialPrompt: [{ label: 'Test', sequence: 'test' }] }, writeFn);

    await vi.advanceTimersByTimeAsync(1999);
    expect(writeFn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(writeFn).toHaveBeenCalledWith('s1', 'test');
  });

  it('writes Enter as \\r — Enter is no longer stripped', async () => {
    const writeFn = vi.fn();
    scheduleInitialPrompt('s1', {
      initialPrompt: [{ label: 'Test', sequence: 'hello{Enter}' }],
      initialPromptDelay: 0,
    }, writeFn);

    await vi.advanceTimersByTimeAsync(0);

    expect(writeFn).toHaveBeenCalledTimes(2);
    expect(writeFn.mock.calls[0]).toEqual(['s1', 'hello']);
    expect(writeFn.mock.calls[1]).toEqual(['s1', '\r']);
  });

  it('cancel function prevents writing', async () => {
    const writeFn = vi.fn();
    const cancel = scheduleInitialPrompt('s1', {
      initialPrompt: [{ label: 'Test', sequence: 'hello' }],
      initialPromptDelay: 1000,
    }, writeFn);

    cancel!();
    await vi.advanceTimersByTimeAsync(2000);
    expect(writeFn).not.toHaveBeenCalled();
  });

  it('handles Tab key correctly', async () => {
    const writeFn = vi.fn();
    scheduleInitialPrompt('s1', {
      initialPrompt: [{ label: 'Test', sequence: '{Tab}' }],
      initialPromptDelay: 0,
    }, writeFn);

    await vi.advanceTimersByTimeAsync(0);
    expect(writeFn).toHaveBeenCalledWith('s1', '\t');
  });

  it('handles Ctrl+C combo', async () => {
    const writeFn = vi.fn();
    scheduleInitialPrompt('s1', {
      initialPrompt: [{ label: 'Test', sequence: '{Ctrl+C}' }],
      initialPromptDelay: 0,
    }, writeFn);

    await vi.advanceTimersByTimeAsync(0);
    expect(writeFn).toHaveBeenCalledWith('s1', '\x03');
  });

  it('writes multiple text segments in order', async () => {
    const writeFn = vi.fn();
    scheduleInitialPrompt('s1', {
      initialPrompt: [{ label: 'Test', sequence: 'hello{Tab}world' }],
      initialPromptDelay: 0,
    }, writeFn);

    await vi.advanceTimersByTimeAsync(0);

    expect(writeFn).toHaveBeenCalledTimes(3);
    expect(writeFn.mock.calls[0]).toEqual(['s1', 'hello']);
    expect(writeFn.mock.calls[1]).toEqual(['s1', '\t']);
    expect(writeFn.mock.calls[2]).toEqual(['s1', 'world']);
  });

  it('zero delay works (immediate execution)', async () => {
    const writeFn = vi.fn();
    scheduleInitialPrompt('s1', {
      initialPrompt: [{ label: 'Test', sequence: 'fast' }],
      initialPromptDelay: 0,
    }, writeFn);

    await vi.advanceTimersByTimeAsync(0);
    expect(writeFn).toHaveBeenCalledWith('s1', 'fast');
  });

  it('prompt with Enter-only sequence writes carriage returns', async () => {
    const writeFn = vi.fn();
    scheduleInitialPrompt('s1', {
      initialPrompt: [{ label: 'Test', sequence: '{Enter}{Enter}' }],
      initialPromptDelay: 0,
    }, writeFn);

    await vi.advanceTimersByTimeAsync(0);

    expect(writeFn).toHaveBeenCalledTimes(2);
    expect(writeFn.mock.calls[0]).toEqual(['s1', '\r']);
    expect(writeFn.mock.calls[1]).toEqual(['s1', '\r']);
  });

  it('handles Wait actions with delay between writes', async () => {
    const writeFn = vi.fn();
    scheduleInitialPrompt('s1', {
      initialPrompt: [{ label: 'Test', sequence: 'a{Wait 500}b' }],
      initialPromptDelay: 0,
    }, writeFn);

    await vi.advanceTimersByTimeAsync(0);
    expect(writeFn).toHaveBeenCalledTimes(1);
    expect(writeFn).toHaveBeenCalledWith('s1', 'a');

    await vi.advanceTimersByTimeAsync(500);
    expect(writeFn).toHaveBeenCalledTimes(2);
    expect(writeFn.mock.calls[1]).toEqual(['s1', 'b']);
  });

  it('complex prompt with text + special keys + waits', async () => {
    const writeFn = vi.fn();
    scheduleInitialPrompt('s1', {
      initialPrompt: [{ label: 'Test', sequence: '/clear{Tab}{Wait 200}yes{Ctrl+S}' }],
      initialPromptDelay: 0,
    }, writeFn);

    await vi.advanceTimersByTimeAsync(0);
    expect(writeFn).toHaveBeenCalledTimes(2);
    expect(writeFn.mock.calls[0]).toEqual(['s1', '/clear']);
    expect(writeFn.mock.calls[1]).toEqual(['s1', '\t']);

    await vi.advanceTimersByTimeAsync(200);
    expect(writeFn).toHaveBeenCalledTimes(4);
    expect(writeFn.mock.calls[2]).toEqual(['s1', 'yes']);
    expect(writeFn.mock.calls[3]).toEqual(['s1', '\x13']);
  });

  it('cancellation during wait prevents subsequent writes', async () => {
    const writeFn = vi.fn();
    const cancel = scheduleInitialPrompt('s1', {
      initialPrompt: [{ label: 'Test', sequence: 'a{Wait 500}b' }],
      initialPromptDelay: 0,
    }, writeFn);

    await vi.advanceTimersByTimeAsync(0);
    expect(writeFn).toHaveBeenCalledTimes(1);

    cancel!();
    await vi.advanceTimersByTimeAsync(1000);
    expect(writeFn).toHaveBeenCalledTimes(1);
  });

  it('skips modDown and modUp actions', async () => {
    const writeFn = vi.fn();
    scheduleInitialPrompt('s1', {
      initialPrompt: [{ label: 'Test', sequence: '{Ctrl Down}x{Ctrl Up}' }],
      initialPromptDelay: 0,
    }, writeFn);

    await vi.advanceTimersByTimeAsync(0);
    expect(writeFn).toHaveBeenCalledTimes(1);
    expect(writeFn).toHaveBeenCalledWith('s1', 'x');
  });

  // ---- Multi-item tests ----

  it('sends multiple items in order', async () => {
    const writeFn = vi.fn();
    scheduleInitialPrompt('s1', {
      initialPrompt: [
        { label: 'Slash cmd', sequence: '/allow-all{Enter}' },
        { label: 'Prompt', sequence: 'hello world' },
      ],
      initialPromptDelay: 0,
    }, writeFn);

    await vi.advanceTimersByTimeAsync(0);

    expect(writeFn).toHaveBeenCalledTimes(3);
    expect(writeFn.mock.calls[0]).toEqual(['s1', '/allow-all']);
    expect(writeFn.mock.calls[1]).toEqual(['s1', '\r']);
    expect(writeFn.mock.calls[2]).toEqual(['s1', 'hello world']);
  });

  it('handles Wait between items', async () => {
    const writeFn = vi.fn();
    scheduleInitialPrompt('s1', {
      initialPrompt: [
        { label: 'First', sequence: 'a{Wait 500}' },
        { label: 'Second', sequence: 'b' },
      ],
      initialPromptDelay: 0,
    }, writeFn);

    await vi.advanceTimersByTimeAsync(0);
    expect(writeFn).toHaveBeenCalledTimes(1);
    expect(writeFn.mock.calls[0]).toEqual(['s1', 'a']);

    await vi.advanceTimersByTimeAsync(500);
    expect(writeFn).toHaveBeenCalledTimes(2);
    expect(writeFn.mock.calls[1]).toEqual(['s1', 'b']);
  });

  it('cancellation between items prevents subsequent items', async () => {
    const writeFn = vi.fn();
    const cancel = scheduleInitialPrompt('s1', {
      initialPrompt: [
        { label: 'First', sequence: 'a{Wait 500}' },
        { label: 'Second', sequence: 'b' },
      ],
      initialPromptDelay: 0,
    }, writeFn);

    await vi.advanceTimersByTimeAsync(0);
    expect(writeFn).toHaveBeenCalledTimes(1);

    cancel!();
    await vi.advanceTimersByTimeAsync(1000);
    expect(writeFn).toHaveBeenCalledTimes(1);
  });

  it('skips items with empty sequence strings', async () => {
    const writeFn = vi.fn();
    scheduleInitialPrompt('s1', {
      initialPrompt: [
        { label: 'Empty', sequence: '' },
        { label: 'Real', sequence: 'hello' },
      ],
      initialPromptDelay: 0,
    }, writeFn);

    await vi.advanceTimersByTimeAsync(0);
    expect(writeFn).toHaveBeenCalledTimes(1);
    expect(writeFn.mock.calls[0]).toEqual(['s1', 'hello']);
  });

  // ---- onComplete callback tests ----

  it('calls onComplete after all items execute', async () => {
    const writeFn = vi.fn();
    const onComplete = vi.fn();
    scheduleInitialPrompt('s1', {
      initialPrompt: [{ label: 'Test', sequence: 'hello' }],
      initialPromptDelay: 0,
    }, writeFn, onComplete);

    await vi.advanceTimersByTimeAsync(0);
    expect(writeFn).toHaveBeenCalledWith('s1', 'hello');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('calls onComplete after multi-item prompt with waits', async () => {
    const writeFn = vi.fn();
    const onComplete = vi.fn();
    scheduleInitialPrompt('s1', {
      initialPrompt: [
        { label: 'First', sequence: 'a{Wait 500}' },
        { label: 'Second', sequence: 'b' },
      ],
      initialPromptDelay: 0,
    }, writeFn, onComplete);

    await vi.advanceTimersByTimeAsync(0);
    expect(onComplete).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(writeFn).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not call onComplete when cancelled', async () => {
    const writeFn = vi.fn();
    const onComplete = vi.fn();
    const cancel = scheduleInitialPrompt('s1', {
      initialPrompt: [{ label: 'Test', sequence: 'hello' }],
      initialPromptDelay: 1000,
    }, writeFn, onComplete);

    cancel!();
    await vi.advanceTimersByTimeAsync(2000);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('does not call onComplete when cancelled mid-execution', async () => {
    const writeFn = vi.fn();
    const onComplete = vi.fn();
    const cancel = scheduleInitialPrompt('s1', {
      initialPrompt: [
        { label: 'First', sequence: 'a{Wait 500}' },
        { label: 'Second', sequence: 'b' },
      ],
      initialPromptDelay: 0,
    }, writeFn, onComplete);

    await vi.advanceTimersByTimeAsync(0);
    cancel!();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('onComplete is optional (no error when omitted)', async () => {
    const writeFn = vi.fn();
    scheduleInitialPrompt('s1', {
      initialPrompt: [{ label: 'Test', sequence: 'hello' }],
      initialPromptDelay: 0,
    }, writeFn);

    await vi.advanceTimersByTimeAsync(0);
    expect(writeFn).toHaveBeenCalledWith('s1', 'hello');
  });
});
