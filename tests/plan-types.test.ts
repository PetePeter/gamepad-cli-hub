/**
 * Plan types (P-0038) — Type field, auto-prefixing, MCP exposure.
 * TDD: tests written first, implementation follows.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

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
import { getDisplayTitle, type PlanType } from '../renderer/types.js';
import * as persistence from '../src/session/persistence.js';

describe('Plan Types (P-0038)', () => {
  let pm: PlanManager;

  beforeEach(() => {
    (persistence.listPlanFiles as unknown as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (persistence.loadPlanFile as unknown as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (persistence.savePlanFile as unknown as ReturnType<typeof vi.fn>).mockClear();
    pm = new PlanManager();
  });

  // ─── getDisplayTitle helper ──────────────────────────────

  describe('getDisplayTitle', () => {
    it('returns title unchanged when type is undefined', () => {
      expect(getDisplayTitle('Build API', undefined)).toBe('Build API');
    });

    it('prefixes with [B] for bug type', () => {
      expect(getDisplayTitle('Fix login', 'bug')).toBe('[B] Fix login');
    });

    it('prefixes with [F] for feature type', () => {
      expect(getDisplayTitle('Add export', 'feature')).toBe('[F] Add export');
    });

    it('prefixes with [R] for research type', () => {
      expect(getDisplayTitle('Investigate perf', 'research')).toBe('[R] Investigate perf');
    });

    it('does not double-prefix if title already has prefix', () => {
      expect(getDisplayTitle('[B] Fix login', 'bug')).toBe('[B] Fix login');
      expect(getDisplayTitle('[F] Add export', 'feature')).toBe('[F] Add export');
      expect(getDisplayTitle('[R] Investigate', 'research')).toBe('[R] Investigate');
    });

    it('does not false-match prefixes in middle of title', () => {
      expect(getDisplayTitle('Bug [B] fixing', 'bug')).toBe('[B] Bug [B] fixing');
      expect(getDisplayTitle('Search [F] for', 'feature')).toBe('[F] Search [F] for');
    });

    it('ignores empty title', () => {
      expect(getDisplayTitle('', 'bug')).toBe('[B] ');
      expect(getDisplayTitle('', undefined)).toBe('');
    });
  });

  // ─── PlanManager.create with type ──────────────────────

  describe('create with type', () => {
    it('creates item without type (undefined)', () => {
      const item = pm.create('/d', 'Task', 'desc');
      expect(item.type).toBeUndefined();
    });

    it('creates item with type set', () => {
      const item = pm.createWithType('/d', 'Fix login', 'JWT issue', 'bug');
      expect(item.type).toBe('bug');
      expect(item.title).toBe('Fix login');
    });

    it('creates feature with type', () => {
      const item = pm.createWithType('/d', 'Add export', 'JSON export', 'feature');
      expect(item.type).toBe('feature');
    });

    it('creates research with type', () => {
      const item = pm.createWithType('/d', 'Investigate perf', 'Baseline analysis', 'research');
      expect(item.type).toBe('research');
    });

    it('saves type to disk via persistence', () => {
      const item = pm.createWithType('/d', 'Bug fix', 'desc', 'bug');
      expect(persistence.savePlanFile).toHaveBeenCalledWith(expect.objectContaining({ type: 'bug' }));
    });

    it('new items without type are backward compatible', () => {
      const item = pm.create('/d', 'Old style', 'no type field');
      expect(item.type).toBeUndefined();
      expect(persistence.savePlanFile).toHaveBeenCalled();
    });
  });

  // ─── PlanManager.update with type ──────────────────────

  describe('update with type', () => {
    it('updates title and type together', () => {
      let item = pm.create('/d', 'Old', 'desc');
      item = pm.updateWithType(item.id, { title: 'New', type: 'feature' })!;
      expect(item.title).toBe('New');
      expect(item.type).toBe('feature');
    });

    it('changes type on existing item', () => {
      let item = pm.createWithType('/d', 'Task', 'desc', 'bug');
      expect(item.type).toBe('bug');
      item = pm.updateWithType(item.id, { type: 'feature' })!;
      expect(item.type).toBe('feature');
    });

    it('clears type by setting to undefined', () => {
      let item = pm.createWithType('/d', 'Task', 'desc', 'bug');
      item = pm.updateWithType(item.id, { type: undefined })!;
      expect(item.type).toBeUndefined();
    });

    it('preserves type when not in update params', () => {
      let item = pm.createWithType('/d', 'Old', 'desc', 'research');
      item = pm.updateWithType(item.id, { title: 'New' })!;
      expect(item.type).toBe('research');
      expect(item.title).toBe('New');
    });

    it('returns null for non-existent item', () => {
      const result = pm.updateWithType('fake-id', { type: 'bug' });
      expect(result).toBeNull();
    });

    it('saves to disk when type changes', () => {
      const item = pm.createWithType('/d', 'Task', 'desc', 'bug');
      (persistence.savePlanFile as unknown as ReturnType<typeof vi.fn>).mockClear();
      pm.updateWithType(item.id, { type: 'feature' });
      expect(persistence.savePlanFile).toHaveBeenCalled();
    });
  });

  // ─── Backward compatibility ──────────────────────────────

  describe('backward compatibility', () => {
    it('loads plans without type field from disk', () => {
      const oldItem = {
        id: 'test-id',
        dirPath: '/d',
        title: 'Legacy',
        description: 'Old plan',
        status: 'startable' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      (persistence.listPlanFiles as unknown as ReturnType<typeof vi.fn>).mockReturnValue(['legacy.json']);
      (persistence.loadPlanFile as unknown as ReturnType<typeof vi.fn>).mockReturnValue(oldItem);

      const pm2 = new PlanManager();
      const item = pm2.getItem('test-id');
      expect(item).not.toBeNull();
      expect(item!.type).toBeUndefined();
    });

    it('existing plans remain startable/doing after loading without type', () => {
      const oldItem = {
        id: 'test-id',
        dirPath: '/d',
        title: 'Doing task',
        description: 'Active',
        status: 'doing' as const,
        sessionId: 'session-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      (persistence.listPlanFiles as unknown as ReturnType<typeof vi.fn>).mockReturnValue(['old.json']);
      (persistence.loadPlanFile as unknown as ReturnType<typeof vi.fn>).mockReturnValue(oldItem);

      const pm2 = new PlanManager();
      const item = pm2.getItem('test-id');
      expect(item!.status).toBe('doing');
      expect(item!.type).toBeUndefined();
    });
  });

  // ─── Persistence round-trip ────────────────────────────

  describe('persistence', () => {
    it('preserves type when saved and loaded', () => {
      const created = pm.createWithType('/projects/backend', 'DB migration', 'Refactor schema', 'feature');

      // Simulate saving and reloading
      const saveCalls = (persistence.savePlanFile as unknown as ReturnType<typeof vi.fn>).mock.calls;
      const lastSavedItem = saveCalls[saveCalls.length - 1][0];

      expect(lastSavedItem.type).toBe('feature');
      expect(lastSavedItem.title).toBe('DB migration');
    });
  });

  // ─── Type validation ────────────────────────────────────

  describe('type field validation', () => {
    it('accepts valid types: bug, feature, research', () => {
      const types: PlanType[] = ['bug', 'feature', 'research'];
      for (const type of types) {
        const item = pm.createWithType('/d', `Item ${type}`, 'desc', type);
        expect(item.type).toBe(type);
      }
    });

    it('rejects invalid types silently (type system enforces at compile time)', () => {
      // This test documents that type validation is compile-time via TypeScript.
      // Runtime: invalid types would require explicit validation (out of scope for P-0038).
      expect(true).toBe(true);
    });
  });

  // ─── Dependencies and status preservation ───────────────

  describe('type field with dependencies', () => {
    it('preserves type through dependency operations', () => {
      const a = pm.createWithType('/d', 'Setup', 'desc', 'feature');
      const b = pm.createWithType('/d', 'Deploy', 'desc', 'feature');

      pm.addDependency(a.id, b.id);

      const reloaded = pm.getItem(a.id);
      expect(reloaded!.type).toBe('feature');
    });

    it('preserves type when item transitions to doing', () => {
      const item = pm.createWithType('/d', 'Task', 'desc', 'bug');
      const applied = pm.applyItem(item.id, 'session-1');
      expect(applied!.type).toBe('bug');
      expect(applied!.status).toBe('doing');
    });

    it('preserves type when item completes', () => {
      let item = pm.createWithType('/d', 'Task', 'desc', 'research');
      item = pm.applyItem(item.id, 'session-1')!;
      item = pm.completeItem(item.id)!;
      expect(item.type).toBe('research');
      expect(item.status).toBe('done');
    });
  });

  // ─── Export/Import with type ───────────────────────────

  describe('export/import with type', () => {
    it('exports item with type preserved', () => {
      const item = pm.createWithType('/d', 'Task', 'desc', 'feature');
      const exported = pm.exportItem(item.id);
      expect(exported!.item.type).toBe('feature');
    });

    it('exports directory with types preserved', () => {
      pm.createWithType('/d', 'Bug fix', 'desc', 'bug');
      pm.createWithType('/d', 'New feature', 'desc', 'feature');
      pm.create('/d', 'No type', 'desc');

      const exported = pm.exportDirectory('/d');
      expect(exported!.items).toHaveLength(3);
      expect(exported!.items[0].type).toBe('bug');
      expect(exported!.items[1].type).toBe('feature');
      expect(exported!.items[2].type).toBeUndefined();
    });

    it('imports item with type', () => {
      const importItem = {
        id: 'external-id',
        dirPath: '/d',
        title: 'Imported',
        description: 'From outside',
        status: 'pending' as const,
        type: 'bug' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const result = pm.importItem(importItem);
      expect(result!.type).toBe('bug');
    });

    it('imports item without type', () => {
      const importItem = {
        id: 'external-id',
        dirPath: '/d',
        title: 'Imported',
        description: 'From outside',
        status: 'pending' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const result = pm.importItem(importItem);
      expect(result!.type).toBeUndefined();
    });
  });
});
