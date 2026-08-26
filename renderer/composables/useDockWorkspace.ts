/**
 * Dock workspace composable — the reactive contract over the pure layout tree.
 *
 * Deliberately thin: all layout logic lives in `dock-layout.ts` so it stays
 * testable without Vue. This layer owns only reactivity, focus identity, and the
 * "reject a bad layout, fall back to Classic" rule. Renderer components,
 * persistence IPC, drag/drop, and terminal adoption arrive in later plans.
 */

import { computed, readonly, ref, type ComputedRef, type Ref } from 'vue';
import {
  closePane,
  createDefaultLayout,
  findPaneGroup,
  isPaneHidden,
  listPanes,
  movePane,
  reorderTab,
  restorePane,
  resetLayout,
  setActiveTab,
  setDockMode,
  validateLayout,
} from '../dock-layout';
import {
  loadDockLayout,
  readLegacyDockPreferences,
  serializeDockLayout,
  type DockLoadResult,
  type DockStorage,
} from '../dock-persistence';
import {
  DOCK_PANES,
  getPaneDescriptor,
  PANE_TERMINAL,
  type DockMode,
  type DockWorkspaceLayout,
  type DropTarget,
  type PaneId,
} from '../dock-types';

export interface DockWorkspace {
  layout: ComputedRef<DockWorkspaceLayout>;
  /** Deterministic left-to-right, top-to-bottom pane order — the cycle order. */
  paneOrder: Ref<PaneId[]>;
  closedPanes: Ref<PaneId[]>;
  focusedPaneId: Ref<PaneId>;
  isVisible: (paneId: PaneId) => boolean;
  focusPane: (paneId: PaneId) => void;
  /** Cycle focus through docked, non-hidden panes. */
  cycleFocus: (direction: 1 | -1) => void;
  move: (paneId: PaneId, target: DropTarget) => void;
  reorder: (paneId: PaneId, index: number) => void;
  activate: (paneId: PaneId) => void;
  setMode: (paneId: PaneId, mode: DockMode) => void;
  close: (paneId: PaneId) => void;
  restore: (paneId: PaneId, target?: DropTarget) => void;
  reset: () => void;
  /** Adopt an untrusted layout; falls back to Classic and returns false if invalid. */
  load: (raw: unknown) => boolean;
  /** Load from app-data and migrate legacy browser storage on first launch. */
  loadPersisted: () => Promise<DockLoadResult>;
  /** True when the pane is present in the tree (regardless of active tab/hidden dock). */
  isOpen: (paneId: PaneId) => boolean;
}

export interface DockWorkspacePersistence {
  load: () => Promise<unknown> | unknown;
  save: (layout: DockWorkspaceLayout) => Promise<unknown> | unknown;
  /** Optional injected storage makes migration deterministic in tests. */
  legacyStorage?: DockStorage;
  /** Optional viewport width used to convert legacy pixel widths to ratios. */
  viewportWidth?: () => number;
}

export interface DockWorkspaceOptions {
  persistence?: DockWorkspacePersistence;
}

export function useDockWorkspace(initial?: DockWorkspaceLayout, options: DockWorkspaceOptions = {}): DockWorkspace {
  const layoutState = ref<DockWorkspaceLayout>(createDefaultLayout());
  if (initial) {
    try {
      layoutState.value = validateLayout(initial);
    } catch {
      // A typed value can still originate from persisted or IPC data. Classic
      // remains the safe initial state when it does not satisfy the schema.
    }
  }
  const layout = computed(() => readonly(layoutState.value));
  const focusedPaneId = ref<PaneId>(PANE_TERMINAL);

  const paneOrder = computed(() => listPanes(layoutState.value.root));
  const closedPanes = computed(() => [...layoutState.value.closed]);
  let persistQueue = Promise.resolve();

  /** A pane is visible when it is the active tab of a group in a non-hidden dock. */
  function isVisible(paneId: PaneId): boolean {
    return !isPaneHidden(layoutState.value.root, paneId)
      && findPaneGroup(layoutState.value.root, paneId)?.activeTab === paneId;
  }

  /** Apply a pure op, keeping focus on a pane that still exists. */
  function persist(next: DockWorkspaceLayout): void {
    const save = options.persistence?.save;
    if (!save) return;
    const detached = serializeDockLayout(next);
    persistQueue = persistQueue
      .catch(() => undefined)
      .then(() => save(detached))
      .catch(() => undefined);
  }

  function apply(next: DockWorkspaceLayout, shouldPersist = true): void {
    layoutState.value = next;
    if (!findPaneGroup(next.root, focusedPaneId.value)) {
      focusedPaneId.value = listPanes(next.root)[0] ?? PANE_TERMINAL;
    }
    if (shouldPersist) persist(next);
  }

  function focusPane(paneId: PaneId): void {
    if (!findPaneGroup(layoutState.value.root, paneId)) return;
    apply(setActiveTab(layoutState.value, paneId));
    focusedPaneId.value = paneId;
  }

  function cycleFocus(direction: 1 | -1): void {
    const order = paneOrder.value.filter(paneId => !isPaneHidden(layoutState.value.root, paneId));
    if (order.length <= 1) return;
    const current = order.indexOf(focusedPaneId.value);
    const start = current === -1 ? 0 : current;
    focusPane(order[(start + direction + order.length) % order.length]);
  }

  async function loadPersisted(): Promise<DockLoadResult> {
    const persistence = options.persistence;
    let raw: unknown;
    if (persistence) {
      try {
        raw = await persistence.load();
      } catch {
        // Treat an unavailable config bridge like a first launch. The default
        // remains usable and the save below is harmless when the bridge returns.
        raw = undefined;
      }
    }
    const result = loadDockLayout(raw, {
      legacy: readLegacyDockPreferences(persistence?.legacyStorage),
      viewportWidth: persistence?.viewportWidth?.(),
    });
    apply(result.layout, false);
    if (result.source !== 'persisted') persist(result.layout);
    return result;
  }

  return {
    layout,
    paneOrder,
    closedPanes,
    focusedPaneId,
    isVisible,
    focusPane,
    cycleFocus,
    move: (paneId, target) => apply(movePane(layoutState.value, paneId, target)),
    reorder: (paneId, index) => apply(reorderTab(layoutState.value, paneId, index)),
    activate: (paneId) => apply(setActiveTab(layoutState.value, paneId)),
    setMode: (paneId, mode) => apply(setDockMode(layoutState.value, paneId, mode)),
    close: (paneId) => apply(closePane(layoutState.value, paneId)),
    restore: (paneId, target) => apply(restorePane(layoutState.value, paneId, target)),
    reset: () => apply(resetLayout()),
    load: (raw) => {
      try {
        apply(validateLayout(raw));
        return true;
      } catch {
        apply(createDefaultLayout());
        return false;
      }
    },
    loadPersisted,
    isOpen: (paneId) => !layoutState.value.closed.includes(paneId),
  };
}

/** Registry view for the View menu: every pane plus whether it is currently closed. */
export function listRegisteredPanes(layout: DockWorkspaceLayout) {
  return DOCK_PANES.map(descriptor => ({
    ...descriptor,
    closed: layout.closed.includes(descriptor.id),
  }));
}

export { getPaneDescriptor };
