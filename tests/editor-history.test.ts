// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addEditorHistoryEntry, loadEditorHistory, saveEditorHistory } from '../renderer/editor/editor-history.js';

describe('editor history', () => {
  beforeEach(() => {
    window.localStorage.clear();
    (window as any).gamepadCli = {
      editorGetHistory: vi.fn().mockResolvedValue([]),
      editorSetHistory: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  it('keeps only the 10 most recent prompts', async () => {
    const store: string[] = [];
    (window as any).gamepadCli.editorSetHistory.mockImplementation(async (entries: string[]) => {
      store.splice(0, store.length, ...entries);
      return { success: true };
    });
    (window as any).gamepadCli.editorGetHistory.mockImplementation(async () => [...store]);

    for (let i = 0; i < 12; i++) {
      await addEditorHistoryEntry(`prompt ${i}`);
    }

    await expect(loadEditorHistory()).resolves.toEqual([
      'prompt 11',
      'prompt 10',
      'prompt 9',
      'prompt 8',
      'prompt 7',
      'prompt 6',
      'prompt 5',
      'prompt 4',
      'prompt 3',
      'prompt 2',
    ]);
  });

  it('persists and reloads saved entries through the preload API', async () => {
    const store: string[] = [];
    (window as any).gamepadCli.editorSetHistory.mockImplementation(async (entries: string[]) => {
      store.splice(0, store.length, ...entries);
      return { success: true };
    });
    (window as any).gamepadCli.editorGetHistory.mockImplementation(async () => [...store]);

    await saveEditorHistory(['first prompt', 'second prompt']);
    await expect(loadEditorHistory()).resolves.toEqual(['first prompt', 'second prompt']);
  });
});
