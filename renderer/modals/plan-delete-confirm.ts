import { logEvent } from '../utils.js';
import {
  planDeleteConfirm, setPlanDeleteCallback,
} from '../stores/modal-bridge.js';

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

export function showPlanDeleteConfirm(planTitle: string, onConfirm: () => void): void {
  planDeleteConfirmState.visible = true;
  planDeleteConfirmState.planTitle = planTitle;
  planDeleteConfirmState.selectedIndex = 0;

  planDeleteConfirm.visible = true;
  planDeleteConfirm.planTitle = planTitle;
  setPlanDeleteCallback(onConfirm);

  logEvent('Plan delete confirmation shown');
}

export function hidePlanDeleteConfirm(): void {
  planDeleteConfirmState.visible = false;
  planDeleteConfirmState.planTitle = '';
  planDeleteConfirm.visible = false;
  setPlanDeleteCallback(null);
}

export function handlePlanDeleteConfirmButton(_button: string): void {
  // Vue PlanDeleteConfirmModal handles gamepad via useModalStack
}

export function initPlanDeleteConfirmClickHandlers(): void {
  // No-op — Vue component handles click events
}
