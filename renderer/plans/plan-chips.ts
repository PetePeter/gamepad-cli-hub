/**
 * Plan Chips — badge display on session cards and pill display in draft strip.
 * Shows plan status (doing/startable) for sessions and directories.
 */

import { setPlanDoingCountCache, setPlanStartableCountCache } from '../screens/sessions.js';
import { state } from '../state.js';
import { getSessionCwd } from '../screens/sessions.js';
import { showPlanInEditor, hideDraftEditor } from '../drafts/draft-editor.js';

const MAX_LABEL_LENGTH = 20;

/** Generation counter to prevent stale async renders from appending duplicates. */
let renderGeneration = 0;

/** Render a plan badge on a session card. Returns the badge element or null. */
export function createPlanBadge(doingCount: number, startableCount: number): HTMLElement | null {
  if (doingCount === 0 && startableCount === 0) return null;

  const wrapper = document.createElement('span');
  wrapper.className = 'plan-badge-group';

  if (doingCount > 0) {
    const badge = document.createElement('span');
    badge.className = 'plan-badge plan-badge--doing';
    badge.textContent = `🗺️ ${doingCount}`;
    wrapper.appendChild(badge);
  }

  if (startableCount > 0) {
    const badge = document.createElement('span');
    badge.className = 'plan-badge plan-badge--startable';
    badge.textContent = `🗺️ ${startableCount}`;
    wrapper.appendChild(badge);
  }

  return wrapper;
}

/** Render plan chips into the draft strip for the given session. */
export async function renderPlanChips(sessionId: string): Promise<void> {
  const strip = document.getElementById('draftStrip');
  if (!strip) return;

  const thisGeneration = ++renderGeneration;

  if (!sessionId) {
    strip.querySelectorAll('.plan-chip').forEach(el => el.remove());
    strip.querySelectorAll('.strip-section-label--plans').forEach(el => el.remove());
    return;
  }

  const [doingPlans, startablePlans] = await fetchPlanData(sessionId);

  // Stale render — a newer call superseded this one during the await
  if (thisGeneration !== renderGeneration) return;

  // Clear existing chips AFTER async fetch to avoid race condition
  strip.querySelectorAll('.plan-chip').forEach(el => el.remove());
  strip.querySelectorAll('.strip-section-label--plans').forEach(el => el.remove());

  // Update caches for session card badges
  setPlanDoingCountCache(sessionId, doingPlans.length);
  setPlanStartableCountCache(sessionId, startablePlans.length);

  // Add "Plans" label if we have any plans
  if (doingPlans.length > 0 || startablePlans.length > 0) {
    const plansLabel = document.createElement('span');
    plansLabel.className = 'strip-section-label strip-section-label--plans';
    plansLabel.textContent = 'Plans';
    strip.appendChild(plansLabel);
  }

  // Render doing chips
  for (const plan of doingPlans) {
    strip.appendChild(createPlanChip(plan, 'doing'));
  }

  // Render startable chips
  for (const plan of startablePlans) {
    strip.appendChild(createPlanChip(plan, 'startable'));
  }

  // Show strip if it has any children (drafts or plans)
  if (strip.children.length > 0) {
    strip.style.display = 'flex';
  }
}

/** Fetch doing and startable plans for a session. */
async function fetchPlanData(sessionId: string): Promise<[any[], any[]]> {
  let doingPlans: any[] = [];
  let startablePlans: any[] = [];

  try {
    doingPlans = await window.gamepadCli.planDoingForSession(sessionId);
  } catch { doingPlans = []; }

  try {
    const cwd = getSessionCwd(sessionId);
    if (cwd) {
      startablePlans = await window.gamepadCli.planStartableForDir(cwd);
    }
  } catch { startablePlans = []; }

  return [doingPlans, startablePlans];
}

/** Create a single plan chip element. */
function createPlanChip(plan: { id: string; title: string }, status: 'doing' | 'startable'): HTMLElement {
  const chip = document.createElement('span');
  chip.className = `plan-chip plan-chip--${status}`;
  chip.dataset.planId = plan.id;
  chip.title = plan.title;

  const truncated = plan.title.length > MAX_LABEL_LENGTH
    ? plan.title.slice(0, MAX_LABEL_LENGTH) + '…'
    : plan.title;
  chip.textContent = truncated;

  chip.addEventListener('click', () => handleChipClick(plan.id, status));

  return chip;
}

/** Handle click on a plan chip — open unified editor for the plan item. */
async function handleChipClick(planId: string, status: 'doing' | 'startable'): Promise<void> {
  try {
    const item = await window.gamepadCli.planGetItem(planId);
    if (!item) return;

    const onSave = async (updates: { title: string; description: string }) => {
      await window.gamepadCli.planUpdate(planId, updates);
    };

    const onDelete = async () => {
      await window.gamepadCli.planDelete(planId);
      hideDraftEditor();
      if (state.activeSessionId) await renderPlanChips(state.activeSessionId);
    };

    const onDone = status === 'doing' ? async () => {
      await window.gamepadCli.planComplete(planId);
      hideDraftEditor();
      if (state.activeSessionId) await renderPlanChips(state.activeSessionId);
    } : undefined;

    const onApply = async () => {
      if (!state.activeSessionId) return;
      await window.gamepadCli.ptyWrite(state.activeSessionId, item.description + '\n');
      if (status === 'startable') {
        await window.gamepadCli.planApply(planId, state.activeSessionId);
      }
      hideDraftEditor();
      await renderPlanChips(state.activeSessionId);
    };

    showPlanInEditor(state.activeSessionId || '', item, { onSave, onDelete, onDone, onApply });
  } catch (err) {
    console.error('[PlanChips] Action failed:', err);
  }
}
