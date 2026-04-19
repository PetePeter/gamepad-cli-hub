/**
 * Plan migration tests — real file I/O with temp directories.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as YAML from 'yaml';
import type { DirectoryPlan } from '../src/types/plan.js';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Import after mocks
import { migrateOldPlans } from '../src/session/plan-migration.js';
import { listPlanFiles, loadPlanFile, loadDependencies, encodeFilename } from '../src/session/persistence.js';

function writeTestPlansYaml(configDir: string, dirPlans: Record<string, DirectoryPlan>): void {
  fs.writeFileSync(
    path.join(configDir, 'plans.yaml'),
    YAML.stringify({ plans: dirPlans }),
    'utf8',
  );
}

describe('migrateOldPlans (real I/O)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamepad-migration-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('is a no-op when plans.yaml does not exist', () => {
    const result = migrateOldPlans(tmpDir);
    expect(result).toEqual({ migratedPlans: 0, migratedDeps: 0 });
    expect(fs.existsSync(path.join(tmpDir, 'plans'))).toBe(false);
  });

  it('converts plans.yaml to individual plan files', () => {
    writeTestPlansYaml(tmpDir, {
      '/proj': {
        dirPath: '/proj',
        items: [
          { id: 'aaaa0001-0000-0000-0000-000000000001', dirPath: '/proj', title: 'Task A', description: 'Desc A', status: 'startable', createdAt: 100, updatedAt: 101 },
          { id: 'aaaa0002-0000-0000-0000-000000000002', dirPath: '/proj', title: 'Task B', description: 'Desc B', status: 'pending', createdAt: 200, updatedAt: 201 },
        ],
        dependencies: [],
      },
    });

    const result = migrateOldPlans(tmpDir);
    expect(result.migratedPlans).toBe(2);
    expect(result.migratedDeps).toBe(0);

    const plansDir = path.join(tmpDir, 'plans');
    const files = listPlanFiles(plansDir);
    expect(files).toHaveLength(2);
  });

  it('preserves all plan item fields after migration', () => {
    const item = { id: 'aaaa0001-0000-0000-0000-000000000001', dirPath: '/proj', title: 'Auth', description: 'JWT', status: 'startable' as const, createdAt: 100, updatedAt: 101 };
    writeTestPlansYaml(tmpDir, { '/proj': { dirPath: '/proj', items: [item], dependencies: [] } });

    migrateOldPlans(tmpDir);

    const plansDir = path.join(tmpDir, 'plans');
    const filename = encodeFilename(item.dirPath, item.id);
    const loaded = loadPlanFile(filename, plansDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.title).toBe('Auth');
    expect(loaded!.description).toBe('JWT');
    expect(loaded!.status).toBe('startable');
  });

  it('preserves dependency edges', () => {
    writeTestPlansYaml(tmpDir, {
      '/proj': {
        dirPath: '/proj',
        items: [
          { id: 'aaaa0001-0000-0000-0000-000000000001', dirPath: '/proj', title: 'A', description: '', status: 'startable', createdAt: 1, updatedAt: 1 },
          { id: 'aaaa0002-0000-0000-0000-000000000002', dirPath: '/proj', title: 'B', description: '', status: 'pending', createdAt: 2, updatedAt: 2 },
        ],
        dependencies: [{ fromId: 'aaaa0001-0000-0000-0000-000000000001', toId: 'aaaa0002-0000-0000-0000-000000000002' }],
      },
    });

    const result = migrateOldPlans(tmpDir);
    expect(result.migratedDeps).toBe(1);

    const deps = loadDependencies(path.join(tmpDir, 'plan-dependencies.json'));
    expect(deps).toHaveLength(1);
    expect(deps[0]).toEqual({
      fromId: 'aaaa0001-0000-0000-0000-000000000001',
      toId: 'aaaa0002-0000-0000-0000-000000000002',
    });
  });

  it('backs up plans.yaml and deletes the original', () => {
    writeTestPlansYaml(tmpDir, {});
    migrateOldPlans(tmpDir);

    expect(fs.existsSync(path.join(tmpDir, 'plans.yaml'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'plans.yaml.bak'))).toBe(true);
  });

  it('returns correct counts for multiple directories', () => {
    writeTestPlansYaml(tmpDir, {
      '/a': { dirPath: '/a', items: [
        { id: 'aaaa0001-0000-0000-0000-000000000001', dirPath: '/a', title: 'X', description: '', status: 'startable', createdAt: 1, updatedAt: 1 },
      ], dependencies: [] },
      '/b': { dirPath: '/b', items: [
        { id: 'aaaa0002-0000-0000-0000-000000000002', dirPath: '/b', title: 'Y', description: '', status: 'startable', createdAt: 1, updatedAt: 1 },
        { id: 'aaaa0003-0000-0000-0000-000000000003', dirPath: '/b', title: 'Z', description: '', status: 'pending', createdAt: 1, updatedAt: 1 },
      ], dependencies: [{ fromId: 'aaaa0002-0000-0000-0000-000000000002', toId: 'aaaa0003-0000-0000-0000-000000000003' }] },
    });

    const result = migrateOldPlans(tmpDir);
    expect(result.migratedPlans).toBe(3);
    expect(result.migratedDeps).toBe(1);
  });
});
