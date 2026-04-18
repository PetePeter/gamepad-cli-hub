/**
 * Group Overview — 2-column grid of session preview cards.
 *
 * Renders into the terminal area (#mainArea) as a sibling to #terminalContainer.
 * Each card shows session name, activity dot, state label, and last 10 lines of PTY output.
 */

import { state, type Session } from '../state.js';
import { sessionsState } from './sessions-state.js';
import type { PtyOutputBuffer } from '../terminal/pty-output-buffer.js';
import { getActivityColor } from '../state-colors.js';
import { getVisibleSessions, resolveGroupDisplayName } from '../session-groups.js';
import { toDirection } from '../utils.js';
import { registerView, showView, currentView } from '../main-view/main-view-manager.js';

const PREVIEW_LINES = 10;

let overviewContainer: HTMLElement | null = null;
let outputBuffer: PtyOutputBuffer | null = null;
let sessionStateGetter: ((sessionId: string) => string) | null = null;
let activityLevelGetter: ((sessionId: string) => string) | null = null;
let updateUnsubscribe: (() => void) | null = null;
let throttleTimer: ReturnType<typeof setTimeout> | null = null;
let pendingUpdates = new Set<string>();
let previousActiveSessionId: string | null = null;
const collapsedSessions = new Set<string>();

interface TerminalManagerLike {
  deselect(): void;
  switchTo(sessionId: string): void;
  getActiveSessionId(): string | null;
  hasTerminal(sessionId: string): boolean;
  getTerminalLines(sessionId: string, count: number): string[];
}

let terminalManagerGetter: (() => TerminalManagerLike | null) | null = null;

/** Inject terminal manager getter (called once from main.ts to avoid circular deps) */
export function setTerminalManagerGetter(fn: () => TerminalManagerLike | null): void {
  terminalManagerGetter = fn;
}

/** Inject the PtyOutputBuffer instance (called once from main.ts) */
export function setOutputBuffer(buffer: PtyOutputBuffer): void {
  outputBuffer = buffer;
}

/** Inject state getter to avoid circular deps with sessions.ts */
export function setSessionStateGetter(fn: (sessionId: string) => string): void {
  sessionStateGetter = fn;
}

/** Inject activity level getter to avoid circular deps with sessions.ts */
export function setActivityLevelGetter(fn: (sessionId: string) => string): void {
  activityLevelGetter = fn;
}

/** Show the overview grid for a specific group, or all visible sessions when no group is provided. Delegates through the main-view manager. */
export function showOverview(groupDirPath: string | null = null, initialSessionId?: string): void {
  void showView('overview', { groupDirPath, initialSessionId });
}

/** Internal — mount the overview view (called by the manager). */
function mountOverview(params?: unknown): void {
  const p = (params as { groupDirPath?: string | null; initialSessionId?: string } | undefined);
  const groupDirPath = p?.groupDirPath ?? null;
  const initialSessionId = p?.initialSessionId;

  sessionsState.overviewGroup = groupDirPath;
  sessionsState.overviewIsGlobal = groupDirPath === null;

  const overviewSessions = getOverviewSessions();
  const matchIdx = initialSessionId ? overviewSessions.findIndex(s => s.id === initialSessionId) : -1;
  sessionsState.overviewFocusIndex = matchIdx >= 0 ? matchIdx : 0;

  // Deselect the active terminal — keyboard/paste should not affect any session while overview is open
  const tm = terminalManagerGetter?.();
  previousActiveSessionId = tm?.getActiveSessionId() ?? null;
  tm?.deselect();

  const mainArea = document.getElementById('mainArea');
  if (!mainArea) return;

  // Ensure terminal area content is ready for overview

  // Hide the terminal container (xterm.js panes)
  const termContainer = document.getElementById('terminalContainer');
  if (termContainer) termContainer.style.display = 'none';

  // Hide draft UI — overview is an absolute overlay that would cover them
  const draftStrip = mainArea.querySelector('.draft-strip') as HTMLElement | null;
  if (draftStrip) draftStrip.style.display = 'none';
  const draftEditor = mainArea.querySelector('.draft-editor') as HTMLElement | null;
  if (draftEditor) draftEditor.style.display = 'none';

  // Create or reuse overview container
  if (!overviewContainer) {
    overviewContainer = document.createElement('div');
    overviewContainer.id = 'overviewGrid';
    overviewContainer.className = 'overview-grid';
    mainArea.appendChild(overviewContainer);
  }
  overviewContainer.style.display = 'grid';

  renderOverviewCards();
  updateOverviewFocus();

  // Subscribe to live PTY updates
  if (outputBuffer && !updateUnsubscribe) {
    const cb = (sessionId: string) => {
      pendingUpdates.add(sessionId);
      if (!throttleTimer) {
        throttleTimer = setTimeout(() => {
          flushPendingUpdates();
          throttleTimer = null;
        }, 500);
      }
    };
    outputBuffer.onUpdate(cb);
    updateUnsubscribe = () => {
      outputBuffer?.offUpdate(cb);
    };
  }
}

/** Hide the overview grid and restore the terminal container. Delegates through the manager. */
export function hideOverview(): void {
  if (currentView() === 'overview') {
    void showView('terminal');
  } else {
    unmountOverview();
  }
}

/** Internal — unmount the overview view (called by the manager). */
function unmountOverview(): void {
  sessionsState.overviewGroup = null;
  sessionsState.overviewIsGlobal = false;

  if (overviewContainer) {
    overviewContainer.style.display = 'none';
  }

  // Restore the terminal container
  const termContainer = document.getElementById('terminalContainer');
  if (termContainer) termContainer.style.display = '';

  // Restore draft UI hidden when overview opened
  const mainArea = document.getElementById('mainArea');
  if (mainArea) {
    const draftStrip = mainArea.querySelector('.draft-strip') as HTMLElement | null;
    if (draftStrip) draftStrip.style.display = '';
    const draftEditor = mainArea.querySelector('.draft-editor') as HTMLElement | null;
    if (draftEditor) draftEditor.style.display = '';
  }

  // Restore the previously active terminal
  const tm = terminalManagerGetter?.();
  if (tm && previousActiveSessionId && tm.hasTerminal(previousActiveSessionId)) {
    tm.switchTo(previousActiveSessionId);
  }
  previousActiveSessionId = null;

  // Unsubscribe from live updates
  if (updateUnsubscribe) {
    updateUnsubscribe();
    updateUnsubscribe = null;
  }
  if (throttleTimer) {
    clearTimeout(throttleTimer);
    throttleTimer = null;
  }
  pendingUpdates.clear();
}

registerView('overview', { mount: mountOverview, unmount: unmountOverview });

/** Check if overview is currently visible */
export function isOverviewVisible(): boolean {
  return sessionsState.overviewIsGlobal || sessionsState.overviewGroup !== null;
}

/** Get the sessions shown in the current overview. */
export function getOverviewSessions(): Session[] {
  if (sessionsState.overviewIsGlobal) {
    return getVisibleOverviewGroups().flatMap(group => group.sessions);
  }
  if (!sessionsState.overviewGroup) return [];
  const group = sessionsState.groups.find(item => item.dirPath === sessionsState.overviewGroup);
  if (!group) {
    return state.sessions.filter(session => session.workingDir === sessionsState.overviewGroup);
  }
  return getVisibleSessions([group], sessionsState.groupPrefs);
}

/** Re-render overview cards if currently visible (e.g. after rename) */
export function refreshOverview(): void {
  if (!isOverviewVisible() || !overviewContainer) return;
  const sessionCount = getOverviewSessions().length;
  sessionsState.overviewFocusIndex = sessionCount > 0
    ? Math.min(sessionsState.overviewFocusIndex, sessionCount - 1)
    : 0;
  renderOverviewCards();
  updateOverviewFocus();
}

/** Render all overview content for the current mode. */
function renderOverviewCards(): void {
  if (!overviewContainer) return;
  overviewContainer.innerHTML = '';

  if (sessionsState.overviewIsGlobal) {
    const groups = getVisibleOverviewGroups();
    groups.forEach((group, index) => {
      if (index > 0) {
        overviewContainer!.appendChild(createBreakMark(group.dirPath));
      }
      for (const session of group.sessions) {
        overviewContainer!.appendChild(createOverviewCard(session));
      }
    });
    return;
  }

  for (const session of getOverviewSessions()) {
    const card = createOverviewCard(session);
    overviewContainer.appendChild(card);
  }
}

function getVisibleOverviewGroups(): Array<{ dirPath: string; sessions: Session[] }> {
  return sessionsState.groups
    .map(group => ({
      dirPath: group.dirPath,
      sessions: getVisibleSessions([group], sessionsState.groupPrefs),
    }))
    .filter(group => group.sessions.length > 0);
}

function createBreakMark(dirPath: string): HTMLElement {
  const mark = document.createElement('div');
  mark.className = 'overview-break-mark';
  mark.textContent = `────────── ${resolveGroupDisplayName(dirPath, sessionsState.directories)} ──────────`;
  return mark;
}

/** Create a single overview card element */
function createOverviewCard(session: Session): HTMLElement {
  const card = document.createElement('div');
  card.className = 'overview-card';
  card.dataset.sessionId = session.id;

  const collapsed = collapsedSessions.has(session.id);
  if (collapsed) card.classList.add('overview-card--collapsed');

  // Header: state dot + name + state label
  const header = document.createElement('div');
  header.className = 'overview-card-header';

  const dot = document.createElement('span');
  dot.className = 'overview-state-dot';
  const activityLevel = getActivityLevelForOverview(session.id);
  dot.style.background = getActivityColor(activityLevel);
  header.appendChild(dot);

  const name = document.createElement('span');
  name.className = 'overview-card-name';
  name.textContent = session.name;
  header.appendChild(name);

  // Subtitle: OSC terminal title
  if (session.title && session.title !== session.name) {
    const subtitle = document.createElement('span');
    subtitle.className = 'overview-card-subtitle';
    subtitle.textContent = session.title;
    subtitle.title = session.title;
    header.appendChild(subtitle);
  }

  const sessionState = getSessionStateForOverview(session.id);
  const stateLabel = document.createElement('span');
  stateLabel.className = 'overview-card-state';
  stateLabel.textContent = sessionState;
  header.appendChild(stateLabel);

  card.appendChild(header);

  // Preview: last N lines (skip for collapsed cards)
  if (!collapsed) {
    const preview = document.createElement('div');
    preview.className = 'overview-card-preview';
    renderPreviewLines(preview, session.id);
    card.appendChild(preview);
  }

  // Click handler — same as A-button
  card.addEventListener('click', () => {
    selectOverviewCard(session.id);
  });

  return card;
}

/** Update focus highlight on overview cards */
export function updateOverviewFocus(): void {
  if (!overviewContainer) return;
  const cards = overviewContainer.querySelectorAll('.overview-card');
  cards.forEach((card, i) => {
    card.classList.toggle('overview-card--focused', i === sessionsState.overviewFocusIndex);
  });
  // Scroll focused card into view
  const focused = cards[sessionsState.overviewFocusIndex];
  if (focused) focused.scrollIntoView({ block: 'nearest' });
}

/** Select a card — exit overview and switch to the session */
export function selectOverviewCard(sessionId: string): void {
  hideOverview();
  // Defer session switch to avoid circular import — navigation.ts wires this
  selectCardCallback?.(sessionId);
}

export function handleOverviewInput(button: string): boolean {
  const dir = toDirection(button);
  const sessions = getOverviewSessions();
  const count = sessions.length;

  if (count === 0) {
    hideOverview();
    return true;
  }

  if (dir === 'left') {
    hideOverview();
    return true;
  }
  if (dir === 'right') {
    return true;
  }

  if (button === 'A') {
    const session = sessions[sessionsState.overviewFocusIndex];
    if (session) selectOverviewCard(session.id);
    return true;
  }

  if (button === 'X') {
    const session = sessions[sessionsState.overviewFocusIndex];
    if (session) {
      toggleCollapseCard(session.id);
      refreshOverview();
    }
    return true;
  }

  if (button === 'B') {
    hideOverview();
    return true;
  }

  return false;
}

/** Callback set by navigation.ts for switching session + sidebar sync */
let selectCardCallback: ((sessionId: string) => void) | null = null;
export function setSelectCardCallback(fn: (sessionId: string) => void): void {
  selectCardCallback = fn;
}

/** Render preview lines into a container element — reads from xterm.js buffer for fidelity.
 *  Content is bottom-aligned: padding divs first, then real lines, so the latest
 *  output always sits at the bottom of the preview area (like a real terminal). */
function renderPreviewLines(preview: Element, sessionId: string): void {
  preview.innerHTML = '';
  const tm = terminalManagerGetter?.();
  const lines = tm?.getTerminalLines(sessionId, PREVIEW_LINES) ?? [];

  // Trim leading blank lines so content is compact
  let start = 0;
  while (start < lines.length && (lines[start] ?? '').trim() === '') start++;
  const trimmedLines = lines.slice(start);

  // Pad at the top so content is bottom-aligned
  const padCount = PREVIEW_LINES - trimmedLines.length;
  for (let i = 0; i < padCount; i++) {
    const lineEl = document.createElement('div');
    lineEl.className = 'preview-line';
    lineEl.textContent = '\u00A0';
    preview.appendChild(lineEl);
  }
  for (const line of trimmedLines) {
    const lineEl = document.createElement('div');
    lineEl.className = 'preview-line';
    lineEl.textContent = line || '\u00A0';
    preview.appendChild(lineEl);
  }
}

/** Flush pending live updates — only re-render affected card previews */
function flushPendingUpdates(): void {
  if (!overviewContainer || !isOverviewVisible()) return;
  for (const sessionId of pendingUpdates) {
    const card = overviewContainer.querySelector(`.overview-card[data-session-id="${sessionId}"]`);
    if (!card) continue;

    // Update preview only for expanded cards
    if (!collapsedSessions.has(sessionId)) {
      const preview = card.querySelector('.overview-card-preview');
      if (preview) renderPreviewLines(preview, sessionId);
    }

    // Always update the state dot color and label
    const dot = card.querySelector('.overview-state-dot') as HTMLElement;
    const stateLabel = card.querySelector('.overview-card-state');
    if (dot || stateLabel) {
      const sessionState = getSessionStateForOverview(sessionId);
      const activityLevel = getActivityLevelForOverview(sessionId);
      if (dot) dot.style.background = getActivityColor(activityLevel);
      if (stateLabel) stateLabel.textContent = sessionState;
    }
  }
  pendingUpdates.clear();
}

/** Get session state via injected getter (avoids circular dep with sessions.ts) */
function getSessionStateForOverview(sessionId: string): string {
  return sessionStateGetter?.(sessionId) ?? 'idle';
}

/** Get activity level via injected getter (avoids circular dep with sessions.ts) */
function getActivityLevelForOverview(sessionId: string): string {
  return activityLevelGetter?.(sessionId) ?? 'idle';
}

/** Toggle collapse state for an overview card */
export function toggleCollapseCard(sessionId: string): void {
  if (collapsedSessions.has(sessionId)) {
    collapsedSessions.delete(sessionId);
  } else {
    collapsedSessions.add(sessionId);
  }
}

/** Check if an overview card is collapsed (exported for tests) */
export function isCardCollapsed(sessionId: string): boolean {
  return collapsedSessions.has(sessionId);
}
