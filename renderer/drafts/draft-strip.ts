/**
 * Draft Strip — pill display above the terminal area.
 * Shows compact pills for each draft in the active session.
 * Clicking a pill (mouse only) opens the draft editor directly.
 */

import { setDraftCountCache } from '../screens/sessions.js';
import { state } from '../state.js';
import { renderPlanChips } from '../plans/plan-chips.js';
import { resolveChipbarTemplates } from './chipbar-templates.js';

const MAX_LABEL_LENGTH = 20;
let renderGeneration = 0;

interface ChipbarActionsResult {
  actions: Array<{ label: string; sequence: string }>;
  inboxDir: string;
}

let cachedChipbarData: ChipbarActionsResult | null = null;

export function invalidateChipActionCache(): void {
  cachedChipbarData = null;
}

async function renderActionButtons(sessionId: string): Promise<void> {
  const strip = document.getElementById('draftStrip');
  if (!strip) return;

  strip.querySelector('.chip-action-bar')?.remove();

  if (!cachedChipbarData) {
    try {
      cachedChipbarData = await window.gamepadCli.configGetChipbarActions();
    } catch {
      return; // transient failure — don't cache, retry on next render
    }
  }

  const { actions, inboxDir } = cachedChipbarData;
  if (actions.length === 0) return;

  const session = state.sessions.find(s => s.id === sessionId);
  const ctx = {
    cwd: session?.workingDir ?? '',
    cliType: session?.cliType ?? '',
    sessionName: session?.name ?? '',
    inboxDir,
  };

  const bar = document.createElement('div');
  bar.className = 'chip-action-bar';

  for (const action of actions) {
    const btn = document.createElement('button');
    btn.className = 'chip-action-btn';
    btn.textContent = action.label;
    const preview = resolveChipbarTemplates(action.sequence, ctx);
    btn.title = preview.length > 120 ? preview.slice(0, 119) + '…' : preview;
    btn.addEventListener('click', async () => {
      const currentSession = state.sessions.find(s => s.id === sessionId);
      const currentCtx = {
        cwd: currentSession?.workingDir ?? '',
        cliType: currentSession?.cliType ?? '',
        sessionName: currentSession?.name ?? '',
        inboxDir,
      };
      const { executeSequence } = await import('../bindings.js');
      await executeSequence(resolveChipbarTemplates(action.sequence, currentCtx));
    });
    bar.appendChild(btn);
  }

  strip.appendChild(bar);
  strip.style.display = 'flex';
}

/** Initialize the draft strip — creates the DOM container once. Called at app startup. */
export function initDraftStrip(): void {
  const existing = document.getElementById('draftStrip');
  if (existing) return;

  const strip = document.createElement('div');
  strip.className = 'draft-strip';
  strip.id = 'draftStrip';
  strip.style.display = 'none';

  const mainArea = document.getElementById('mainArea');
  const terminalContainer = mainArea?.querySelector('.terminal-container');
  if (mainArea && terminalContainer) {
    mainArea.insertBefore(strip, terminalContainer);
  } else if (mainArea) {
    mainArea.prepend(strip);
  }
}

/** Refresh the draft strip for the current active session. Call whenever session switches or drafts change. */
export async function refreshDraftStrip(sessionId: string | null): Promise<void> {
  const strip = document.getElementById('draftStrip');
  if (!strip) return;
  const thisGeneration = ++renderGeneration;

  if (!sessionId) {
    strip.replaceChildren();
    strip.style.display = 'none';
    return;
  }

  let drafts: Array<{ id: string; label: string; text: string }> = [];
  try {
    drafts = await window.gamepadCli.draftList(sessionId);
  } catch {
    drafts = [];
  }
  if (thisGeneration !== renderGeneration) return;

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
    pill.textContent = truncated;

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
  if (thisGeneration !== renderGeneration) return;

  // Render chipbar action buttons (right-aligned quick actions)
  await renderActionButtons(sessionId);
  if (thisGeneration !== renderGeneration) return;

  // Show strip if it has any children, hide if empty
  strip.style.display = strip.children.length > 0 ? 'flex' : 'none';
}

/** Hide the strip and cancel any in-flight refresh so session switches stay clean. */
export function dismissDraftStrip(): void {
  const strip = document.getElementById('draftStrip');
  renderGeneration++;
  if (!strip) return;
  strip.replaceChildren();
  strip.style.display = 'none';
}

/** Render draft count badge on a session card. Returns the badge element or null. */
export function createDraftBadge(count: number): HTMLElement | null {
  if (count === 0) return null;

  const badge = document.createElement('span');
  badge.className = 'draft-badge';
  badge.textContent = `📝 ${count}`;
  return badge;
}
