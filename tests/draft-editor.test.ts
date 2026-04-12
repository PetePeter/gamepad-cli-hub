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
  getDraftCount: vi.fn(),
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
});
