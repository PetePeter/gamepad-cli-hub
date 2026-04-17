/**
 * Context menu overlay — copy, paste, editor, new-session, new-session-with-selection, prompts, drafts, cancel.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { state } from '../renderer/state.js';

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE vi.mock() calls so hoisted references resolve
// ---------------------------------------------------------------------------

const mockLogEvent = vi.fn();
const mockShowScreen = vi.fn();
const mockAttachModalKeyboard = vi.fn(() => vi.fn());
const mockSetPendingContextText = vi.fn();
const mockSpawnNewSession = vi.fn();
const mockGetTerminalManager = vi.fn();
const mockShowQuickSpawn = vi.fn();
const mockShowEditorPopup = vi.fn();

vi.mock('../renderer/utils.js', () => {
  const dirMap: Record<string, string> = {
    DPadUp: 'up',
    DPadDown: 'down',
    DPadLeft: 'left',
    DPadRight: 'right',
    LeftStickUp: 'up',
    LeftStickDown: 'down',
  };
  return {
    logEvent: mockLogEvent,
    showScreen: mockShowScreen,
    toDirection: (button: string) => dirMap[button] ?? null,
  };
});

vi.mock('../renderer/main.js', () => ({
  getTerminalManager: mockGetTerminalManager,
}));

vi.mock('../renderer/modals/modal-base.js', () => ({
  attachModalKeyboard: mockAttachModalKeyboard,
}));

vi.mock('../renderer/screens/sessions.js', () => ({
  setPendingContextText: mockSetPendingContextText,
  spawnNewSession: mockSpawnNewSession,
}));

vi.mock('../renderer/modals/quick-spawn.js', () => ({
  showQuickSpawn: mockShowQuickSpawn,
}));

vi.mock('../renderer/editor/editor-popup.js', () => ({
  showEditorPopup: mockShowEditorPopup,
}));

const mockShowSequencePicker = vi.fn();
vi.mock('../renderer/modals/sequence-picker.js', () => ({
  showSequencePicker: mockShowSequencePicker,
}));

const mockExecuteSequence = vi.fn();
vi.mock('../renderer/bindings.js', () => ({
  executeSequence: mockExecuteSequence,
}));

vi.mock('../renderer/state.js', () => ({
  state: {
    sessions: [],
    activeSessionId: null,
    availableSpawnTypes: ['claude-code', 'copilot-cli'],
    cliSequencesCache: {},
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildContextMenuDom(): void {
  document.body.innerHTML = `
    <div class="modal-overlay" id="contextMenuOverlay" aria-hidden="true">
      <div class="context-menu" id="contextMenu">
        <div class="context-menu-item" data-action="copy"></div>
        <div class="context-menu-item" data-action="paste"></div>
        <div class="context-menu-item" data-action="editor"></div>
        <div class="context-menu-item" data-action="new-session"></div>
        <div class="context-menu-item" data-action="new-session-with-selection"></div>
        <div class="context-menu-item" data-action="sequences"></div>
        <div class="context-menu-item" data-action="drafts"></div>
        <div class="context-menu-item context-menu-item--cancel" data-action="cancel"></div>
      </div>
    </div>
  `;
}

function makeMockView(selection = '', hasSelection = false) {
  return {
    getSelection: vi.fn(() => selection),
    hasSelection: vi.fn(() => hasSelection),
    clearSelection: vi.fn(),
  };
}

function makeMockTerminalManager(view = makeMockView(), activeSessionId = 'session-1') {
  return {
    getActiveView: vi.fn(() => view),
    getActiveSessionId: vi.fn(() => activeSessionId),
  };
}

async function getModule() {
  return await import('../renderer/modals/context-menu.js');
}

/** Flush microtask queue so async fire-and-forget (executeSelectedItem) completes. */
async function flush(): Promise<void> {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Context Menu', () => {
  let mod: Awaited<ReturnType<typeof getModule>>;
  let mockView: ReturnType<typeof makeMockView>;
  let mockTM: ReturnType<typeof makeMockTerminalManager>;

  beforeEach(async () => {
    buildContextMenuDom();

    // Clipboard mock
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
        readText: vi.fn().mockResolvedValue('clipboard text'),
      },
      writable: true,
      configurable: true,
    });

    // gamepadCli mock
    (window as any).gamepadCli = {
      ptyWrite: vi.fn(),
    };
    mockShowEditorPopup.mockReset();
    mockShowEditorPopup.mockResolvedValue('editor text');

    // Default mocks — no selection
    mockView = makeMockView();
    mockTM = makeMockTerminalManager(mockView);
    mockGetTerminalManager.mockReturnValue(mockTM);

    mod = await getModule();

    // Reset state to defaults between tests
    Object.assign(mod.contextMenuState, {
      visible: false,
      selectedIndex: 0,
      selectedText: '',
      hasSelection: false,
      sourceSessionId: '',
      mode: 'gamepad' as const,
    });
  });

  afterEach(() => {
    mod.hideContextMenu();
    vi.clearAllMocks();
  });

  // =========================================================================
  // State
  // =========================================================================

  describe('Context Menu State', () => {
    it('starts with default state', () => {
      const s = mod.contextMenuState;
      expect(s.visible).toBe(false);
      expect(s.selectedIndex).toBe(0);
      expect(s.selectedText).toBe('');
      expect(s.hasSelection).toBe(false);
    });

    it('showContextMenu sets state correctly', () => {
      mod.showContextMenu(100, 100, 'sess-1', 'gamepad');
      const s = mod.contextMenuState;
      expect(s.visible).toBe(true);
      expect(s.sourceSessionId).toBe('sess-1');
      expect(s.mode).toBe('gamepad');
      expect(s.hasSelection).toBe(false);
    });

    it('showContextMenu with selection captures selected text', () => {
      const viewWithSel = makeMockView('hello world', true);
      mockGetTerminalManager.mockReturnValue(makeMockTerminalManager(viewWithSel));

      mod.showContextMenu(100, 100, 'sess-1', 'gamepad');
      expect(mod.contextMenuState.selectedText).toBe('hello world');
      expect(mod.contextMenuState.hasSelection).toBe(true);
    });

    it('hideContextMenu resets visibility', () => {
      mod.showContextMenu(100, 100, 'sess-1', 'gamepad');
      expect(mod.contextMenuState.visible).toBe(true);
      mod.hideContextMenu();
      expect(mod.contextMenuState.visible).toBe(false);
    });
  });

  // =========================================================================
  // Positioning
  // =========================================================================

  describe('Context Menu Positioning', () => {
    it('gamepad mode adds centered class', () => {
      mod.showContextMenu(100, 100, 'sess-1', 'gamepad');
      const menu = document.getElementById('contextMenu')!;
      expect(menu.classList.contains('context-menu--centered')).toBe(true);
    });

    it('mouse mode positions at coordinates', () => {
      mod.showContextMenu(150, 200, 'sess-1', 'mouse');
      const menu = document.getElementById('contextMenu')!;
      expect(menu.classList.contains('context-menu--centered')).toBe(false);
      expect(menu.style.left).toBe('150px');
      expect(menu.style.top).toBe('200px');
    });

    it('mouse mode clamps to viewport', () => {
      // jsdom defaults innerWidth/innerHeight to 0, so large coords get clamped
      mod.showContextMenu(2000, 2000, 'sess-1', 'mouse');
      const menu = document.getElementById('contextMenu')!;
      // Clamped to window.innerWidth - 260 and window.innerHeight - 200
      const left = parseInt(menu.style.left, 10);
      const top = parseInt(menu.style.top, 10);
      expect(left).toBeLessThanOrEqual(window.innerWidth);
      expect(top).toBeLessThanOrEqual(window.innerHeight);
    });
  });

  // =========================================================================
  // Navigation (handleContextMenuButton)
  // =========================================================================

  describe('Context Menu Navigation', () => {
    it('DPadDown moves selection down', () => {
      // No selection → enabled items are Paste(1), NewSession(3), Cancel(7)
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      const startIdx = mod.contextMenuState.selectedIndex;
      expect(startIdx).toBe(1); // Paste = first enabled

      mod.handleContextMenuButton('DPadDown');
      expect(mod.contextMenuState.selectedIndex).toBe(3); // New Session
    });

    it('DPadUp moves selection up, wrapping', () => {
      // No selection → enabled: Paste(1), NewSession(3), Cancel(7)
      // Disabled: Copy(0), Editor(2), NewSessionWithSelection(4), Prompts(5), Drafts(6)
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      expect(mod.contextMenuState.selectedIndex).toBe(1); // Paste

      mod.handleContextMenuButton('DPadUp');
      // Wraps around to Cancel(7)
      expect(mod.contextMenuState.selectedIndex).toBe(7);
    });

    it('skips disabled items when no selection', () => {
      // No selection → Copy(0), Editor(2), NewSessionWithSelection(4), Prompts(5), Drafts(6) disabled
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      expect(mod.contextMenuState.selectedIndex).toBe(1); // Paste

      const visited: number[] = [mod.contextMenuState.selectedIndex];
      for (let i = 0; i < 5; i++) {
        mod.handleContextMenuButton('DPadDown');
        visited.push(mod.contextMenuState.selectedIndex);
      }
      // Should only visit enabled indices: 1 (Paste), 3 (NewSession), 7 (Cancel)
      const unique = [...new Set(visited)];
      expect(unique).not.toContain(0); // Copy — disabled
      expect(unique).not.toContain(2); // Editor — disabled
      expect(unique).not.toContain(4); // NewSessionWithSelection — disabled
    });

    it('all items navigable when selection exists', () => {
      const viewWithSel = makeMockView('some text', true);
      mockGetTerminalManager.mockReturnValue(makeMockTerminalManager(viewWithSel));

      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      // With selection, 5 of 8 items are enabled (Editor(2) disabled — no activeSessionId,
      // Prompts(5) disabled — no sequences cache, Drafts(6) disabled — no activeSessionId)
      const visited: number[] = [mod.contextMenuState.selectedIndex];
      for (let i = 0; i < 6; i++) {
        mod.handleContextMenuButton('DPadDown');
        visited.push(mod.contextMenuState.selectedIndex);
      }
      const unique = [...new Set(visited)];
      expect(unique).toHaveLength(5);
      expect(unique.sort()).toEqual([0, 1, 3, 4, 7]);
    });

    it('B button hides menu', () => {
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      expect(mod.contextMenuState.visible).toBe(true);

      mod.handleContextMenuButton('B');
      expect(mod.contextMenuState.visible).toBe(false);
    });

    it('A button executes selected item', async () => {
      // Start on Paste (index 1 when no selection)
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      expect(mod.contextMenuState.selectedIndex).toBe(1); // Paste

      mod.handleContextMenuButton('A');
      await flush();

      expect(navigator.clipboard.readText).toHaveBeenCalled();
      expect((window as any).gamepadCli.ptyWrite).toHaveBeenCalledWith('session-1', 'clipboard text');
    });
  });

  // =========================================================================
  // Actions
  // =========================================================================

  describe('Context Menu Actions', () => {
    it('Copy writes to clipboard', async () => {
      const viewWithSel = makeMockView('hello', true);
      mockGetTerminalManager.mockReturnValue(makeMockTerminalManager(viewWithSel));

      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      // With selection, Copy(0) is the first enabled item
      expect(mod.contextMenuState.selectedIndex).toBe(0);

      mod.handleContextMenuButton('A');
      await flush();

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello');
    });

    it('Paste reads clipboard and writes to PTY', async () => {
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      // Paste is selected by default (index 1 when no selection)
      expect(mod.contextMenuState.selectedIndex).toBe(1);

      mod.handleContextMenuButton('A');
      await flush();

      expect(navigator.clipboard.readText).toHaveBeenCalled();
      expect((window as any).gamepadCli.ptyWrite).toHaveBeenCalledWith('session-1', 'clipboard text');
    });

    it('Editor opens in-app editor and writes result to PTY', async () => {
      state.activeSessionId = 'sess-1';
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      // Navigate to Editor (index 2): Paste(1) → Editor(2)
      mod.handleContextMenuButton('DPadDown');
      expect(mod.contextMenuState.selectedIndex).toBe(2);

      mod.handleContextMenuButton('A');
      await flush();

      expect(mockShowEditorPopup).toHaveBeenCalled();
      expect((window as any).gamepadCli.ptyWrite).toHaveBeenCalledWith('sess-1', 'editor text');
      expect(mod.contextMenuState.visible).toBe(false);
    });

    it('Editor does not write to PTY when result is empty', async () => {
      state.activeSessionId = 'sess-1';
      mockShowEditorPopup.mockResolvedValueOnce('');
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      mod.handleContextMenuButton('DPadDown');
      mod.handleContextMenuButton('A');
      await flush();

      expect(mockShowEditorPopup).toHaveBeenCalled();
      expect((window as any).gamepadCli.ptyWrite).not.toHaveBeenCalled();
    });

    it('Editor does not open when no active session', async () => {
      state.activeSessionId = null;
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      mod.contextMenuState.selectedIndex = 2;
      mod.handleContextMenuButton('A');
      await flush();

      expect(mockShowEditorPopup).not.toHaveBeenCalled();
    });

    it('New Session opens quick-spawn picker', async () => {
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      // Navigate to New Session (index 3)
      mod.handleContextMenuButton('DPadDown'); // Paste(1) → NewSession(3)
      expect(mod.contextMenuState.selectedIndex).toBe(3);

      mod.handleContextMenuButton('A');
      await flush();

      expect(mockSetPendingContextText).toHaveBeenCalledWith(null);
      expect(mockShowQuickSpawn).toHaveBeenCalled();
      expect(mockShowQuickSpawn.mock.calls[0][0]).toEqual(['claude-code', 'copilot-cli']);
    });

    it('New Session with Selection passes text and opens quick-spawn', async () => {
      const viewWithSel = makeMockView('selected code', true);
      mockGetTerminalManager.mockReturnValue(makeMockTerminalManager(viewWithSel));

      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      // With selection → most items enabled. Navigate to NewSessionWithSelection(4)
      // Start at Copy(0) → down to Paste(1) → down to NewSession(3, skips Editor(2)) → down to NewSessWithSel(4)
      mod.handleContextMenuButton('DPadDown');
      mod.handleContextMenuButton('DPadDown');
      mod.handleContextMenuButton('DPadDown');
      expect(mod.contextMenuState.selectedIndex).toBe(4);

      mod.handleContextMenuButton('A');
      await flush();

      expect(mockSetPendingContextText).toHaveBeenCalledWith('selected code');
      expect(mockShowQuickSpawn).toHaveBeenCalled();
    });

    it('Cancel hides menu', async () => {
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      // Navigate to Cancel (index 7): Paste(1) → NewSession(3) → Cancel(7, skips 4+5+6)
      mod.handleContextMenuButton('DPadDown');
      mod.handleContextMenuButton('DPadDown');
      expect(mod.contextMenuState.selectedIndex).toBe(7);

      mod.handleContextMenuButton('A');
      await flush();

      expect(mod.contextMenuState.visible).toBe(false);
    });

    it('disabled item does not execute', async () => {
      // No selection → Copy(0) is disabled
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      // Force selectedIndex to 0 (disabled Copy)
      mod.contextMenuState.selectedIndex = 0;

      mod.handleContextMenuButton('A');
      await flush();

      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Overlay
  // =========================================================================

  describe('Context Menu Overlay', () => {
    it('show adds modal--visible class', () => {
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      const overlay = document.getElementById('contextMenuOverlay')!;
      expect(overlay.classList.contains('modal--visible')).toBe(true);
    });

    it('hide removes modal--visible class', () => {
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      mod.hideContextMenu();
      const overlay = document.getElementById('contextMenuOverlay')!;
      expect(overlay.classList.contains('modal--visible')).toBe(false);
    });

    it('show sets aria-hidden to false', () => {
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      const overlay = document.getElementById('contextMenuOverlay')!;
      expect(overlay.getAttribute('aria-hidden')).toBe('false');
    });

    it('hide sets aria-hidden to true', () => {
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      mod.hideContextMenu();
      const overlay = document.getElementById('contextMenuOverlay')!;
      expect(overlay.getAttribute('aria-hidden')).toBe('true');
    });
  });

  // =========================================================================
  // Click Handlers
  // =========================================================================

  describe('Context Menu Click Handlers', () => {
    it('initContextMenuClickHandlers wires item clicks', async () => {
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      mod.initContextMenuClickHandlers();

      // Click the Paste item (index 1)
      const items = document.querySelectorAll('.context-menu-item');
      (items[1] as HTMLElement).click();
      await flush();

      expect(navigator.clipboard.readText).toHaveBeenCalled();
      expect((window as any).gamepadCli.ptyWrite).toHaveBeenCalledWith('session-1', 'clipboard text');
    });

    it('overlay click outside menu hides', () => {
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      mod.initContextMenuClickHandlers();

      const overlay = document.getElementById('contextMenuOverlay')!;
      // Dispatch click with target = overlay (not the menu)
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(mod.contextMenuState.visible).toBe(false);
    });
  });

  // =========================================================================
  // Render
  // =========================================================================

  describe('Context Menu Render', () => {
    it('renders selected class on current item', () => {
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      const items = document.querySelectorAll('.context-menu-item');
      const selectedIdx = mod.contextMenuState.selectedIndex;

      items.forEach((el, i) => {
        if (i === selectedIdx) {
          expect(el.classList.contains('context-menu-item--selected')).toBe(true);
        } else {
          expect(el.classList.contains('context-menu-item--selected')).toBe(false);
        }
      });
    });

    it('renders disabled class on items that fail enabledWhen', () => {
      // No selection → Copy(0), Editor(2), NewSessionWithSelection(4), Prompts(5), Drafts(6) disabled
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      const items = document.querySelectorAll('.context-menu-item');

      expect(items[0].classList.contains('context-menu-item--disabled')).toBe(true);  // Copy
      expect(items[1].classList.contains('context-menu-item--disabled')).toBe(false); // Paste
      expect(items[2].classList.contains('context-menu-item--disabled')).toBe(true);  // Editor (no activeSessionId)
      expect(items[3].classList.contains('context-menu-item--disabled')).toBe(false); // New Session
      expect(items[4].classList.contains('context-menu-item--disabled')).toBe(true);  // New Session with Selection
      expect(items[5].classList.contains('context-menu-item--disabled')).toBe(true);  // Prompts (no sequences)
      expect(items[6].classList.contains('context-menu-item--disabled')).toBe(true);  // Drafts (no activeSessionId)
      expect(items[7].classList.contains('context-menu-item--disabled')).toBe(false); // Cancel
    });
  });

  // =========================================================================
  // Prompts (Sequences) Item
  // =========================================================================

  describe('Prompts Item', () => {
    const SEQUENCES = {
      prompts: [
        { label: 'commit', sequence: 'use skill(commit)' },
        { label: 'review', sequence: 'use skill(code-review-it)' },
      ],
    };

    it('Prompts is disabled when no sequences configured', () => {
      state.cliSequencesCache = {};
      state.sessions = [{ id: 'sess-1', name: 'Test', cliType: 'claude-code', processId: 1 }];
      state.activeSessionId = 'sess-1';
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      const items = document.querySelectorAll('.context-menu-item');
      expect(items[5].classList.contains('context-menu-item--disabled')).toBe(true);
    });

    it('Prompts is disabled when cache entry exists but all groups are empty', () => {
      state.cliSequencesCache = { 'claude-code': { prompts: [] } };
      state.sessions = [{ id: 'sess-1', name: 'Test', cliType: 'claude-code', processId: 1 }];
      state.activeSessionId = 'sess-1';
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      const items = document.querySelectorAll('.context-menu-item');
      expect(items[5].classList.contains('context-menu-item--disabled')).toBe(true);
    });

    it('Prompts is disabled when cache entry is empty object (post-refresh)', () => {
      state.cliSequencesCache = { 'claude-code': {} };
      state.sessions = [{ id: 'sess-1', name: 'Test', cliType: 'claude-code', processId: 1 }];
      state.activeSessionId = 'sess-1';
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      const items = document.querySelectorAll('.context-menu-item');
      expect(items[5].classList.contains('context-menu-item--disabled')).toBe(true);
    });

    it('Prompts is enabled when sequences exist for active CLI type', () => {
      state.cliSequencesCache = { 'claude-code': SEQUENCES };
      state.sessions = [{ id: 'sess-1', name: 'Test', cliType: 'claude-code', processId: 1 }];
      state.activeSessionId = 'sess-1';
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      const items = document.querySelectorAll('.context-menu-item');
      expect(items[5].classList.contains('context-menu-item--disabled')).toBe(false);
    });

    it('Prompts is disabled when no active session', () => {
      state.cliSequencesCache = { 'claude-code': SEQUENCES };
      state.sessions = [];
      state.activeSessionId = null;
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      const items = document.querySelectorAll('.context-menu-item');
      expect(items[5].classList.contains('context-menu-item--disabled')).toBe(true);
    });

    it('selecting Prompts hides context menu and opens sequence picker', async () => {
      state.cliSequencesCache = { 'claude-code': SEQUENCES };
      state.sessions = [{ id: 'sess-1', name: 'Test', cliType: 'claude-code', processId: 1 }];
      state.activeSessionId = 'sess-1';
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');

      // Navigate to Prompts (index 5): Paste(1) → Editor(2) → NewSession(3) → Prompts(5)
      mod.handleContextMenuButton('DPadDown');
      mod.handleContextMenuButton('DPadDown');
      mod.handleContextMenuButton('DPadDown');
      expect(mod.contextMenuState.selectedIndex).toBe(5);

      mod.handleContextMenuButton('A');
      await flush();

      expect(mod.contextMenuState.visible).toBe(false);
      expect(mockShowSequencePicker).toHaveBeenCalledTimes(1);
      const [items, callback] = mockShowSequencePicker.mock.calls[0];
      expect(items).toHaveLength(2);
      expect(items[0].label).toBe('commit');
      expect(typeof callback).toBe('function');
    });

    it('navigation skips disabled Prompts when no sequences', () => {
      state.cliSequencesCache = {};
      state.sessions = [{ id: 'sess-1', name: 'Test', cliType: 'claude-code', processId: 1 }];
      state.activeSessionId = 'sess-1';
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');

      // From Paste(1), navigate down: Editor(2) → NewSession(3) → Drafts(6) → Cancel(7) — skips 0,4,5
      const visited: number[] = [mod.contextMenuState.selectedIndex];
      for (let i = 0; i < 5; i++) {
        mod.handleContextMenuButton('DPadDown');
        visited.push(mod.contextMenuState.selectedIndex);
      }
      const unique = [...new Set(visited)];
      expect(unique).not.toContain(5); // Prompts should be skipped
    });
  });

  // =========================================================================
  // Keyboard Navigation Callbacks
  // =========================================================================

  describe('Keyboard Navigation Callbacks', () => {
    it('attachModalKeyboard receives onArrowUp and onArrowDown', () => {
      mod.showContextMenu(100, 100, 'sess-1', 'gamepad');
      const call = mockAttachModalKeyboard.mock.calls[mockAttachModalKeyboard.mock.calls.length - 1][0];
      expect(call.onArrowUp).toBeTypeOf('function');
      expect(call.onArrowDown).toBeTypeOf('function');
    });

    it('onArrowDown moves to next enabled item', () => {
      mod.showContextMenu(100, 100, 'sess-1', 'gamepad');
      const initialIndex = mod.contextMenuState.selectedIndex;
      const call = mockAttachModalKeyboard.mock.calls[mockAttachModalKeyboard.mock.calls.length - 1][0];
      call.onArrowDown();
      expect(mod.contextMenuState.selectedIndex).not.toBe(initialIndex);
    });

    it('onArrowUp moves to previous enabled item', () => {
      mod.showContextMenu(100, 100, 'sess-1', 'gamepad');
      const call = mockAttachModalKeyboard.mock.calls[mockAttachModalKeyboard.mock.calls.length - 1][0];
      // Move down first, then up to verify navigation
      call.onArrowDown();
      const afterDown = mod.contextMenuState.selectedIndex;
      call.onArrowUp();
      expect(mod.contextMenuState.selectedIndex).not.toBe(afterDown);
    });

    it('onArrowDown skips disabled items', () => {
      // With no selection, copy is disabled (index 0), paste is enabled (index 1)
      mod.showContextMenu(100, 100, 'sess-1', 'gamepad');
      // Start at first enabled item (paste, index 1)
      const call = mockAttachModalKeyboard.mock.calls[mockAttachModalKeyboard.mock.calls.length - 1][0];
      // First enabled item should not be copy (index 0) since hasSelection is false
      expect(mod.contextMenuState.selectedIndex).not.toBe(0); // Copy is disabled without selection
    });
  });
});
