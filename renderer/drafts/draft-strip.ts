/**
 * Draft Strip — view-only pill display above the terminal area.
 * Shows compact pills for each draft in the active session.
 * All actions are via context menu — pills are not interactive.
 */

import { setDraftCountCache } from '../screens/sessions.js';

const MAX_LABEL_LENGTH = 20;

/** Initialize the draft strip — creates the DOM container once. Called at app startup. */
export function initDraftStrip(): void {
  const existing = document.getElementById('draftStrip');
  if (existing) return;

  const strip = document.createElement('div');
  strip.className = 'draft-strip';
  strip.id = 'draftStrip';
  strip.style.display = 'none';

  const terminalArea = document.getElementById('terminalArea');
  const terminalContainer = terminalArea?.querySelector('.terminal-container');
  if (terminalArea && terminalContainer) {
    terminalArea.insertBefore(strip, terminalContainer);
  } else if (terminalArea) {
    terminalArea.prepend(strip);
  }
}

/** Refresh the draft strip for the current active session. Call whenever session switches or drafts change. */
export async function refreshDraftStrip(sessionId: string | null): Promise<void> {
  const strip = document.getElementById('draftStrip');
  if (!strip) return;

  if (!sessionId) {
    strip.style.display = 'none';
    return;
  }

  let drafts: Array<{ id: string; label: string; text: string }> = [];
  try {
    drafts = await window.gamepadCli.draftList(sessionId);
  } catch {
    drafts = [];
  }

  // Update the draft count cache for session card badges
  setDraftCountCache(sessionId, drafts.length);

  if (drafts.length === 0) {
    strip.style.display = 'none';
    strip.innerHTML = '';
    return;
  }

  strip.innerHTML = '';
  for (const draft of drafts) {
    const pill = document.createElement('span');
    pill.className = 'draft-pill';
    pill.dataset.draftId = draft.id;
    pill.title = draft.label;

    const truncated = draft.label.length > MAX_LABEL_LENGTH
      ? draft.label.slice(0, MAX_LABEL_LENGTH) + '…'
      : draft.label;
    pill.textContent = `📝 ${truncated}`;

    strip.appendChild(pill);
  }

  strip.style.display = 'flex';
}

/** Get the draft count for a session (from IPC). */
export async function getDraftCount(sessionId: string): Promise<number> {
  try {
    return await window.gamepadCli.draftCount(sessionId);
  } catch {
    return 0;
  }
}

/** Render draft count badge on a session card. Returns the badge element or null. */
export function createDraftBadge(count: number): HTMLElement | null {
  if (count === 0) return null;

  const badge = document.createElement('span');
  badge.className = 'draft-badge';
  badge.textContent = `📝 ${count}`;
  return badge;
}
