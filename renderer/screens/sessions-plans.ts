/**
 * Sessions screen — plans grid zone (3rd navigation zone below spawn).
 *
 * Shows configured working directories as compact buttons with plan badge counts.
 * Follows the same patterns as sessions-spawn.ts.
 */

import { sessionsState } from './sessions-state.js';

// Circular import — safe: all usages are inside function bodies, not at module-evaluation time.
import { updateAllFocus } from './sessions.js';

// ============================================================================
// Render — plans grid
// ============================================================================

/** Generation counter to prevent stale async renders from appending duplicates. */
let plansRenderGeneration = 0;

export function renderPlansGrid(): void {
  const grid = document.getElementById('plansGrid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!window.gamepadCli) return;

  const thisGeneration = ++plansRenderGeneration;

  window.gamepadCli.configGetWorkingDirs().then((dirs: Array<{ name: string; path: string }>) => {
    if (thisGeneration !== plansRenderGeneration) return;
    if (!dirs || dirs.length === 0) return;
    grid.innerHTML = '';
    dirs.forEach((dir, index) => {
      grid.appendChild(createPlansButton(dir, index));
    });
    updatePlansFocus();
    refreshPlanBadges();
  });
}

function createPlansButton(dir: { name: string; path: string }, index: number): HTMLElement {
  const btn = document.createElement('button');
  btn.className = 'spawn-btn plans-grid-btn';
  btn.dataset.dir = dir.path;
  if (index === sessionsState.plansFocusIndex && sessionsState.activeFocus === 'plans') {
    btn.classList.add('focused');
  }

  const icon = document.createElement('span');
  icon.className = 'spawn-icon';
  icon.textContent = '📁';

  const label = document.createElement('span');
  label.className = 'spawn-label';
  label.textContent = dir.name;

  const startableBadge = document.createElement('span');
  startableBadge.className = 'plan-badge startable';
  startableBadge.style.display = 'none';

  const doingBadge = document.createElement('span');
  doingBadge.className = 'plan-badge doing';
  doingBadge.style.display = 'none';

  btn.appendChild(icon);
  btn.appendChild(label);
  btn.appendChild(startableBadge);
  btn.appendChild(doingBadge);

  btn.addEventListener('click', () => {
    import('../plans/plan-screen.js').then(({ showPlanScreen }) => {
      showPlanScreen(dir.path);
    });
  });

  return btn;
}

// ============================================================================
// Gamepad navigation — plans zone (2-column grid, same as spawn)
// ============================================================================

export function handlePlansZone(button: string, dir: string | null): void {
  const grid = document.getElementById('plansGrid');
  if (!grid) return;
  const total = grid.querySelectorAll('.plans-grid-btn').length;
  if (total === 0) return;

  const cols = 2;

  if (dir === 'up') {
    const newIndex = sessionsState.plansFocusIndex - cols;
    if (newIndex < 0) {
      sessionsState.activeFocus = 'spawn';
      const spawnCount = sessionsState.cliTypes.length;
      sessionsState.spawnFocusIndex = Math.max(0, spawnCount - 1);
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
      const grid = document.getElementById('plansGrid');
      if (!grid) return true;
      const btns = grid.querySelectorAll('.plans-grid-btn');
      const focused = btns[sessionsState.plansFocusIndex] as HTMLElement | undefined;
      const dirPath = focused?.dataset.dir;
      if (dirPath) {
        import('../plans/plan-screen.js').then(({ showPlanScreen }) => {
          showPlanScreen(dirPath);
        });
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
  const grid = document.getElementById('plansGrid');
  if (!grid) return;

  const btns = grid.querySelectorAll('.plans-grid-btn');
  for (const btn of btns) {
    const dirPath = (btn as HTMLElement).dataset.dir;
    if (!dirPath) continue;

    const startableBadge = btn.querySelector('.plan-badge.startable');
    const doingBadge = btn.querySelector('.plan-badge.doing');

    try {
      const [startableItems, allItems] = await Promise.all([
        window.gamepadCli.planStartableForDir(dirPath),
        window.gamepadCli.planList(dirPath),
      ]);

      const startableCount = startableItems?.length ?? 0;
      const doingCount = (allItems ?? []).filter((p: any) => p.status === 'doing').length;

      if (startableBadge) {
        startableBadge.textContent = startableCount > 0 ? `🔵${startableCount}` : '';
        (startableBadge as HTMLElement).style.display = startableCount > 0 ? '' : 'none';
      }
      if (doingBadge) {
        doingBadge.textContent = doingCount > 0 ? `🟢${doingCount}` : '';
        (doingBadge as HTMLElement).style.display = doingCount > 0 ? '' : 'none';
      }
    } catch {
      // Silently ignore badge fetch errors
    }
  }
}
