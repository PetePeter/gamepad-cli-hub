/**
 * Draft Editor — composing/editing drafts panel.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE vi.mock() calls so hoisted references resolve
// ---------------------------------------------------------------------------

const mockDraftCreate = vi.fn();
const mockDraftUpdate = vi.fn();
const mockDraftList = vi.fn();
const mockDraftCount = vi.fn();

vi.mock('../renderer/drafts/draft-strip.js', () => ({
  refreshDraftStrip: vi.fn(),
  initDraftStrip: vi.fn(),
  createDraftBadge: vi.fn(),
}));

vi.mock('../renderer/utils.js', () => ({
  toDirection: (button: string) => {
    if (button === 'DPadUp') return 'up';
    if (button === 'DPadDown') return 'down';
    return null;
  },
  logEvent: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDraftEditorDom(): void {
  document.body.innerHTML = `
    <div id="terminalArea" class="panel-right">
      <div id="draftStrip" class="draft-strip" style="display: none;"></div>
      <div class="terminal-container"></div>
    </div>
  `;
}

async function getModule() {
  return await import('../renderer/drafts/draft-editor.js');
}

/** Flush microtask queue so async fire-and-forget completes. */
async function flush(): Promise<void> {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Draft Editor', () => {
  let mod: Awaited<ReturnType<typeof getModule>>;

  beforeEach(async () => {
    buildDraftEditorDom();

    // Mock window.gamepadCli
    (window as any).gamepadCli = {
      draftCreate: mockDraftCreate,
      draftUpdate: mockDraftUpdate,
      draftList: mockDraftList,
      draftCount: mockDraftCount,
    };

    mockDraftCreate.mockReset();
    mockDraftUpdate.mockReset();
    mockDraftList.mockReset();
    mockDraftCount.mockReset();

    mod = await getModule();

    // Reset state between tests
    Object.assign(mod.draftEditorState, {
      visible: false,
      sessionId: '',
      draftId: null,
      label: '',
      text: '',
    });
  });

  // =========================================================================
  // initDraftEditor
  // =========================================================================

  describe('initDraftEditor', () => {
    it('creates the editor panel in panel-right', () => {
      mod.initDraftEditor();
      const editor = document.getElementById('draftEditor');
      expect(editor).not.toBeNull();
      expect(editor!.className).toBe('draft-editor');

      // Should be inside terminalArea
      const terminalArea = document.getElementById('terminalArea')!;
      expect(terminalArea.contains(editor)).toBe(true);

      // Should have save and cancel buttons
      expect(document.getElementById('draftSaveBtn')).not.toBeNull();
      expect(document.getElementById('draftCancelBtn')).not.toBeNull();
      expect(document.getElementById('draftLabelInput')).not.toBeNull();
      expect(document.getElementById('draftContentInput')).not.toBeNull();
    });
  });

  // =========================================================================
  // showDraftEditor
  // =========================================================================

  describe('showDraftEditor', () => {
    beforeEach(() => {
      mod.initDraftEditor();
    });

    it('shows the editor with empty fields for new draft', () => {
      mod.showDraftEditor('session-1');
      const editor = document.getElementById('draftEditor')!;
      expect(editor.style.display).toBe('flex');
      expect(mod.draftEditorState.visible).toBe(true);
      expect(mod.draftEditorState.sessionId).toBe('session-1');
      expect(mod.draftEditorState.draftId).toBeNull();

      const labelInput = document.getElementById('draftLabelInput') as HTMLInputElement;
      const contentInput = document.getElementById('draftContentInput') as HTMLTextAreaElement;
      expect(labelInput.value).toBe('');
      expect(contentInput.value).toBe('');

      const title = editor.querySelector('.draft-editor-title')!;
      expect(title.textContent).toContain('New Draft');
    });

    it('pre-fills fields for editing existing draft', () => {
      mod.showDraftEditor('session-1', {
        id: 'draft-1',
        label: 'Test Label',
        text: 'Test Content',
      });

      expect(mod.draftEditorState.draftId).toBe('draft-1');
      expect(mod.draftEditorState.label).toBe('Test Label');
      expect(mod.draftEditorState.text).toBe('Test Content');

      const labelInput = document.getElementById('draftLabelInput') as HTMLInputElement;
      const contentInput = document.getElementById('draftContentInput') as HTMLTextAreaElement;
      expect(labelInput.value).toBe('Test Label');
      expect(contentInput.value).toBe('Test Content');

      const editor = document.getElementById('draftEditor')!;
      const title = editor.querySelector('.draft-editor-title')!;
      expect(title.textContent).toContain('Edit Draft');
    });
  });

  // =========================================================================
  // hideDraftEditor
  // =========================================================================

  describe('hideDraftEditor', () => {
    beforeEach(() => {
      mod.initDraftEditor();
    });

    it('hides the editor', () => {
      mod.showDraftEditor('session-1');
      expect(mod.draftEditorState.visible).toBe(true);

      mod.hideDraftEditor();
      const editor = document.getElementById('draftEditor')!;
      expect(editor.style.display).toBe('none');
      expect(mod.draftEditorState.visible).toBe(false);
    });
  });

  // =========================================================================
  // isDraftEditorVisible
  // =========================================================================

  describe('isDraftEditorVisible', () => {
    beforeEach(() => {
      mod.initDraftEditor();
    });

    it('returns correct state', () => {
      expect(mod.isDraftEditorVisible()).toBe(false);
      mod.showDraftEditor('session-1');
      expect(mod.isDraftEditorVisible()).toBe(true);
      mod.hideDraftEditor();
      expect(mod.isDraftEditorVisible()).toBe(false);
    });
  });

  // =========================================================================
  // saveDraft
  // =========================================================================

  describe('saveDraft', () => {
    beforeEach(() => {
      mod.initDraftEditor();
    });

    it('creates new draft via IPC when draftId is null', async () => {
      mockDraftCreate.mockResolvedValue({ id: 'new-id', sessionId: 'session-1', label: 'My Draft', text: 'content', createdAt: Date.now() });

      mod.showDraftEditor('session-1');

      const labelInput = document.getElementById('draftLabelInput') as HTMLInputElement;
      const contentInput = document.getElementById('draftContentInput') as HTMLTextAreaElement;
      labelInput.value = 'My Draft';
      contentInput.value = 'content';

      await mod.saveDraft();

      expect(mockDraftCreate).toHaveBeenCalledWith('session-1', 'My Draft', 'content');
      expect(mod.draftEditorState.visible).toBe(false);
    });

    it('updates existing draft via IPC when draftId is set', async () => {
      mockDraftUpdate.mockResolvedValue({ id: 'draft-1', sessionId: 'session-1', label: 'Updated', text: 'new text', createdAt: Date.now() });

      mod.showDraftEditor('session-1', { id: 'draft-1', label: 'Old', text: 'old text' });

      const labelInput = document.getElementById('draftLabelInput') as HTMLInputElement;
      const contentInput = document.getElementById('draftContentInput') as HTMLTextAreaElement;
      labelInput.value = 'Updated';
      contentInput.value = 'new text';

      await mod.saveDraft();

      expect(mockDraftUpdate).toHaveBeenCalledWith('draft-1', { label: 'Updated', text: 'new text' });
      expect(mod.draftEditorState.visible).toBe(false);
    });

    it('hides editor after saving', async () => {
      mockDraftCreate.mockResolvedValue({ id: 'new-id', sessionId: 'session-1', label: 'Test', text: '', createdAt: Date.now() });

      mod.showDraftEditor('session-1');

      const labelInput = document.getElementById('draftLabelInput') as HTMLInputElement;
      labelInput.value = 'Test';

      await mod.saveDraft();

      const editor = document.getElementById('draftEditor')!;
      expect(editor.style.display).toBe('none');
      expect(mod.isDraftEditorVisible()).toBe(false);
    });

    it('does not save when label is empty', async () => {
      mod.showDraftEditor('session-1');

      const contentInput = document.getElementById('draftContentInput') as HTMLTextAreaElement;
      contentInput.value = 'some content';
      // Label is empty

      await mod.saveDraft();

      expect(mockDraftCreate).not.toHaveBeenCalled();
      expect(mockDraftUpdate).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Header title
  // =========================================================================

  describe('editor header', () => {
    beforeEach(() => {
      mod.initDraftEditor();
    });

    it('shows "New Draft" for new, "Edit Draft" for edit', () => {
      mod.showDraftEditor('session-1');
      const editor = document.getElementById('draftEditor')!;
      const title = editor.querySelector('.draft-editor-title')!;
      expect(title.textContent).toContain('New Draft');

      mod.showDraftEditor('session-1', { id: 'd1', label: 'Test', text: 'body' });
      expect(title.textContent).toContain('Edit Draft');
    });
  });

  // =========================================================================
  // handleDraftEditorButton — gamepad navigation
  // =========================================================================

  describe('handleDraftEditorButton', () => {
    beforeEach(() => {
      mod.initDraftEditor();
      mod.showDraftEditor('session-1');
    });

    it('starts with focusIndex 0 (title)', () => {
      expect(mod.draftEditorState.focusIndex).toBe(0);
    });

    it('D-pad Down cycles focus: title → content → save → cancel → title', () => {
      mod.handleDraftEditorButton('DPadDown');
      expect(mod.draftEditorState.focusIndex).toBe(1); // content
      expect(document.activeElement?.id).toBe('draftContentInput');

      mod.handleDraftEditorButton('DPadDown');
      expect(mod.draftEditorState.focusIndex).toBe(2); // save
      expect(document.activeElement?.id).toBe('draftSaveBtn');

      mod.handleDraftEditorButton('DPadDown');
      expect(mod.draftEditorState.focusIndex).toBe(3); // cancel
      expect(document.activeElement?.id).toBe('draftCancelBtn');

      mod.handleDraftEditorButton('DPadDown');
      expect(mod.draftEditorState.focusIndex).toBe(0); // wraps to title
      expect(document.activeElement?.id).toBe('draftLabelInput');
    });

    it('D-pad Up cycles focus in reverse', () => {
      mod.handleDraftEditorButton('DPadUp');
      expect(mod.draftEditorState.focusIndex).toBe(3); // wraps to cancel
      expect(document.activeElement?.id).toBe('draftCancelBtn');

      mod.handleDraftEditorButton('DPadUp');
      expect(mod.draftEditorState.focusIndex).toBe(2); // save
    });

    it('A button on Save triggers save', async () => {
      mockDraftCreate.mockResolvedValue({ id: 'new', sessionId: 'session-1', label: 'Test', text: '', createdAt: Date.now() });
      const labelInput = document.getElementById('draftLabelInput') as HTMLInputElement;
      labelInput.value = 'Test';

      // Navigate to Save button (index 2)
      mod.handleDraftEditorButton('DPadDown'); // content
      mod.handleDraftEditorButton('DPadDown'); // save
      expect(mod.draftEditorState.focusIndex).toBe(2);

      mod.handleDraftEditorButton('A');
      await flush();

      expect(mockDraftCreate).toHaveBeenCalled();
    });

    it('A button on Cancel closes editor', () => {
      // Navigate to Cancel button (index 3)
      mod.handleDraftEditorButton('DPadDown'); // content
      mod.handleDraftEditorButton('DPadDown'); // save
      mod.handleDraftEditorButton('DPadDown'); // cancel
      expect(mod.draftEditorState.focusIndex).toBe(3);

      mod.handleDraftEditorButton('A');
      expect(mod.isDraftEditorVisible()).toBe(false);
    });

    it('B button closes editor from any position', () => {
      mod.handleDraftEditorButton('DPadDown'); // content
      mod.handleDraftEditorButton('B');
      expect(mod.isDraftEditorVisible()).toBe(false);
    });

    it('A button is no-op on text fields', () => {
      // At title (index 0)
      mod.handleDraftEditorButton('A');
      expect(mod.isDraftEditorVisible()).toBe(true);
      expect(mockDraftCreate).not.toHaveBeenCalled();

      // At content (index 1)
      mod.handleDraftEditorButton('DPadDown');
      mod.handleDraftEditorButton('A');
      expect(mod.isDraftEditorVisible()).toBe(true);
      expect(mockDraftCreate).not.toHaveBeenCalled();
    });

    it('highlights Save/Cancel buttons when focused', () => {
      mod.handleDraftEditorButton('DPadDown'); // content
      mod.handleDraftEditorButton('DPadDown'); // save
      const saveBtn = document.getElementById('draftSaveBtn')!;
      expect(saveBtn.classList.contains('btn--focused')).toBe(true);

      mod.handleDraftEditorButton('DPadDown'); // cancel
      const cancelBtn = document.getElementById('draftCancelBtn')!;
      expect(cancelBtn.classList.contains('btn--focused')).toBe(true);
      expect(saveBtn.classList.contains('btn--focused')).toBe(false);
    });

    it('removes button highlight when focus returns to inputs', () => {
      mod.handleDraftEditorButton('DPadDown'); // content
      mod.handleDraftEditorButton('DPadDown'); // save
      mod.handleDraftEditorButton('DPadDown'); // cancel
      mod.handleDraftEditorButton('DPadDown'); // wraps to title

      const saveBtn = document.getElementById('draftSaveBtn')!;
      const cancelBtn = document.getElementById('draftCancelBtn')!;
      expect(saveBtn.classList.contains('btn--focused')).toBe(false);
      expect(cancelBtn.classList.contains('btn--focused')).toBe(false);
    });

    it('clears stale btn--focused highlight on editor reopen', () => {
      // Navigate to Save, then close with B
      mod.handleDraftEditorButton('DPadDown'); // content
      mod.handleDraftEditorButton('DPadDown'); // save
      const saveBtn = document.getElementById('draftSaveBtn')!;
      expect(saveBtn.classList.contains('btn--focused')).toBe(true);

      mod.handleDraftEditorButton('B'); // close

      // Reopen — stale highlight should be cleared
      mod.showDraftEditor('session-1');
      expect(saveBtn.classList.contains('btn--focused')).toBe(false);
      expect(mod.draftEditorState.focusIndex).toBe(0);
    });
  });
});
