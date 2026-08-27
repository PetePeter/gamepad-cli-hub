/**
 * Pane context — the injection seam between the docking shell and pane content.
 *
 * Why provide/inject rather than props: once the workspace renders panes through
 * the recursive dock tree, a pane sits at an arbitrary depth under splits, tab
 * groups and edge docks. Threading props through that tree is impossible without
 * the layout renderer knowing every pane's API, which is exactly the coupling the
 * registry exists to remove. One provided context keeps placement and content
 * independent.
 *
 * The context deliberately carries ONLY what the shell owns per-instance:
 * controllers created with `useSidebarController` / `usePlanWorkspaceController`,
 * the terminal container element, and shell-level callbacks. Everything else the
 * panes need (`sessionsState`, the Pinia stores, `useArtifactViewer`,
 * `useFlashAttention`, the plan-screen handlers) is already a module singleton,
 * so panes import it directly. No domain state is copied into the shell.
 */

import { inject, provide, type InjectionKey, type Ref } from 'vue';
import type { useSidebarController } from './composables/useSidebarController.js';
import type { usePlanWorkspaceController } from './composables/usePlanWorkspaceController.js';

export type SidebarController = ReturnType<typeof useSidebarController>;
export type PlanWorkspaceController = ReturnType<typeof usePlanWorkspaceController>;

/** Runtime-group actions raised from the session list tool window. */
export interface PaneGroupActions {
  newGroup: () => void;
  newGroupWithSession: (sessionId: string) => void;
  rename: (groupId: string) => void;
  close: (groupId: string) => void;
  addSession: (groupId: string, sessionId: string) => void;
  removeSession: (sessionId: string) => void;
}

export interface HelmPaneContext {
  /** Element the TerminalManager mounts xterm instances into. */
  terminalContainerRef: Ref<HTMLElement | null>;
  sidebar: SidebarController;
  planWorkspace: PlanWorkspaceController;
  groups: PaneGroupActions;
  /** Activate a session and reveal its artifacts (session-card badge entry point). */
  showArtifactsForSession: (sessionId: string) => void;
  /** Pop the active session out; its artifact panel travels with the terminal. */
  popOutArtifacts: () => void;
}

export const HELM_PANE_CONTEXT: InjectionKey<HelmPaneContext> = Symbol('helm-pane-context');

export function provideHelmPaneContext(context: HelmPaneContext): void {
  provide(HELM_PANE_CONTEXT, context);
}

/**
 * Panes are only ever mounted by a shell that provides the context, so a missing
 * provider is a wiring bug and must fail loudly rather than render half a pane.
 */
export function useHelmPaneContext(): HelmPaneContext {
  const context = inject(HELM_PANE_CONTEXT, null);
  if (!context) throw new Error('Helm pane context is not provided by the docking shell');
  return context;
}
