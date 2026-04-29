/**
 * Navigation store — centralized view routing + sidebar focus.
 *
 * Single write authority for:
 *   - Panel view (terminal / overview / plan) — mirrors main-view-manager
 *   - Active session ID — writes to state.activeSessionId
 *   - Sidebar focus (identity-based — survives navList rebuilds)
 *   - Overlay lifecycle (open/close overview, plan, settings)
 *
 * Existing reactive singletons (state.ts, sessions-state.ts) remain the
 * read path for components. The store writes to them; no competing refs.
 *
 * main-view-manager.ts remains the DOM transition engine — this store
 * delegates view transitions to showView() and mirrors the result via
 * onViewChange().
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { state } from '../state.js';
import { sessionsState } from '../screens/sessions-state.js';
import { hideDraftEditor } from '../drafts/draft-editor.js';
import {
  showView,
  onViewChange,
  currentView,
  type MainView,
} from '../main-view/main-view-manager.js';
import { findNavIndexBySessionId } from '../session-groups.js';
import { getTerminalManager } from '../runtime/terminal-provider.js';
import { useChipBarStore } from './chip-bar.js';

export const useNavigationStore = defineStore('navigation', () => {
  // ── Panel view (mirrors main-view-manager) ───────────────────────────
  // Not a competing ref — updated exclusively via onViewChange listener.
  const _panelView = ref<MainView>(currentView());
  const panelView = computed(() => _panelView.value);

  // ── Overlay restore context ──────────────────────────────────────────
  // Saved on overlay open, consumed on overlay close.
  const _previousSessionId = ref<string | null>(null);
  const _savedFocusItem = ref<{ id: string; type: string } | null>(null);

  // ── Identity-based sidebar focus ─────────────────────────────────────
  // Store { id, type } not index — survives navList rebuilds.
  const focusedNavItem = ref<{ id: string; type: string } | null>(null);
  const focusColumn = ref<0 | 1 | 2 | 3 | 4>(0);

  // ── Initialization ───────────────────────────────────────────────────
  let initialized = false;
  let unsubViewChange: (() => void) | null = null;
  let navigationRequestId = 0;

  function init(): void {
    if (initialized) return;
    initialized = true;

    unsubViewChange = onViewChange((view: MainView) => {
      _panelView.value = view;
    });

    // Seed identity from current sidebar focus
    const navItem = sessionsState.navList[sessionsState.sessionsFocusIndex];
    if (navItem) {
      focusedNavItem.value = { id: navItem.id, type: navItem.type };
      focusColumn.value = sessionsState.cardColumn;
    }
  }

  // ── Focus helpers ────────────────────────────────────────────────────

  /** Derive numeric navList index from identity-based focusedNavItem. */
  function resolveFocusIndex(): number {
    if (!focusedNavItem.value) return sessionsState.sessionsFocusIndex;
    const idx = sessionsState.navList.findIndex(
      item => item.type === focusedNavItem.value!.type && item.id === focusedNavItem.value!.id,
    );
    return idx >= 0 ? idx : sessionsState.sessionsFocusIndex;
  }

  /** Write identity-based focus to sessionsState numeric fields. */
  function syncFocusIndex(): void {
    sessionsState.sessionsFocusIndex = resolveFocusIndex();
    sessionsState.cardColumn = focusColumn.value;
  }

  /** Re-read sidebar focus from sessionsState (legacy writes may have changed it). */
  function captureCurrentFocus(): void {
    const navItem = sessionsState.navList[sessionsState.sessionsFocusIndex];
    if (navItem) {
      focusedNavItem.value = { id: navItem.id, type: navItem.type };
      focusColumn.value = sessionsState.cardColumn;
    }
  }

  /** Set sidebar focus to a specific session card by ID. */
  function syncSidebarToSession(sessionId: string): void {
    focusedNavItem.value = { id: sessionId, type: 'session-card' };
    focusColumn.value = 0;
    syncFocusIndex();
  }

  // ── Navigation actions ───────────────────────────────────────────────

  /**
   * Full UX transition — dismiss overlays, switch terminal, sync sidebar,
   * hide draft/editor, clear chip bar.
   *
   * Use for: sidebar session click, notification click, overview card select.
   */
  async function navigateToSession(sessionId: string): Promise<void> {
    const requestId = ++navigationRequestId;
    const isLatestRequest = () => requestId === navigationRequestId;
    const cv = currentView();

    // Always clear restore context — we're navigating to a concrete session.
    // Covers the case where overview's selectCard callback already dismissed
    // the overlay before this runs (so cv === 'terminal' with stale context).
    _previousSessionId.value = null;
    _savedFocusItem.value = null;

    // 1. Dismiss overlays (skip their restore — we're going somewhere new)
    if (cv === 'overview') {
      const { setSelectedOnExit } = await import('../screens/group-overview.js');
      if (!isLatestRequest()) return;
      setSelectedOnExit(true);
      await showView('terminal');
    } else if (cv === 'plan') {
      await showView('terminal');
    }
    if (!isLatestRequest()) return;

    // 2. Clean up draft/editor/chip bar
    const [{ hideEditorPopup }, chipBarMod] = await Promise.all([
      import('../editor/editor-popup.js'),
      import('../stores/chip-bar.js'),
    ]);
    if (!isLatestRequest()) return;
    const chipBarStore = chipBarMod.useChipBarStore();
    hideDraftEditor();
    hideEditorPopup();
    chipBarStore.clear();

    // 3. Focus snapped-out sessions via the main process so their owning
    // window is activated instead of assuming the terminal lives locally.
    if (state.snappedOutSessions.has(sessionId)) {
      try {
        await window.gamepadCli?.sessionSetActive(sessionId);
      } catch {
        // Ignore focus failures and still sync local selection state.
      }
      if (!isLatestRequest()) return;
      state.activeSessionId = sessionId;
      syncSidebarToSession(sessionId);
      void chipBarStore.refresh(sessionId);
      return;
    }

    // 3. Switch terminal
    const tm = getTerminalManager();
    if (tm?.hasTerminal(sessionId)) {
      tm.switchTo(sessionId);
      state.activeSessionId = sessionId;
    } else {
      state.activeSessionId = sessionId;
    }

    // 4. Sync sidebar focus
    syncSidebarToSession(sessionId);

    // 5. Refresh chip bar for new session
    void chipBarStore.refresh(sessionId);
  }

  /**
   * Thin session switch — set activeSessionId + switch terminal only.
   * No overlay dismissal, no sidebar sync, no draft/chip cleanup.
   *
   * Use for: D-pad auto-select, Ctrl+Tab cycling.
   */
  function activateSession(sessionId: string): void {
    ++navigationRequestId;
    const tm = getTerminalManager();
    if (tm?.hasTerminal(sessionId)) {
      tm.switchTo(sessionId);
      state.activeSessionId = sessionId;
      void useChipBarStore().refresh(sessionId);
    }
  }

  // ── Overlay lifecycle ────────────────────────────────────────────────

  async function openOverview(dirPath: string | null, initialSessionId?: string): Promise<void> {
    ++navigationRequestId;
    // If transitioning from plan, its unmount runs during showView('overview') — no special flag needed.

    // Re-read legacy focus before saving (D-pad may have moved it)
    captureCurrentFocus();

    // Save restore context (preserve existing if chaining overlay → overlay)
    if (_previousSessionId.value === null) {
      _previousSessionId.value = state.activeSessionId;
    }
    if (!_savedFocusItem.value) {
      _savedFocusItem.value = focusedNavItem.value ? { ...focusedNavItem.value } : null;
    }

    await showView('overview', { groupDirPath: dirPath, initialSessionId });
  }

  /**
   * Close overview and restore previous terminal + sidebar focus.
   * Delegates to group-overview.ts unmount for terminal/DOM restore,
   * then reads back the result to update identity-based focus.
   */
  async function closeOverview(): Promise<void> {
    ++navigationRequestId;
    await showView('terminal');

    // Overview unmount restores terminal + numeric sidebar focus.
    // Read back the restored index and update identity tracker.
    const currentIdx = Math.min(
      sessionsState.sessionsFocusIndex,
      Math.max(0, sessionsState.navList.length - 1),
    );
    sessionsState.sessionsFocusIndex = currentIdx;
    const navItem = sessionsState.navList[currentIdx];
    if (navItem) {
      focusedNavItem.value = { id: navItem.id, type: navItem.type };
    }
    _previousSessionId.value = null;
    _savedFocusItem.value = null;
  }

  async function openPlan(dirPath: string): Promise<void> {
    ++navigationRequestId;
    // If overview is open, tell it to skip restore
    if (currentView() === 'overview') {
      const { setSelectedOnExit } = await import('../screens/group-overview.js');
      setSelectedOnExit(true);
    }

    // Re-read legacy focus before saving (D-pad may have moved it)
    captureCurrentFocus();

    // Save restore context (preserve existing if chaining overlay → overlay)
    if (_previousSessionId.value === null) {
      _previousSessionId.value = state.activeSessionId;
    }
    if (!_savedFocusItem.value) {
      _savedFocusItem.value = focusedNavItem.value ? { ...focusedNavItem.value } : null;
    }

    await showView('plan', { dir: dirPath });
  }

  /**
   * Close plan and restore previous terminal + sidebar focus.
   * Plan has no internal restore logic (unlike overview), so the
   * store handles it entirely.
   */
  async function closePlan(): Promise<void> {
    ++navigationRequestId;
    const savedPrev = _previousSessionId.value;
    const savedFocus = _savedFocusItem.value;
    _previousSessionId.value = null;
    _savedFocusItem.value = null;

    await showView('terminal');

    // Restore terminal (plan's openCallback deselected it during mount)
    const tm = getTerminalManager();
    if (savedPrev && tm?.hasTerminal(savedPrev)) {
      tm.switchTo(savedPrev);
      state.activeSessionId = savedPrev;
    }

    // Restore sidebar focus
    if (savedFocus) {
      focusedNavItem.value = savedFocus;
      syncFocusIndex();
    }

    // Refresh chip bar for restored session
    const { useChipBarStore } = await import('../stores/chip-bar.js');
    void useChipBarStore().refresh(savedPrev);
  }

  function openSettings(): void {
    state.currentScreen = 'settings';
  }

  function closeSettings(): void {
    state.currentScreen = 'sessions';
  }

  // ── NavList rebuild ──────────────────────────────────────────────────

  /**
   * Reconcile after an external terminal switch (e.g. destroyTerminal auto-selects
   * next session, or internal TerminalManager logic). Updates state + sidebar +
   * chip bar without calling tm.switchTo (avoids re-entrancy).
   */
  async function reconcileTerminalSwitch(sessionId: string | null): Promise<void> {
    if (sessionId) {
      state.activeSessionId = sessionId;
      syncSidebarToSession(sessionId);
    } else {
      state.activeSessionId = null;
    }
    const { useChipBarStore } = await import('../stores/chip-bar.js');
    void useChipBarStore().refresh(sessionId);
  }

  /**
   * Re-derive numeric focus index from identity after navList changes.
   * Call after refreshSessions() rebuilds navList.
   */
  function onNavListRebuilt(): void {
    if (!focusedNavItem.value) return;

    const idx = sessionsState.navList.findIndex(
      item => item.type === focusedNavItem.value!.type && item.id === focusedNavItem.value!.id,
    );

    if (idx >= 0) {
      sessionsState.sessionsFocusIndex = idx;
      return;
    }

    // Focused item gone — fall back to active session
    if (state.activeSessionId) {
      const activeIdx = findNavIndexBySessionId(sessionsState.navList, state.activeSessionId);
      if (activeIdx >= 0) {
        sessionsState.sessionsFocusIndex = activeIdx;
        const nav = sessionsState.navList[activeIdx];
        focusedNavItem.value = { id: nav.id, type: nav.type };
        return;
      }
    }

    // Clamp to valid range
    sessionsState.sessionsFocusIndex = Math.min(
      sessionsState.sessionsFocusIndex,
      Math.max(0, sessionsState.navList.length - 1),
    );
    const clamped = sessionsState.navList[sessionsState.sessionsFocusIndex];
    if (clamped) {
      focusedNavItem.value = { id: clamped.id, type: clamped.type };
    }
  }

  // ── Test utilities ───────────────────────────────────────────────────

  /** Test-only — dispose listeners and reset state. */
  function __dispose(): void {
    if (unsubViewChange) {
      unsubViewChange();
      unsubViewChange = null;
    }
    initialized = false;
    _panelView.value = 'terminal';
    _previousSessionId.value = null;
    _savedFocusItem.value = null;
    focusedNavItem.value = null;
    focusColumn.value = 0;
  }

  /** Test-only — read restore context for assertions. */
  function __getRestoreContext() {
    return {
      previousSessionId: _previousSessionId.value,
      savedFocusItem: _savedFocusItem.value,
    };
  }

  return {
    // State (readonly)
    panelView,
    focusedNavItem,
    focusColumn,

    // Init
    init,

    // Focus
    captureCurrentFocus,
    resolveFocusIndex,
    syncFocusIndex,
    syncSidebarToSession,

    // Navigation actions
    navigateToSession,
    activateSession,
    reconcileTerminalSwitch,

    // Overlay lifecycle
    openOverview,
    closeOverview,
    openPlan,
    closePlan,

    // Settings
    openSettings,
    closeSettings,

    // NavList rebuild
    onNavListRebuilt,

    // Test-only
    __dispose,
    __getRestoreContext,
  };
});
