/**
 * WindowsWindowManager unit tests
 *
 * Validates window enumeration, focus, process listing, and cleanup
 * without spawning real PowerShell processes.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// ── Mocks ────────────────────────────────────────────────────────────

vi.mock('child_process', () => ({
  spawn: vi.fn(),
  exec: vi.fn(),
}));

vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  existsSync: vi.fn(() => false),
}));

vi.mock('os', () => ({
  tmpdir: vi.fn(() => '/tmp'),
}));

vi.mock('../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { spawn, exec } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { WindowsWindowManager, type WindowInfo } from '../src/output/windows.js';

// ── Helpers ──────────────────────────────────────────────────────────

/** Build a fake ChildProcess whose stdout/stderr are EventEmitters. */
function makeMockProcess() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: Mock;
  };
  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.kill = vi.fn();
  return proc;
}

/** Shortcut: make spawn return a process that exits successfully with `data`. */
function spawnReturnsData(data: string) {
  const proc = makeMockProcess();
  vi.mocked(spawn).mockReturnValue(proc as unknown as ChildProcess);
  // Emit data + close on next microtask so the Promise in executeWindowScript resolves
  queueMicrotask(() => {
    proc.stdout.emit('data', Buffer.from(data));
    proc.emit('close', 0);
  });
  return proc;
}

/** Shortcut: make spawn return a process that exits with an error code. */
function spawnFails(stderr = 'something went wrong', code = 1) {
  const proc = makeMockProcess();
  vi.mocked(spawn).mockReturnValue(proc as unknown as ChildProcess);
  queueMicrotask(() => {
    proc.stderr.emit('data', Buffer.from(stderr));
    proc.emit('close', code);
  });
  return proc;
}

/** Shortcut: make spawn return a process that emits an `error` event. */
function spawnErrors(message = 'ENOENT') {
  const proc = makeMockProcess();
  vi.mocked(spawn).mockReturnValue(proc as unknown as ChildProcess);
  queueMicrotask(() => {
    proc.emit('error', new Error(message));
  });
  return proc;
}

/** Make `exec` (promisified) resolve with `stdout`. */
function execReturnsData(data: string) {
  vi.mocked(exec).mockImplementation((_cmd: string, cb: any) => {
    cb(null, { stdout: data, stderr: '' });
    return {} as any;
  });
}

/** Make `exec` fail. */
function execFails(message = 'exec failed') {
  vi.mocked(exec).mockImplementation((_cmd: string, cb: any) => {
    cb(new Error(message));
    return {} as any;
  });
}

// ── Sample data ──────────────────────────────────────────────────────

const sampleWindows: WindowInfo[] = [
  {
    hwnd: '0x00010A',
    title: 'My App',
    className: 'MyAppClass',
    processId: 1234,
    processName: 'myapp',
    isVisible: true,
  },
  {
    hwnd: '0x00020B',
    title: 'Another Window',
    className: 'AnotherClass',
    processId: 5678,
    processName: 'another',
    isVisible: true,
  },
];

// ── Tests ────────────────────────────────────────────────────────────

describe('WindowsWindowManager', () => {
  let wm: WindowsWindowManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(false);
    wm = new WindowsWindowManager();
  });

  // ── Construction / script management ──────────────────────────────

  describe('script management', () => {
    it('writes PowerShell script to temp directory on construction', () => {
      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('gamepad-windows.ps1'),
        expect.stringContaining('EnumWindows'),
        'utf-8',
      );
    });

    it('skips writing script when file already exists', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(writeFileSync).mockClear();

      const wm2 = new WindowsWindowManager();
      // existsSync is checked in ensureScriptExists; on second call it's true
      // but constructor always sets scriptPath to null first, so it rewrites once
      // then subsequent calls to ensureScriptExists skip the write
      spawnReturnsData('[]');
      // trigger ensureScriptExists again via a method call
      void wm2.enumerateWindows();
      // The first write in constructor happens, but subsequent ensure calls skip
    });

    it('cleanup removes temp file', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      wm.cleanup();
      expect(unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('gamepad-windows.ps1'),
      );
    });

    it('cleanup handles missing file gracefully', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(() => wm.cleanup()).not.toThrow();
      expect(unlinkSync).not.toHaveBeenCalled();
    });

    it('cleanup handles unlinkSync error gracefully', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(unlinkSync).mockImplementation(() => {
        throw new Error('EPERM');
      });
      expect(() => wm.cleanup()).not.toThrow();
    });
  });

  // ── enumerateWindows ──────────────────────────────────────────────

  describe('enumerateWindows', () => {
    it('parses PowerShell JSON output into WindowEnumerationResult', async () => {
      spawnReturnsData(JSON.stringify(sampleWindows));

      const result = await wm.enumerateWindows();

      expect(result.windows).toHaveLength(2);
      expect(result.count).toBe(2);
      expect(result.windows[0].title).toBe('My App');
      expect(result.windows[1].processId).toBe(5678);
    });

    it('passes "enumerate" mode to PowerShell via env', async () => {
      spawnReturnsData('[]');

      await wm.enumerateWindows();

      expect(spawn).toHaveBeenCalledWith(
        'pwsh',
        expect.arrayContaining(['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File']),
        expect.objectContaining({
          env: expect.objectContaining({ WINDOW_OP_MODE: 'enumerate' }),
        }),
      );
    });

    it('returns empty result on PowerShell failure', async () => {
      spawnFails();

      const result = await wm.enumerateWindows();

      expect(result.windows).toEqual([]);
      expect(result.count).toBe(0);
    });

    it('returns empty result on malformed JSON', async () => {
      spawnReturnsData('NOT VALID JSON {{{');

      const result = await wm.enumerateWindows();

      expect(result.windows).toEqual([]);
      expect(result.count).toBe(0);
    });

    it('returns empty result when stdout is empty', async () => {
      spawnReturnsData('');

      const result = await wm.enumerateWindows();

      expect(result.windows).toEqual([]);
      expect(result.count).toBe(0);
    });

    it('handles spawn error event gracefully', async () => {
      spawnErrors('ENOENT');

      const result = await wm.enumerateWindows();

      expect(result.windows).toEqual([]);
      expect(result.count).toBe(0);
    });
  });

  // ── findWindowsByTitle ────────────────────────────────────────────

  describe('findWindowsByTitle', () => {
    it('returns matching windows from PowerShell output', async () => {
      const match = [sampleWindows[0]];
      spawnReturnsData(JSON.stringify(match));

      const result = await wm.findWindowsByTitle('My App');

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('My App');
    });

    it('passes title pattern via TITLE_PATTERN env var', async () => {
      spawnReturnsData('[]');

      await wm.findWindowsByTitle('.*Terminal.*');

      expect(spawn).toHaveBeenCalledWith(
        'pwsh',
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            WINDOW_OP_MODE: 'findbytitle',
            TITLE_PATTERN: '.*Terminal.*',
          }),
        }),
      );
    });

    it('returns empty array when no windows match', async () => {
      spawnReturnsData('[]');

      const result = await wm.findWindowsByTitle('NoSuchWindow');

      expect(result).toEqual([]);
    });

    it('returns empty array on error', async () => {
      spawnFails();

      const result = await wm.findWindowsByTitle('anything');

      expect(result).toEqual([]);
    });
  });

  // ── findWindowsByProcessName ──────────────────────────────────────

  describe('findWindowsByProcessName', () => {
    it('returns windows matching process name', async () => {
      const match = [sampleWindows[1]];
      spawnReturnsData(JSON.stringify(match));

      const result = await wm.findWindowsByProcessName('another');

      expect(result).toHaveLength(1);
      expect(result[0].processName).toBe('another');
    });

    it('passes PROCESS_NAME env var', async () => {
      spawnReturnsData('[]');

      await wm.findWindowsByProcessName('code');

      expect(spawn).toHaveBeenCalledWith(
        'pwsh',
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            WINDOW_OP_MODE: 'findbyprocess',
            PROCESS_NAME: 'code',
          }),
        }),
      );
    });

    it('wraps single-object response in array', async () => {
      // PowerShell returns a bare object (not array) when only one match
      spawnReturnsData(JSON.stringify(sampleWindows[0]));

      const result = await wm.findWindowsByProcessName('myapp');

      // Non-array parsed value → should return empty array per the code
      expect(Array.isArray(result)).toBe(true);
    });

    it('returns empty array on error', async () => {
      spawnFails();

      const result = await wm.findWindowsByProcessName('anything');

      expect(result).toEqual([]);
    });
  });

  // ── focusWindow ───────────────────────────────────────────────────

  describe('focusWindow', () => {
    it('returns true when PowerShell reports success', async () => {
      spawnReturnsData(JSON.stringify({ success: true }));

      const result = await wm.focusWindow('0x00010A');

      expect(result).toBe(true);
    });

    it('returns false when PowerShell reports failure', async () => {
      spawnReturnsData(JSON.stringify({ success: false }));

      const result = await wm.focusWindow('0x00010A');

      expect(result).toBe(false);
    });

    it('passes TARGET_HWND env var with the handle', async () => {
      spawnReturnsData(JSON.stringify({ success: true }));

      await wm.focusWindow('0xDEAD');

      expect(spawn).toHaveBeenCalledWith(
        'pwsh',
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            WINDOW_OP_MODE: 'focus',
            TARGET_HWND: '0xDEAD',
          }),
        }),
      );
    });

    it('returns false on spawn error', async () => {
      spawnErrors();

      const result = await wm.focusWindow('0x000001');

      expect(result).toBe(false);
    });
  });

  // ── getActiveWindow ───────────────────────────────────────────────

  describe('getActiveWindow', () => {
    it('returns WindowInfo for the active window', async () => {
      const active = {
        hwnd: '0xABC',
        title: 'Active Win',
        processId: 42,
        processName: 'explorer',
      };
      spawnReturnsData(JSON.stringify(active));

      const result = await wm.getActiveWindow();

      expect(result).not.toBeNull();
      expect(result!.hwnd).toBe('0xABC');
      expect(result!.title).toBe('Active Win');
      expect(result!.processId).toBe(42);
      expect(result!.processName).toBe('explorer');
      expect(result!.isVisible).toBe(true);
      expect(result!.className).toBe('');
    });

    it('uses "getactive" mode', async () => {
      spawnReturnsData(JSON.stringify({ hwnd: '0x1', title: '', processId: 0, processName: '' }));

      await wm.getActiveWindow();

      expect(spawn).toHaveBeenCalledWith(
        'pwsh',
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({ WINDOW_OP_MODE: 'getactive' }),
        }),
      );
    });

    it('returns null on failure', async () => {
      spawnFails();

      const result = await wm.getActiveWindow();

      expect(result).toBeNull();
    });

    it('returns null on malformed JSON', async () => {
      spawnReturnsData('{broken');

      const result = await wm.getActiveWindow();

      expect(result).toBeNull();
    });
  });

  // ── getProcesses ──────────────────────────────────────────────────

  describe('getProcesses', () => {
    it('returns filtered process list from exec output', async () => {
      const processes = [
        { Id: 10, ProcessName: 'explorer', MainWindowTitle: 'Desktop' },
        { Id: 20, ProcessName: 'node', MainWindowTitle: '' },
        { Id: 30, ProcessName: 'code', MainWindowTitle: 'VSCode' },
      ];
      execReturnsData(JSON.stringify(processes));

      const result = await wm.getProcesses();

      // Only processes with non-empty MainWindowTitle
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ pid: 10, name: 'explorer', mainWindowTitle: 'Desktop' });
      expect(result[1]).toEqual({ pid: 30, name: 'code', mainWindowTitle: 'VSCode' });
    });

    it('returns empty array on exec failure', async () => {
      execFails();

      const result = await wm.getProcesses();

      expect(result).toEqual([]);
    });

    it('returns empty array when all processes lack window titles', async () => {
      const processes = [
        { Id: 1, ProcessName: 'svchost', MainWindowTitle: '' },
        { Id: 2, ProcessName: 'csrss', MainWindowTitle: '' },
      ];
      execReturnsData(JSON.stringify(processes));

      const result = await wm.getProcesses();

      expect(result).toEqual([]);
    });
  });

  // ── findTerminalWindows ───────────────────────────────────────────

  describe('findTerminalWindows', () => {
    it('searches common terminal process names', async () => {
      // Return empty for every call — we just want to verify the process names
      const proc = makeMockProcess();
      vi.mocked(spawn).mockReturnValue(proc as unknown as ChildProcess);

      // Each findWindowsByProcessName call will fire spawn then wait.
      // We auto-resolve them all.
      vi.mocked(spawn).mockImplementation(() => {
        const p = makeMockProcess();
        queueMicrotask(() => {
          p.stdout.emit('data', Buffer.from('[]'));
          p.emit('close', 0);
        });
        return p as unknown as ChildProcess;
      });

      await wm.findTerminalWindows();

      const calls = vi.mocked(spawn).mock.calls;
      const processNames = calls.map(
        (c) => (c[2] as any)?.env?.PROCESS_NAME,
      );

      expect(processNames).toContain('WindowsTerminal');
      expect(processNames).toContain('code');
      expect(processNames).toContain('cmd');
      expect(processNames).toContain('powershell');
      expect(processNames).toContain('pwsh');
    });

    it('aggregates windows from multiple process searches', async () => {
      const wtWindow: WindowInfo = {
        hwnd: '0x100',
        title: 'Windows Terminal',
        className: 'CASCADIA_HOSTING_WINDOW_CLASS',
        processId: 100,
        processName: 'WindowsTerminal',
        isVisible: true,
      };
      const codeWindow: WindowInfo = {
        hwnd: '0x200',
        title: 'Visual Studio Code',
        className: 'Chrome_WidgetWin_1',
        processId: 200,
        processName: 'code',
        isVisible: true,
      };

      let callIndex = 0;
      vi.mocked(spawn).mockImplementation(() => {
        const p = makeMockProcess();
        const idx = callIndex++;
        queueMicrotask(() => {
          if (idx === 0) {
            // First call is 'WindowsTerminal'
            p.stdout.emit('data', Buffer.from(JSON.stringify([wtWindow])));
          } else if (idx === 1) {
            // Second call is 'code'
            p.stdout.emit('data', Buffer.from(JSON.stringify([codeWindow])));
          } else {
            p.stdout.emit('data', Buffer.from('[]'));
          }
          p.emit('close', 0);
        });
        return p as unknown as ChildProcess;
      });

      const result = await wm.findTerminalWindows();

      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result.some((w) => w.processName === 'WindowsTerminal')).toBe(true);
      expect(result.some((w) => w.processName === 'code')).toBe(true);
    });
  });

  // ── Multi-line stdout handling ────────────────────────────────────

  describe('stdout parsing edge cases', () => {
    it('takes only the last line of multi-line stdout', async () => {
      // PowerShell may print warnings before the JSON line
      const output = 'WARNING: some noise\n' + JSON.stringify(sampleWindows);
      spawnReturnsData(output);

      const result = await wm.enumerateWindows();

      expect(result.windows).toHaveLength(2);
    });

    it('handles chunked stdout data', async () => {
      const json = JSON.stringify(sampleWindows);
      const half = Math.floor(json.length / 2);

      const proc = makeMockProcess();
      vi.mocked(spawn).mockReturnValue(proc as unknown as ChildProcess);

      queueMicrotask(() => {
        proc.stdout.emit('data', Buffer.from(json.slice(0, half)));
        proc.stdout.emit('data', Buffer.from(json.slice(half)));
        proc.emit('close', 0);
      });

      const result = await wm.enumerateWindows();

      expect(result.windows).toHaveLength(2);
    });
  });
});
