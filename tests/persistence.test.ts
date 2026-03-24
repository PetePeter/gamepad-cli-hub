/**
 * Session persistence & crash recovery unit tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveSessions, loadSessions, clearPersistedSessions } from '../src/session/persistence.js';
import { SessionManager } from '../src/session/manager.js';
import type { SessionInfo } from '../src/types/session.js';
import * as fs from 'node:fs';
import * as YAML from 'yaml';

// Mock fs so we never touch the real filesystem
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

// Mock logger to silence output during tests
vi.mock('../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockSession1: SessionInfo = {
  id: 'session-1',
  name: 'Claude Code 1',
  cliType: 'claude-code',
  windowHandle: 12345,
  processId: 1001,
};

const mockSession2: SessionInfo = {
  id: 'session-2',
  name: 'Copilot CLI 1',
  cliType: 'copilot-cli',
  windowHandle: 67890,
  processId: 1002,
};

describe('persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('saveSessions', () => {
    it('writes sessions as YAML to the sessions file', () => {
      saveSessions([mockSession1, mockSession2]);

      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      const [, content] = (fs.writeFileSync as any).mock.calls[0];
      const parsed = YAML.parse(content);
      expect(parsed.sessions).toHaveLength(2);
      expect(parsed.sessions[0]).toEqual({
        id: 'session-1',
        name: 'Claude Code 1',
        cliType: 'claude-code',
        processId: 1001,
        windowHandle: 12345,
      });
    });

    it('writes empty sessions array', () => {
      saveSessions([]);

      const [, content] = (fs.writeFileSync as any).mock.calls[0];
      const parsed = YAML.parse(content);
      expect(parsed.sessions).toEqual([]);
    });

    it('does not throw when writeFileSync fails', () => {
      (fs.writeFileSync as any).mockImplementation(() => {
        throw new Error('disk full');
      });

      expect(() => saveSessions([mockSession1])).not.toThrow();
    });
  });

  describe('loadSessions', () => {
    it('returns empty array when file does not exist', () => {
      (fs.existsSync as any).mockReturnValue(false);

      expect(loadSessions()).toEqual([]);
    });

    it('parses YAML and returns sessions', () => {
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(
        YAML.stringify({ sessions: [mockSession1] })
      );

      const result = loadSessions();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('session-1');
    });

    it('returns empty array when file has no sessions key', () => {
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(YAML.stringify({ other: 'data' }));

      expect(loadSessions()).toEqual([]);
    });

    it('returns empty array when file is corrupt', () => {
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockImplementation(() => {
        throw new Error('bad encoding');
      });

      expect(loadSessions()).toEqual([]);
    });
  });

  describe('clearPersistedSessions', () => {
    it('writes empty sessions when file exists', () => {
      (fs.existsSync as any).mockReturnValue(true);

      clearPersistedSessions();

      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      const [, content] = (fs.writeFileSync as any).mock.calls[0];
      const parsed = YAML.parse(content);
      expect(parsed.sessions).toEqual([]);
    });

    it('does nothing when file does not exist', () => {
      (fs.existsSync as any).mockReturnValue(false);

      clearPersistedSessions();

      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });
});

describe('SessionManager persistence integration', () => {
  let manager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SessionManager();
  });

  it('persists after addSession', () => {
    manager.addSession(mockSession1);

    // saveSessions is called, which calls writeFileSync
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('persists after removeSession', () => {
    manager.addSession(mockSession1);
    manager.addSession(mockSession2);
    vi.clearAllMocks();

    manager.removeSession(mockSession1.id);

    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('persists after setActiveSession changes active', () => {
    manager.addSession(mockSession1);
    manager.addSession(mockSession2);
    vi.clearAllMocks();

    manager.setActiveSession(mockSession2.id);

    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('persists after clear', () => {
    manager.addSession(mockSession1);
    vi.clearAllMocks();

    manager.clear();

    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('restoreSessions loads and adds sessions from disk', () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(
      YAML.stringify({ sessions: [mockSession1, mockSession2] })
    );

    const restored = manager.restoreSessions();

    expect(restored).toHaveLength(2);
    expect(manager.getSessionCount()).toBe(2);
    expect(manager.getSession(mockSession1.id)).toMatchObject({ id: 'session-1' });
    expect(manager.getSession(mockSession2.id)).toMatchObject({ id: 'session-2' });
  });

  it('restoreSessions skips sessions that already exist', () => {
    manager.addSession(mockSession1);
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(
      YAML.stringify({ sessions: [mockSession1, mockSession2] })
    );

    manager.restoreSessions();

    expect(manager.getSessionCount()).toBe(2);
  });

  it('restoreSessions returns empty array when nothing persisted', () => {
    (fs.existsSync as any).mockReturnValue(false);

    const restored = manager.restoreSessions();

    expect(restored).toEqual([]);
    expect(manager.getSessionCount()).toBe(0);
  });
});

describe('SessionManager health check', () => {
  let manager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    manager = new SessionManager();
  });

  afterEach(() => {
    manager.stopHealthCheck();
    vi.useRealTimers();
  });

  it('removes sessions with dead processes', () => {
    manager.addSession(mockSession1);
    expect(manager.getSessionCount()).toBe(1);

    // Mock process.kill to throw (= process is dead)
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH');
    });

    manager.startHealthCheck(1000);
    vi.advanceTimersByTime(1000);

    expect(manager.getSessionCount()).toBe(0);
    killSpy.mockRestore();
  });

  it('keeps sessions with alive processes', () => {
    manager.addSession(mockSession1);

    // Mock process.kill to succeed (= process is alive)
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true as any);

    manager.startHealthCheck(1000);
    vi.advanceTimersByTime(1000);

    expect(manager.getSessionCount()).toBe(1);
    killSpy.mockRestore();
  });

  it('stopHealthCheck stops the interval', () => {
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH');
    });

    manager.addSession(mockSession1);
    manager.startHealthCheck(1000);
    manager.stopHealthCheck();

    vi.advanceTimersByTime(5000);

    // Session should still be there because health check was stopped
    expect(manager.getSessionCount()).toBe(1);
    killSpy.mockRestore();
  });
});
