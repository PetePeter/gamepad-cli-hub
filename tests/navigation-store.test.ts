// @vitest-environment jsdom

/**
 * Navigation store — unit tests.
 *
 * Tests cover:
 *   - panelView mirrors main-view-manager via onViewChange
 *   - Identity-based focus resolution + navList rebuild survival
 *   - navigateToSession — full UX transition
 *   - activateSession — thin preview
 *   - Overlay lifecycle (overview, plan, settings)
 *   - Overlay chaining (overview → plan, plan → overview)
 *   - Edge cases (missing session, empty navList, double-close)
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockedFunction } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { reactive } from 'vue';

// ── Mocks ──────────────────────────────────────────────────────────────

// main-view-manager — the DOM transition engine
let viewChangeListeners: Array<(view: string) => void> = [];
let currentMvmView = 'terminal';

vi.mock('../renderer/main-view/main-view-manager.js', () => ({
  showView: vi.fn(async (view: string, _params?: unknown) => {
    currentMvmView = view;
    for (const cb of viewChangeListeners) cb(view);
  }),
  onViewChange: vi.fn((cb: (view: string) => void) => {
    viewChangeListeners.push(cb);
    return () => {
      viewChangeListeners = viewChangeListeners.filter(l => l !== cb);
    };
  }),
  currentView: vi.fn(() => currentMvmView),
}));

// terminal provider
const mockTm = {
  hasTerminal: vi.fn(() => true),
  switchTo: vi.fn(),
  deselect: vi.fn(),
  getActiveSessionId: vi.fn(() => null),
};

vi.mock('../renderer/runtime/terminal-provider.js', () => ({
  getTerminalManager: vi.fn(() => mockTm),
}));

// session-groups
vi.mock('../renderer/session-groups.js', () => ({
  findNavIndexBySessionId: vi.fn((navList: Array<{ type: string; id: string }>, sessionId: string) => {
    return navList.findIndex(item => item.type === 'session-card' && item.id === sessionId);
  }),
}));

// Dynamic imports — draft-editor, editor-popup, chip-bar, group-overview
const mockHideDraftEditor = vi.fn();
const mockHideEditorPopup = vi.fn();
const mockChipBarClear = vi.fn();
const mockChipBarRefresh = vi.fn();
const mockSetSelectedOnExit = vi.fn();
const mockHideOverview = vi.fn();

vi.mock('../renderer/drafts/draft-editor.js', () => ({
  hideDraftEditor: mockHideDraftEditor,
  showDraftEditor: vi.fn(),
  showPlanInEditor: vi.fn(),
}));

vi.mock('../renderer/editor/editor-popup.js', () => ({
  hideEditorPopup: mockHideEditorPopup,
}));

vi.mock('../renderer/stores/chip-bar.js', () => ({
  useChipBarStore: vi.fn(() => ({
    clear: mockChipBarClear,
    refresh: mockChipBarRefresh,
  })),
}));

vi.mock('../renderer/screens/group-overview.js', () => ({
  setSelectedOnExit: mockSetSelectedOnExit,
  hideOverview: mockHideOverview,
}));

// ── Imports (after mocks) ──────────────────────────────────────────────

import { useNavigationStore } from '../renderer/stores/navigation.js';
import { state } from '../renderer/state.js';
import { sessionsState } from '../renderer/screens/sessions-state.js';
import { showView, currentView } from '../renderer/main-view/main-view-manager.js';

// ── Helpers ────────────────────────────────────────────────────────────

function buildNavList(...items: Array<{ type: string; id: string }>): void {
  sessionsState.navList = items.map((item, i) => ({
    ...item,
    groupIndex: 0,
  })) as any;
}

function resetSingletons(): void {
  state.currentScreen = 'sessions';
  state.activeSessionId = null;
  state.sessions = [];
  sessionsState.sessionsFocusIndex = 0;
  sessionsState.cardColumn = 0;
  sessionsState.activeFocus = 'sessions';
  sessionsState.navList = [];
  sessionsState.overviewGroup = null;
  sessionsState.overviewIsGlobal = false;
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('useNavigationStore', () => {
  let store: ReturnType<typeof useNavigationStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    currentMvmView = 'terminal';
    viewChangeListeners = [];
    resetSingletons();
    vi.clearAllMocks();
    mockTm.hasTerminal.mockReturnValue(true);
    store = useNavigationStore();
  });

  afterEach(() => {
    store.__dispose();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Initialization + panelView mirroring
  // ──────────────────────────────────────────────────────────────────────

  describe('init', () => {
    it('registers onViewChange listener', () => {
      store.init();
      expect(viewChangeListeners).toHaveLength(1);
    });

    it('is idempotent — second call does nothing', () => {
      store.init();
      store.init();
      expect(viewChangeListeners).toHaveLength(1);
    });

    it('seeds focusedNavItem from current sessionsState', () => {
      buildNavList(
        { type: 'group-header', id: '/projects' },
        { type: 'session-card', id: 'sess-1' },
      );
      sessionsState.sessionsFocusIndex = 1;
      sessionsState.cardColumn = 2 as any;

      store.init();

      expect(store.focusedNavItem).toEqual({ id: 'sess-1', type: 'session-card' });
      expect(store.focusColumn).toBe(2);
    });

    it('leaves focusedNavItem null when navList is empty', () => {
      store.init();
      expect(store.focusedNavItem).toBeNull();
    });
  });

  describe('panelView', () => {
    it('defaults to terminal', () => {
      expect(store.panelView).toBe('terminal');
    });

    it('updates when onViewChange fires', () => {
      store.init();
      // Simulate main-view-manager changing view
      viewChangeListeners[0]('overview');
      expect(store.panelView).toBe('overview');
    });

    it('does not update after dispose', () => {
      store.init();
      store.__dispose();
      viewChangeListeners = []; // listener was removed by dispose
      expect(store.panelView).toBe('terminal');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Focus resolution
  // ──────────────────────────────────────────────────────────────────────

  describe('resolveFocusIndex', () => {
    it('returns sessionsState index when focusedNavItem is null', () => {
      sessionsState.sessionsFocusIndex = 3;
      expect(store.resolveFocusIndex()).toBe(3);
    });

    it('finds item by identity in navList', () => {
      buildNavList(
        { type: 'group-header', id: '/a' },
        { type: 'session-card', id: 'sess-1' },
        { type: 'session-card', id: 'sess-2' },
      );
      store.focusedNavItem = { id: 'sess-2', type: 'session-card' };
      expect(store.resolveFocusIndex()).toBe(2);
    });

    it('falls back to sessionsState index when item not found', () => {
      buildNavList({ type: 'session-card', id: 'sess-1' });
      sessionsState.sessionsFocusIndex = 0;
      store.focusedNavItem = { id: 'deleted', type: 'session-card' };
      expect(store.resolveFocusIndex()).toBe(0);
    });
  });

  describe('syncFocusIndex', () => {
    it('writes resolved index + column to sessionsState', () => {
      buildNavList(
        { type: 'group-header', id: '/a' },
        { type: 'session-card', id: 'sess-1' },
      );
      store.focusedNavItem = { id: 'sess-1', type: 'session-card' };
      store.focusColumn = 2 as any;

      store.syncFocusIndex();

      expect(sessionsState.sessionsFocusIndex).toBe(1);
      expect(sessionsState.cardColumn).toBe(2);
    });
  });

  describe('syncSidebarToSession', () => {
    it('sets identity + column 0 and syncs to sessionsState', () => {
      buildNavList(
        { type: 'group-header', id: '/a' },
        { type: 'session-card', id: 'sess-1' },
        { type: 'session-card', id: 'sess-2' },
      );

      store.syncSidebarToSession('sess-2');

      expect(store.focusedNavItem).toEqual({ id: 'sess-2', type: 'session-card' });
      expect(store.focusColumn).toBe(0);
      expect(sessionsState.sessionsFocusIndex).toBe(2);
      expect(sessionsState.cardColumn).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // navigateToSession
  // ──────────────────────────────────────────────────────────────────────

  describe('navigateToSession', () => {
    beforeEach(() => {
      buildNavList(
        { type: 'group-header', id: '/a' },
        { type: 'session-card', id: 'sess-1' },
        { type: 'session-card', id: 'sess-2' },
      );
    });

    it('switches terminal and sets activeSessionId', async () => {
      await store.navigateToSession('sess-2');

      expect(mockTm.switchTo).toHaveBeenCalledWith('sess-2');
      expect(state.activeSessionId).toBe('sess-2');
    });

    it('syncs sidebar focus to the target session', async () => {
      await store.navigateToSession('sess-2');

      expect(store.focusedNavItem).toEqual({ id: 'sess-2', type: 'session-card' });
      expect(sessionsState.sessionsFocusIndex).toBe(2);
    });

    it('cleans up draft editor and chip bar', async () => {
      await store.navigateToSession('sess-1');

      expect(mockHideDraftEditor).toHaveBeenCalled();
      expect(mockHideEditorPopup).toHaveBeenCalled();
      expect(mockChipBarClear).toHaveBeenCalled();
    });

    it('refreshes chip bar for new session', async () => {
      await store.navigateToSession('sess-1');

      expect(mockChipBarRefresh).toHaveBeenCalledWith('sess-1');
    });

    it('dismisses overview (with selectedOnExit) when overview is open', async () => {
      currentMvmView = 'overview';

      await store.navigateToSession('sess-1');

      expect(mockSetSelectedOnExit).toHaveBeenCalledWith(true);
      expect(showView).toHaveBeenCalledWith('terminal');
      expect(mockTm.switchTo).toHaveBeenCalledWith('sess-1');
    });

    it('dismisses plan when plan is open', async () => {
      currentMvmView = 'plan';

      await store.navigateToSession('sess-1');

      expect(showView).toHaveBeenCalledWith('terminal');
      expect(mockTm.switchTo).toHaveBeenCalledWith('sess-1');
    });

    it('clears restore context when dismissing overlay', async () => {
      currentMvmView = 'overview';
      // Simulate that overview was opened (restore context saved)
      store.focusedNavItem = { id: 'sess-1', type: 'session-card' };
      await store.openOverview('/projects');

      // Now navigate away
      await store.navigateToSession('sess-2');

      const ctx = store.__getRestoreContext();
      expect(ctx.previousSessionId).toBeNull();
      expect(ctx.savedFocusItem).toBeNull();
    });

    it('does not call switchTo when terminal has no matching session', async () => {
      mockTm.hasTerminal.mockReturnValue(false);

      await store.navigateToSession('nonexistent');

      expect(mockTm.switchTo).not.toHaveBeenCalled();
      expect(state.activeSessionId).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // activateSession
  // ──────────────────────────────────────────────────────────────────────

  describe('activateSession', () => {
    it('switches terminal and sets activeSessionId', () => {
      store.activateSession('sess-1');

      expect(mockTm.switchTo).toHaveBeenCalledWith('sess-1');
      expect(state.activeSessionId).toBe('sess-1');
    });

    it('does NOT clean up drafts or chip bar', () => {
      store.activateSession('sess-1');

      expect(mockHideDraftEditor).not.toHaveBeenCalled();
      expect(mockHideEditorPopup).not.toHaveBeenCalled();
      expect(mockChipBarClear).not.toHaveBeenCalled();
    });

    it('does NOT sync sidebar focus', () => {
      buildNavList(
        { type: 'session-card', id: 'sess-1' },
        { type: 'session-card', id: 'sess-2' },
      );
      sessionsState.sessionsFocusIndex = 0;

      store.activateSession('sess-2');

      // Sidebar index unchanged
      expect(sessionsState.sessionsFocusIndex).toBe(0);
    });

    it('does not call switchTo when terminal has no matching session', () => {
      mockTm.hasTerminal.mockReturnValue(false);

      store.activateSession('nonexistent');

      expect(mockTm.switchTo).not.toHaveBeenCalled();
      expect(state.activeSessionId).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Overview lifecycle
  // ──────────────────────────────────────────────────────────────────────

  describe('openOverview', () => {
    it('saves restore context (previous session + focus)', async () => {
      state.activeSessionId = 'sess-1';
      store.focusedNavItem = { id: 'sess-1', type: 'session-card' };

      await store.openOverview('/projects', 'sess-2');

      const ctx = store.__getRestoreContext();
      expect(ctx.previousSessionId).toBe('sess-1');
      expect(ctx.savedFocusItem).toEqual({ id: 'sess-1', type: 'session-card' });
    });

    it('delegates to showView with overview params', async () => {
      await store.openOverview('/projects', 'sess-2');

      expect(showView).toHaveBeenCalledWith('overview', {
        groupDirPath: '/projects',
        initialSessionId: 'sess-2',
      });
    });

    it('preserves existing restore context when chaining overlays', async () => {
      state.activeSessionId = 'original-session';
      store.focusedNavItem = { id: 'original-session', type: 'session-card' };

      // First overlay open saves context
      await store.openOverview('/a');
      const ctx1 = store.__getRestoreContext();
      expect(ctx1.previousSessionId).toBe('original-session');

      // Transition to plan (overview → plan) should keep original context
      await store.openPlan('/b');
      const ctx2 = store.__getRestoreContext();
      expect(ctx2.previousSessionId).toBe('original-session');
    });
  });

  describe('closeOverview', () => {
    it('delegates to hideOverview', async () => {
      currentMvmView = 'overview';
      await store.closeOverview();
      expect(mockHideOverview).toHaveBeenCalled();
    });

    it('reads back restored focus from sessionsState', async () => {
      buildNavList(
        { type: 'group-header', id: '/a' },
        { type: 'session-card', id: 'sess-1' },
      );
      sessionsState.sessionsFocusIndex = 1;

      await store.closeOverview();

      expect(store.focusedNavItem).toEqual({ id: 'sess-1', type: 'session-card' });
    });

    it('clears restore context', async () => {
      state.activeSessionId = 'sess-1';
      store.focusedNavItem = { id: 'sess-1', type: 'session-card' };
      await store.openOverview('/a');

      await store.closeOverview();

      const ctx = store.__getRestoreContext();
      expect(ctx.previousSessionId).toBeNull();
      expect(ctx.savedFocusItem).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Plan lifecycle
  // ──────────────────────────────────────────────────────────────────────

  describe('openPlan', () => {
    it('saves restore context', async () => {
      state.activeSessionId = 'sess-1';
      store.focusedNavItem = { id: 'sess-1', type: 'session-card' };

      await store.openPlan('/projects');

      const ctx = store.__getRestoreContext();
      expect(ctx.previousSessionId).toBe('sess-1');
      expect(ctx.savedFocusItem).toEqual({ id: 'sess-1', type: 'session-card' });
    });

    it('delegates to showView with plan params', async () => {
      await store.openPlan('/projects');

      expect(showView).toHaveBeenCalledWith('plan', { dir: '/projects' });
    });

    it('sets selectedOnExit on overview when transitioning overview → plan', async () => {
      currentMvmView = 'overview';

      await store.openPlan('/projects');

      expect(mockSetSelectedOnExit).toHaveBeenCalledWith(true);
    });
  });

  describe('closePlan', () => {
    it('transitions to terminal view', async () => {
      currentMvmView = 'plan';

      await store.closePlan();

      expect(showView).toHaveBeenCalledWith('terminal');
    });

    it('restores previous terminal session', async () => {
      state.activeSessionId = 'sess-1';
      store.focusedNavItem = { id: 'sess-1', type: 'session-card' };
      await store.openPlan('/projects');

      // Simulate plan deselecting the terminal (as openCallback does)
      state.activeSessionId = null;

      await store.closePlan();

      expect(mockTm.switchTo).toHaveBeenCalledWith('sess-1');
      expect(state.activeSessionId).toBe('sess-1');
    });

    it('restores sidebar focus', async () => {
      buildNavList(
        { type: 'group-header', id: '/a' },
        { type: 'session-card', id: 'sess-1' },
        { type: 'session-card', id: 'sess-2' },
      );
      store.focusedNavItem = { id: 'sess-2', type: 'session-card' };
      sessionsState.sessionsFocusIndex = 2;
      state.activeSessionId = 'sess-2';
      await store.openPlan('/projects');

      await store.closePlan();

      expect(store.focusedNavItem).toEqual({ id: 'sess-2', type: 'session-card' });
      expect(sessionsState.sessionsFocusIndex).toBe(2);
    });

    it('refreshes chip bar for restored session', async () => {
      state.activeSessionId = 'sess-1';
      await store.openPlan('/projects');

      await store.closePlan();

      expect(mockChipBarRefresh).toHaveBeenCalledWith('sess-1');
    });

    it('handles missing previous session gracefully', async () => {
      // No previous session
      state.activeSessionId = null;
      await store.openPlan('/projects');

      mockTm.hasTerminal.mockReturnValue(false);
      await store.closePlan();

      expect(mockTm.switchTo).not.toHaveBeenCalled();
    });

    it('clears restore context', async () => {
      state.activeSessionId = 'sess-1';
      await store.openPlan('/a');

      await store.closePlan();

      const ctx = store.__getRestoreContext();
      expect(ctx.previousSessionId).toBeNull();
      expect(ctx.savedFocusItem).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Settings
  // ──────────────────────────────────────────────────────────────────────

  describe('openSettings / closeSettings', () => {
    it('sets currentScreen to settings', () => {
      store.openSettings();
      expect(state.currentScreen).toBe('settings');
    });

    it('sets currentScreen back to sessions', () => {
      state.currentScreen = 'settings';
      store.closeSettings();
      expect(state.currentScreen).toBe('sessions');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // navList rebuild — identity-based focus survival
  // ──────────────────────────────────────────────────────────────────────

  describe('onNavListRebuilt', () => {
    it('re-derives index when focused item moves position', () => {
      store.focusedNavItem = { id: 'sess-2', type: 'session-card' };
      sessionsState.sessionsFocusIndex = 1;

      // Rebuild navList with sess-2 at a new position
      buildNavList(
        { type: 'group-header', id: '/a' },
        { type: 'session-card', id: 'sess-NEW' },
        { type: 'session-card', id: 'sess-2' },
      );

      store.onNavListRebuilt();

      expect(sessionsState.sessionsFocusIndex).toBe(2);
    });

    it('falls back to active session when focused item is gone', () => {
      store.focusedNavItem = { id: 'deleted-session', type: 'session-card' };
      state.activeSessionId = 'sess-1';

      buildNavList(
        { type: 'group-header', id: '/a' },
        { type: 'session-card', id: 'sess-1' },
      );

      store.onNavListRebuilt();

      expect(sessionsState.sessionsFocusIndex).toBe(1);
      expect(store.focusedNavItem).toEqual({ id: 'sess-1', type: 'session-card' });
    });

    it('clamps index when both focused item and active session are gone', () => {
      store.focusedNavItem = { id: 'deleted', type: 'session-card' };
      state.activeSessionId = 'also-deleted';
      sessionsState.sessionsFocusIndex = 5;

      buildNavList(
        { type: 'group-header', id: '/a' },
        { type: 'session-card', id: 'sess-only' },
      );

      store.onNavListRebuilt();

      expect(sessionsState.sessionsFocusIndex).toBe(1); // clamped to max
      expect(store.focusedNavItem).toEqual({ id: 'sess-only', type: 'session-card' });
    });

    it('no-ops when focusedNavItem is null', () => {
      store.focusedNavItem = null;
      sessionsState.sessionsFocusIndex = 42;

      store.onNavListRebuilt();

      expect(sessionsState.sessionsFocusIndex).toBe(42); // unchanged
    });

    it('handles empty navList without crashing', () => {
      store.focusedNavItem = { id: 'sess-1', type: 'session-card' };
      sessionsState.sessionsFocusIndex = 5;
      sessionsState.navList = [];

      store.onNavListRebuilt();

      expect(sessionsState.sessionsFocusIndex).toBe(0); // clamped to 0
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Overlay chaining edge cases
  // ──────────────────────────────────────────────────────────────────────

  describe('overlay chaining', () => {
    it('overview → plan preserves original restore context', async () => {
      state.activeSessionId = 'original';
      store.focusedNavItem = { id: 'original', type: 'session-card' };

      await store.openOverview('/a');
      // overview mount deselects terminal
      state.activeSessionId = null;

      await store.openPlan('/b');

      const ctx = store.__getRestoreContext();
      expect(ctx.previousSessionId).toBe('original');
      expect(ctx.savedFocusItem).toEqual({ id: 'original', type: 'session-card' });
    });

    it('closing chained plan restores original session', async () => {
      buildNavList(
        { type: 'session-card', id: 'original' },
        { type: 'session-card', id: 'other' },
      );
      state.activeSessionId = 'original';
      store.focusedNavItem = { id: 'original', type: 'session-card' };

      await store.openOverview('/a');
      state.activeSessionId = null;
      await store.openPlan('/b');
      state.activeSessionId = null;

      await store.closePlan();

      expect(mockTm.switchTo).toHaveBeenCalledWith('original');
      expect(state.activeSessionId).toBe('original');
    });

    it('navigateToSession from overlay clears all restore context', async () => {
      state.activeSessionId = 'original';
      store.focusedNavItem = { id: 'original', type: 'session-card' };
      await store.openOverview('/a');

      buildNavList({ type: 'session-card', id: 'target' });
      currentMvmView = 'overview';
      await store.navigateToSession('target');

      const ctx = store.__getRestoreContext();
      expect(ctx.previousSessionId).toBeNull();
      expect(ctx.savedFocusItem).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // __dispose
  // ──────────────────────────────────────────────────────────────────────

  describe('__dispose', () => {
    it('resets all internal state', () => {
      store.init();
      store.focusedNavItem = { id: 'sess-1', type: 'session-card' };
      store.focusColumn = 3 as any;

      store.__dispose();

      expect(store.panelView).toBe('terminal');
      expect(store.focusedNavItem).toBeNull();
      expect(store.focusColumn).toBe(0);
      expect(store.__getRestoreContext()).toEqual({
        previousSessionId: null,
        savedFocusItem: null,
      });
    });

    it('allows re-initialization after dispose', () => {
      store.init();
      store.__dispose();
      store.init();
      expect(viewChangeListeners).toHaveLength(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Integration — user journeys
  // ──────────────────────────────────────────────────────────────────────

  describe('integration — user journeys', () => {
    it('overview visible → sidebar click → overview dismissed, terminal shown', async () => {
      store.init();
      buildNavList(
        { type: 'session-card', id: 'sess-1' },
        { type: 'session-card', id: 'sess-2' },
      );
      state.activeSessionId = 'sess-1';
      store.focusedNavItem = { id: 'sess-1', type: 'session-card' };

      await store.openOverview('/projects');
      expect(store.panelView).toBe('overview');

      await store.navigateToSession('sess-2');

      expect(showView).toHaveBeenCalledWith('terminal');
      expect(mockSetSelectedOnExit).toHaveBeenCalledWith(true);
      expect(mockTm.switchTo).toHaveBeenCalledWith('sess-2');
      expect(state.activeSessionId).toBe('sess-2');
      expect(store.focusedNavItem).toEqual({ id: 'sess-2', type: 'session-card' });
      expect(sessionsState.sessionsFocusIndex).toBe(1);
      const ctx = store.__getRestoreContext();
      expect(ctx.previousSessionId).toBeNull();
      expect(ctx.savedFocusItem).toBeNull();
    });

    it('session → plan → session with no stale views', async () => {
      store.init();
      buildNavList(
        { type: 'session-card', id: 'sess-1' },
        { type: 'session-card', id: 'sess-2' },
      );
      state.activeSessionId = 'sess-1';
      store.focusedNavItem = { id: 'sess-1', type: 'session-card' };
      sessionsState.sessionsFocusIndex = 0;

      await store.openPlan('/projects');
      expect(store.panelView).toBe('plan');

      // Simulate plan deselecting the terminal
      state.activeSessionId = null;

      (showView as MockedFunction<typeof showView>).mockClear();
      mockTm.switchTo.mockClear();

      await store.closePlan();

      expect(showView).toHaveBeenCalledWith('terminal');
      expect(mockTm.switchTo).toHaveBeenCalledWith('sess-1');
      expect(state.activeSessionId).toBe('sess-1');
      expect(store.focusedNavItem).toEqual({ id: 'sess-1', type: 'session-card' });
    });

    it('overview → plan → session (chained overlays)', async () => {
      store.init();
      buildNavList(
        { type: 'session-card', id: 'sess-1' },
        { type: 'session-card', id: 'sess-2' },
      );
      state.activeSessionId = 'sess-1';
      store.focusedNavItem = { id: 'sess-1', type: 'session-card' };
      sessionsState.sessionsFocusIndex = 0;

      // Open overview, then chain into plan
      await store.openOverview('/projects');
      state.activeSessionId = null;
      await store.openPlan('/projects');
      state.activeSessionId = null;

      // Close plan — should restore original sess-1, not overview state
      await store.closePlan();

      expect(mockTm.switchTo).toHaveBeenCalledWith('sess-1');
      expect(state.activeSessionId).toBe('sess-1');
    });

    it('Ctrl+Tab sidebar sync', () => {
      store.init();
      buildNavList(
        { type: 'session-card', id: 'sess-1' },
        { type: 'session-card', id: 'sess-2' },
        { type: 'session-card', id: 'sess-3' },
      );

      store.activateSession('sess-2');
      store.syncSidebarToSession('sess-2');

      expect(state.activeSessionId).toBe('sess-2');
      expect(store.focusedNavItem).toEqual({ id: 'sess-2', type: 'session-card' });
      expect(sessionsState.sessionsFocusIndex).toBe(1);
    });

    it('notification click during overview → overview dismissed + correct session shown', async () => {
      store.init();
      buildNavList(
        { type: 'session-card', id: 'sess-1' },
        { type: 'session-card', id: 'sess-2' },
        { type: 'session-card', id: 'sess-3' },
      );
      state.activeSessionId = 'sess-1';
      store.focusedNavItem = { id: 'sess-1', type: 'session-card' };

      await store.openOverview('/projects');
      expect(store.panelView).toBe('overview');

      await store.navigateToSession('sess-3');

      // Overview dismissed
      expect(showView).toHaveBeenCalledWith('terminal');
      expect(mockSetSelectedOnExit).toHaveBeenCalledWith(true);
      // Terminal switched to sess-3
      expect(mockTm.switchTo).toHaveBeenCalledWith('sess-3');
      expect(state.activeSessionId).toBe('sess-3');
      // Sidebar synced to sess-3
      expect(store.focusedNavItem).toEqual({ id: 'sess-3', type: 'session-card' });
      expect(sessionsState.sessionsFocusIndex).toBe(2);
      // Restore context cleared
      const ctx = store.__getRestoreContext();
      expect(ctx.previousSessionId).toBeNull();
      expect(ctx.savedFocusItem).toBeNull();
    });

    it('navList rebuild preserves focused identity', () => {
      store.init();
      buildNavList(
        { type: 'group-header', id: '/a' },
        { type: 'session-card', id: 'sess-1' },
        { type: 'session-card', id: 'sess-2' },
      );
      store.focusedNavItem = { id: 'sess-2', type: 'session-card' };
      sessionsState.sessionsFocusIndex = 2;

      // Rebuild with different order — sess-2 is now at index 1
      buildNavList(
        { type: 'group-header', id: '/b' },
        { type: 'session-card', id: 'sess-2' },
        { type: 'session-card', id: 'sess-1' },
      );

      store.onNavListRebuilt();

      expect(sessionsState.sessionsFocusIndex).toBe(1);
      expect(store.focusedNavItem).toEqual({ id: 'sess-2', type: 'session-card' });
    });

    it('navList rebuild — focused item removed → falls back to active session', () => {
      store.init();
      buildNavList(
        { type: 'session-card', id: 'sess-1' },
        { type: 'session-card', id: 'sess-2' },
      );
      store.focusedNavItem = { id: 'sess-2', type: 'session-card' };
      sessionsState.sessionsFocusIndex = 1;
      state.activeSessionId = 'sess-1';

      // Rebuild WITHOUT sess-2
      buildNavList(
        { type: 'session-card', id: 'sess-1' },
        { type: 'session-card', id: 'sess-3' },
      );

      store.onNavListRebuilt();

      expect(sessionsState.sessionsFocusIndex).toBe(0);
      expect(store.focusedNavItem).toEqual({ id: 'sess-1', type: 'session-card' });
    });

    it('reconcileTerminalSwitch after destroyTerminal', async () => {
      store.init();
      buildNavList(
        { type: 'session-card', id: 'sess-1' },
        { type: 'session-card', id: 'sess-2' },
      );
      state.activeSessionId = 'sess-1';

      await store.reconcileTerminalSwitch('sess-2');

      expect(state.activeSessionId).toBe('sess-2');
      expect(store.focusedNavItem).toEqual({ id: 'sess-2', type: 'session-card' });
      expect(sessionsState.sessionsFocusIndex).toBe(1);
      expect(mockChipBarRefresh).toHaveBeenCalledWith('sess-2');
    });

    it('double close is safe — closePlan when already on terminal', async () => {
      store.init();
      // currentView is already 'terminal' (default)
      expect(store.panelView).toBe('terminal');

      // Should not throw
      await store.closePlan();

      expect(showView).toHaveBeenCalledWith('terminal');
    });

    it('rapid D-pad switching convergence', () => {
      store.init();
      buildNavList(
        { type: 'session-card', id: 'sess-1' },
        { type: 'session-card', id: 'sess-2' },
        { type: 'session-card', id: 'sess-3' },
      );

      store.activateSession('sess-1');
      store.activateSession('sess-2');
      store.activateSession('sess-3');

      expect(state.activeSessionId).toBe('sess-3');
      expect(mockTm.switchTo).toHaveBeenCalledTimes(3);
    });
  });
});
