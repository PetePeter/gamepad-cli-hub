/**
 * Plan file persistence — real file I/O tests.
 * Uses OS temp directories so no production config is touched.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  encodeFilename,
  decodeFilename,
  savePlanFile,
  loadPlanFile,
  deletePlanFile,
  listPlanFiles,
  saveDependencies,
  loadDependencies,
  cleanupOrphanDependencies,
} from '../src/session/persistence.js';
import type { PlanItem, PlanDependency } from '../src/types/plan.js';

// Silence logger output during tests
vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { vi } from 'vitest';

function makePlanItem(overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id: 'a1b2c3d4-1234-5678-90ab-cdef12345678',
    dirPath: 'C:\\Users\\oscar\\project',
    title: 'Build Auth',
    description: 'JWT middleware',
    status: 'startable',
    createdAt: 1000,
    updatedAt: 1001,
    ...overrides,
  };
}

describe('plan file persistence (real I/O)', () => {
  let tmpDir: string;
  let plansDir: string;
  let depsFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamepad-test-'));
    plansDir = path.join(tmpDir, 'plans');
    depsFile = path.join(tmpDir, 'plan-dependencies.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── encodeFilename / decodeFilename ────────────────────────────────────

  describe('encodeFilename', () => {
    it('encodes special chars in dirPath', () => {
      const name = encodeFilename('C:\\Users\\oscar', 'a1b2c3d4-uuid');
      expect(name).toBe('C%3A%5CUsers%5Coscar@a1b2c3d4-uuid.json');
    });

    it('encodes @ in dirPath as %40 so separator is unambiguous', () => {
      const name = encodeFilename('C:\\at@work', 'uuid-here');
      expect(name).toContain('%40');
      expect(name.split('@').length).toBe(2);
    });

    it('uses full planId in filename', () => {
      const name = encodeFilename('/dir', '12345678-abcd-efgh');
      expect(name).toBe('%2Fdir@12345678-abcd-efgh.json');
    });
  });

  describe('decodeFilename', () => {
    it('recovers dirPath from encoded filename', () => {
      const { dirPath } = decodeFilename('C%3A%5CUsers%5Coscar@a1b2c3d4.json');
      expect(dirPath).toBe('C:\\Users\\oscar');
    });

    it('recovers planId', () => {
      const { planId } = decodeFilename('C%3AUsers%5Coscar@a1b2c3d4-5678-9012.json');
      expect(planId).toBe('a1b2c3d4-5678-9012');
    });

    it('round-trips encode → decode', () => {
      const item = makePlanItem();
      const filename = encodeFilename(item.dirPath, item.id);
      const { dirPath } = decodeFilename(filename);
      expect(dirPath).toBe(item.dirPath);
    });
  });

  // ─── savePlanFile ────────────────────────────────────────────────────────

  describe('savePlanFile', () => {
    it('creates the plans/ directory on first write', () => {
      expect(fs.existsSync(plansDir)).toBe(false);
      savePlanFile(makePlanItem(), plansDir);
      expect(fs.existsSync(plansDir)).toBe(true);
    });

    it('writes a .json file with correct filename', () => {
      const item = makePlanItem();
      savePlanFile(item, plansDir);
      const files = fs.readdirSync(plansDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/\.json$/);
    });

    it('includes _fileVersion in the written file', () => {
      const item = makePlanItem();
      savePlanFile(item, plansDir);
      const files = fs.readdirSync(plansDir);
      const raw = JSON.parse(fs.readFileSync(path.join(plansDir, files[0]), 'utf8'));
      expect(raw._fileVersion).toBe(1);
    });

    it('writes all PlanItem fields to the file', () => {
      const item = makePlanItem();
      savePlanFile(item, plansDir);
      const files = fs.readdirSync(plansDir);
      const raw = JSON.parse(fs.readFileSync(path.join(plansDir, files[0]), 'utf8'));
      expect(raw.id).toBe(item.id);
      expect(raw.title).toBe(item.title);
      expect(raw.status).toBe(item.status);
    });
  });

  // ─── loadPlanFile ────────────────────────────────────────────────────────

  describe('loadPlanFile', () => {
    it('returns null for a missing file', () => {
      const result = loadPlanFile('nonexistent.json', plansDir);
      expect(result).toBeNull();
    });

    it('loads a saved plan and strips _fileVersion', () => {
      const item = makePlanItem();
      savePlanFile(item, plansDir);
      const files = fs.readdirSync(plansDir);
      const loaded = loadPlanFile(files[0], plansDir);
      expect(loaded).not.toBeNull();
      expect((loaded as any)._fileVersion).toBeUndefined();
      expect(loaded!.id).toBe(item.id);
      expect(loaded!.title).toBe(item.title);
    });

    it('returns null for invalid JSON', () => {
      fs.mkdirSync(plansDir, { recursive: true });
      fs.writeFileSync(path.join(plansDir, 'bad.json'), 'not-json', 'utf8');
      const result = loadPlanFile('bad.json', plansDir);
      expect(result).toBeNull();
    });
  });

  // ─── listPlanFiles ───────────────────────────────────────────────────────

  describe('listPlanFiles', () => {
    it('returns empty array when directory does not exist', () => {
      expect(listPlanFiles(plansDir)).toEqual([]);
    });

    it('returns only .json files (not subdirectories)', () => {
      savePlanFile(makePlanItem({ id: 'aaaa0001-0000-0000-0000-000000000001' }), plansDir);
      savePlanFile(makePlanItem({ id: 'aaaa0002-0000-0000-0000-000000000002' }), plansDir);
      // Create a subdirectory that should be excluded
      fs.mkdirSync(path.join(plansDir, 'incoming'), { recursive: true });
      fs.writeFileSync(path.join(plansDir, 'incoming', 'sub.json'), '{}');

      const files = listPlanFiles(plansDir);
      expect(files).toHaveLength(2);
      expect(files.every(f => f.endsWith('.json'))).toBe(true);
    });
  });

  // ─── deletePlanFile ──────────────────────────────────────────────────────

  describe('deletePlanFile', () => {
    it('deletes the file matching the plan ID', () => {
      const item = makePlanItem();
      savePlanFile(item, plansDir);
      expect(listPlanFiles(plansDir)).toHaveLength(1);

      const deleted = deletePlanFile(item.id, plansDir);
      expect(deleted).toBe(true);
      expect(listPlanFiles(plansDir)).toHaveLength(0);
    });

    it('does not delete a file whose ID only shares a prefix', () => {
      // Regression: old 8-char prefix scheme could delete wrong file
      const base = 'a1b2c3d4';
      const item1 = makePlanItem({ id: `${base}-1111-2222-3333-000000000001` });
      const item2 = makePlanItem({ id: `${base}-aaaa-bbbb-cccc-000000000002` });
      savePlanFile(item1, plansDir);
      savePlanFile(item2, plansDir);
      expect(listPlanFiles(plansDir)).toHaveLength(2);

      deletePlanFile(item1.id, plansDir);
      const remaining = listPlanFiles(plansDir);
      expect(remaining).toHaveLength(1);
      const kept = remaining[0];
      expect(kept).toContain(item2.id);
    });

    it('returns false when no matching file exists', () => {
      fs.mkdirSync(plansDir, { recursive: true });
      const result = deletePlanFile('no-such-id', plansDir);
      expect(result).toBe(false);
    });

    it('returns false when plans dir does not exist', () => {
      const result = deletePlanFile('any-id', plansDir);
      expect(result).toBe(false);
    });

    it('deletes a legacy short-named file when the JSON body stores the full ID', () => {
      fs.mkdirSync(plansDir, { recursive: true });
      const item = makePlanItem();
      const legacyFilename = `${encodeURIComponent(item.dirPath)}@${item.id.slice(0, 8)}.json`;
      fs.writeFileSync(
        path.join(plansDir, legacyFilename),
        JSON.stringify({ ...item, _fileVersion: 1 }, null, 2),
        'utf8',
      );

      const deleted = deletePlanFile(item.id, plansDir);

      expect(deleted).toBe(true);
      expect(listPlanFiles(plansDir)).toHaveLength(0);
    });

    it('deletes all stale file variants for the same plan ID', () => {
      fs.mkdirSync(plansDir, { recursive: true });
      const item = makePlanItem();
      const currentFilename = encodeFilename(item.dirPath, item.id);
      const legacyFilename = `${encodeURIComponent(item.dirPath)}@${item.id.slice(0, 8)}.json`;
      const otherItem = makePlanItem({ id: 'bbbbbbbb-1234-5678-90ab-cdef12345678', title: 'Keep me' });

      fs.writeFileSync(
        path.join(plansDir, currentFilename),
        JSON.stringify({ ...item, _fileVersion: 1 }, null, 2),
        'utf8',
      );
      fs.writeFileSync(
        path.join(plansDir, legacyFilename),
        JSON.stringify({ ...item, _fileVersion: 1 }, null, 2),
        'utf8',
      );
      savePlanFile(otherItem, plansDir);

      const deleted = deletePlanFile(item.id, plansDir);
      const remaining = listPlanFiles(plansDir);

      expect(deleted).toBe(true);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]).toContain(otherItem.id);
    });
  });

  // ─── saveDependencies / loadDependencies ─────────────────────────────────

  describe('saveDependencies / loadDependencies', () => {
    it('returns empty array when file does not exist', () => {
      expect(loadDependencies(depsFile)).toEqual([]);
    });

    it('round-trips a dependency list', () => {
      const deps: PlanDependency[] = [
        { fromId: 'uuid1', toId: 'uuid2' },
        { fromId: 'uuid2', toId: 'uuid3' },
      ];
      saveDependencies(deps, depsFile);
      const loaded = loadDependencies(depsFile);
      expect(loaded).toEqual(deps);
    });

    it('writes version:1 to the file', () => {
      saveDependencies([], depsFile);
      const raw = JSON.parse(fs.readFileSync(depsFile, 'utf8'));
      expect(raw.version).toBe(1);
    });
  });

  // ─── cleanupOrphanDependencies ───────────────────────────────────────────

  describe('cleanupOrphanDependencies', () => {
    it('removes edges whose IDs are not in the valid set', () => {
      const initialDeps: PlanDependency[] = [
        { fromId: 'valid1', toId: 'valid2' },
        { fromId: 'valid1', toId: 'orphan' },
        { fromId: 'orphan', toId: 'valid2' },
      ];
      saveDependencies(initialDeps, depsFile);

      const { removed, deps } = cleanupOrphanDependencies(new Set(['valid1', 'valid2']), depsFile);
      expect(removed).toBe(2);
      expect(deps).toEqual([{ fromId: 'valid1', toId: 'valid2' }]);

      const remaining = loadDependencies(depsFile);
      expect(remaining).toEqual([{ fromId: 'valid1', toId: 'valid2' }]);
    });

    it('preserves all edges when all IDs are valid', () => {
      const deps: PlanDependency[] = [
        { fromId: 'a', toId: 'b' },
        { fromId: 'b', toId: 'c' },
      ];
      saveDependencies(deps, depsFile);

      const { removed } = cleanupOrphanDependencies(new Set(['a', 'b', 'c']), depsFile);
      expect(removed).toBe(0);
      expect(loadDependencies(depsFile)).toEqual(deps);
    });

    it('handles missing deps file gracefully', () => {
      const { removed } = cleanupOrphanDependencies(new Set(['a']), depsFile);
      expect(removed).toBe(0);
    });
  });
});
