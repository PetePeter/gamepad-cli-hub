import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PtyManager } from '../src/session/pty-manager';
import type { PtyProcess, PtyFactory, PtySpawnOptions } from '../src/session/pty-manager';

/** Create a mock PtyProcess with controllable callbacks. */
function createMockPty(pid = 1234): {
  pty: PtyProcess;
  triggerData: (data: string) => void;
  triggerExit: (exitCode: number) => void;
} {
  let dataCallback: ((data: string) => void) | undefined;
  let exitCallback: ((exit: { exitCode: number; signal?: number }) => void) | undefined;

  const pty: PtyProcess = {
    pid,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: (cb) => { dataCallback = cb; },
    onExit: (cb) => { exitCallback = cb; },
  };

  return {
    pty,
    triggerData: (data: string) => dataCallback?.(data),
    triggerExit: (exitCode: number) => exitCallback?.({ exitCode }),
  };
}

function createMockFactory(mockPty: PtyProcess): PtyFactory {
  return { spawn: vi.fn().mockReturnValue(mockPty) };
}

describe('PtyManager', () => {
  let manager: PtyManager;
  let mock: ReturnType<typeof createMockPty>;
  let factory: PtyFactory;

  beforeEach(() => {
    mock = createMockPty(42);
    factory = createMockFactory(mock.pty);
    manager = new PtyManager(factory);
  });

  describe('spawn', () => {
    it('creates a PTY and stores it by session ID', () => {
      manager.spawn({ sessionId: 's1', command: 'echo hello' });

      expect(manager.has('s1')).toBe(true);
      expect(manager.getPid('s1')).toBe(42);
      expect(manager.getSessionIds()).toEqual(['s1']);
    });

    it('throws if a PTY already exists for the session', () => {
      manager.spawn({ sessionId: 's1', command: 'test' });

      expect(() => manager.spawn({ sessionId: 's1', command: 'test2' })).toThrow(
        'PTY already exists for session: s1',
      );
    });

    it('writes command to PTY on spawn', () => {
      manager.spawn({ sessionId: 's1', command: 'echo', args: ['hello'] });
      expect(mock.pty.write).toHaveBeenCalledWith('echo hello\r');
    });

    it('writes command without args when args is empty', () => {
      manager.spawn({ sessionId: 's1', command: 'whoami' });
      expect(mock.pty.write).toHaveBeenCalledWith('whoami\r');
    });

    it('passes cols/rows to factory', () => {
      manager.spawn({ sessionId: 's1', command: 'test', cols: 80, rows: 24 });

      expect(factory.spawn).toHaveBeenCalledWith(
        expect.any(String),
        [],
        expect.objectContaining({ cols: 80, rows: 24 }),
      );
    });

    it('returns the PtyProcess', () => {
      const result = manager.spawn({ sessionId: 's1', command: 'test' });
      expect(result).toBe(mock.pty);
    });
  });

  describe('data events', () => {
    it('emits data event when PTY produces output', () => {
      const handler = vi.fn();
      manager.on('data', handler);
      manager.spawn({ sessionId: 's1', command: 'test' });

      mock.triggerData('hello world');

      expect(handler).toHaveBeenCalledWith('s1', 'hello world');
    });
  });

  describe('exit events', () => {
    it('emits exit event and removes PTY on exit', () => {
      const handler = vi.fn();
      manager.on('exit', handler);
      manager.spawn({ sessionId: 's1', command: 'test' });

      mock.triggerExit(0);

      expect(handler).toHaveBeenCalledWith('s1', 0);
      expect(manager.has('s1')).toBe(false);
    });
  });

  describe('write', () => {
    it('writes to the correct PTY', () => {
      manager.spawn({ sessionId: 's1', command: 'test' });
      manager.write('s1', 'input data');

      // write is called once for the command, once for our explicit write
      expect(mock.pty.write).toHaveBeenCalledWith('input data');
    });

    it('does not throw for unknown session', () => {
      expect(() => manager.write('nonexistent', 'data')).not.toThrow();
    });
  });

  describe('resize', () => {
    it('resizes the PTY', () => {
      manager.spawn({ sessionId: 's1', command: 'test' });
      manager.resize('s1', 80, 24);

      expect(mock.pty.resize).toHaveBeenCalledWith(80, 24);
    });

    it('does not throw for unknown session', () => {
      expect(() => manager.resize('nonexistent', 80, 24)).not.toThrow();
    });
  });

  describe('kill', () => {
    it('kills the PTY and removes it', () => {
      manager.spawn({ sessionId: 's1', command: 'test' });
      manager.kill('s1');

      expect(mock.pty.kill).toHaveBeenCalled();
      expect(manager.has('s1')).toBe(false);
    });

    it('does not throw for unknown session', () => {
      expect(() => manager.kill('nonexistent')).not.toThrow();
    });
  });

  describe('killAll', () => {
    it('kills all PTYs', () => {
      const mock2 = createMockPty(99);
      const multiFactory: PtyFactory = {
        spawn: vi.fn()
          .mockReturnValueOnce(mock.pty)
          .mockReturnValueOnce(mock2.pty),
      };
      const mgr = new PtyManager(multiFactory);
      mgr.spawn({ sessionId: 's1', command: 'a' });
      mgr.spawn({ sessionId: 's2', command: 'b' });

      mgr.killAll();

      expect(mock.pty.kill).toHaveBeenCalled();
      expect(mock2.pty.kill).toHaveBeenCalled();
      expect(mgr.getSessionIds()).toEqual([]);
    });
  });

  describe('getPid / has / getSessionIds', () => {
    it('returns undefined pid for unknown session', () => {
      expect(manager.getPid('nonexistent')).toBeUndefined();
    });

    it('returns false for has on unknown session', () => {
      expect(manager.has('nonexistent')).toBe(false);
    });

    it('returns empty array when no sessions', () => {
      expect(manager.getSessionIds()).toEqual([]);
    });
  });

  describe('error resilience', () => {
    it('write() catches error and does not remove PTY', () => {
      manager.spawn({ sessionId: 's1', command: 'test' });
      (mock.pty.write as any).mockImplementation(() => { throw new Error('broken pipe'); });

      expect(() => manager.write('s1', 'data')).not.toThrow();
      expect(manager.has('s1')).toBe(true); // PTY not removed
    });

    it('resize() catches error and does not remove PTY', () => {
      manager.spawn({ sessionId: 's1', command: 'test' });
      (mock.pty.resize as any).mockImplementation(() => { throw new Error('invalid handle'); });

      expect(() => manager.resize('s1', 80, 24)).not.toThrow();
      expect(manager.has('s1')).toBe(true); // PTY not removed
    });

    it('kill() catches error and still removes PTY from map', () => {
      manager.spawn({ sessionId: 's1', command: 'test' });
      (mock.pty.kill as any).mockImplementation(() => { throw new Error('already dead'); });

      expect(() => manager.kill('s1')).not.toThrow();
      expect(manager.has('s1')).toBe(false); // PTY removed despite error
    });

    it('killAll() catches errors and clears all PTYs', () => {
      const mock2 = createMockPty(99);
      const multiFactory: PtyFactory = {
        spawn: vi.fn()
          .mockReturnValueOnce(mock.pty)
          .mockReturnValueOnce(mock2.pty),
      };
      const mgr = new PtyManager(multiFactory);
      mgr.spawn({ sessionId: 's1', command: 'a' });
      mgr.spawn({ sessionId: 's2', command: 'b' });

      (mock.pty.kill as any).mockImplementation(() => { throw new Error('fail1'); });
      (mock2.pty.kill as any).mockImplementation(() => { throw new Error('fail2'); });

      expect(() => mgr.killAll()).not.toThrow();
      expect(mgr.getSessionIds()).toEqual([]);
    });

    it('spawn() catches command write error but still registers PTY', () => {
      // First call to write (the initial command) throws
      (mock.pty.write as any).mockImplementation(() => { throw new Error('write failed'); });

      // spawn should not throw — PTY is still registered
      expect(() => manager.spawn({ sessionId: 's1', command: 'test' })).not.toThrow();
      expect(manager.has('s1')).toBe(true);
    });

    it('attaches socket error handlers when internal agent exists', () => {
      const inSocket = { on: vi.fn() };
      const outSocket = { on: vi.fn() };
      const agentMock = createMockPty(42);
      (agentMock.pty as any)._agent = { _inSocket: inSocket, _outSocket: outSocket };

      const agentFactory = createMockFactory(agentMock.pty);
      const mgr = new PtyManager(agentFactory);
      mgr.spawn({ sessionId: 's1', command: 'test' });

      expect(inSocket.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(outSocket.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('skips socket error handlers when no internal agent', () => {
      // Default mock has no _agent property — should not throw
      expect(() => manager.spawn({ sessionId: 's1', command: 'test' })).not.toThrow();
    });
  });
});
