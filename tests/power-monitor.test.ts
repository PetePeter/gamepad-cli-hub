import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupPowerMonitor } from '../src/session/power-monitor';
import type { PowerMonitorLike } from '../src/session/power-monitor';

vi.mock('../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { logger } from '../src/utils/logger';

function createMockPowerMonitor() {
  const handlers: Record<string, () => void> = {};
  const pm: PowerMonitorLike = {
    on(event: string, cb: () => void) {
      handlers[event] = cb;
    },
  };
  return { pm, handlers };
}

function createMockSessionManager(overrides: Partial<{
  getSessionCount: () => number;
  getAllSessions: () => Array<{
    id: string; name: string; cliType: string; state: string; processId: number;
  }>;
  getActiveSession: () => { id: string } | null;
}> = {}) {
  return {
    getSessionCount: overrides.getSessionCount ?? (() => 0),
    getAllSessions: overrides.getAllSessions ?? (() => []),
    getActiveSession: overrides.getActiveSession ?? (() => null),
  } as any;
}

function createMockPtyManager(overrides: Partial<{
  getSessionIds: () => string[];
  getPid: (id: string) => number | undefined;
}> = {}) {
  return {
    getSessionIds: overrides.getSessionIds ?? (() => []),
    getPid: overrides.getPid ?? (() => undefined),
  } as any;
}

describe('setupPowerMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers three event handlers', () => {
    const { pm, handlers } = createMockPowerMonitor();
    const sm = createMockSessionManager();
    const ptm = createMockPtyManager();

    setupPowerMonitor(pm, { sessionManager: sm, ptyManager: ptm });

    expect(handlers).toHaveProperty('suspend');
    expect(handlers).toHaveProperty('resume');
    expect(handlers).toHaveProperty('shutdown');
  });

  it('onSuspend logs session details', () => {
    const { pm, handlers } = createMockPowerMonitor();
    const sm = createMockSessionManager({
      getSessionCount: () => 2,
      getAllSessions: () => [
        { id: 's1', name: 'Bash', cliType: 'bash', state: 'idle', processId: 100 },
        { id: 's2', name: 'Zsh', cliType: 'zsh', state: 'busy', processId: 200 },
      ],
      getActiveSession: () => ({ id: 's1' }),
    });
    const ptm = createMockPtyManager({ getSessionIds: () => ['s1', 's2'] });

    setupPowerMonitor(pm, { sessionManager: sm, ptyManager: ptm });
    handlers.suspend();

    const calls = (logger.info as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0]);
    expect(calls.some((m: string) => m.includes('2 sessions') && m.includes('active=s1'))).toBe(true);
    expect(calls.some((m: string) => m.includes('session s1') && m.includes('name=Bash'))).toBe(true);
    expect(calls.some((m: string) => m.includes('session s2') && m.includes('name=Zsh'))).toBe(true);
  });

  it('onSuspend logs PTY IDs', () => {
    const { pm, handlers } = createMockPowerMonitor();
    const sm = createMockSessionManager();
    const ptm = createMockPtyManager({ getSessionIds: () => ['p1', 'p2', 'p3'] });

    setupPowerMonitor(pm, { sessionManager: sm, ptyManager: ptm });
    handlers.suspend();

    const calls = (logger.info as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0]);
    expect(calls.some((m: string) => m.includes('p1') && m.includes('p2') && m.includes('p3'))).toBe(true);
  });

  it('onResume logs duration', () => {
    vi.useFakeTimers();

    const { pm, handlers } = createMockPowerMonitor();
    const sm = createMockSessionManager();
    const ptm = createMockPtyManager();

    setupPowerMonitor(pm, { sessionManager: sm, ptyManager: ptm });

    handlers.suspend();
    vi.advanceTimersByTime(75_000); // 1m 15s
    handlers.resume();

    const calls = (logger.info as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0]);
    expect(calls.some((m: string) => m.includes('1m 15s'))).toBe(true);
  });

  it('onResume checks PTY health', () => {
    const { pm, handlers } = createMockPowerMonitor();
    const sm = createMockSessionManager();
    const ptm = createMockPtyManager({
      getSessionIds: () => ['a', 'b'],
      getPid: (id: string) => (id === 'a' ? 111 : 222),
    });

    // PID 111 is alive, PID 222 is dead
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(((pid: number) => {
      if (pid === 222) throw new Error('ESRCH');
      return true;
    }) as any);

    setupPowerMonitor(pm, { sessionManager: sm, ptyManager: ptm });
    handlers.suspend();
    handlers.resume();

    const calls = (logger.info as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0]);
    expect(calls.some((m: string) => m.includes('PTY a') && m.includes('alive'))).toBe(true);
    expect(calls.some((m: string) => m.includes('PTY b') && m.includes('dead'))).toBe(true);

    killSpy.mockRestore();
  });

  it('onResume reports survival count', () => {
    const { pm, handlers } = createMockPowerMonitor();
    const sm = createMockSessionManager();
    const ptm = createMockPtyManager({
      getSessionIds: () => ['x', 'y', 'z'],
      getPid: (id: string) => ({ x: 10, y: 20, z: 30 })[id],
    });

    const killSpy = vi.spyOn(process, 'kill').mockImplementation(((pid: number) => {
      if (pid === 20) throw new Error('ESRCH');
      return true;
    }) as any);

    setupPowerMonitor(pm, { sessionManager: sm, ptyManager: ptm });
    handlers.suspend();
    handlers.resume();

    const calls = (logger.info as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0]);
    expect(calls.some((m: string) => m.includes('2/3 PTYs survived'))).toBe(true);

    killSpy.mockRestore();
  });

  it('onShutdown logs session count', () => {
    const { pm, handlers } = createMockPowerMonitor();
    const sm = createMockSessionManager({ getSessionCount: () => 5 });
    const ptm = createMockPtyManager();

    setupPowerMonitor(pm, { sessionManager: sm, ptyManager: ptm });
    handlers.shutdown();

    const calls = (logger.info as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0]);
    expect(calls.some((m: string) =>
      m.includes('shutting down') && m.includes('5 sessions active'),
    )).toBe(true);
  });

  it('onResume with no prior suspend logs unknown duration', () => {
    const { pm, handlers } = createMockPowerMonitor();
    const sm = createMockSessionManager();
    const ptm = createMockPtyManager();

    setupPowerMonitor(pm, { sessionManager: sm, ptyManager: ptm });
    // resume WITHOUT a preceding suspend
    handlers.resume();

    const calls = (logger.info as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0]);
    expect(calls.some((m: string) => m.includes('unknown'))).toBe(true);
  });
});
