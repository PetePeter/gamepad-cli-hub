import { logEvent, toDirection } from '../utils.js';
import { attachModalKeyboard } from './modal-base.js';

export interface PlanDeleteConfirmState {
  visible: boolean;
  planTitle: string;
  selectedIndex: number;
}

export const planDeleteConfirmState: PlanDeleteConfirmState = {
  visible: false,
  planTitle: '',
  selectedIndex: 0,
};

let onConfirmCallback: (() => void) | null = null;
let cleanupKeyboard: (() => void) | null = null;

export function showPlanDeleteConfirm(planTitle: string, onConfirm: () => void): void {
  planDeleteConfirmState.visible = true;
  planDeleteConfirmState.planTitle = planTitle;
  planDeleteConfirmState.selectedIndex = 0;
  onConfirmCallback = onConfirm;

  const overlay = document.getElementById('planDeleteConfirmOverlay');
  if (!overlay) return;

  renderPlanDeleteConfirm();
  overlay.classList.add('modal--visible');
  overlay.setAttribute('aria-hidden', 'false');

  cleanupKeyboard?.();
  cleanupKeyboard = attachModalKeyboard({
    mode: 'selection',
    onAccept: () => executeSelected(),
    onCancel: () => hidePlanDeleteConfirm(),
    onArrowLeft: toggleSelection,
    onArrowRight: toggleSelection,
    onArrowUp: toggleSelection,
    onArrowDown: toggleSelection,
  });

  logEvent('Plan delete confirmation shown');
}

export function hidePlanDeleteConfirm(): void {
  planDeleteConfirmState.visible = false;
  planDeleteConfirmState.planTitle = '';
  onConfirmCallback = null;

  cleanupKeyboard?.();
  cleanupKeyboard = null;

  const overlay = document.getElementById('planDeleteConfirmOverlay');
  if (!overlay) return;

  overlay.classList.remove('modal--visible');
  overlay.setAttribute('aria-hidden', 'true');
}

export function handlePlanDeleteConfirmButton(button: string): void {
  const dir = toDirection(button);
  if (dir === 'left' || dir === 'right') {
    toggleSelection();
    return;
  }

  if (button === 'A') {
    executeSelected();
    return;
  }

  if (button === 'B') {
    hidePlanDeleteConfirm();
  }
}

export function initPlanDeleteConfirmClickHandlers(): void {
  const deleteBtn = document.getElementById('planDeleteConfirmDeleteBtn');
  const cancelBtn = document.getElementById('planDeleteConfirmCancelBtn');
  const overlay = document.getElementById('planDeleteConfirmOverlay');

  deleteBtn?.addEventListener('click', () => {
    planDeleteConfirmState.selectedIndex = 1;
    executeSelected();
  });
  cancelBtn?.addEventListener('click', () => hidePlanDeleteConfirm());
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) hidePlanDeleteConfirm();
  });
}

function toggleSelection(): void {
  planDeleteConfirmState.selectedIndex = planDeleteConfirmState.selectedIndex === 0 ? 1 : 0;
  renderPlanDeleteConfirm();
}

function executeSelected(): void {
  if (planDeleteConfirmState.selectedIndex !== 1) {
    hidePlanDeleteConfirm();
    return;
  }

  const cb = onConfirmCallback;
  hidePlanDeleteConfirm();
  cb?.();
}

function renderPlanDeleteConfirm(): void {
  const body = document.getElementById('planDeleteConfirmBody');
  const cancelBtn = document.getElementById('planDeleteConfirmCancelBtn');
  const deleteBtn = document.getElementById('planDeleteConfirmDeleteBtn');
  if (!body) return;

  body.textContent = `Delete "${planDeleteConfirmState.planTitle}"?`;
  cancelBtn?.classList.toggle('btn--focused', planDeleteConfirmState.selectedIndex === 0);
  deleteBtn?.classList.toggle('btn--focused', planDeleteConfirmState.selectedIndex === 1);
}
