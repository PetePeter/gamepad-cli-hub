/**
 * Group Overview — 2-column grid of session preview cards.
 *
 * Renders into the terminal area (#terminalArea) as a sibling to #terminalContainer.
 * Each card shows session name, state dot, CLI type, and last 5 lines of PTY output.
 */

import { state, type Session } from '../state.js';
import { sessionsState } from './sessions-state.js';
import type { PtyOutputBuffer } from '../terminal/pty-output-buffer.js';
import { getActivityColor } from '../state-colors.js';

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

/** Show the overview grid for a specific group */
export function showOverview(groupDirPath: string, initialSessionId?: string): void {
  sessionsState.overviewGroup = groupDirPath;

  // Pre-select the matching session if provided, default to 0
  const groupSessions = state.sessions.filter(s => s.workingDir === groupDirPath);
  const matchIdx = initialSessionId ? groupSessions.findIndex(s => s.id === initialSessionId) : -1;
  sessionsState.overviewFocusIndex = matchIdx >= 0 ? matchIdx : 0;

  // Deselect the active terminal — keyboard/paste should not affect any session while overview is open
  const tm = terminalManagerGetter?.();
  previousActiveSessionId = tm?.getActiveSessionId() ?? null;
  tm?.deselect();

  const terminalArea = document.getElementById('terminalArea');
  if (!terminalArea) return;

  // Show terminal area if hidden
  terminalArea.style.display = 'flex';
  const splitter = document.getElementById('panelSplitter');
  if (splitter) splitter.style.display = 'block';

  // Hide the terminal container (xterm.js panes)
  const termContainer = document.getElementById('terminalContainer');
  if (termContainer) termContainer.style.display = 'none';

  // Create or reuse overview container
  if (!overviewContainer) {
    overviewContainer = document.createElement('div');
    overviewContainer.id = 'overviewGrid';
    overviewContainer.className = 'overview-grid';
    terminalArea.appendChild(overviewContainer);
  }
  overviewContainer.style.display = 'grid';

  renderOverviewCards(groupDirPath);
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

/** Hide the overview grid and restore the terminal container */
export function hideOverview(): void {
  sessionsState.overviewGroup = null;

  if (overviewContainer) {
    overviewContainer.style.display = 'none';
  }

  // Restore the terminal container
  const termContainer = document.getElementById('terminalContainer');
  if (termContainer) termContainer.style.display = '';

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

/** Check if overview is currently visible */
export function isOverviewVisible(): boolean {
  return sessionsState.overviewGroup !== null;
}

/** Get the sessions for the current overview group */
export function getOverviewSessions(): Session[] {
  if (!sessionsState.overviewGroup) return [];
  return state.sessions.filter(s => s.workingDir === sessionsState.overviewGroup);
}

/** Re-render overview cards if currently visible (e.g. after rename) */
export function refreshOverview(): void {
  if (!sessionsState.overviewGroup || !overviewContainer) return;
  renderOverviewCards(sessionsState.overviewGroup);
  updateOverviewFocus();
}

/** Render all cards for the group */
function renderOverviewCards(groupDirPath: string): void {
  if (!overviewContainer) return;
  overviewContainer.innerHTML = '';

  const sessions = state.sessions.filter(s => s.workingDir === groupDirPath);

  for (const session of sessions) {
    const card = createOverviewCard(session);
    overviewContainer.appendChild(card);
  }
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

/** Callback set by navigation.ts for switching session + sidebar sync */
let selectCardCallback: ((sessionId: string) => void) | null = null;
export function setSelectCardCallback(fn: (sessionId: string) => void): void {
  selectCardCallback = fn;
}

/** Render preview lines into a container element — shared by createOverviewCard and flushPendingUpdates */
function renderPreviewLines(preview: Element, sessionId: string): void {
  preview.innerHTML = '';
  const lines = outputBuffer?.getLastLines(sessionId, PREVIEW_LINES) ?? [];
  for (const line of lines) {
    const lineEl = document.createElement('div');
    lineEl.className = 'preview-line';
    lineEl.textContent = line || '\u00A0';
    preview.appendChild(lineEl);
  }
  for (let i = lines.length; i < PREVIEW_LINES; i++) {
    const lineEl = document.createElement('div');
    lineEl.className = 'preview-line';
    lineEl.textContent = '\u00A0';
    preview.appendChild(lineEl);
  }
}

/** Flush pending live updates — only re-render affected card previews */
function flushPendingUpdates(): void {
  if (!overviewContainer || !sessionsState.overviewGroup) return;
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
