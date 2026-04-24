/**
 * Context menu bridge — tests for showContextMenu / hideContextMenu state,
 * hasSequenceItems, and collectSequenceItems.
 *
 * The module now sets reactive bridge state (contextMenuState + contextMenu)
 * instead of manipulating DOM. Vue ContextMenu.vue handles rendering & actions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { state } from '../renderer/state.js';

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE vi.mock() calls so hoisted references resolve
// ---------------------------------------------------------------------------

const mockLogEvent = vi.fn();
const mockGetTerminalManager = vi.fn();

vi.mock('vue', () => ({
  reactive: (obj: any) => obj,
}));

vi.mock('../renderer/utils.js', () => ({
  logEvent: mockLogEvent,
}));

vi.mock('../renderer/runtime/terminal-provider.js', () => ({
  getTerminalManager: mockGetTerminalManager,
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

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Context Menu', () => {
  let mod: Awaited<ReturnType<typeof getModule>>;
  let bridge: typeof import('../renderer/stores/modal-bridge.js')['contextMenu'];
  let mockView: ReturnType<typeof makeMockView>;
  let mockTM: ReturnType<typeof makeMockTerminalManager>;

  beforeEach(async () => {
    // Default mocks — no selection
    mockView = makeMockView();
    mockTM = makeMockTerminalManager(mockView);
    mockGetTerminalManager.mockReturnValue(mockTM);

    mod = await getModule();
    const bridgeMod = await import('../renderer/stores/modal-bridge.js');
    bridge = bridgeMod.contextMenu;

    // Reset legacy state to defaults between tests
    Object.assign(mod.contextMenuState, {
      visible: false,
      selectedIndex: 0,
      selectedText: '',
      hasSelection: false,
      sourceSessionId: '',
      mode: 'gamepad' as const,
    });

    // Reset bridge state
    Object.assign(bridge, {
      visible: false,
      mode: 'gamepad' as const,
      mouseX: 0,
      mouseY: 0,
      selectedText: '',
      hasSelection: false,
      sourceSessionId: '',
    });

    // Reset app state
    state.sessions = [];
    state.activeSessionId = null;
    state.cliSequencesCache = {};
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
  // Bridge State (contextMenu reactive object)
  // =========================================================================

  describe('Context Menu Bridge State', () => {
    it('gamepad mode sets bridge mode to gamepad', () => {
      mod.showContextMenu(100, 100, 'sess-1', 'gamepad');
      expect(bridge.mode).toBe('gamepad');
      expect(mod.contextMenuState.mode).toBe('gamepad');
    });

    it('mouse mode sets bridge mode and coordinates', () => {
      mod.showContextMenu(150, 200, 'sess-1', 'mouse');
      expect(bridge.mode).toBe('mouse');
      expect(bridge.mouseX).toBe(150);
      expect(bridge.mouseY).toBe(200);
    });

    it('mouse mode stores exact coordinates on bridge', () => {
      mod.showContextMenu(2000, 2000, 'sess-1', 'mouse');
      // Bridge stores raw coords — Vue component handles clamping
      expect(bridge.mouseX).toBe(2000);
      expect(bridge.mouseY).toBe(2000);
    });
  });

  // =========================================================================
  // Navigation (handleContextMenuButton) — now no-op
  // =========================================================================

  describe('Context Menu Navigation', () => {
    it('handleContextMenuButton is a no-op (Vue handles gamepad)', () => {
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      const indexBefore = mod.contextMenuState.selectedIndex;

      mod.handleContextMenuButton('DPadDown');
      // selectedIndex unchanged — function is a no-op
      expect(mod.contextMenuState.selectedIndex).toBe(indexBefore);
    });

    it('B button does not change state (Vue handles dismiss)', () => {
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      expect(mod.contextMenuState.visible).toBe(true);

      mod.handleContextMenuButton('B');
      // No-op — visibility unchanged from handleContextMenuButton
      expect(mod.contextMenuState.visible).toBe(true);
    });

    it('A button does not trigger actions (Vue handles actions)', async () => {
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      mod.handleContextMenuButton('A');
      // No-op — no side effects
      expect(mod.contextMenuState.visible).toBe(true);
    });
  });

  // =========================================================================
  // Show / Hide toggle
  // =========================================================================

  describe('Context Menu Show/Hide', () => {
    it('show sets both legacy and bridge visible to true', () => {
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      expect(mod.contextMenuState.visible).toBe(true);
      expect(bridge.visible).toBe(true);
    });

    it('hide sets both legacy and bridge visible to false', () => {
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      mod.hideContextMenu();
      expect(mod.contextMenuState.visible).toBe(false);
      expect(bridge.visible).toBe(false);
    });

    it('show sets bridge selection text from terminal', () => {
      const viewWithSel = makeMockView('bridge text', true);
      mockGetTerminalManager.mockReturnValue(makeMockTerminalManager(viewWithSel));

      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      expect(bridge.selectedText).toBe('bridge text');
      expect(bridge.hasSelection).toBe(true);
    });

    it('show sets bridge sourceSessionId', () => {
      mod.showContextMenu(0, 0, 'sess-42', 'mouse');
      expect(bridge.sourceSessionId).toBe('sess-42');
      expect(mod.contextMenuState.sourceSessionId).toBe('sess-42');
    });

    it('show sets bridge selection from pre-captured values', () => {
      mockGetTerminalManager.mockReturnValue(null);

      mod.showContextMenu(0, 0, 'sess-1', 'mouse', 'pre-captured', true);
      expect(bridge.selectedText).toBe('pre-captured');
      expect(bridge.hasSelection).toBe(true);
    });
  });

  // =========================================================================
  // Selection reading from terminal
  // =========================================================================

  describe('Context Menu Selection', () => {
    it('reads selection from terminal manager on show', () => {
      const viewWithSel = makeMockView('selected code', true);
      const tm = makeMockTerminalManager(viewWithSel);
      mockGetTerminalManager.mockReturnValue(tm);

      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');

      expect(tm.getActiveView).toHaveBeenCalled();
      expect(viewWithSel.getSelection).toHaveBeenCalled();
      expect(viewWithSel.hasSelection).toHaveBeenCalled();
      expect(mod.contextMenuState.selectedText).toBe('selected code');
      expect(mod.contextMenuState.hasSelection).toBe(true);
    });

    it('defaults to empty when terminal manager returns null view', () => {
      mockGetTerminalManager.mockReturnValue({ getActiveView: () => null });

      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');

      expect(mod.contextMenuState.selectedText).toBe('');
      expect(mod.contextMenuState.hasSelection).toBe(false);
    });

    it('defaults to empty when terminal manager is null', () => {
      mockGetTerminalManager.mockReturnValue(null);

      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');

      expect(mod.contextMenuState.selectedText).toBe('');
      expect(mod.contextMenuState.hasSelection).toBe(false);
    });

    it('uses pre-captured selection when provided (mouse right-click path)', () => {
      // Terminal manager returns no selection (simulates async clearing)
      mockGetTerminalManager.mockReturnValue({ getActiveView: () => null });

      mod.showContextMenu(100, 200, 'sess-1', 'mouse', 'pre-captured text', true);

      expect(mod.contextMenuState.selectedText).toBe('pre-captured text');
      expect(mod.contextMenuState.hasSelection).toBe(true);
    });

    it('pre-captured selection overrides terminal manager view', () => {
      // Terminal manager has different selection, but pre-captured takes priority
      const viewWithSel = makeMockView('stale selection', true);
      mockGetTerminalManager.mockReturnValue(makeMockTerminalManager(viewWithSel));

      mod.showContextMenu(0, 0, 'sess-1', 'mouse', 'fresh selection', true);

      expect(mod.contextMenuState.selectedText).toBe('fresh selection');
      expect(mod.contextMenuState.hasSelection).toBe(true);
      // Should NOT query terminal manager when pre-captured values provided
      expect(viewWithSel.getSelection).not.toHaveBeenCalled();
    });

    it('falls back to terminal manager when pre-captured values are undefined', () => {
      const viewWithSel = makeMockView('from terminal', true);
      mockGetTerminalManager.mockReturnValue(makeMockTerminalManager(viewWithSel));

      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');

      expect(viewWithSel.getSelection).toHaveBeenCalled();
      expect(mod.contextMenuState.selectedText).toBe('from terminal');
      expect(mod.contextMenuState.hasSelection).toBe(true);
    });
  });

  // =========================================================================
  // Prompts (Sequences) Item — hasSequenceItems / collectSequenceItems
  // =========================================================================

  describe('Prompts Item', () => {
    const SEQUENCES = {
      prompts: [
        { label: 'commit', sequence: 'use skill(commit)' },
        { label: 'review', sequence: 'use skill(code-review-it)' },
      ],
    };

    it('hasSequenceItems returns false when no sequences configured', () => {
      state.cliSequencesCache = {};
      state.sessions = [{ id: 'sess-1', name: 'Test', cliType: 'claude-code', processId: 1 }];
      state.activeSessionId = 'sess-1';
      expect(mod.hasSequenceItems()).toBe(false);
    });

    it('hasSequenceItems returns false when cache entry exists but all groups are empty', () => {
      state.cliSequencesCache = { 'claude-code': { prompts: [] } };
      state.sessions = [{ id: 'sess-1', name: 'Test', cliType: 'claude-code', processId: 1 }];
      state.activeSessionId = 'sess-1';
      expect(mod.hasSequenceItems()).toBe(false);
    });

    it('hasSequenceItems returns false when cache entry is empty object (post-refresh)', () => {
      state.cliSequencesCache = { 'claude-code': {} };
      state.sessions = [{ id: 'sess-1', name: 'Test', cliType: 'claude-code', processId: 1 }];
      state.activeSessionId = 'sess-1';
      expect(mod.hasSequenceItems()).toBe(false);
    });

    it('hasSequenceItems returns true when sequences exist for active CLI type', () => {
      state.cliSequencesCache = { 'claude-code': SEQUENCES };
      state.sessions = [{ id: 'sess-1', name: 'Test', cliType: 'claude-code', processId: 1 }];
      state.activeSessionId = 'sess-1';
      expect(mod.hasSequenceItems()).toBe(true);
    });

    it('hasSequenceItems returns false when no active session', () => {
      state.cliSequencesCache = { 'claude-code': SEQUENCES };
      state.sessions = [];
      state.activeSessionId = null;
      expect(mod.hasSequenceItems()).toBe(false);
    });

    it('collectSequenceItems returns items for active CLI type', () => {
      state.cliSequencesCache = { 'claude-code': SEQUENCES };
      state.sessions = [{ id: 'sess-1', name: 'Test', cliType: 'claude-code', processId: 1 }];
      state.activeSessionId = 'sess-1';

      const items = mod.collectSequenceItems();
      expect(items).toHaveLength(2);
      expect(items[0].label).toBe('commit');
      expect(items[1].label).toBe('review');
    });

    it('collectSequenceItems returns empty when no sequences', () => {
      state.cliSequencesCache = {};
      state.sessions = [{ id: 'sess-1', name: 'Test', cliType: 'claude-code', processId: 1 }];
      state.activeSessionId = 'sess-1';
      expect(mod.collectSequenceItems()).toEqual([]);
    });

    it('collectSequenceItems returns empty when no active session', () => {
      state.cliSequencesCache = { 'claude-code': SEQUENCES };
      state.sessions = [];
      state.activeSessionId = null;
      expect(mod.collectSequenceItems()).toEqual([]);
    });
  });

  // =========================================================================
  // Logging
  // =========================================================================

  describe('Logging', () => {
    it('showContextMenu logs event', () => {
      mod.showContextMenu(100, 100, 'sess-1', 'gamepad');
      expect(mockLogEvent).toHaveBeenCalledWith('Context menu opened');
    });

    it('selectedIndex resets to 0 on show', () => {
      mod.contextMenuState.selectedIndex = 5;
      mod.showContextMenu(0, 0, 'sess-1', 'gamepad');
      expect(mod.contextMenuState.selectedIndex).toBe(0);
    });

    it('show then hide then show resets state cleanly', () => {
      mod.showContextMenu(10, 20, 'sess-1', 'mouse');
      expect(mod.contextMenuState.visible).toBe(true);
      expect(bridge.visible).toBe(true);

      mod.hideContextMenu();
      expect(mod.contextMenuState.visible).toBe(false);
      expect(bridge.visible).toBe(false);

      mod.showContextMenu(30, 40, 'sess-2', 'gamepad');
      expect(mod.contextMenuState.visible).toBe(true);
      expect(bridge.visible).toBe(true);
      expect(mod.contextMenuState.sourceSessionId).toBe('sess-2');
      expect(bridge.sourceSessionId).toBe('sess-2');
    });
  });
});
