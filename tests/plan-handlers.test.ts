/**
 * Tests for plan IPC handlers.
 *
 * Verifies plan:* channels route correctly to PlanManager methods
 * and plan:changed events forward to the renderer window.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron ipcMain before importing handler
const handlers = new Map<string, Function>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      handlers.set(channel, handler);
    }),
  },
}));

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// PlanManager now self-saves — mock persistence so no disk I/O occurs
vi.mock('../src/session/persistence.js', () => ({
  savePlanFile: vi.fn(),
  deletePlanFile: vi.fn(),
  listPlanFiles: vi.fn(() => []),
  loadPlanFile: vi.fn(() => null),
  loadDependencies: vi.fn(() => []),
  saveDependencies: vi.fn(),
  cleanupOrphanDependencies: vi.fn(() => ({ removed: 0, deps: [] })),
}));

import { setupPlanHandlers } from '../src/electron/ipc/plan-handlers.js';
import { PlanManager } from '../src/session/plan-manager.js';

describe('plan IPC handlers', () => {
  let planManager: PlanManager;

  beforeEach(() => {
    handlers.clear();
    planManager = new PlanManager();
    setupPlanHandlers(planManager);
  });

  // ─── Registration ─────────────────────────────────────

  it('registers all expected channels', () => {
    const expected = [
      'plan:list', 'plan:create', 'plan:update', 'plan:delete',
      'plan:addDep', 'plan:removeDep', 'plan:apply', 'plan:complete',
      'plan:setState', 'plan:startableForDir', 'plan:doingForSession',
      'plan:getAllDoingForDir', 'plan:deps', 'plan:getItem',
    ];
    for (const channel of expected) {
      expect(handlers.has(channel), `missing handler for ${channel}`).toBe(true);
    }
  });

  // ─── CRUD ──────────────────────────────────────────────

  it('plan:create creates an item and returns it', async () => {
    const result = await handlers.get('plan:create')!({}, '/proj', 'Task 1', 'Description 1');
    expect(result).toMatchObject({ title: 'Task 1', description: 'Description 1', dirPath: '/proj' });
    expect(result.id).toBeDefined();
  });

  it('plan:list returns items for a directory', async () => {
    await handlers.get('plan:create')!({}, '/proj', 'A', '');
    await handlers.get('plan:create')!({}, '/proj', 'B', '');
    await handlers.get('plan:create')!({}, '/other', 'C', '');

    const items = await handlers.get('plan:list')!({}, '/proj');
    expect(items).toHaveLength(2);
    expect(items.map((i: any) => i.title)).toEqual(expect.arrayContaining(['A', 'B']));
  });

  it('plan:update modifies title and/or description', async () => {
    const created = await handlers.get('plan:create')!({}, '/proj', 'Old', 'Old desc');
    const updated = await handlers.get('plan:update')!({}, created.id, { title: 'New' });
    expect(updated.title).toBe('New');
    expect(updated.description).toBe('Old desc');
  });

  it('plan:update returns null for unknown id', async () => {
    const result = await handlers.get('plan:update')!({}, 'nonexistent', { title: 'X' });
    expect(result).toBeNull();
  });

  it('plan:delete removes item and returns true', async () => {
    const created = await handlers.get('plan:create')!({}, '/proj', 'Gone', '');
    const result = await handlers.get('plan:delete')!({}, created.id);
    expect(result).toBe(true);

    const items = await handlers.get('plan:list')!({}, '/proj');
    expect(items).toHaveLength(0);
  });

  it('plan:delete returns false for unknown id', async () => {
    const result = await handlers.get('plan:delete')!({}, 'nonexistent');
    expect(result).toBe(false);
  });

  it('plan:getItem returns a single item or null', async () => {
    const created = await handlers.get('plan:create')!({}, '/proj', 'Find me', '');
    const found = await handlers.get('plan:getItem')!({}, created.id);
    expect(found.title).toBe('Find me');

    const missing = await handlers.get('plan:getItem')!({}, 'nope');
    expect(missing).toBeNull();
  });

  // ─── Dependencies ──────────────────────────────────────

  it('plan:addDep adds a dependency and returns true', async () => {
    const a = await handlers.get('plan:create')!({}, '/proj', 'A', '');
    const b = await handlers.get('plan:create')!({}, '/proj', 'B', '');

    const result = await handlers.get('plan:addDep')!({}, a.id, b.id);
    expect(result).toBe(true);
  });

  it('plan:addDep returns false for cross-directory items', async () => {
    const a = await handlers.get('plan:create')!({}, '/proj1', 'A', '');
    const b = await handlers.get('plan:create')!({}, '/proj2', 'B', '');

    const result = await handlers.get('plan:addDep')!({}, a.id, b.id);
    expect(result).toBe(false);
  });

  it('plan:removeDep removes a dependency and returns true', async () => {
    const a = await handlers.get('plan:create')!({}, '/proj', 'A', '');
    const b = await handlers.get('plan:create')!({}, '/proj', 'B', '');
    await handlers.get('plan:addDep')!({}, a.id, b.id);

    const result = await handlers.get('plan:removeDep')!({}, a.id, b.id);
    expect(result).toBe(true);
  });

  it('plan:removeDep returns false when dep does not exist', async () => {
    const result = await handlers.get('plan:removeDep')!({}, 'x', 'y');
    expect(result).toBe(false);
  });

  it('plan:deps returns dependency array for a directory', async () => {
    const a = await handlers.get('plan:create')!({}, '/proj', 'A', '');
    const b = await handlers.get('plan:create')!({}, '/proj', 'B', '');
    await handlers.get('plan:addDep')!({}, a.id, b.id);

    const deps = await handlers.get('plan:deps')!({}, '/proj');
    expect(deps).toHaveLength(1);
    expect(deps[0]).toMatchObject({ fromId: a.id, toId: b.id });
  });

  it('plan:deps returns empty array for directory with no plans', async () => {
    const deps = await handlers.get('plan:deps')!({}, '/nowhere');
    expect(deps).toHaveLength(0);
  });

  // ─── Lifecycle ─────────────────────────────────────────

  it('plan:apply transitions startable → doing with sessionId', async () => {
    const item = await handlers.get('plan:create')!({}, '/proj', 'Task', '');
    const applied = await handlers.get('plan:apply')!({}, item.id, 'sess-42');
    expect(applied.status).toBe('doing');
    expect(applied.sessionId).toBe('sess-42');
  });

  it('plan:apply returns null for non-startable item', async () => {
    const a = await handlers.get('plan:create')!({}, '/proj', 'A', '');
    const b = await handlers.get('plan:create')!({}, '/proj', 'B', '');
    await handlers.get('plan:addDep')!({}, a.id, b.id);

    // B is pending (blocked by A), cannot apply
    const result = await handlers.get('plan:apply')!({}, b.id, 'sess-1');
    expect(result).toBeNull();
  });

  it('plan:complete transitions doing → done', async () => {
    const item = await handlers.get('plan:create')!({}, '/proj', 'Task', '');
    await handlers.get('plan:apply')!({}, item.id, 'sess-1');
    const completed = await handlers.get('plan:complete')!({}, item.id);
    expect(completed.status).toBe('done');
  });

  it('plan:complete returns null for non-doing item', async () => {
    const item = await handlers.get('plan:create')!({}, '/proj', 'Task', '');
    // item is startable, not doing
    const result = await handlers.get('plan:complete')!({}, item.id);
    expect(result).toBeNull();
  });

  it('plan:setState updates status and stateInfo', async () => {
    const item = await handlers.get('plan:create')!({}, '/proj', 'Task', '');
    await handlers.get('plan:apply')!({}, item.id, 'sess-1');

    const updated = await handlers.get('plan:setState')!({}, item.id, 'blocked', 'Waiting on API', 'sess-1');
    expect(updated.status).toBe('blocked');
    expect(updated.stateInfo).toBe('Waiting on API');
  });

  // ─── Queries ───────────────────────────────────────────

  it('plan:startableForDir returns only startable items', async () => {
    const a = await handlers.get('plan:create')!({}, '/proj', 'A', '');
    const b = await handlers.get('plan:create')!({}, '/proj', 'B', '');
    await handlers.get('plan:addDep')!({}, a.id, b.id);

    const startable = await handlers.get('plan:startableForDir')!({}, '/proj');
    expect(startable).toHaveLength(1);
    expect(startable[0].id).toBe(a.id);
  });

  it('plan:doingForSession returns items assigned to a session', async () => {
    const item = await handlers.get('plan:create')!({}, '/proj', 'Working', '');
    await handlers.get('plan:apply')!({}, item.id, 'sess-99');

    const doing = await handlers.get('plan:doingForSession')!({}, 'sess-99');
    expect(doing).toHaveLength(1);
    expect(doing[0].title).toBe('Working');
  });

  it('plan:doingForSession returns empty array for unknown session', async () => {
    const doing = await handlers.get('plan:doingForSession')!({}, 'nobody');
    expect(doing).toHaveLength(0);
  });

  it('plan:getAllDoingForDir returns active plans across sessions', async () => {
    const first = await handlers.get('plan:create')!({}, '/proj', 'First', '');
    const second = await handlers.get('plan:create')!({}, '/proj', 'Second', '');
    await handlers.get('plan:apply')!({}, first.id, 'sess-1');
    await handlers.get('plan:apply')!({}, second.id, 'sess-2');

    const doing = await handlers.get('plan:getAllDoingForDir')!({}, '/proj');
    expect(doing).toHaveLength(2);
    expect(doing.map((item: any) => item.title)).toEqual(expect.arrayContaining(['First', 'Second']));
  });

  // ─── Cascading startable after completion ──────────────

  it('completing a dependency unblocks dependents', async () => {
    const a = await handlers.get('plan:create')!({}, '/proj', 'A', '');
    const b = await handlers.get('plan:create')!({}, '/proj', 'B', '');
    await handlers.get('plan:addDep')!({}, a.id, b.id);

    // B is pending (blocked by A)
    let bItem = (await handlers.get('plan:list')!({}, '/proj')).find((i: any) => i.id === b.id);
    expect(bItem.status).toBe('pending');

    // Complete A → B becomes startable
    await handlers.get('plan:apply')!({}, a.id, 'sess-1');
    await handlers.get('plan:complete')!({}, a.id);

    bItem = (await handlers.get('plan:list')!({}, '/proj')).find((i: any) => i.id === b.id);
    expect(bItem.status).toBe('startable');
  });
});
