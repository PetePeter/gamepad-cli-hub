import { describe, it, expect, vi } from 'vitest';

vi.mock('../renderer/screens/sessions-render.js', () => ({
  renderSessions: vi.fn(),
  updateStatusCounts: vi.fn(),
}));
vi.mock('../renderer/screens/sessions-spawn.js', () => ({
  renderSpawnGrid: vi.fn(),
  spawnNewSession: vi.fn().mockResolvedValue(undefined),
  autoSelectFocusedSession: vi.fn(),
}));
vi.mock('../renderer/screens/sessions-plans.js', () => ({
  renderPlansGrid: vi.fn(),
  refreshPlanBadges: vi.fn().mockResolvedValue(undefined),
  updatePlansFocus: vi.fn(),
}));

import * as sidebar from '../renderer/sidebar/index.js';
import * as renderMod from '../renderer/screens/sessions-render.js';
import * as spawnMod from '../renderer/screens/sessions-spawn.js';
import * as plansMod from '../renderer/screens/sessions-plans.js';

describe('Sidebar components', () => {
  it('sessionList.refresh calls renderSessions + updateStatusCounts', () => {
    sidebar.sessionList.refresh();
    expect(renderMod.renderSessions).toHaveBeenCalled();
    expect(renderMod.updateStatusCounts).toHaveBeenCalled();
  });

  it('sessionList.selectFocused calls autoSelectFocusedSession', () => {
    sidebar.sessionList.selectFocused();
    expect(spawnMod.autoSelectFocusedSession).toHaveBeenCalled();
  });

  it('spawnGrid.refresh calls renderSpawnGrid', () => {
    sidebar.spawnGrid.refresh();
    expect(spawnMod.renderSpawnGrid).toHaveBeenCalled();
  });

  it('spawnGrid.spawn forwards args to spawnNewSession', async () => {
    await sidebar.spawnGrid.spawn('claude-code', '/home/me');
    expect(spawnMod.spawnNewSession).toHaveBeenCalledWith('claude-code', '/home/me');
  });

  it('folderPlanner.refresh calls renderPlansGrid', () => {
    sidebar.folderPlanner.refresh();
    expect(plansMod.renderPlansGrid).toHaveBeenCalled();
  });

  it('folderPlanner.refreshBadges calls refreshPlanBadges', async () => {
    await sidebar.folderPlanner.refreshBadges();
    expect(plansMod.refreshPlanBadges).toHaveBeenCalled();
  });

  it('folderPlanner.updateFocus calls updatePlansFocus', () => {
    sidebar.folderPlanner.updateFocus();
    expect(plansMod.updatePlansFocus).toHaveBeenCalled();
  });

  it('refreshAll refreshes every section', () => {
    (renderMod.renderSessions as ReturnType<typeof vi.fn>).mockClear();
    (spawnMod.renderSpawnGrid as ReturnType<typeof vi.fn>).mockClear();
    (plansMod.renderPlansGrid as ReturnType<typeof vi.fn>).mockClear();
    sidebar.refreshAll();
    expect(renderMod.renderSessions).toHaveBeenCalled();
    expect(spawnMod.renderSpawnGrid).toHaveBeenCalled();
    expect(plansMod.renderPlansGrid).toHaveBeenCalled();
  });
});
