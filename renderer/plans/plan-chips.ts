/**
 * Plan Chips — badge display on session cards and pill display in draft strip.
 * Shows plan status (doing/startable) for sessions and directories.
 */

import { setPlanDoingCountCache, setPlanStartableCountCache } from '../screens/sessions.js';
import { state } from '../state.js';
import { getSessionCwd } from '../screens/sessions.js';
import { showPlanInEditor, hideDraftEditor } from '../drafts/draft-editor.js';

const MAX_LABEL_LENGTH = 20;
const ACTIVE_PLAN_STATUSES = new Set(['doing', 'blocked', 'question']);

/** Generation counter to prevent stale async renders from appending duplicates. */
let renderGeneration = 0;

/** Render a plan badge on a session card. Returns the badge element or null. */
export function createPlanBadge(
  doingCount: number,
  startableCount: number,
  blockedCount = 0,
  questionCount = 0,
): HTMLElement | null {
  if (doingCount === 0 && startableCount === 0 && blockedCount === 0 && questionCount === 0) return null;

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

  if (blockedCount > 0) {
    const badge = document.createElement('span');
    badge.className = 'plan-badge plan-badge--blocked';
    badge.textContent = `🗺️ ${blockedCount}`;
    wrapper.appendChild(badge);
  }

  if (questionCount > 0) {
    const badge = document.createElement('span');
    badge.className = 'plan-badge plan-badge--question';
    badge.textContent = `🗺️ ${questionCount}`;
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

  const [activePlans, startablePlans] = await fetchPlanData(sessionId);

  // Stale render — a newer call superseded this one during the await
  if (thisGeneration !== renderGeneration) return;

  // Clear existing chips AFTER async fetch to avoid race condition
  strip.querySelectorAll('.plan-chip').forEach(el => el.remove());
  strip.querySelectorAll('.strip-section-label--plans').forEach(el => el.remove());

  // Update caches for session card badges
  setPlanDoingCountCache(sessionId, activePlans.filter(plan => plan.sessionId === sessionId).length);
  setPlanStartableCountCache(sessionId, startablePlans.length);

  // Add "Plans" label if we have any plans
  if (activePlans.length > 0 || startablePlans.length > 0) {
    const plansLabel = document.createElement('span');
    plansLabel.className = 'strip-section-label strip-section-label--plans';
    plansLabel.textContent = 'Plans';
    strip.appendChild(plansLabel);
  }

  // Render active chips
  for (const plan of activePlans) {
    strip.appendChild(createPlanChip(plan, toChipStatus(plan.status)));
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
  let activePlans: any[] = [];
  let startablePlans: any[] = [];
  const cwd = getSessionCwd(sessionId);

  try {
    if (cwd && window.gamepadCli.planGetAllDoingForDir) {
      activePlans = await window.gamepadCli.planGetAllDoingForDir(cwd);
    } else {
      activePlans = await window.gamepadCli.planDoingForSession(sessionId);
    }
  } catch { activePlans = []; }

  try {
    if (cwd) {
      startablePlans = await window.gamepadCli.planStartableForDir(cwd);
    }
  } catch { startablePlans = []; }

  return [activePlans.filter(plan => ACTIVE_PLAN_STATUSES.has(plan.status)), startablePlans];
}

/** Create a single plan chip element. */
function createPlanChip(
  plan: { id: string; title: string },
  status: 'doing' | 'blocked' | 'question' | 'startable',
): HTMLElement {
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

function toChipStatus(status: string): 'doing' | 'blocked' | 'question' | 'startable' {
  if (status === 'blocked' || status === 'question' || status === 'startable') return status;
  return 'doing';
}

/** Handle click on a plan chip — open unified editor for the plan item. */
async function handleChipClick(
  planId: string,
  status: 'doing' | 'blocked' | 'question' | 'startable',
): Promise<void> {
  try {
    const item = await window.gamepadCli.planGetItem(planId);
    if (!item) return;

    const onSave = async (updates: { title: string; description: string; status: string; stateInfo?: string }) => {
      await window.gamepadCli.planUpdate(planId, updates);
      if (item.status !== 'done') {
        await window.gamepadCli.planSetState(planId, updates.status, updates.stateInfo, state.activeSessionId || item.sessionId);
      }
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
      const result = await window.gamepadCli.writeTempContent(item.description);
      if (result?.success && result.path) {
        const filePath = result.path;
        await window.gamepadCli.ptyWrite(state.activeSessionId, `${filePath}\n`);
        if (status === 'startable') {
          await window.gamepadCli.planApply(planId, state.activeSessionId);
        }
        // Clean up temp file after ptyWrite succeeds
        try { await window.gamepadCli.deleteTemp(filePath); }
        catch (err) { console.debug('[PlanChips] Could not delete temp file:', err); }
      } else {
        console.error('[PlanChips] Failed to write temp file:', result?.error);
      }
      hideDraftEditor();
      await renderPlanChips(state.activeSessionId);
    };

    showPlanInEditor(state.activeSessionId || '', item, { onSave, onDelete, onDone, onApply });
  } catch (err) {
    console.error('[PlanChips] Action failed:', err);
  }
}
