import { logEvent } from '../utils.js';
import {
  planDeleteConfirm, setPlanDeleteCallback,
} from '../stores/modal-bridge.js';

export interface PlanDeleteConfirmState {
  visible: boolean;
  planTitle: string;
  itemKind: string;
  title: string;
  message: string;
  confirmLabel: string;
  selectedIndex: number;
}

export const planDeleteConfirmState: PlanDeleteConfirmState = {
  visible: false,
  planTitle: '',
  itemKind: 'plan item',
  title: 'Delete Plan Item',
  message: '',
  confirmLabel: 'Delete',
  selectedIndex: 0,
};

export function showPlanDeleteConfirm(
  planTitle: string,
  onConfirm: () => void,
  options: Partial<Pick<PlanDeleteConfirmState, 'itemKind' | 'title' | 'message' | 'confirmLabel'>> = {},
): void {
  planDeleteConfirmState.visible = true;
  planDeleteConfirmState.planTitle = planTitle;
  planDeleteConfirmState.itemKind = options.itemKind ?? 'plan item';
  planDeleteConfirmState.title = options.title ?? 'Delete Plan Item';
  planDeleteConfirmState.message = options.message ?? '';
  planDeleteConfirmState.confirmLabel = options.confirmLabel ?? 'Delete';
  planDeleteConfirmState.selectedIndex = 0;

  planDeleteConfirm.visible = true;
  planDeleteConfirm.planTitle = planTitle;
  planDeleteConfirm.itemKind = planDeleteConfirmState.itemKind;
  planDeleteConfirm.title = planDeleteConfirmState.title;
  planDeleteConfirm.message = planDeleteConfirmState.message;
  planDeleteConfirm.confirmLabel = planDeleteConfirmState.confirmLabel;
  setPlanDeleteCallback(onConfirm);

  logEvent(`${planDeleteConfirmState.title} confirmation shown`);
}

export function hidePlanDeleteConfirm(): void {
  planDeleteConfirmState.visible = false;
  planDeleteConfirmState.planTitle = '';
  planDeleteConfirmState.itemKind = 'plan item';
  planDeleteConfirmState.title = 'Delete Plan Item';
  planDeleteConfirmState.message = '';
  planDeleteConfirmState.confirmLabel = 'Delete';
  planDeleteConfirm.visible = false;
  planDeleteConfirm.planTitle = '';
  planDeleteConfirm.itemKind = 'plan item';
  planDeleteConfirm.title = 'Delete Plan Item';
  planDeleteConfirm.message = '';
  planDeleteConfirm.confirmLabel = 'Delete';
  setPlanDeleteCallback(null);
}

export function handlePlanDeleteConfirmButton(_button: string): void {
  // Vue PlanDeleteConfirmModal handles gamepad via useModalStack
}

export function initPlanDeleteConfirmClickHandlers(): void {
  // No-op — Vue component handles click events
}
