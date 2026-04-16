/**
 * Draft Strip — pill display above the terminal area.
 * Shows compact pills for each draft in the active session.
 * Clicking a pill (mouse only) opens the draft editor directly.
 */

import { setDraftCountCache } from '../screens/sessions.js';
import { state } from '../state.js';
import { renderPlanChips } from '../plans/plan-chips.js';

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

  // Clear existing draft pills and labels (keep plan chips separate)
  strip.querySelectorAll('.strip-section-label:not(.strip-section-label--plans)').forEach(el => el.remove());
  strip.querySelectorAll('.draft-pill').forEach(el => el.remove());

  for (const draft of drafts) {
    const pill = document.createElement('span');
    pill.className = 'draft-pill';
    pill.dataset.draftId = draft.id;
    pill.title = draft.label;

    const truncated = draft.label.length > MAX_LABEL_LENGTH
      ? draft.label.slice(0, MAX_LABEL_LENGTH) + '…'
      : draft.label;
    pill.textContent = `📝 ${truncated}`;

    // Click pill → open draft editor directly (mouse only, no gamepad nav to pills)
    pill.addEventListener('click', async () => {
      const { showDraftEditor } = await import('./draft-editor.js');
      showDraftEditor(state.activeSessionId!, draft);
    });

    strip.appendChild(pill);
  }

  // Add "Drafts" label if we have drafts
  if (drafts.length > 0) {
    const draftsLabel = document.createElement('span');
    draftsLabel.className = 'strip-section-label';
    draftsLabel.textContent = 'Drafts';
    const firstPill = strip.querySelector('.draft-pill');
    if (firstPill) {
      strip.insertBefore(draftsLabel, firstPill);
    }
  }

  // Render plan chips after draft pills
  await renderPlanChips(sessionId);

  // Show strip if it has any children, hide if empty
  strip.style.display = strip.children.length > 0 ? 'flex' : 'none';
}

/** Render draft count badge on a session card. Returns the badge element or null. */
export function createDraftBadge(count: number): HTMLElement | null {
  if (count === 0) return null;

  const badge = document.createElement('span');
  badge.className = 'draft-badge';
  badge.textContent = `📝 ${count}`;
  return badge;
}
