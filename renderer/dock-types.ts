/**
 * Dock workspace contract — serializable layout model for the prompt-IDE workspace.
 *
 * Why a hand-rolled recursive tree instead of Dockview/Golden Layout: those
 * libraries own DOM placement, which would fight xterm.js DOM ownership and the
 * existing terminal manager. Here the tree is plain data; the renderer decides
 * placement, so a terminal element can be adopted rather than remounted.
 *
 * Every pane has a stable PaneId. Nothing in this model refers to a DOM
 * selector, a fixed column, or a Vue construct.
 */

export type PaneId = string;

export type SplitDirection = 'horizontal' | 'vertical';
export type DockSide = 'left' | 'right' | 'top' | 'bottom';
export type DockMode = 'pinned' | 'autohide' | 'hidden';

/** Views default to the centre workspace; tool windows default to an edge dock. */
export type PaneKind = 'view' | 'tool';

export interface DockSplitNode {
  type: 'split';
  direction: SplitDirection;
  /** Normalized child ratios; same length as `children`, sums to 1. */
  sizes: number[];
  children: DockNode[];
}

export interface DockGroupNode {
  type: 'group';
  tabs: PaneId[];
  activeTab: PaneId;
}

/** Canonical root for a valid workspace whose registered panes are all closed. */
export interface DockEmptyNode {
  type: 'empty';
}

export interface DockDockNode {
  type: 'dock';
  side: DockSide;
  mode: DockMode;
  child: DockNode;
}

export type DockNode = DockSplitNode | DockGroupNode | DockDockNode | DockEmptyNode;

/** Child path used by the renderer when it reports a split resize. `-1` enters a dock child. */
export type DockNodePath = number[];

/** Where a dragged/restored pane lands relative to an existing pane. */
export type DropZone = 'center' | 'left' | 'right' | 'top' | 'bottom';

export interface DropTarget {
  /** Pane whose group/region receives the drop. */
  paneId: PaneId;
  zone: DropZone;
}

export interface DockPaneDescriptor {
  id: PaneId;
  kind: PaneKind;
  title: string;
  /** Panes that may be closed to the View menu and recovered later. */
  closable: boolean;
}

export interface DockWorkspaceLayout {
  version: number;
  root: DockNode;
  /** Panes removed from the tree, recoverable via the View menu. */
  closed: PaneId[];
}

export const DOCK_LAYOUT_VERSION = 1;

export const PANE_TERMINAL = 'terminal';
export const PANE_OVERVIEW = 'overview';
export const PANE_PLAN_SCREEN = 'plan-screen';
export const PANE_SESSIONS = 'sessions';
export const PANE_SCHEDULER = 'scheduler';
export const PANE_QUICK_SPAWN = 'quick-spawn';
export const PANE_PLAN_DIRECTORIES = 'plan-directories';
export const PANE_ARTIFACTS = 'artifacts';

/**
 * The pane registry. Registration is id-keyed data, so a later renderer plan can
 * map ids to components without the model knowing about them.
 */
export const DOCK_PANES: readonly DockPaneDescriptor[] = Object.freeze([
  Object.freeze({ id: PANE_TERMINAL, kind: 'view', title: 'Terminal', closable: true }),
  Object.freeze({ id: PANE_OVERVIEW, kind: 'view', title: 'Overview', closable: true }),
  Object.freeze({ id: PANE_PLAN_SCREEN, kind: 'view', title: 'Plans', closable: true }),
  Object.freeze({ id: PANE_SESSIONS, kind: 'tool', title: 'Sessions', closable: true }),
  Object.freeze({ id: PANE_SCHEDULER, kind: 'tool', title: 'Scheduler', closable: true }),
  Object.freeze({ id: PANE_QUICK_SPAWN, kind: 'tool', title: 'Quick Spawn', closable: true }),
  Object.freeze({ id: PANE_PLAN_DIRECTORIES, kind: 'tool', title: 'Directories', closable: true }),
  Object.freeze({ id: PANE_ARTIFACTS, kind: 'tool', title: 'Artifacts', closable: true }),
]);

export function getPaneDescriptor(paneId: PaneId): DockPaneDescriptor | undefined {
  return DOCK_PANES.find(p => p.id === paneId);
}

export function isKnownPane(paneId: PaneId): boolean {
  return DOCK_PANES.some(p => p.id === paneId);
}
