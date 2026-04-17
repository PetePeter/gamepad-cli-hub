// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hideEditorPopup, initEditorPopup, showEditorPopup } from '../renderer/editor/editor-popup.js';
import { saveEditorHistory } from '../renderer/editor/editor-history.js';

function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('editor popup', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
    const historyStore: string[] = [];
    (window as any).gamepadCli = {
      editorGetHistory: vi.fn().mockImplementation(async () => [...historyStore]),
      editorSetHistory: vi.fn().mockImplementation(async (entries: string[]) => {
        historyStore.splice(0, historyStore.length, ...entries);
        return { success: true };
      }),
    };
    initEditorPopup();
  });

  afterEach(() => {
    hideEditorPopup();
  });

  it('opens with an editable textarea and closes on send', async () => {
    const pending = showEditorPopup();
    await flush();

    const overlay = document.getElementById('editorPopupOverlay');
    const textarea = document.getElementById('editorPopupTextarea') as HTMLTextAreaElement;
    expect(overlay?.classList.contains('modal--visible')).toBe(true);
    expect(textarea.disabled).toBe(false);
    expect(textarea.readOnly).toBe(false);

    textarea.value = 'hello editor';
    document.getElementById('editorPopupSendBtn')?.click();

    await expect(pending).resolves.toBe('hello editor');
  });

  it('replaces textarea content from history when requested', async () => {
    await saveEditorHistory(['history prompt']);
    void showEditorPopup('existing');
    await flush();

    document.querySelector<HTMLButtonElement>('.editor-popup__history-item')?.click();
    document.getElementById('editorPopupReplaceBtn')?.click();

    const textarea = document.getElementById('editorPopupTextarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('history prompt');
  });

  it('inserts history at the current caret position', async () => {
    await saveEditorHistory(['XYZ']);
    void showEditorPopup('ab');
    await flush();

    const textarea = document.getElementById('editorPopupTextarea') as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(1, 1);

    document.querySelector<HTMLButtonElement>('.editor-popup__history-item')?.click();
    document.getElementById('editorPopupInsertBtn')?.click();

    expect(textarea.value).toBe('aXYZb');
  });

  it('keeps existing content when history action is cancelled', async () => {
    await saveEditorHistory(['history prompt']);
    void showEditorPopup('existing');
    await flush();

    document.querySelector<HTMLButtonElement>('.editor-popup__history-item')?.click();
    document.getElementById('editorPopupHistoryCancelBtn')?.click();

    const textarea = document.getElementById('editorPopupTextarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('existing');
  });

  it('stores sent prompts through the preload API', async () => {
    const pending = showEditorPopup();
    await flush();

    const textarea = document.getElementById('editorPopupTextarea') as HTMLTextAreaElement;
    textarea.value = 'persist me';
    document.getElementById('editorPopupSendBtn')?.click();
    await expect(pending).resolves.toBe('persist me');

    expect((window as any).gamepadCli.editorSetHistory).toHaveBeenCalled();
  });
});
