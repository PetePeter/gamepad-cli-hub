/**
 * ProcessSpawner unit tests — CLI process lifecycle management
 *
 * Tests cover: spawning with correct config, process tracking by PID,
 * retrieval/filtering, termination, exit/error event cleanup, and edge cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before imports
// ---------------------------------------------------------------------------

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('../src/config/loader.js', () => ({
  configLoader: {
    getSpawnConfig: vi.fn(),
  },
}));

vi.mock('../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { spawn } from 'node:child_process';
import { configLoader } from '../src/config/loader.js';
import { logger } from '../src/utils/logger.js';
import { processSpawner } from '../src/session/spawner.js';

// ---------------------------------------------------------------------------
// Mock process factory
// ---------------------------------------------------------------------------

function createMockProcess(pid: number = 1234) {
  const eventHandlers = new Map<string, Function[]>();
  return {
    pid,
    on: vi.fn((event: string, handler: Function) => {
      if (!eventHandlers.has(event)) eventHandlers.set(event, []);
      eventHandlers.get(event)!.push(handler);
    }),
    kill: vi.fn(),
    unref: vi.fn(),
    /** Trigger a registered event handler in tests */
    _emit(event: string, ...args: unknown[]) {
      for (const handler of eventHandlers.get(event) ?? []) {
        handler(...args);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProcessSpawner', () => {
  let mockProcess: ReturnType<typeof createMockProcess>;

  beforeEach(() => {
    // Clear tracked processes from the previous test, then reset mocks
    processSpawner.killAll();
    vi.clearAllMocks();

    mockProcess = createMockProcess(1234);
    vi.mocked(spawn).mockReturnValue(mockProcess as any);
    vi.mocked(configLoader.getSpawnConfig).mockReturnValue({
      command: 'wt',
      args: ['-w', '0', 'cc'],
    });
  });

  // =========================================================================
  // Spawning
  // =========================================================================

  describe('spawn', () => {
    it('calls child_process.spawn with correct args from config', () => {
      processSpawner.spawn('claude-code');

      expect(spawn).toHaveBeenCalledWith(
        'wt',
        ['-w', '0', 'cc'],
        expect.objectContaining({
          detached: true,
          stdio: 'ignore',
          shell: true,
        }),
      );
    });

    it('stores process with correct metadata', () => {
      const before = new Date();
      const result = processSpawner.spawn('claude-code');
      const after = new Date();

      expect(result).not.toBeNull();
      expect(result!.cliType).toBe('claude-code');
      expect(result!.command).toBe('wt');
      expect(result!.args).toEqual(['-w', '0', 'cc']);
      expect(result!.pid).toBe(1234);
      expect(result!.spawnedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result!.spawnedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('returns null when configLoader has no spawn config for CLI type', () => {
      vi.mocked(configLoader.getSpawnConfig).mockReturnValue(null);

      const result = processSpawner.spawn('unknown-cli');

      expect(result).toBeNull();
      expect(spawn).not.toHaveBeenCalled();
    });

    it('passes working directory when provided', () => {
      processSpawner.spawn('claude-code', 'X:\\coding\\project');

      expect(spawn).toHaveBeenCalledWith(
        'wt',
        ['-w', '0', 'cc'],
        expect.objectContaining({ cwd: 'X:\\coding\\project' }),
      );
    });

    it('spawns with detached:true, stdio:ignore, shell:true', () => {
      processSpawner.spawn('claude-code');

      const options = vi.mocked(spawn).mock.calls[0][2] as Record<string, unknown>;
      expect(options.detached).toBe(true);
      expect(options.stdio).toBe('ignore');
      expect(options.shell).toBe(true);
    });

    it('calls process.unref()', () => {
      processSpawner.spawn('claude-code');

      expect(mockProcess.unref).toHaveBeenCalledOnce();
    });

    it('tracks process in internal Map after spawn', () => {
      processSpawner.spawn('claude-code');

      const all = processSpawner.getAllProcesses();
      expect(all).toHaveLength(1);
      expect(all[0].pid).toBe(1234);
      expect(all[0].cliType).toBe('claude-code');
      expect(processSpawner.getProcess(1234)).toBeDefined();
    });
  });

  // =========================================================================
  // Retrieval
  // =========================================================================

  describe('getProcess', () => {
    it('returns process by PID', () => {
      processSpawner.spawn('claude-code');

      const found = processSpawner.getProcess(1234);

      expect(found).toBeDefined();
      expect(found!.pid).toBe(1234);
      expect(found!.cliType).toBe('claude-code');
    });

    it('returns undefined for non-existent PID', () => {
      expect(processSpawner.getProcess(9999)).toBeUndefined();
    });
  });

  describe('getAllProcesses', () => {
    it('returns all tracked processes', () => {
      const mock1 = createMockProcess(1001);
      const mock2 = createMockProcess(1002);
      vi.mocked(spawn)
        .mockReturnValueOnce(mock1 as any)
        .mockReturnValueOnce(mock2 as any);

      processSpawner.spawn('claude-code');
      processSpawner.spawn('copilot-cli');

      const all = processSpawner.getAllProcesses();
      expect(all).toHaveLength(2);
      expect(all.map((p) => p.pid)).toContain(1001);
      expect(all.map((p) => p.pid)).toContain(1002);
    });
  });

  describe('getProcessesByCliType', () => {
    it('filters correctly', () => {
      const mock1 = createMockProcess(1001);
      const mock2 = createMockProcess(1002);
      const mock3 = createMockProcess(1003);
      vi.mocked(spawn)
        .mockReturnValueOnce(mock1 as any)
        .mockReturnValueOnce(mock2 as any)
        .mockReturnValueOnce(mock3 as any);

      processSpawner.spawn('claude-code');
      processSpawner.spawn('copilot-cli');
      processSpawner.spawn('claude-code');

      const filtered = processSpawner.getProcessesByCliType('claude-code');
      expect(filtered).toHaveLength(2);
      expect(filtered.every((p) => p.cliType === 'claude-code')).toBe(true);
    });

    it('returns empty array for unknown type', () => {
      processSpawner.spawn('claude-code');

      expect(processSpawner.getProcessesByCliType('unknown')).toEqual([]);
    });
  });

  // =========================================================================
  // Termination
  // =========================================================================

  describe('kill', () => {
    it('calls process.kill() and removes from tracking', () => {
      processSpawner.spawn('claude-code');

      const result = processSpawner.kill(1234);

      expect(result).toBe(true);
      expect(mockProcess.kill).toHaveBeenCalledOnce();

      // Simulate the OS-level exit event that follows a kill signal
      mockProcess._emit('exit', null);
      expect(processSpawner.getProcess(1234)).toBeUndefined();
    });

    it('returns false for non-existent PID', () => {
      expect(processSpawner.kill(9999)).toBe(false);
    });
  });

  describe('killAll', () => {
    it('terminates all and clears map', () => {
      const mock1 = createMockProcess(1001);
      const mock2 = createMockProcess(1002);
      vi.mocked(spawn)
        .mockReturnValueOnce(mock1 as any)
        .mockReturnValueOnce(mock2 as any);

      processSpawner.spawn('claude-code');
      processSpawner.spawn('copilot-cli');

      processSpawner.killAll();

      expect(mock1.kill).toHaveBeenCalledOnce();
      expect(mock2.kill).toHaveBeenCalledOnce();
      expect(processSpawner.getAllProcesses()).toHaveLength(0);
    });
  });

  // =========================================================================
  // Event Handling
  // =========================================================================

  describe('event handling', () => {
    it('process exit event removes process from tracking', () => {
      processSpawner.spawn('claude-code');
      expect(processSpawner.getProcess(1234)).toBeDefined();

      mockProcess._emit('exit', 0);

      expect(processSpawner.getProcess(1234)).toBeUndefined();
      expect(logger.info).toHaveBeenCalledWith(
        'Process 1234 exited with code 0',
      );
    });

    it('process error event removes process from tracking', () => {
      processSpawner.spawn('claude-code');
      expect(processSpawner.getProcess(1234)).toBeDefined();

      mockProcess._emit('error', new Error('spawn ENOENT'));

      expect(processSpawner.getProcess(1234)).toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to spawn claude-code: spawn ENOENT',
      );
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('edge cases', () => {
    it('multiple spawns of same CLI type tracked independently', () => {
      const mock1 = createMockProcess(2001);
      const mock2 = createMockProcess(2002);
      vi.mocked(spawn)
        .mockReturnValueOnce(mock1 as any)
        .mockReturnValueOnce(mock2 as any);

      const p1 = processSpawner.spawn('claude-code');
      const p2 = processSpawner.spawn('claude-code');

      expect(p1!.pid).toBe(2001);
      expect(p2!.pid).toBe(2002);
      expect(processSpawner.getAllProcesses()).toHaveLength(2);
      expect(processSpawner.getProcess(2001)).toBeDefined();
      expect(processSpawner.getProcess(2002)).toBeDefined();
    });
  });
});
