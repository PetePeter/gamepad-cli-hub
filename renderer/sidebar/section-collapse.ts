/**
 * Collapsible sidebar sections (Quick Spawn / Folder Planner).
 *
 * Toggle buttons (˅/˄) on section headers collapse/expand the grid.
 * State persists via config:getCollapsePrefs / config:setCollapsePrefs IPC.
 */

const api = (window as any).electronAPI;

let spawnCollapsed = false;
let plannerCollapsed = false;

export function isSpawnCollapsed(): boolean { return spawnCollapsed; }
export function isPlannerCollapsed(): boolean { return plannerCollapsed; }

function applyCollapse(sectionId: string, gridId: string, toggleId: string, collapsed: boolean): void {
  const section = document.getElementById(sectionId);
  const grid = document.getElementById(gridId);
  const toggle = document.getElementById(toggleId) as HTMLButtonElement | null;
  if (section) section.classList.toggle('spawn-section--collapsed', collapsed);
  if (grid) grid.classList.toggle('spawn-grid--collapsed', collapsed);
  if (toggle) {
    toggle.textContent = collapsed ? '˄' : '˅';
    toggle.title = collapsed ? 'Expand' : 'Collapse';
  }
}

function persist(): void {
  api?.configSetCollapsePrefs({ spawnCollapsed, plannerCollapsed });
}

function toggleSpawn(): void {
  spawnCollapsed = !spawnCollapsed;
  applyCollapse('spawnSection', 'spawnGrid', 'spawnToggle', spawnCollapsed);
  persist();
}

function togglePlanner(): void {
  plannerCollapsed = !plannerCollapsed;
  applyCollapse('plansGridSection', 'plansGrid', 'plannerToggle', plannerCollapsed);
  persist();
}

/** Restore saved collapse state and wire click handlers. Call once on init. */
export async function initSectionCollapse(): Promise<void> {
  // Load persisted prefs
  const prefs = await api?.configGetCollapsePrefs?.();
  if (prefs) {
    spawnCollapsed = prefs.spawnCollapsed;
    plannerCollapsed = prefs.plannerCollapsed;
  }

  // Apply initial state
  applyCollapse('spawnSection', 'spawnGrid', 'spawnToggle', spawnCollapsed);
  applyCollapse('plansGridSection', 'plansGrid', 'plannerToggle', plannerCollapsed);

  // Wire click handlers
  document.getElementById('spawnToggle')?.addEventListener('click', toggleSpawn);
  document.getElementById('plannerToggle')?.addEventListener('click', togglePlanner);
}
