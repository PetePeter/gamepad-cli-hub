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
  processId: 1001,
};

const mockSession2: SessionInfo = {
  id: 'session-2',
  name: 'Copilot CLI 1',
  cliType: 'copilot-cli',
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

    it('persists cliSessionName when present', () => {
      const sessionWithName: SessionInfo = {
        ...mockSession1,
        cliSessionName: 'hub-session-1',
      };
      saveSessions([sessionWithName]);

      const [, content] = (fs.writeFileSync as any).mock.calls[0];
      const parsed = YAML.parse(content);
      expect(parsed.sessions[0].cliSessionName).toBe('hub-session-1');
    });

    it('omits cliSessionName when not present', () => {
      saveSessions([mockSession1]);

      const [, content] = (fs.writeFileSync as any).mock.calls[0];
      const parsed = YAML.parse(content);
      expect(parsed.sessions[0]).not.toHaveProperty('cliSessionName');
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

    it('loads cliSessionName from persisted data', () => {
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(
        YAML.stringify({ sessions: [{ ...mockSession1, cliSessionName: 'hub-session-1' }] })
      );

      const result = loadSessions();
      expect(result[0].cliSessionName).toBe('hub-session-1');
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

  it('restoreSessions preserves custom session names', () => {
    const renamedSession: SessionInfo = {
      ...mockSession1,
      name: 'My Custom Name',
    };
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(
      YAML.stringify({ sessions: [renamedSession] })
    );

    manager.restoreSessions();

    const restored = manager.getSession(mockSession1.id);
    expect(restored?.name).toBe('My Custom Name');
  });

  it('rename + persist + restore round-trips the custom name', () => {
    manager.addSession(mockSession1);
    manager.renameSession(mockSession1.id, 'Renamed Session');

    // Capture what was written to disk
    const lastWrite = (fs.writeFileSync as any).mock.calls.at(-1);
    const savedYaml = YAML.parse(lastWrite[1]);
    expect(savedYaml.sessions[0].name).toBe('Renamed Session');

    // Simulate reload from disk
    const manager2 = new SessionManager();
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(lastWrite[1]);
    manager2.restoreSessions();

    expect(manager2.getSession(mockSession1.id)?.name).toBe('Renamed Session');
  });
});


