/**
 * Draft submenu + draft action picker tests.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE vi.mock() calls so hoisted references resolve
// ---------------------------------------------------------------------------

const mockLogEvent = vi.fn();
const mockAttachModalKeyboard = vi.fn(() => vi.fn());
const mockShowDraftEditor = vi.fn();
const mockExecuteSequence = vi.fn().mockResolvedValue(undefined);
const mockRefreshDraftStrip = vi.fn().mockResolvedValue(undefined);

vi.mock('../renderer/utils.js', () => {
  const dirMap: Record<string, string> = {
    DPadUp: 'up',
    DPadDown: 'down',
    DPadLeft: 'left',
    DPadRight: 'right',
  };
  return {
    logEvent: mockLogEvent,
    toDirection: (button: string) => dirMap[button] ?? null,
    escapeHtml: (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  };
});

vi.mock('../renderer/modals/modal-base.js', () => ({
  attachModalKeyboard: mockAttachModalKeyboard,
}));

vi.mock('../renderer/state.js', () => ({
  state: {
    sessions: [],
    activeSessionId: 'session-1',
  },
}));

vi.mock('../renderer/drafts/draft-editor.js', () => ({
  showDraftEditor: mockShowDraftEditor,
}));

vi.mock('../renderer/bindings.js', () => ({
  executeSequence: mockExecuteSequence,
}));

vi.mock('../renderer/drafts/draft-strip.js', () => ({
  refreshDraftStrip: mockRefreshDraftStrip,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDraftSubmenuDom(): void {
  document.body.innerHTML = `
    <div class="modal-overlay" id="draftSubmenuOverlay" aria-hidden="true">
      <div class="context-menu context-menu--centered" id="draftSubmenu"></div>
    </div>
    <div class="modal-overlay" id="draftActionOverlay" aria-hidden="true">
      <div class="context-menu context-menu--centered" id="draftActionMenu"></div>
    </div>
  `;
}

const sampleDrafts = [
  { id: 'd1', sessionId: 'session-1', label: 'Deploy script', text: 'npm run deploy', createdAt: 1000 },
  { id: 'd2', sessionId: 'session-1', label: 'Test suite', text: 'npm test', createdAt: 2000 },
];

async function getModule() {
  return await import('../renderer/modals/draft-submenu.js');
}

/** Flush microtask queue so async fire-and-forget completes. */
async function flush(): Promise<void> {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Draft Submenu', () => {
  let mod: Awaited<ReturnType<typeof getModule>>;

  beforeEach(async () => {
    buildDraftSubmenuDom();

    // gamepadCli mock with draft IPC methods
    (window as any).gamepadCli = {
      draftList: vi.fn().mockResolvedValue(sampleDrafts),
      draftDelete: vi.fn().mockResolvedValue(true),
      draftCreate: vi.fn(),
      draftUpdate: vi.fn(),
      draftCount: vi.fn().mockResolvedValue(0),
    };

    mod = await getModule();

    // Reset state between tests
    Object.assign(mod.draftSubmenuState, {
      visible: false,
      selectedIndex: 0,
      drafts: [],
    });
    Object.assign(mod.draftActionState, {
      visible: false,
      selectedIndex: 0,
      draft: null,
    });
  });

  afterEach(() => {
    mod.hideDraftSubmenu();
    mod.hideDraftActionPicker();
    vi.clearAllMocks();
  });

  // =========================================================================
  // Draft Submenu — Show / Hide / Visibility
  // =========================================================================

  describe('showDraftSubmenu', () => {
    it('renders "New Draft" item', async () => {
      await mod.showDraftSubmenu();
      const menu = document.getElementById('draftSubmenu')!;
      const items = menu.querySelectorAll('.context-menu-item');
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items[0].textContent).toContain('New Draft');
    });

    it('renders existing draft labels', async () => {
      await mod.showDraftSubmenu();
      const menu = document.getElementById('draftSubmenu')!;
      const items = menu.querySelectorAll('.context-menu-item');
      // 1 "New Draft" + 2 sample drafts = 3
      expect(items.length).toBe(3);
      expect(items[1].textContent).toContain('Deploy script');
      expect(items[2].textContent).toContain('Test suite');
    });

    it('sets visible to true and shows overlay', async () => {
      expect(mod.draftSubmenuState.visible).toBe(false);
      await mod.showDraftSubmenu();
      expect(mod.draftSubmenuState.visible).toBe(true);
      const overlay = document.getElementById('draftSubmenuOverlay')!;
      expect(overlay.classList.contains('modal--visible')).toBe(true);
      expect(overlay.getAttribute('aria-hidden')).toBe('false');
    });

    it('calls attachModalKeyboard', async () => {
      await mod.showDraftSubmenu();
      expect(mockAttachModalKeyboard).toHaveBeenCalledTimes(1);
    });

    it('renders empty list when no drafts exist', async () => {
      (window as any).gamepadCli.draftList = vi.fn().mockResolvedValue([]);
      await mod.showDraftSubmenu();
      const menu = document.getElementById('draftSubmenu')!;
      const items = menu.querySelectorAll('.context-menu-item');
      expect(items.length).toBe(1); // Only "New Draft"
      // No separator should exist
      expect(menu.querySelectorAll('.context-menu-separator').length).toBe(0);
    });

    it('renders separator when drafts exist', async () => {
      await mod.showDraftSubmenu();
      const menu = document.getElementById('draftSubmenu')!;
      expect(menu.querySelectorAll('.context-menu-separator').length).toBe(1);
    });

    it('truncates long labels', async () => {
      const longDraft = [{ id: 'd3', sessionId: 'session-1', label: 'A'.repeat(50), text: 'test', createdAt: 3000 }];
      (window as any).gamepadCli.draftList = vi.fn().mockResolvedValue(longDraft);
      await mod.showDraftSubmenu();
      const menu = document.getElementById('draftSubmenu')!;
      const items = menu.querySelectorAll('.context-menu-item');
      const lastItem = items[items.length - 1];
      const textSpan = lastItem.querySelector('.item-text');
      expect(textSpan!.textContent!.length).toBeLessThanOrEqual(30);
      expect(textSpan!.textContent).toContain('...');
    });
  });

  describe('hideDraftSubmenu', () => {
    it('hides the overlay and resets visible', async () => {
      await mod.showDraftSubmenu();
      expect(mod.draftSubmenuState.visible).toBe(true);

      mod.hideDraftSubmenu();
      expect(mod.draftSubmenuState.visible).toBe(false);
      const overlay = document.getElementById('draftSubmenuOverlay')!;
      expect(overlay.classList.contains('modal--visible')).toBe(false);
      expect(overlay.getAttribute('aria-hidden')).toBe('true');
    });
  });

  describe('isDraftSubmenuVisible', () => {
    it('returns false when not visible', () => {
      expect(mod.isDraftSubmenuVisible()).toBe(false);
    });

    it('returns true when visible', async () => {
      await mod.showDraftSubmenu();
      expect(mod.isDraftSubmenuVisible()).toBe(true);
    });

    it('returns false after hiding', async () => {
      await mod.showDraftSubmenu();
      mod.hideDraftSubmenu();
      expect(mod.isDraftSubmenuVisible()).toBe(false);
    });
  });

  // =========================================================================
  // Draft Submenu — Selection
  // =========================================================================

  describe('Submenu selection', () => {
    it('selecting "New Draft" opens draft editor', async () => {
      await mod.showDraftSubmenu();
      // Index 0 = New Draft (already selected by default)
      mod.handleDraftSubmenuButton('A');
      await flush();
      expect(mockShowDraftEditor).toHaveBeenCalledWith('session-1');
    });

    it('selecting existing draft opens action picker', async () => {
      await mod.showDraftSubmenu();
      // Move to first draft (index 1)
      mod.handleDraftSubmenuButton('DPadDown');
      mod.handleDraftSubmenuButton('A');
      await flush();
      expect(mod.isDraftActionVisible()).toBe(true);
    });
  });

  // =========================================================================
  // Gamepad button handler — draft submenu
  // =========================================================================

  describe('handleDraftSubmenuButton', () => {
    it('A button executes selected item', async () => {
      await mod.showDraftSubmenu();
      mod.handleDraftSubmenuButton('A');
      await flush();
      // Default index 0 = New Draft → opens editor
      expect(mockShowDraftEditor).toHaveBeenCalled();
    });

    it('B button hides submenu', async () => {
      await mod.showDraftSubmenu();
      expect(mod.isDraftSubmenuVisible()).toBe(true);
      mod.handleDraftSubmenuButton('B');
      expect(mod.isDraftSubmenuVisible()).toBe(false);
    });

    it('DPadDown moves selection down', async () => {
      await mod.showDraftSubmenu();
      expect(mod.draftSubmenuState.selectedIndex).toBe(0);
      mod.handleDraftSubmenuButton('DPadDown');
      expect(mod.draftSubmenuState.selectedIndex).toBe(1);
    });

    it('DPadUp wraps to last item', async () => {
      await mod.showDraftSubmenu();
      expect(mod.draftSubmenuState.selectedIndex).toBe(0);
      mod.handleDraftSubmenuButton('DPadUp');
      // Wraps to last: 1 + 2 drafts = 3 items total, last = index 2
      expect(mod.draftSubmenuState.selectedIndex).toBe(2);
    });

    it('DPadDown wraps from last to first', async () => {
      await mod.showDraftSubmenu();
      mod.draftSubmenuState.selectedIndex = 2; // last item
      mod.handleDraftSubmenuButton('DPadDown');
      expect(mod.draftSubmenuState.selectedIndex).toBe(0);
    });
  });

  // =========================================================================
  // Draft Action Picker
  // =========================================================================

  describe('Draft Action Picker', () => {
    const testDraft = { id: 'd1', label: 'Deploy script', text: 'npm run deploy' };

    it('showDraftActionPicker sets visible and renders', async () => {
      await mod.showDraftActionPicker(testDraft);
      expect(mod.isDraftActionVisible()).toBe(true);
      const overlay = document.getElementById('draftActionOverlay')!;
      expect(overlay.classList.contains('modal--visible')).toBe(true);
    });

    it('renders draft label as header', async () => {
      await mod.showDraftActionPicker(testDraft);
      const menu = document.getElementById('draftActionMenu')!;
      const disabledItem = menu.querySelector('.context-menu-item--disabled');
      expect(disabledItem).not.toBeNull();
      expect(disabledItem!.textContent).toContain('Deploy script');
    });

    it('renders Apply, Edit, Delete, Cancel actions', async () => {
      await mod.showDraftActionPicker(testDraft);
      const menu = document.getElementById('draftActionMenu')!;
      const text = menu.textContent;
      expect(text).toContain('Apply');
      expect(text).toContain('Edit');
      expect(text).toContain('Delete');
      expect(text).toContain('Cancel');
    });

    it('Apply action calls executeSequence and deletes draft', async () => {
      await mod.showDraftActionPicker(testDraft);
      // Index 0 = Apply (default)
      mod.handleDraftActionButton('A');
      await flush();
      expect(mockExecuteSequence).toHaveBeenCalledWith('npm run deploy');
      expect((window as any).gamepadCli.draftDelete).toHaveBeenCalledWith('d1');
      expect(mockRefreshDraftStrip).toHaveBeenCalled();
      expect(mod.isDraftActionVisible()).toBe(false);
    });

    it('Edit action opens draft editor with existing data', async () => {
      await mod.showDraftActionPicker(testDraft);
      // Move to Edit (index 1)
      mod.handleDraftActionButton('DPadDown');
      mod.handleDraftActionButton('A');
      await flush();
      expect(mockShowDraftEditor).toHaveBeenCalledWith('session-1', testDraft);
      expect(mod.isDraftActionVisible()).toBe(false);
    });

    it('Delete action calls draftDelete and refreshes strip', async () => {
      await mod.showDraftActionPicker(testDraft);
      // Move to Delete (index 2)
      mod.handleDraftActionButton('DPadDown');
      mod.handleDraftActionButton('DPadDown');
      mod.handleDraftActionButton('A');
      await flush();
      expect((window as any).gamepadCli.draftDelete).toHaveBeenCalledWith('d1');
      expect(mockRefreshDraftStrip).toHaveBeenCalled();
      expect(mockExecuteSequence).not.toHaveBeenCalled(); // Not applied, just deleted
      expect(mod.isDraftActionVisible()).toBe(false);
    });

    it('Cancel hides the action picker', async () => {
      await mod.showDraftActionPicker(testDraft);
      // Move to Cancel (index 3)
      mod.handleDraftActionButton('DPadDown');
      mod.handleDraftActionButton('DPadDown');
      mod.handleDraftActionButton('DPadDown');
      mod.handleDraftActionButton('A');
      await flush();
      expect(mod.isDraftActionVisible()).toBe(false);
    });

    it('hideDraftActionPicker hides overlay and resets state', async () => {
      await mod.showDraftActionPicker(testDraft);
      mod.hideDraftActionPicker();
      expect(mod.isDraftActionVisible()).toBe(false);
      const overlay = document.getElementById('draftActionOverlay')!;
      expect(overlay.classList.contains('modal--visible')).toBe(false);
    });

    it('isDraftActionVisible returns correct state', async () => {
      expect(mod.isDraftActionVisible()).toBe(false);
      await mod.showDraftActionPicker(testDraft);
      expect(mod.isDraftActionVisible()).toBe(true);
      mod.hideDraftActionPicker();
      expect(mod.isDraftActionVisible()).toBe(false);
    });
  });

  // =========================================================================
  // Draft Action Picker — Gamepad buttons
  // =========================================================================

  describe('handleDraftActionButton', () => {
    const testDraft = { id: 'd1', label: 'Deploy script', text: 'npm run deploy' };

    it('A button executes selected action', async () => {
      await mod.showDraftActionPicker(testDraft);
      mod.handleDraftActionButton('A');
      await flush();
      // Default index 0 = Apply
      expect(mockExecuteSequence).toHaveBeenCalledWith('npm run deploy');
    });

    it('B button hides action picker', async () => {
      await mod.showDraftActionPicker(testDraft);
      mod.handleDraftActionButton('B');
      expect(mod.isDraftActionVisible()).toBe(false);
    });

    it('DPadDown moves selection down', async () => {
      await mod.showDraftActionPicker(testDraft);
      expect(mod.draftActionState.selectedIndex).toBe(0);
      mod.handleDraftActionButton('DPadDown');
      expect(mod.draftActionState.selectedIndex).toBe(1);
    });

    it('DPadUp wraps from first to last', async () => {
      await mod.showDraftActionPicker(testDraft);
      expect(mod.draftActionState.selectedIndex).toBe(0);
      mod.handleDraftActionButton('DPadUp');
      expect(mod.draftActionState.selectedIndex).toBe(3); // Cancel
    });
  });

  // =========================================================================
  // Click handler wiring
  // =========================================================================

  describe('Click handlers', () => {
    it('clicking overlay background closes submenu', async () => {
      mod.initDraftSubmenuClickHandlers();
      await mod.showDraftSubmenu();
      expect(mod.isDraftSubmenuVisible()).toBe(true);

      const overlay = document.getElementById('draftSubmenuOverlay')!;
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      // Click target === overlay → should close
      expect(mod.isDraftSubmenuVisible()).toBe(false);
    });

    it('clicking overlay background closes action picker', async () => {
      mod.initDraftActionClickHandlers();
      const testDraft = { id: 'd1', label: 'Test', text: 'text' };
      await mod.showDraftActionPicker(testDraft);
      expect(mod.isDraftActionVisible()).toBe(true);

      const overlay = document.getElementById('draftActionOverlay')!;
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(mod.isDraftActionVisible()).toBe(false);
    });

    it('clicking a draft item selects and executes it', async () => {
      await mod.showDraftSubmenu();
      const menu = document.getElementById('draftSubmenu')!;
      const items = menu.querySelectorAll('.context-menu-item');
      // Click "New Draft" (index 0)
      (items[0] as HTMLElement).click();
      await flush();
      expect(mockShowDraftEditor).toHaveBeenCalledWith('session-1');
    });
  });
});
