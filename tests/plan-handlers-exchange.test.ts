/**
 * Tests for the new plan exchange IPC channels:
 *   plan:incoming-list, plan:incoming-delete
 *   plan:export-item, plan:export-directory
 *   plan:import-file
 *   plan:read-file, plan:write-file
 *
 * Also tests that the incoming-watcher events forward to the renderer window.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const handlers = new Map<string, Function>();

vi.mock('electron', () => {
  const mockGetAllWindows = vi.fn(() => []);
  return {
    ipcMain: {
      handle: vi.fn((channel: string, handler: Function) => {
        handlers.set(channel, handler);
      }),
    },
    BrowserWindow: {
      getAllWindows: mockGetAllWindows,
    },
  };
});

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

// Mock node:fs for read-file / write-file tests
const mockReadFileSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockMkdirSync = vi.fn();

vi.mock('node:fs', () => ({
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
}));

import { setupPlanHandlers } from '../src/electron/ipc/plan-handlers.js';
import { PlanManager } from '../src/session/plan-manager.js';
import { BrowserWindow } from 'electron';

// ─── Fake IncomingPlansWatcher ────────────────────────────────────────────────

class FakeWatcher extends EventEmitter {
  listFiles = vi.fn(() => [] as string[]);
  deleteFile = vi.fn(() => true);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeItem(overrides = {}) {
  return {
    id: `item-${Math.random().toString(36).slice(2)}`,
    dirPath: '/proj',
    title: 'Task',
    description: 'Do the thing',
    status: 'startable' as const,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('plan exchange IPC channels', () => {
  let planManager: PlanManager;
  let fakeWatcher: FakeWatcher;

  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    planManager = new PlanManager();
    fakeWatcher = new FakeWatcher();
    setupPlanHandlers(planManager, undefined as any, fakeWatcher as any);
  });

  // ─── Registration ──────────────────────────────────────────────────────────

  it('registers new exchange channels', () => {
    const expected = [
      'plan:incoming-list',
      'plan:incoming-delete',
      'plan:export-item',
      'plan:export-directory',
      'plan:import-file',
      'plan:read-file',
      'plan:write-file',
    ];
    for (const ch of expected) {
      expect(handlers.has(ch), `missing channel: ${ch}`).toBe(true);
    }
  });

  // ─── plan:incoming-list ────────────────────────────────────────────────────

  describe('plan:incoming-list', () => {
    it('returns file list from watcher', async () => {
      fakeWatcher.listFiles.mockReturnValue(['a.json', 'b.json']);
      const result = await handlers.get('plan:incoming-list')!({});
      expect(result).toEqual(['a.json', 'b.json']);
    });

    it('returns empty array when no files', async () => {
      fakeWatcher.listFiles.mockReturnValue([]);
      const result = await handlers.get('plan:incoming-list')!({});
      expect(result).toEqual([]);
    });

    it('returns empty array when no watcher provided', async () => {
      handlers.clear();
      setupPlanHandlers(planManager); // no watcher
      const result = await handlers.get('plan:incoming-list')!({});
      expect(result).toEqual([]);
    });
  });

  // ─── plan:incoming-delete ──────────────────────────────────────────────────

  describe('plan:incoming-delete', () => {
    it('delegates to watcher.deleteFile and returns true on success', async () => {
      fakeWatcher.deleteFile.mockReturnValue(true);
      const result = await handlers.get('plan:incoming-delete')!({}, 'file.json');
      expect(fakeWatcher.deleteFile).toHaveBeenCalledWith('file.json');
      expect(result).toBe(true);
    });

    it('returns false when file does not exist', async () => {
      fakeWatcher.deleteFile.mockReturnValue(false);
      const result = await handlers.get('plan:incoming-delete')!({}, 'missing.json');
      expect(result).toBe(false);
    });

    it('returns false when no watcher provided', async () => {
      handlers.clear();
      setupPlanHandlers(planManager);
      const result = await handlers.get('plan:incoming-delete')!({}, 'file.json');
      expect(result).toBe(false);
    });
  });

  // ─── plan:export-item ─────────────────────────────────────────────────────

  describe('plan:export-item', () => {
    it('returns JSON string with item and dependencies', async () => {
      const item = planManager.create('/proj', 'My Task', 'desc');
      const result = await handlers.get('plan:export-item')!({}, item.id);
      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result);
      expect(parsed.item).toMatchObject({ id: item.id, title: 'My Task' });
      expect(Array.isArray(parsed.dependencies)).toBe(true);
    });

    it('returns null for unknown plan ID', async () => {
      const result = await handlers.get('plan:export-item')!({}, 'nonexistent');
      expect(result).toBeNull();
    });

    it('exported JSON includes dependencies touching the item', async () => {
      const a = planManager.create('/proj', 'A', '');
      const b = planManager.create('/proj', 'B', '');
      planManager.addDependency(a.id, b.id);

      const resultA = JSON.parse(await handlers.get('plan:export-item')!({}, a.id));
      expect(resultA.dependencies).toHaveLength(1);
      expect(resultA.dependencies[0]).toMatchObject({ fromId: a.id, toId: b.id });
    });
  });

  // ─── plan:export-directory ────────────────────────────────────────────────

  describe('plan:export-directory', () => {
    it('returns JSON with all items for a directory', async () => {
      planManager.create('/proj', 'Task 1', '');
      planManager.create('/proj', 'Task 2', '');
      planManager.create('/other', 'Unrelated', '');

      const result = await handlers.get('plan:export-directory')!({}, '/proj');
      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result);
      expect(parsed.dirPath).toBe('/proj');
      expect(parsed.items).toHaveLength(2);
    });

    it('includes cross-item dependencies in export', async () => {
      const a = planManager.create('/proj', 'A', '');
      const b = planManager.create('/proj', 'B', '');
      planManager.addDependency(a.id, b.id);

      const result = JSON.parse(await handlers.get('plan:export-directory')!({}, '/proj'));
      expect(result.dependencies).toHaveLength(1);
    });

    it('returns null for empty directory', async () => {
      const result = await handlers.get('plan:export-directory')!({}, '/empty');
      expect(result).toBeNull();
    });
  });

  // ─── plan:import-file ─────────────────────────────────────────────────────

  describe('plan:import-file', () => {
    it('imports a single item from flat PlanItem JSON', async () => {
      const json = JSON.stringify({
        id: 'cli-001',
        dirPath: '/proj',
        title: 'CLI Task',
        description: 'From CLI',
        status: 'startable',
      });

      const result = await handlers.get('plan:import-file')!({}, json, '/proj');
      expect(result).toMatchObject({ id: 'cli-001', title: 'CLI Task' });
    });

    it('imports a single item from wrapped { item, dependencies } format', async () => {
      const json = JSON.stringify({
        item: {
          id: 'cli-002',
          dirPath: '/proj',
          title: 'Wrapped Task',
          description: '',
          status: 'startable',
        },
        dependencies: [],
      });

      const result = await handlers.get('plan:import-file')!({}, json, '/proj');
      expect(result).toMatchObject({ title: 'Wrapped Task' });
    });

    it('imports batch directory format and returns array', async () => {
      const json = JSON.stringify({
        dirPath: '/proj',
        items: [
          { id: 'b1', dirPath: '/proj', title: 'Batch 1', description: '', status: 'startable' },
          { id: 'b2', dirPath: '/proj', title: 'Batch 2', description: '', status: 'startable' },
        ],
        dependencies: [],
      });

      const result = await handlers.get('plan:import-file')!({}, json, '/proj');
      expect(Array.isArray(result)).toBe(true);
      expect((result as unknown[]).length).toBe(2);
    });

    it('overrides dirPath with targetDirPath in batch import', async () => {
      const json = JSON.stringify({
        dirPath: '/original',
        items: [
          { id: 'c1', dirPath: '/original', title: 'Cross-dir', description: '', status: 'startable' },
        ],
        dependencies: [],
      });

      const result = await handlers.get('plan:import-file')!({}, json, '/target-dir');
      expect((result as any)[0].dirPath).toBe('/target-dir');
    });

    it('returns null for invalid JSON', async () => {
      const result = await handlers.get('plan:import-file')!({}, 'not json', '/proj');
      expect(result).toBeNull();
    });

    it('returns null for duplicate ID', async () => {
      planManager.create('/proj', 'Existing'); // auto-assigns ID
      const existingId = planManager.getForDirectory('/proj')[0].id;

      const json = JSON.stringify({
        id: existingId,
        dirPath: '/proj',
        title: 'Dup',
        description: '',
        status: 'startable',
      });

      const result = await handlers.get('plan:import-file')!({}, json, '/proj');
      expect(result).toBeNull();
    });

    it('auto-renames on title collision', async () => {
      planManager.create('/proj', 'Same Title', '');

      const json = JSON.stringify({
        id: 'fresh-id',
        dirPath: '/proj',
        title: 'Same Title',
        description: '',
        status: 'startable',
      });

      const result = await handlers.get('plan:import-file')!({}, json, '/proj');
      expect((result as any).title).toBe('Same Title (2)');
    });
  });

  // ─── plan:read-file ────────────────────────────────────────────────────────

  describe('plan:read-file', () => {
    it('reads and returns file content', async () => {
      mockReadFileSync.mockReturnValue('{"id":"x"}');
      const result = await handlers.get('plan:read-file')!({}, '/some/file.json');
      expect(result).toBe('{"id":"x"}');
      expect(mockReadFileSync).toHaveBeenCalledWith('/some/file.json', 'utf8');
    });

    it('returns null if file does not exist', async () => {
      mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
      const result = await handlers.get('plan:read-file')!({}, '/missing.json');
      expect(result).toBeNull();
    });
  });

  // ─── plan:write-file ──────────────────────────────────────────────────────

  describe('plan:write-file', () => {
    it('writes content to file and returns true', async () => {
      mockWriteFileSync.mockImplementation(() => {});
      const result = await handlers.get('plan:write-file')!({}, '/out/plan.json', '{"data":1}');
      expect(result).toBe(true);
      expect(mockWriteFileSync).toHaveBeenCalledWith('/out/plan.json', '{"data":1}', 'utf8');
    });

    it('creates parent directories before writing', async () => {
      mockMkdirSync.mockImplementation(() => {});
      mockWriteFileSync.mockImplementation(() => {});
      await handlers.get('plan:write-file')!({}, '/deep/nested/plan.json', '{}');
      expect(mockMkdirSync).toHaveBeenCalledWith('/deep/nested', expect.objectContaining({ recursive: true }));
    });

    it('returns false if write fails', async () => {
      mockMkdirSync.mockImplementation(() => {});
      mockWriteFileSync.mockImplementation(() => { throw new Error('Permission denied'); });
      const result = await handlers.get('plan:write-file')!({}, '/readonly/plan.json', '{}');
      expect(result).toBe(false);
    });
  });

  // ─── Incoming watcher event forwarding ────────────────────────────────────

  describe('incoming watcher event forwarding', () => {
    it('forwards incoming-imported event to renderer window', () => {
      const mockSend = vi.fn();
      (BrowserWindow.getAllWindows as any).mockReturnValue([{ isDestroyed: () => false, webContents: { send: mockSend } }]);

      fakeWatcher.emit('incoming-imported', { filename: 'x.json', title: 'Task', dirPath: '/proj' });

      expect(mockSend).toHaveBeenCalledWith('plan:incoming-imported', expect.objectContaining({ title: 'Task' }));
    });

    it('forwards incoming-error event to renderer window', () => {
      const mockSend = vi.fn();
      (BrowserWindow.getAllWindows as any).mockReturnValue([{ isDestroyed: () => false, webContents: { send: mockSend } }]);

      fakeWatcher.emit('incoming-error', { filename: 'bad.json', error: 'Invalid JSON' });

      expect(mockSend).toHaveBeenCalledWith('plan:incoming-error', expect.objectContaining({ error: 'Invalid JSON' }));
    });

    it('does not forward if window is destroyed', () => {
      const mockSend = vi.fn();
      (BrowserWindow.getAllWindows as any).mockReturnValue([{ isDestroyed: () => true, webContents: { send: mockSend } }]);

      fakeWatcher.emit('incoming-imported', { filename: 'x.json', title: 'T', dirPath: '/proj' });

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('does not forward if no window returned', () => {
      (BrowserWindow.getAllWindows as any).mockReturnValue([]);
      // Should not throw
      expect(() => fakeWatcher.emit('incoming-imported', { filename: 'x.json', title: 'T', dirPath: '/proj' })).not.toThrow();
    });
  });
});
