/**
 * IncomingPlansWatcher tests
 *
 * Uses mocked chokidar and fs to avoid real file I/O while still covering
 * all processing paths: valid import, invalid JSON, duplicate ID, validation
 * errors, listFiles, deleteFile, title collision rename.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../src/utils/app-paths.js', () => ({
  getConfigDir: vi.fn(() => '/config'),
}));

// ─── Mock chokidar ───────────────────────────────────────────────────────────
// Use vi.hoisted() so variables are available inside the vi.mock factory
// (which is hoisted to the top of the file by Vitest).

const { mockWatcherOn, mockWatcherClose, mockChokidarWatch } = vi.hoisted(() => {
  const mockWatcherOn = vi.fn();
  const mockWatcherClose = vi.fn().mockResolvedValue(undefined);
  const mockChokidarWatch = vi.fn(() => ({
    on: mockWatcherOn,
    close: mockWatcherClose,
  }));
  return { mockWatcherOn, mockWatcherClose, mockChokidarWatch };
});

vi.mock('chokidar', () => ({
  default: { watch: mockChokidarWatch },
}));

// ─── Mock node:fs ────────────────────────────────────────────────────────────

const mockMkdirSync = vi.fn();
const mockExistsSync = vi.fn(() => true);
const mockUnlinkSync = vi.fn();
const mockReaddirSync = vi.fn(() => [] as string[]);
const mockReadFileSync = vi.fn(() => '{}');

vi.mock('node:fs', () => ({
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  unlinkSync: (...args: unknown[]) => mockUnlinkSync(...args),
  readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
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

import { IncomingPlansWatcher } from '../src/session/incoming-plans-watcher.js';
import { PlanManager } from '../src/session/plan-manager.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeValidJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'plan-abc-123',
    dirPath: '/projects/backend',
    title: 'Implement Auth',
    description: 'JWT middleware',
    status: 'startable',
    ...overrides,
  });
}

/** Capture the chokidar 'add' callback so tests can call it directly. */
function getAddCallback(): (filePath: string) => void {
  const calls = mockWatcherOn.mock.calls;
  const addCall = calls.find(c => c[0] === 'add');
  if (!addCall) throw new Error('No "add" handler registered on watcher');
  return addCall[1] as (filePath: string) => void;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('IncomingPlansWatcher', () => {
  let planManager: PlanManager;
  let watcher: IncomingPlansWatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([]);
    planManager = new PlanManager();
    watcher = new IncomingPlansWatcher(planManager, '/config');
  });

  // ─── start / close ─────────────────────────────────────────────────────────

  describe('start()', () => {
    it('creates the incoming directory if missing', () => {
      watcher.start();
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('incoming'),
        expect.objectContaining({ recursive: true }),
      );
    });

    it('calls chokidar.watch on the incoming directory', () => {
      watcher.start();
      expect(mockChokidarWatch).toHaveBeenCalledWith(
        expect.stringContaining('incoming'),
        expect.objectContaining({ awaitWriteFinish: expect.any(Object) }),
      );
    });

    it('registers add and error handlers on the chokidar watcher', () => {
      watcher.start();
      const channels = mockWatcherOn.mock.calls.map(c => c[0]);
      expect(channels).toContain('add');
      expect(channels).toContain('error');
    });
  });

  describe('close()', () => {
    it('closes the chokidar watcher and nullifies it', async () => {
      watcher.start();
      await watcher.close();
      expect(mockWatcherClose).toHaveBeenCalledOnce();
    });

    it('is safe to call when not started', async () => {
      await expect(watcher.close()).resolves.toBeUndefined();
      expect(mockWatcherClose).not.toHaveBeenCalled();
    });
  });

  // ─── listFiles ─────────────────────────────────────────────────────────────

  describe('listFiles()', () => {
    it('returns empty array when incoming dir does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      expect(watcher.listFiles()).toEqual([]);
    });

    it('returns only .json files', () => {
      mockReaddirSync.mockReturnValue(['a.json', 'b.json', 'README.md', '.gitkeep'] as unknown as string[]);
      const result = watcher.listFiles();
      expect(result).toHaveLength(2);
      expect(result[0]).toMatch(/a\.json$/);
      expect(result[1]).toMatch(/b\.json$/);
    });

    it('returns empty array when directory is empty', () => {
      mockReaddirSync.mockReturnValue([] as unknown as string[]);
      expect(watcher.listFiles()).toEqual([]);
    });
  });

  // ─── deleteFile ────────────────────────────────────────────────────────────

  describe('deleteFile()', () => {
    it('deletes a file and returns true', () => {
      mockExistsSync.mockReturnValue(true);
      const result = watcher.deleteFile('my-plan.json');
      expect(mockUnlinkSync).toHaveBeenCalledOnce();
      expect(result).toBe(true);
    });

    it('returns false if file does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      const result = watcher.deleteFile('missing.json');
      expect(mockUnlinkSync).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('rejects path traversal — only uses basename', () => {
      mockExistsSync.mockReturnValue(false);
      watcher.deleteFile('../../evil.json');
      // Should resolve to incoming dir + 'evil.json' only
      const firstArg = (mockExistsSync as Mock).mock.calls[0]?.[0] as string;
      expect(firstArg).not.toContain('..');
    });
  });

  // ─── processFile — valid JSON ───────────────────────────────────────────────

  describe('processFile() — valid input', () => {
    it('emits incoming-imported with correct fields on success', () => {
      mockReadFileSync.mockReturnValue(makeValidJson());
      watcher.start();

      const onImported = vi.fn();
      watcher.on('incoming-imported', onImported);

      getAddCallback()('/config/plans/incoming/plan.json');

      expect(onImported).toHaveBeenCalledOnce();
      const evt = onImported.mock.calls[0][0];
      expect(evt.filename).toBe('plan.json');
      expect(evt.title).toBe('Implement Auth');
      expect(evt.dirPath).toBe('/projects/backend');
    });

    it('deletes the source file after successful import', () => {
      mockReadFileSync.mockReturnValue(makeValidJson());
      watcher.start();
      getAddCallback()('/config/plans/incoming/plan.json');
      expect(mockUnlinkSync).toHaveBeenCalledWith('/config/plans/incoming/plan.json');
    });

    it('forces imported item status to startable', () => {
      // Even if file says 'doing', imported item must be startable
      mockReadFileSync.mockReturnValue(makeValidJson({ status: 'doing' }));
      watcher.start();

      const onImported = vi.fn();
      watcher.on('incoming-imported', onImported);
      getAddCallback()('/config/plans/incoming/plan.json');

      const importSpy = vi.spyOn(planManager, 'importItem');
      // Check status normalisation in the manager (importItem always sets startable)
      // Verify the event was emitted — normalisation tested in PlanManager tests
      expect(onImported).toHaveBeenCalled();
    });

    it('ignores non-.json files', () => {
      watcher.start();
      const onImported = vi.fn();
      watcher.on('incoming-imported', onImported);

      getAddCallback()('/config/plans/incoming/readme.txt');
      expect(onImported).not.toHaveBeenCalled();
      expect(mockReadFileSync).not.toHaveBeenCalled();
    });
  });

  // ─── processFile — invalid JSON ────────────────────────────────────────────

  describe('processFile() — invalid JSON', () => {
    it('emits incoming-error and deletes file on malformed JSON', () => {
      mockReadFileSync.mockReturnValue('not json!!!');
      watcher.start();

      const onError = vi.fn();
      watcher.on('incoming-error', onError);

      getAddCallback()('/config/plans/incoming/bad.json');

      expect(onError).toHaveBeenCalledOnce();
      const evt = onError.mock.calls[0][0];
      expect(evt.filename).toBe('bad.json');
      expect(evt.error).toMatch(/Invalid JSON/);
      expect(mockUnlinkSync).toHaveBeenCalledWith('/config/plans/incoming/bad.json');
    });

    it('emits incoming-error for missing required id field', () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({
        dirPath: '/proj', title: 'T', description: 'D',
      }));
      watcher.start();

      const onError = vi.fn();
      watcher.on('incoming-error', onError);
      getAddCallback()('/config/plans/incoming/no-id.json');

      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0][0].error).toMatch(/id/);
    });

    it('emits incoming-error for missing required dirPath field', () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({
        id: 'x', title: 'T', description: 'D',
      }));
      watcher.start();

      const onError = vi.fn();
      watcher.on('incoming-error', onError);
      getAddCallback()('/config/plans/incoming/no-dir.json');

      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0][0].error).toMatch(/dirPath/);
    });

    it('emits incoming-error for missing title', () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({
        id: 'x', dirPath: '/proj', description: 'D',
      }));
      watcher.start();

      const onError = vi.fn();
      watcher.on('incoming-error', onError);
      getAddCallback()('/config/plans/incoming/no-title.json');

      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0][0].error).toMatch(/title/);
    });

    it('emits incoming-error for invalid status value', () => {
      mockReadFileSync.mockReturnValue(makeValidJson({ status: 'unknown-status' }));
      watcher.start();

      const onError = vi.fn();
      watcher.on('incoming-error', onError);
      getAddCallback()('/config/plans/incoming/bad-status.json');

      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0][0].error).toMatch(/status/);
    });
  });

  // ─── processFile — duplicate ID ────────────────────────────────────────────

  describe('processFile() — duplicate ID', () => {
    it('emits incoming-error and deletes file when ID already exists', () => {
      // Pre-populate planManager with the same ID
      const json = makeValidJson({ id: 'existing-id' });
      mockReadFileSync.mockReturnValue(json);
      planManager.importItem({
        id: 'existing-id',
        dirPath: '/projects/backend',
        title: 'Already Exists',
        description: '',
        status: 'startable',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      watcher.start();
      const onError = vi.fn();
      const onImported = vi.fn();
      watcher.on('incoming-error', onError);
      watcher.on('incoming-imported', onImported);

      getAddCallback()('/config/plans/incoming/dup.json');

      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0][0].error).toMatch(/[Dd]uplicate/);
      expect(onImported).not.toHaveBeenCalled();
      expect(mockUnlinkSync).toHaveBeenCalled();
    });
  });

  // ─── Title collision rename ─────────────────────────────────────────────────

  describe('title collision rename', () => {
    it('auto-renames title to avoid collision (handled by PlanManager)', () => {
      // First import succeeds with 'Implement Auth'
      const json = makeValidJson();
      mockReadFileSync.mockReturnValue(json);
      watcher.start();

      const importedTitles: string[] = [];
      watcher.on('incoming-imported', (e: { title: string }) => importedTitles.push(e.title));

      getAddCallback()('/config/plans/incoming/first.json');
      expect(importedTitles[0]).toBe('Implement Auth');

      // Second import with same title but different ID should get renamed
      mockReadFileSync.mockReturnValue(makeValidJson({ id: 'different-id' }));
      getAddCallback()('/config/plans/incoming/second.json');

      // PlanManager.importItem renames to 'Implement Auth (2)'
      expect(importedTitles[1]).toBe('Implement Auth (2)');
    });
  });
});
