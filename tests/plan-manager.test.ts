/**
 * PlanManager unit tests — Phase 1 data layer for Directory Plans (NCN).
 * TDD: tests written first, implementation follows.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { PlanManager } from '../src/session/plan-manager.js';

describe('PlanManager', () => {
  let pm: PlanManager;

  beforeEach(() => {
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
      expect(item.createdAt).toBeTypeOf('number');
      expect(item.updatedAt).toBeTypeOf('number');
    });

    it('sets no-dep item to startable immediately', () => {
      const item = pm.create('/projects/backend', 'Standalone', 'No deps');
      expect(item.status).toBe('startable');
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
      expect(cNow!.status).toBe('startable');
    });

    it('returns false for unknown ID', () => {
      expect(pm.delete('nonexistent')).toBe(false);
    });

    it('recomputes startable for dependents after removal', () => {
      const a = pm.create('/d', 'A', '');
      const b = pm.create('/d', 'B', '');
      pm.addDependency(a.id, b.id);

      // b should be pending (blocked by a)
      expect(pm.getItem(b.id)!.status).toBe('pending');

      // Delete a — b's blocker is gone, so b should become startable
      pm.delete(a.id);
      expect(pm.getItem(b.id)!.status).toBe('startable');
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

      expect(pm.getItem(b.id)!.status).toBe('pending');
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
      expect(pm.getItem(c.id)!.status).toBe('pending');
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
      expect(pm.getItem(b.id)!.status).toBe('pending');

      pm.removeDependency(a.id, b.id);
      expect(pm.getItem(b.id)!.status).toBe('startable');
    });

    it('returns false for unknown edge', () => {
      expect(pm.removeDependency('x', 'y')).toBe(false);
    });
  });

  // ─── Startable Computation ─────────────────────────────

  describe('startable computation', () => {
    it('item with no deps is startable', () => {
      const item = pm.create('/d', 'Solo', '');
      expect(item.status).toBe('startable');
    });

    it('item with all deps done is startable', () => {
      const a = pm.create('/d', 'A', '');
      const b = pm.create('/d', 'B', '');
      pm.addDependency(a.id, b.id);

      // Complete a
      pm.applyItem(a.id, 'session-1');
      pm.completeItem(a.id);

      expect(pm.getItem(b.id)!.status).toBe('startable');
    });

    it('item with any dep not done is pending', () => {
      const a = pm.create('/d', 'A', '');
      const b = pm.create('/d', 'B', '');
      const c = pm.create('/d', 'C', '');
      pm.addDependency(a.id, c.id);
      pm.addDependency(b.id, c.id);

      // Complete a but not b
      pm.applyItem(a.id, 'session-1');
      pm.completeItem(a.id);

      expect(pm.getItem(c.id)!.status).toBe('pending');
    });

    it('completing a dep cascades startable to dependents', () => {
      const a = pm.create('/d', 'A', '');
      const b = pm.create('/d', 'B', '');
      const c = pm.create('/d', 'C', '');
      pm.addDependency(a.id, b.id);
      pm.addDependency(b.id, c.id);

      // Complete a → b becomes startable
      pm.applyItem(a.id, 's1');
      pm.completeItem(a.id);
      expect(pm.getItem(b.id)!.status).toBe('startable');
      expect(pm.getItem(c.id)!.status).toBe('pending');

      // Complete b → c becomes startable
      pm.applyItem(b.id, 's1');
      pm.completeItem(b.id);
      expect(pm.getItem(c.id)!.status).toBe('startable');
    });
  });

  // ─── Lifecycle ─────────────────────────────────────────

  describe('applyItem', () => {
    it('transitions startable→doing with sessionId', () => {
      const item = pm.create('/d', 'Task', '');
      const applied = pm.applyItem(item.id, 'session-42');

      expect(applied).not.toBeNull();
      expect(applied!.status).toBe('doing');
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
      const completed = pm.completeItem(a.id);

      expect(completed).not.toBeNull();
      expect(completed!.status).toBe('done');
      expect(pm.getItem(b.id)!.status).toBe('startable');
    });

    it('rejects non-doing items', () => {
      const item = pm.create('/d', 'Task', '');
      // item is startable, not doing
      expect(pm.completeItem(item.id)).toBeNull();
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

      pm.completeItem(item.id);

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
            status: 'startable',
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
            { id: 'b', dirPath: '/d', title: 'B', description: '', status: 'pending', createdAt: 2, updatedAt: 2 },
          ],
          dependencies: [{ fromId: 'a', toId: 'b' }],
        },
      });

      // b's only dep (a) is done → b should be recomputed to startable
      expect(pm.getItem('b')!.status).toBe('startable');
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

      expect(pm.getItem(x.id)!.status).toBe('pending');
      expect(pm.getItem(y.id)!.status).toBe('pending');
      expect(pm.getItem(z.id)!.status).toBe('pending');

      pm.applyItem(blocker.id, 's1');
      pm.completeItem(blocker.id);

      expect(pm.getItem(x.id)!.status).toBe('startable');
      expect(pm.getItem(y.id)!.status).toBe('startable');
      expect(pm.getItem(z.id)!.status).toBe('startable');
    });
  });
});
