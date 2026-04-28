/**
 * PlanManager unit tests — Phase 1 data layer for Directory Plans (NCN).
 * TDD: tests written first, implementation follows.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// PlanManager constructor does file I/O — mock all persistence functions
vi.mock('../src/session/persistence.js', () => ({
  savePlanFile: vi.fn(),
  deletePlanFile: vi.fn(),
  listPlanFiles: vi.fn(() => []),
  loadPlanFile: vi.fn(() => null),
  loadDependencies: vi.fn(() => []),
  saveDependencies: vi.fn(),
  cleanupOrphanDependencies: vi.fn(() => ({ removed: 0, deps: [] })),
}));

import { PlanManager } from '../src/session/plan-manager.js';
import * as persistence from '../src/session/persistence.js';

describe('PlanManager', () => {
  let pm: PlanManager;

  beforeEach(() => {
    (persistence.listPlanFiles as unknown as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (persistence.loadPlanFile as unknown as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (persistence.savePlanFile as unknown as ReturnType<typeof vi.fn>).mockClear();
    pm = new PlanManager();
  });

  // ─── CRUD ───────────────────────────────────────────────

  describe('create', () => {
    it('creates item with all fields populated', () => {
      const item = pm.create('/projects/backend', 'Build Auth', 'JWT middleware');

      expect(item.id).toBeDefined();
      expect(typeof item.id).toBe('string');
      expect(item.id.length).toBeGreaterThan(0);
      expect(item.dirPath).toBe('/projects/backend');
      expect(item.title).toBe('Build Auth');
      expect(item.description).toBe('JWT middleware');
      expect(item.humanId).toMatch(/^P-\d{4,}$/);
      expect(item.createdAt).toBeTypeOf('number');
      expect(item.stateUpdatedAt).toBeTypeOf('number');
      expect(item.updatedAt).toBeTypeOf('number');
    });

    it('sets no-dep item to ready immediately', () => {
      const item = pm.create('/projects/backend', 'Standalone', 'No deps');
      expect(item.status).toBe('ready');
    });

    it('assigns unique IDs', () => {
      const a = pm.create('/d', 'A', '');
      const b = pm.create('/d', 'B', '');
      const c = pm.create('/d', 'C', '');

      expect(a.id).not.toBe(b.id);
      expect(b.id).not.toBe(c.id);
      expect(a.id).not.toBe(c.id);
    });
  });

  describe('update', () => {
    it('changes title only', () => {
      const item = pm.create('/d', 'Old', 'keep desc');
      const updated = pm.update(item.id, { title: 'New' });

      expect(updated).not.toBeNull();
      expect(updated!.title).toBe('New');
      expect(updated!.description).toBe('keep desc');
    });

    it('changes description only', () => {
      const item = pm.create('/d', 'keep title', 'Old');
      const updated = pm.update(item.id, { description: 'New' });

      expect(updated).not.toBeNull();
      expect(updated!.title).toBe('keep title');
      expect(updated!.description).toBe('New');
    });

    it('returns null for unknown ID', () => {
      expect(pm.update('nonexistent', { title: 'nope' })).toBeNull();
    });
  });

  describe('metadata migration', () => {
    it('assigns missing humanId and stateUpdatedAt when loading older plan files', () => {
      (persistence.listPlanFiles as unknown as ReturnType<typeof vi.fn>).mockReturnValue(['legacy.json']);
      (persistence.loadPlanFile as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        id: 'legacy-id',
        dirPath: '/d',
        title: 'Legacy',
        description: 'Older plan',
        status: 'ready',
        createdAt: 100,
        updatedAt: 101,
      });

      pm = new PlanManager();

      expect(pm.getItem('legacy-id')).toMatchObject({
        humanId: expect.stringMatching(/^P-\d{4,}$/),
        stateUpdatedAt: 101,
      });
      expect(persistence.savePlanFile).toHaveBeenCalledWith(expect.objectContaining({
        id: 'legacy-id',
        humanId: expect.stringMatching(/^P-\d{4,}$/),
        stateUpdatedAt: 101,
      }));
    });

    it('resolves UUID and P-id plan references', () => {
      const item = pm.create('/d', 'Alias me', 'Resolve by either ID');

      expect(pm.resolveItemRef(item.id)).toEqual({ status: 'found', item });
      expect(pm.resolveItemRef(item.humanId!.toLowerCase())).toEqual({ status: 'found', item });
      expect(pm.resolveItemRef('P-9999')).toEqual({ status: 'missing' });
    });

    it('reports ambiguous P-id references', () => {
      (persistence.listPlanFiles as unknown as ReturnType<typeof vi.fn>).mockReturnValue(['a.json', 'b.json']);
      (persistence.loadPlanFile as unknown as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          id: 'a',
          humanId: 'P-0042',
          dirPath: '/d',
          title: 'A',
          description: 'First',
          status: 'ready',
          createdAt: 100,
          updatedAt: 101,
        })
        .mockReturnValueOnce({
          id: 'b',
          humanId: 'P-0042',
          dirPath: '/d',
          title: 'B',
          description: 'Second',
          status: 'ready',
          createdAt: 100,
          updatedAt: 101,
        });

      pm = new PlanManager();

      expect(pm.resolveItemRef('P-0042')).toMatchObject({
        status: 'ambiguous',
        matches: [
          expect.objectContaining({ id: 'a' }),
          expect.objectContaining({ id: 'b' }),
        ],
      });
    });
  });

  describe('delete', () => {
    it('removes item and returns true', () => {
      const item = pm.create('/d', 'Bye', 'gone');
      expect(pm.delete(item.id)).toBe(true);
      expect(pm.getForDirectory('/d')).toHaveLength(0);
    });

    it('removes all edges involving the deleted item', () => {
      const a = pm.create('/d', 'A', '');
      const b = pm.create('/d', 'B', '');
      const c = pm.create('/d', 'C', '');
      pm.addDependency(a.id, b.id);
      pm.addDependency(b.id, c.id);

      pm.delete(b.id);

      // c should become startable (its only blocker was deleted)
      const cNow = pm.getItem(c.id);
      expect(cNow).not.toBeNull();
      expect(cNow!.status).toBe('ready');
    });

    it('returns false for unknown ID', () => {
      expect(pm.delete('nonexistent')).toBe(false);
    });

    it('recomputes startable for dependents after removal', () => {
      const a = pm.create('/d', 'A', '');
      const b = pm.create('/d', 'B', '');
      pm.addDependency(a.id, b.id);

      // b should be pending (blocked by a)
      expect(pm.getItem(b.id)!.status).toBe('planning');

      // Delete a — b's blocker is gone, so b should become startable
      pm.delete(a.id);
      expect(pm.getItem(b.id)!.status).toBe('ready');
    });
  });

  // ─── Dependencies ──────────────────────────────────────

  describe('addDependency', () => {
    it('creates edge fromId→toId', () => {
      const a = pm.create('/d', 'A', '');
      const b = pm.create('/d', 'B', '');

      const result = pm.addDependency(a.id, b.id);
      expect(result).toBe(true);
    });

    it('marks toId as pending if fromId is not done', () => {
      const a = pm.create('/d', 'A', '');
      const b = pm.create('/d', 'B', '');
      pm.addDependency(a.id, b.id);

      expect(pm.getItem(b.id)!.status).toBe('planning');
    });

    it('rejects self-loop', () => {
      const a = pm.create('/d', 'A', '');
      expect(pm.addDependency(a.id, a.id)).toBe(false);
    });

    it('rejects cycle A→B→C→A', () => {
      const a = pm.create('/d', 'A', '');
      const b = pm.create('/d', 'B', '');
      const c = pm.create('/d', 'C', '');

      pm.addDependency(a.id, b.id);
      pm.addDependency(b.id, c.id);

      // C→A would create a cycle
      expect(pm.addDependency(c.id, a.id)).toBe(false);
    });

    it('allows diamond shape (A→C, B→C)', () => {
      const a = pm.create('/d', 'A', '');
      const b = pm.create('/d', 'B', '');
      const c = pm.create('/d', 'C', '');

      expect(pm.addDependency(a.id, c.id)).toBe(true);
      expect(pm.addDependency(b.id, c.id)).toBe(true);

      // c is pending because both a and b are not done
      expect(pm.getItem(c.id)!.status).toBe('planning');
    });
  });

  describe('removeDependency', () => {
    it('removes edge and returns true', () => {
      const a = pm.create('/d', 'A', '');
      const b = pm.create('/d', 'B', '');
      pm.addDependency(a.id, b.id);

      expect(pm.removeDependency(a.id, b.id)).toBe(true);
    });

    it('recomputes startable after removal', () => {
      const a = pm.create('/d', 'A', '');
      const b = pm.create('/d', 'B', '');
      pm.addDependency(a.id, b.id);
      expect(pm.getItem(b.id)!.status).toBe('planning');

      pm.removeDependency(a.id, b.id);
      expect(pm.getItem(b.id)!.status).toBe('ready');
    });

    it('returns false for unknown edge', () => {
      expect(pm.removeDependency('x', 'y')).toBe(false);
    });
  });

  // ─── Startable Computation ─────────────────────────────

  describe('startable computation', () => {
    it('item with no deps is startable', () => {
      const item = pm.create('/d', 'Solo', '');
      expect(item.status).toBe('ready');
    });

    it('item with all deps done is startable', () => {
      const a = pm.create('/d', 'A', '');
      const b = pm.create('/d', 'B', '');
      pm.addDependency(a.id, b.id);

      // Complete a
      pm.applyItem(a.id, 'session-1');
      pm.completeItem(a.id, 'Completed this task successfully');

      expect(pm.getItem(b.id)!.status).toBe('ready');
    });

    it('item with any dep not done is pending', () => {
      const a = pm.create('/d', 'A', '');
      const b = pm.create('/d', 'B', '');
      const c = pm.create('/d', 'C', '');
      pm.addDependency(a.id, c.id);
      pm.addDependency(b.id, c.id);

      // Complete a but not b
      pm.applyItem(a.id, 'session-1');
      pm.completeItem(a.id, 'Completed this task successfully');

      expect(pm.getItem(c.id)!.status).toBe('planning');
    });

    it('completing a dep cascades startable to dependents', () => {
      const a = pm.create('/d', 'A', '');
      const b = pm.create('/d', 'B', '');
      const c = pm.create('/d', 'C', '');
      pm.addDependency(a.id, b.id);
      pm.addDependency(b.id, c.id);

      // Complete a → b becomes startable
      pm.applyItem(a.id, 's1');
      pm.completeItem(a.id, 'Completed this task successfully');
      expect(pm.getItem(b.id)!.status).toBe('ready');
      expect(pm.getItem(c.id)!.status).toBe('planning');

      // Complete b → c becomes startable
      pm.applyItem(b.id, 's1');
      pm.completeItem(b.id, 'Completed this task successfully');
      expect(pm.getItem(c.id)!.status).toBe('ready');
    });
  });

  // ─── Lifecycle ─────────────────────────────────────────

  describe('applyItem', () => {
    it('transitions startable→doing with sessionId', () => {
      const item = pm.create('/d', 'Task', '');
      const applied = pm.applyItem(item.id, 'session-42');

      expect(applied).not.toBeNull();
      expect(applied!.status).toBe('coding');
      expect(applied!.sessionId).toBe('session-42');
    });

    it('rejects non-startable items', () => {
      const a = pm.create('/d', 'A', '');
      const b = pm.create('/d', 'B', '');
      pm.addDependency(a.id, b.id);

      // b is pending — cannot apply
      expect(pm.applyItem(b.id, 'session-1')).toBeNull();
    });
  });

  describe('completeItem', () => {
    it('transitions doing→done and cascades startable recompute', () => {
      const a = pm.create('/d', 'A', '');
      const b = pm.create('/d', 'B', '');
      pm.addDependency(a.id, b.id);

      pm.applyItem(a.id, 's1');
      const completed = pm.completeItem(a.id, 'Completed this task successfully');

      expect(completed).not.toBeNull();
      expect(completed!.status).toBe('done');
      expect(pm.getItem(b.id)!.status).toBe('ready');
    });

    it('rejects non-doing items', () => {
      const item = pm.create('/d', 'Task', '');
      // item is startable, not doing
      expect(pm.completeItem(item.id)).toBeNull();
    });

    describe('completionNotes validation', () => {
      it('stores completionNotes when completing', () => {
        const item = pm.create('/d', 'Task', '');
        pm.applyItem(item.id, 's1');
        const completed = pm.completeItem(item.id, 'Built the auth middleware with JWT validation');
        expect(completed).not.toBeNull();
        expect(completed!.completionNotes).toBe('Built the auth middleware with JWT validation');
        expect(pm.getItem(item.id)!.completionNotes).toBe('Built the auth middleware with JWT validation');
      });

      it('rejects missing completionNotes (undefined)', () => {
        const item = pm.create('/d', 'Task', '');
        pm.applyItem(item.id, 's1');
        expect(pm.completeItem(item.id, undefined)).toBeNull();
        expect(pm.getItem(item.id)!.status).toBe('coding');
      });

      it('rejects empty completionNotes', () => {
        const item = pm.create('/d', 'Task', '');
        pm.applyItem(item.id, 's1');
        expect(pm.completeItem(item.id, '')).toBeNull();
        expect(pm.getItem(item.id)!.status).toBe('coding');
      });

      it('rejects whitespace-only completionNotes', () => {
        const item = pm.create('/d', 'Task', '');
        pm.applyItem(item.id, 's1');
        expect(pm.completeItem(item.id, '   ')).toBeNull();
        expect(pm.getItem(item.id)!.status).toBe('coding');
      });

      it('rejects completionNotes shorter than 10 characters', () => {
        const item = pm.create('/d', 'Task', '');
        pm.applyItem(item.id, 's1');
        expect(pm.completeItem(item.id, 'Short')).toBeNull();
        expect(pm.getItem(item.id)!.status).toBe('coding');
      });

      it('trims completionNotes before storing', () => {
        const item = pm.create('/d', 'Task', '');
        pm.applyItem(item.id, 's1');
        const completed = pm.completeItem(item.id, '  Padded completion notes  ');
        expect(completed!.completionNotes).toBe('Padded completion notes');
      });

      it('persists completionNotes to disk via savePlanFile', () => {
        const item = pm.create('/d', 'Task', '');
        pm.applyItem(item.id, 's1');
        pm.completeItem(item.id, 'Persisted completion notes');
        expect(persistence.savePlanFile).toHaveBeenCalledWith(
          expect.objectContaining({ completionNotes: 'Persisted completion notes' }),
        );
      });
    });
  });

  // ─── Directory Scoping ─────────────────────────────────

  describe('directory scoping', () => {
    it('getForDirectory returns only items for that dirPath', () => {
      pm.create('/frontend', 'FE task', '');
      pm.create('/backend', 'BE task', '');
      pm.create('/frontend', 'FE task 2', '');

      const fe = pm.getForDirectory('/frontend');
      expect(fe).toHaveLength(2);
      expect(fe.every(i => i.dirPath === '/frontend')).toBe(true);
    });

    it('getStartableForDirectory returns only startable items', () => {
      const a = pm.create('/d', 'A', '');
      const b = pm.create('/d', 'B', '');
      pm.addDependency(a.id, b.id);

      const startable = pm.getStartableForDirectory('/d');
      expect(startable).toHaveLength(1);
      expect(startable[0].id).toBe(a.id);
    });

    it('getDoingForSession returns items being worked on by sessionId', () => {
      const a = pm.create('/d', 'A', '');
      const b = pm.create('/d', 'B', '');
      pm.applyItem(a.id, 'session-1');
      pm.applyItem(b.id, 'session-2');

      const doing = pm.getDoingForSession('session-1');
      expect(doing).toHaveLength(1);
      expect(doing[0].id).toBe(a.id);
    });

    it('getAllDoingForDirectory returns active plans across sessions', () => {
      const a = pm.create('/d', 'A', '');
      const b = pm.create('/d', 'B', '');
      const c = pm.create('/other', 'C', '');
      pm.applyItem(a.id, 'session-1');
      pm.applyItem(b.id, 'session-2');
      pm.applyItem(c.id, 'session-3');

      const doing = pm.getAllDoingForDirectory('/d');
      expect(doing).toHaveLength(2);
      expect(doing.map(item => item.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    });
  });

  describe('setState', () => {
    it('preserves blocked items during recompute', () => {
      const a = pm.create('/d', 'A', '');
      const b = pm.create('/d', 'B', '');
      pm.addDependency(a.id, b.id);
      pm.applyItem(a.id, 'session-1');
      pm.setState(a.id, 'blocked', 'Waiting for review');
      pm.removeDependency(a.id, b.id);

      expect(pm.getItem(a.id)?.status).toBe('blocked');
      expect(pm.getItem(a.id)?.stateInfo).toBe('Waiting for review');
    });

    it('preserves question items during recompute', () => {
      const a = pm.create('/d', 'A', '');
      const b = pm.create('/d', 'B', '');
      pm.addDependency(a.id, b.id);
      pm.applyItem(a.id, 'session-1');
      pm.setState(a.id, 'blocked', 'Need product input');
      pm.removeDependency(a.id, b.id);

      expect(pm.getItem(a.id)?.status).toBe('blocked');
      expect(pm.getItem(a.id)?.stateInfo).toBe('Need product input');
    });

    it('allows blocked to return to doing', () => {
      const item = pm.create('/d', 'Task', '');
      pm.applyItem(item.id, 'session-1');
      pm.setState(item.id, 'blocked', 'Waiting on CI');

      const updated = pm.setState(item.id, 'coding');
      expect(updated).not.toBeNull();
      expect(updated?.status).toBe('coding');
      expect(updated?.sessionId).toBe('session-1');
      expect(updated?.stateInfo).toBeUndefined();
    });

    it('clears session ownership when moving back to planning or ready', () => {
      const blocker = pm.create('/d', 'Blocker', '');
      const item = pm.create('/d', 'Task', '');
      pm.addDependency(blocker.id, item.id);
      pm.setState(item.id, 'coding', '', 'session-1');

      const planning = pm.setState(item.id, 'planning');
      expect(planning?.status).toBe('planning');
      expect(planning?.sessionId).toBeUndefined();

      const readyItem = pm.create('/d', 'Ready task', '');
      pm.setState(readyItem.id, 'coding', '', 'session-2');
      const ready = pm.setState(readyItem.id, 'ready');
      expect(ready?.status).toBe('ready');
      expect(ready?.sessionId).toBeUndefined();
    });

    it('preserves existing session ownership for review and blocked', () => {
      const item = pm.create('/d', 'Task', '');
      pm.applyItem(item.id, 'session-1');

      const review = pm.setState(item.id, 'review');
      expect(review?.status).toBe('review');
      expect(review?.sessionId).toBe('session-1');

      const blocked = pm.setState(item.id, 'blocked', 'Waiting on review');
      expect(blocked?.status).toBe('blocked');
      expect(blocked?.sessionId).toBe('session-1');
    });

    it('does not assign review or blocked ownership without an explicit session', () => {
      const item = pm.create('/d', 'Task', '');

      const blocked = pm.setState(item.id, 'blocked', 'Waiting on decision');
      expect(blocked?.status).toBe('blocked');
      expect(blocked?.sessionId).toBeUndefined();

      const review = pm.setState(item.id, 'review');
      expect(review?.status).toBe('review');
      expect(review?.sessionId).toBeUndefined();
    });

    it('rejects done to pending', () => {
      const item = pm.create('/d', 'Task', '');
      pm.applyItem(item.id, 'session-1');
      pm.completeItem(item.id, 'Completed this task successfully');

      expect(pm.setState(item.id, 'planning')).toBeNull();
    });
  });

  // ─── Events ────────────────────────────────────────────

  describe('events', () => {
    it('emits plan:changed on create', () => {
      const handler = vi.fn();
      pm.on('plan:changed', handler);

      pm.create('/d', 'Test', '');

      expect(handler).toHaveBeenCalledWith('/d');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('emits plan:changed on update', () => {
      const item = pm.create('/d', 'Test', '');
      const handler = vi.fn();
      pm.on('plan:changed', handler);

      pm.update(item.id, { title: 'Updated' });

      expect(handler).toHaveBeenCalledWith('/d');
    });

    it('emits plan:changed on delete', () => {
      const item = pm.create('/d', 'Test', '');
      const handler = vi.fn();
      pm.on('plan:changed', handler);

      pm.delete(item.id);

      expect(handler).toHaveBeenCalledWith('/d');
    });

    it('emits plan:changed on addDependency', () => {
      const a = pm.create('/d', 'A', '');
      const b = pm.create('/d', 'B', '');
      const handler = vi.fn();
      pm.on('plan:changed', handler);

      pm.addDependency(a.id, b.id);

      expect(handler).toHaveBeenCalledWith('/d');
    });

    it('emits plan:changed on removeDependency', () => {
      const a = pm.create('/d', 'A', '');
      const b = pm.create('/d', 'B', '');
      pm.addDependency(a.id, b.id);
      const handler = vi.fn();
      pm.on('plan:changed', handler);

      pm.removeDependency(a.id, b.id);

      expect(handler).toHaveBeenCalledWith('/d');
    });

    it('emits plan:changed on applyItem', () => {
      const item = pm.create('/d', 'Task', '');
      const handler = vi.fn();
      pm.on('plan:changed', handler);

      pm.applyItem(item.id, 's1');

      expect(handler).toHaveBeenCalledWith('/d');
    });

    it('emits plan:changed on completeItem', () => {
      const item = pm.create('/d', 'Task', '');
      pm.applyItem(item.id, 's1');
      const handler = vi.fn();
      pm.on('plan:changed', handler);

      pm.completeItem(item.id, 'Completed this task successfully');

      expect(handler).toHaveBeenCalledWith('/d');
    });
  });

  // ─── Export / Import ───────────────────────────────────

  describe('exportAll', () => {
    it('returns all directories plans', () => {
      pm.create('/frontend', 'FE', '');
      pm.create('/backend', 'BE', '');
      const a = pm.create('/frontend', 'FE2', '');
      const b = pm.create('/frontend', 'FE3', '');
      pm.addDependency(a.id, b.id);

      const exported = pm.exportAll();

      expect(Object.keys(exported)).toHaveLength(2);
      expect(exported['/frontend'].items).toHaveLength(3);
      expect(exported['/frontend'].dependencies).toHaveLength(1);
      expect(exported['/backend'].items).toHaveLength(1);
      expect(exported['/backend'].dependencies).toHaveLength(0);
    });
  });

  describe('importAll', () => {
    it('loads data and clears existing', () => {
      pm.create('/old', 'Old item', '');

      pm.importAll({
        '/new': {
          dirPath: '/new',
          items: [{
            id: 'imported-1',
            dirPath: '/new',
            title: 'Imported',
            description: 'From file',
            status: 'ready',
            createdAt: 1000,
            updatedAt: 1000,
          }],
          dependencies: [],
        },
      });

      expect(pm.getForDirectory('/old')).toHaveLength(0);
      expect(pm.getForDirectory('/new')).toHaveLength(1);
      expect(pm.getItem('imported-1')).not.toBeNull();
    });

    it('recomputes startable status after import', () => {
      pm.importAll({
        '/d': {
          dirPath: '/d',
          items: [
            { id: 'a', dirPath: '/d', title: 'A', description: '', status: 'done', createdAt: 1, updatedAt: 1 },
            { id: 'b', dirPath: '/d', title: 'B', description: '', status: 'planning', createdAt: 2, updatedAt: 2 },
          ],
          dependencies: [{ fromId: 'a', toId: 'b' }],
        },
      });

      // b's only dep (a) is done → b should be recomputed to startable
      expect(pm.getItem('b')!.status).toBe('ready');
    });
  });

  // ─── Edge Cases ────────────────────────────────────────

  describe('edge cases', () => {
    it('multiple directories are independent DAGs', () => {
      const fe = pm.create('/frontend', 'FE', '');
      const be = pm.create('/backend', 'BE', '');

      // Cross-dir dependency should be rejected (items not in same dir)
      expect(pm.addDependency(fe.id, be.id)).toBe(false);
    });

    it('detects long cycle A→B→C→D→A', () => {
      const a = pm.create('/d', 'A', '');
      const b = pm.create('/d', 'B', '');
      const c = pm.create('/d', 'C', '');
      const d = pm.create('/d', 'D', '');

      pm.addDependency(a.id, b.id);
      pm.addDependency(b.id, c.id);
      pm.addDependency(c.id, d.id);

      // D→A would create a cycle
      expect(pm.addDependency(d.id, a.id)).toBe(false);
    });

    it('completing last blocker makes multiple items startable simultaneously', () => {
      const blocker = pm.create('/d', 'Blocker', '');
      const x = pm.create('/d', 'X', '');
      const y = pm.create('/d', 'Y', '');
      const z = pm.create('/d', 'Z', '');

      pm.addDependency(blocker.id, x.id);
      pm.addDependency(blocker.id, y.id);
      pm.addDependency(blocker.id, z.id);

      expect(pm.getItem(x.id)!.status).toBe('planning');
      expect(pm.getItem(y.id)!.status).toBe('planning');
      expect(pm.getItem(z.id)!.status).toBe('planning');

      pm.applyItem(blocker.id, 's1');
      pm.completeItem(blocker.id, 'Completed this task successfully');

      expect(pm.getItem(x.id)!.status).toBe('ready');
      expect(pm.getItem(y.id)!.status).toBe('ready');
      expect(pm.getItem(z.id)!.status).toBe('ready');
    });
  });

  // ─── deleteCompletedForDirectory ──────────────────────

  describe('deleteCompletedForDirectory', () => {
    let pm: PlanManager;

    beforeEach(() => {
      pm = new PlanManager();
    });

    it('deletes only done items, leaves non-done items', () => {
      const done1 = pm.create('/proj', 'Done1', '');
      pm.applyItem(done1.id, 's1');
      pm.completeItem(done1.id, 'Completed this task successfully');

      const doing1 = pm.create('/proj', 'Doing1', '');
      pm.applyItem(doing1.id, 's2');

      const startable1 = pm.create('/proj', 'Startable1', '');

      pm.deleteCompletedForDirectory('/proj');

      expect(pm.getItem(done1.id)).toBeNull();
      expect(pm.getItem(doing1.id)).not.toBeNull();
      expect(pm.getItem(startable1.id)).not.toBeNull();
    });

    it('returns count of deleted items', () => {
      const a = pm.create('/proj', 'A', '');
      pm.applyItem(a.id, 's1');
      pm.completeItem(a.id, 'Completed this task successfully');

      const b = pm.create('/proj', 'B', '');
      pm.applyItem(b.id, 's2');
      pm.completeItem(b.id, 'Completed this task successfully');

      pm.create('/proj', 'C', '');

      expect(pm.deleteCompletedForDirectory('/proj')).toBe(2);
    });

    it('returns 0 when no done items exist', () => {
      pm.create('/proj', 'Active', '');
      const doing = pm.create('/proj', 'Doing', '');
      pm.applyItem(doing.id, 's1');

      expect(pm.deleteCompletedForDirectory('/proj')).toBe(0);
    });

    it('returns 0 for empty directory', () => {
      expect(pm.deleteCompletedForDirectory('/empty')).toBe(0);
    });

    it('emits plan:changed event', () => {
      const item = pm.create('/proj', 'Task', '');
      pm.applyItem(item.id, 's1');
      pm.completeItem(item.id, 'Completed this task successfully');

      const handler = vi.fn();
      pm.on('plan:changed', handler);

      pm.deleteCompletedForDirectory('/proj');

      expect(handler).toHaveBeenCalledWith('/proj');
    });

    it('does not delete done items in other directories', () => {
      const inTarget = pm.create('/proj', 'Target', '');
      pm.applyItem(inTarget.id, 's1');
      pm.completeItem(inTarget.id, 'Completed this task successfully');

      const inOther = pm.create('/other', 'Other', '');
      pm.applyItem(inOther.id, 's2');
      pm.completeItem(inOther.id, 'Completed this task successfully');

      pm.deleteCompletedForDirectory('/proj');

      expect(pm.getItem(inTarget.id)).toBeNull();
      expect(pm.getItem(inOther.id)).not.toBeNull();
      expect(pm.getItem(inOther.id)!.status).toBe('done');
    });
  });
});
