import { describe, it, expect } from 'vitest';
import { buildToolEditorOptions } from '../../renderer/stores/modal-bridge.js';

describe('buildToolEditorOptions', () => {
  it('trims command fields and includes them in output', () => {
    const values = {
      spawnCommand: '  claude  ',
      resumeCommand: '  claude --resume  ',
      continueCommand: '',
      renameCommand: ' rename-me ',
      handoffCommand: '  handoff ',
      env: [],
      helmInitialPrompt: false,
      helmPreambleForInterSession: true,
      pasteMode: 'pty',
    };
    const result = buildToolEditorOptions(values);
    expect(result.spawnCommand).toBe('claude');
    expect(result.resumeCommand).toBe('claude --resume');
    expect(result.continueCommand).toBe('');
    expect(result.renameCommand).toBe('rename-me');
    expect(result.handoffCommand).toBe('handoff');
  });

  it('handles non-string command fields gracefully', () => {
    const values = {
      spawnCommand: 123,
      resumeCommand: null,
      continueCommand: undefined,
      renameCommand: '',
      handoffCommand: '',
      env: [],
    };
    const result = buildToolEditorOptions(values);
    expect(result.spawnCommand).toBe('');
    expect(result.resumeCommand).toBe('');
    expect(result.continueCommand).toBe('');
  });

  it('preserves env entries with mode field (append/prepend)', () => {
    const values = {
      env: [
        { name: ' PATH ', value: '/usr/bin', mode: 'append' },
        { name: 'HOME', value: '/home/user', mode: 'prepend' },
        { name: 'EDITOR', value: 'vim' }, // no mode — default replace
      ],
    };
    const result = buildToolEditorOptions(values);
    expect(result.env).toHaveLength(3);
    expect(result.env![0]).toEqual({ name: 'PATH', value: '/usr/bin', mode: 'append' });
    expect(result.env![1]).toEqual({ name: 'HOME', value: '/home/user', mode: 'prepend' });
    expect(result.env![2]).toEqual({ name: 'EDITOR', value: 'vim' });
  });

  it('filters out env entries with empty names after trim', () => {
    const values = {
      env: [
        { name: 'VALID', value: 'val' },
        { name: '', value: 'empty-name' },
        { name: '   ', value: 'whitespace-name' },
      ],
    };
    const result = buildToolEditorOptions(values);
    expect(result.env).toHaveLength(1);
    expect(result.env![0].name).toBe('VALID');
  });

  it('handles non-array env gracefully', () => {
    const result = buildToolEditorOptions({ env: 'not-array' });
    expect(result.env).toEqual([]);
  });

  it('handles env items with non-string names/values', () => {
    const values = {
      env: [
        { name: 42, value: 'val' },
        { name: 'VALID', value: null },
      ],
    };
    const result = buildToolEditorOptions(values);
    expect(result.env).toHaveLength(1); // non-string name becomes '', filtered out; VALID survives
    expect(result.env![0]).toEqual({ name: 'VALID', value: '' });
  });

  it('sets helmInitialPrompt as boolean', () => {
    expect(buildToolEditorOptions({ helmInitialPrompt: true }).helmInitialPrompt).toBe(true);
    expect(buildToolEditorOptions({ helmInitialPrompt: false }).helmInitialPrompt).toBe(false);
    expect(buildToolEditorOptions({ helmInitialPrompt: undefined }).helmInitialPrompt).toBe(false);
    expect(buildToolEditorOptions({ helmInitialPrompt: 1 }).helmInitialPrompt).toBe(true);
  });

  it('defaults helmPreambleForInterSession to true, respects explicit false', () => {
    expect(buildToolEditorOptions({}).helmPreambleForInterSession).toBe(true);
    expect(buildToolEditorOptions({ helmPreambleForInterSession: true }).helmPreambleForInterSession).toBe(true);
    expect(buildToolEditorOptions({ helmPreambleForInterSession: false }).helmPreambleForInterSession).toBe(false);
  });

  it('includes valid pasteMode values, omits invalid ones', () => {
    const validModes = ['pty', 'ptyindividual', 'sendkeys', 'sendkeysindividual', 'clippaste'] as const;
    for (const mode of validModes) {
      expect(buildToolEditorOptions({ pasteMode: mode }).pasteMode).toBe(mode);
    }
    expect(buildToolEditorOptions({ pasteMode: 'invalid' }).pasteMode).toBeUndefined();
    expect(buildToolEditorOptions({ pasteMode: undefined }).pasteMode).toBeUndefined();
  });

  it('returns complete options with all fields populated', () => {
    const values = {
      spawnCommand: 'claude --dangerously-skip-permissions',
      resumeCommand: 'claude --resume',
      continueCommand: '/continue',
      renameCommand: '/rename',
      handoffCommand: 'handoff-text',
      env: [{ name: 'API_KEY', value: 'secret', mode: 'append' }],
      helmInitialPrompt: true,
      helmPreambleForInterSession: false,
      pasteMode: 'sendkeysindividual',
    };
    const result = buildToolEditorOptions(values);
    expect(result).toEqual({
      spawnCommand: 'claude --dangerously-skip-permissions',
      resumeCommand: 'claude --resume',
      continueCommand: '/continue',
      renameCommand: '/rename',
      handoffCommand: 'handoff-text',
      env: [{ name: 'API_KEY', value: 'secret', mode: 'append' }],
      helmInitialPrompt: true,
      helmPreambleForInterSession: false,
      pasteMode: 'sendkeysindividual',
    });
  });
});
