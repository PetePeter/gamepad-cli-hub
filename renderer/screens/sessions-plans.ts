/**
 * Sessions screen — plans grid zone (3rd navigation zone below spawn).
 *
 * Shows configured working directories as compact buttons with plan badge counts.
 * Follows the same patterns as sessions-spawn.ts.
 */

import { sessionsState } from './sessions-state.js';
import { showPlanScreen } from '../plans/plan-screen.js';
import { isSpawnCollapsed } from '../sidebar/section-collapse.js';
import { state } from '../state.js';

// Circular import — safe: all usages are inside function bodies, not at module-evaluation time.
import { updateAllFocus } from './sessions.js';

// ============================================================================
// Render — plans grid
// ============================================================================

export function renderPlansGrid(): void {
  // Vue owns the plans grid — PlansGrid.vue renders reactively from state.planDir* maps.
  void refreshPlanBadges();
}

// ============================================================================
// Gamepad navigation — plans zone (2-column grid, same as spawn)
// ============================================================================

export function handlePlansZone(button: string, dir: string | null): void {
  // Read directory count from state — Vue owns the DOM so we can't rely on DOM button count.
  const total = sessionsState.directories.length;
  if (total === 0) return;

  const cols = 2;

  if (dir === 'up') {
    const newIndex = sessionsState.plansFocusIndex - cols;
    if (newIndex < 0) {
      // Skip to sessions if spawn is collapsed
      if (isSpawnCollapsed()) {
        sessionsState.activeFocus = 'sessions';
        sessionsState.sessionsFocusIndex = Math.max(0, sessionsState.navList.length - 1);
        sessionsState.cardColumn = 0;
      } else {
        sessionsState.activeFocus = 'spawn';
        const spawnCount = sessionsState.cliTypes.length;
        sessionsState.spawnFocusIndex = Math.max(0, spawnCount - 1);
      }
      updateAllFocus();
      return;
    }
    sessionsState.plansFocusIndex = newIndex;
    updatePlansFocus();
    return;
  }
  if (dir === 'down') {
    const newIndex = sessionsState.plansFocusIndex + cols;
    if (newIndex < total) {
      sessionsState.plansFocusIndex = newIndex;
      updatePlansFocus();
    }
    return;
  }
  if (dir === 'left') {
    if (sessionsState.plansFocusIndex % cols > 0) {
      sessionsState.plansFocusIndex--;
      updatePlansFocus();
    }
    return;
  }
  if (dir === 'right') {
    if (sessionsState.plansFocusIndex % cols < cols - 1 && sessionsState.plansFocusIndex + 1 < total) {
      sessionsState.plansFocusIndex++;
      updatePlansFocus();
    }
    return;
  }
}

export function handlePlansZoneButton(button: string): boolean {
  switch (button) {
    case 'A': {
      // Read from state — Vue owns the DOM, so we can't rely on DOM button order.
      const dir = sessionsState.directories[sessionsState.plansFocusIndex];
      if (dir?.path) {
        showPlanScreen(dir.path);
      }
      return true;
    }
    case 'B':
      sessionsState.activeFocus = 'sessions';
      updateAllFocus();
      return true;
    default:
      return false;
  }
}

// ============================================================================
// Focus update
// ============================================================================

export function updatePlansFocus(): void {
  const grid = document.getElementById('plansGrid');
  if (!grid) return;
  grid.querySelectorAll('.plans-grid-btn').forEach((el, i) => {
    el.classList.toggle('focused', i === sessionsState.plansFocusIndex && sessionsState.activeFocus === 'plans');
  });
}

// ============================================================================
// Badge refresh
// ============================================================================

export async function refreshPlanBadges(): Promise<void> {
  if (!window.gamepadCli) return;

  for (const dir of sessionsState.directories) {
    try {
      const [startableItems, allItems] = await Promise.all([
        window.gamepadCli.planStartableForDir(dir.path),
        window.gamepadCli.planList(dir.path),
      ]);

      const items: Array<{ status: string }> = allItems ?? [];
      state.planDirStartableCounts.set(dir.path, (startableItems ?? []).length);
      state.planDirDoingCounts.set(dir.path, items.filter(p => p.status === 'doing').length);
      state.planDirBlockedCounts.set(dir.path, items.filter(p => p.status === 'blocked').length);
      state.planDirQuestionCounts.set(dir.path, items.filter(p => p.status === 'question').length);
      state.planDirWaitTestsCounts.set(dir.path, items.filter(p => p.status === 'wait-tests').length);
      state.planDirPendingCounts.set(dir.path, items.filter(p => p.status === 'pending').length);
    } catch {
      // Silently ignore badge fetch errors
    }
  }
}
