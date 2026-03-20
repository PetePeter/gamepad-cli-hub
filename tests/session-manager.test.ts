/**
 * Session Manager happy path tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../src/session/manager.js';
import type { SessionInfo } from '../src/types/session.js';

describe('SessionManager - Happy Path', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  describe('addSession', () => {
    it('adds a session and sets it as active when it is the first session', () => {
      const session: SessionInfo = {
        id: 'session-1',
        cliType: 'claude-code',
        processId: 1234,
        windowTitle: 'Claude Code Terminal',
      };

      manager.addSession(session);

      expect(manager.getSessionCount()).toBe(1);
      expect(manager.getActiveSession()).toEqual(session);
      expect(manager.hasSession('session-1')).toBe(true);
    });

    it('adds multiple sessions in order', () => {
      const session1: SessionInfo = {
        id: 'session-1',
        cliType: 'claude-code',
        processId: 1234,
        windowTitle: 'Claude Code Terminal 1',
      };
      const session2: SessionInfo = {
        id: 'session-2',
        cliType: 'copilot-cli',
        processId: 5678,
        windowTitle: 'Copilot CLI Terminal',
      };

      manager.addSession(session1);
      manager.addSession(session2);

      expect(manager.getSessionCount()).toBe(2);
      const allSessions = manager.getAllSessions();
      expect(allSessions).toHaveLength(2);
      expect(allSessions[0].id).toBe('session-1');
      expect(allSessions[1].id).toBe('session-2');
    });
  });

  describe('setActiveSession and getActiveSession', () => {
    it('sets and retrieves the active session', () => {
      const session1: SessionInfo = {
        id: 'session-1',
        cliType: 'claude-code',
        processId: 1234,
        windowTitle: 'Claude Code Terminal',
      };
      const session2: SessionInfo = {
        id: 'session-2',
        cliType: 'copilot-cli',
        processId: 5678,
        windowTitle: 'Copilot CLI Terminal',
      };

      manager.addSession(session1);
      manager.addSession(session2);

      expect(manager.getActiveSession()?.id).toBe('session-1');

      manager.setActiveSession('session-2');
      expect(manager.getActiveSession()?.id).toBe('session-2');
    });
  });

  describe('nextSession and previousSession', () => {
    it('cycles through sessions in order', () => {
      const sessions: SessionInfo[] = [
        { id: 'session-1', cliType: 'claude-code', processId: 1234, windowTitle: 'Terminal 1' },
        { id: 'session-2', cliType: 'copilot-cli', processId: 5678, windowTitle: 'Terminal 2' },
        { id: 'session-3', cliType: 'generic-terminal', processId: 9012, windowTitle: 'Terminal 3' },
      ];

      sessions.forEach(s => manager.addSession(s));

      // Start at session-1 (first session is auto-activated)
      expect(manager.getActiveSession()?.id).toBe('session-1');

      // Move to next
      manager.nextSession();
      expect(manager.getActiveSession()?.id).toBe('session-2');

      manager.nextSession();
      expect(manager.getActiveSession()?.id).toBe('session-3');

      // Wrap around to beginning
      manager.nextSession();
      expect(manager.getActiveSession()?.id).toBe('session-1');

      // Go backwards
      manager.previousSession();
      expect(manager.getActiveSession()?.id).toBe('session-3');
    });
  });

  describe('removeSession', () => {
    it('removes a session and updates active session if needed', () => {
      const session1: SessionInfo = {
        id: 'session-1',
        cliType: 'claude-code',
        processId: 1234,
        windowTitle: 'Claude Code Terminal',
      };
      const session2: SessionInfo = {
        id: 'session-2',
        cliType: 'copilot-cli',
        processId: 5678,
        windowTitle: 'Copilot CLI Terminal',
      };

      manager.addSession(session1);
      manager.addSession(session2);

      expect(manager.getSessionCount()).toBe(2);

      manager.removeSession('session-1');

      expect(manager.getSessionCount()).toBe(1);
      expect(manager.hasSession('session-1')).toBe(false);
      expect(manager.getActiveSession()?.id).toBe('session-2');
    });

    it('sets active session to null when last session is removed', () => {
      const session: SessionInfo = {
        id: 'session-1',
        cliType: 'claude-code',
        processId: 1234,
        windowTitle: 'Claude Code Terminal',
      };

      manager.addSession(session);
      manager.removeSession('session-1');

      expect(manager.getSessionCount()).toBe(0);
      expect(manager.getActiveSession()).toBeNull();
    });
  });

  describe('getSession', () => {
    it('retrieves a session by id', () => {
      const session: SessionInfo = {
        id: 'session-1',
        cliType: 'claude-code',
        processId: 1234,
        windowTitle: 'Claude Code Terminal',
      };

      manager.addSession(session);

      const retrieved = manager.getSession('session-1');
      expect(retrieved).toEqual(session);

      const notFound = manager.getSession('non-existent');
      expect(notFound).toBeNull();
    });
  });

  describe('clear', () => {
    it('clears all sessions', () => {
      const sessions: SessionInfo[] = [
        { id: 'session-1', cliType: 'claude-code', processId: 1234, windowTitle: 'Terminal 1' },
        { id: 'session-2', cliType: 'copilot-cli', processId: 5678, windowTitle: 'Terminal 2' },
      ];

      sessions.forEach(s => manager.addSession(s));

      expect(manager.getSessionCount()).toBe(2);

      manager.clear();

      expect(manager.getSessionCount()).toBe(0);
      expect(manager.getActiveSession()).toBeNull();
    });
  });
});
