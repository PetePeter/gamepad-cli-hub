/**
 * TopicManager unit tests
 *
 * Tests: ensureTopic, ensureAllTopics, close/rename, lookup,
 * topic naming with instance prefix, persistence.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TopicManager } from '../src/telegram/topic-manager.js';
import type { SessionInfo } from '../src/types/session.js';

// ---------------------------------------------------------------------------
// Mock persistence — prevent real disk writes
// ---------------------------------------------------------------------------

vi.mock('../src/session/persistence.js', () => ({
  saveSessions: vi.fn(),
}));

import { saveSessions } from '../src/session/persistence.js';

// ---------------------------------------------------------------------------
// Helpers: mock bot + mock session manager
// ---------------------------------------------------------------------------

function makeMockBot() {
  return {
    createForumTopic: vi.fn().mockResolvedValue({ message_thread_id: 100, name: 'topic' }),
    closeForumTopic: vi.fn().mockResolvedValue(true),
    reopenForumTopic: vi.fn().mockResolvedValue(true),
    editForumTopic: vi.fn().mockResolvedValue(true),
    sendToTopic: vi.fn().mockResolvedValue({ message_id: 1 }),
    sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
    isRunning: vi.fn().mockReturnValue(true),
  };
}

function makeSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    id: 'sess-1',
    name: 'my-session',
    cliType: 'claude-code',
    processId: 1234,
    workingDir: '/projects/app',
    ...overrides,
  };
}

function makeMockSessionManager(sessions: SessionInfo[]) {
  const sessionMap = new Map(sessions.map(s => [s.id, s]));
  return {
    getAllSessions: vi.fn(() => [...sessionMap.values()]),
    getSession: vi.fn((id: string) => sessionMap.get(id) ?? null),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TopicManager', () => {
  let bot: ReturnType<typeof makeMockBot>;
  let session: SessionInfo;
  let sessionManager: ReturnType<typeof makeMockSessionManager>;
  let tm: TopicManager;

  beforeEach(() => {
    vi.clearAllMocks();
    bot = makeMockBot();
    session = makeSession();
    sessionManager = makeMockSessionManager([session]);
    tm = new TopicManager(bot as any, sessionManager as any, 'Home');
  });

  // =========================================================================
  // ensureTopic
  // =========================================================================

  describe('ensureTopic', () => {
    it('creates a new topic when session has no topicId', async () => {
      const topicId = await tm.ensureTopic(session);

      expect(topicId).toBe(100);
      expect(bot.createForumTopic).toHaveBeenCalledWith('[Home] my-session');
      // Should send initial info message to the new topic
      expect(bot.sendToTopic).toHaveBeenCalledWith(
        100,
        expect.stringContaining('my-session'),
      );
    });

    it('probes existing topicId and reuses if alive', async () => {
      session.topicId = 42;
      // sendToTopic returns non-null → topic alive
      bot.sendToTopic.mockResolvedValue({ message_id: 2 });

      const topicId = await tm.ensureTopic(session);

      expect(topicId).toBe(42);
      // Should probe by sending a "reconnected" message
      expect(bot.sendToTopic).toHaveBeenCalledWith(42, '🔄 Hub reconnected.');
      // Should NOT create a new topic
      expect(bot.createForumTopic).not.toHaveBeenCalled();
    });

    it('creates new topic when probe fails (dead topic)', async () => {
      session.topicId = 42;
      // First sendToTopic (probe) returns null → dead
      bot.sendToTopic.mockResolvedValueOnce(null);
      // Second sendToTopic (initial info message after creation) → success
      bot.sendToTopic.mockResolvedValueOnce({ message_id: 1 });

      const topicId = await tm.ensureTopic(session);

      expect(topicId).toBe(100);
      expect(bot.createForumTopic).toHaveBeenCalledWith('[Home] my-session');
    });

    it('stores topicId on session and calls saveSessions', async () => {
      await tm.ensureTopic(session);

      expect(session.topicId).toBe(100);
      expect(saveSessions).toHaveBeenCalled();
    });

    it('returns null when topic creation fails', async () => {
      bot.createForumTopic.mockResolvedValue(null);

      const topicId = await tm.ensureTopic(session);

      expect(topicId).toBeNull();
    });
  });

  // =========================================================================
  // ensureAllTopics
  // =========================================================================

  describe('ensureAllTopics', () => {
    it('creates topics for all sessions', async () => {
      const s1 = makeSession({ id: 'a', name: 'alpha' });
      const s2 = makeSession({ id: 'b', name: 'beta' });
      const mgr = makeMockSessionManager([s1, s2]);
      const topicMgr = new TopicManager(bot as any, mgr as any, 'Work');

      let topicCounter = 200;
      bot.createForumTopic.mockImplementation(async () => ({
        message_thread_id: topicCounter++,
        name: 'topic',
      }));

      await topicMgr.ensureAllTopics();

      expect(bot.createForumTopic).toHaveBeenCalledTimes(2);
      expect(bot.createForumTopic).toHaveBeenCalledWith('[Work] alpha');
      expect(bot.createForumTopic).toHaveBeenCalledWith('[Work] beta');
    });

    it('skips sessions that already have valid topics', async () => {
      session.topicId = 42;
      bot.sendToTopic.mockResolvedValue({ message_id: 1 }); // probe alive

      await tm.ensureAllTopics();

      expect(bot.createForumTopic).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // closeSessionTopic
  // =========================================================================

  describe('closeSessionTopic', () => {
    it('sends close message and calls closeForumTopic', async () => {
      session.topicId = 42;

      await tm.closeSessionTopic(session);

      expect(bot.sendToTopic).toHaveBeenCalledWith(42, '🔒 Session closed.');
      expect(bot.closeForumTopic).toHaveBeenCalledWith(42);
    });

    it('no-ops when session has no topicId', async () => {
      await tm.closeSessionTopic(session);
      expect(bot.closeForumTopic).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // renameSessionTopic
  // =========================================================================

  describe('renameSessionTopic', () => {
    it('calls editForumTopic with formatted name', async () => {
      session.topicId = 42;
      session.name = 'renamed';

      await tm.renameSessionTopic(session);

      expect(bot.editForumTopic).toHaveBeenCalledWith(42, '[Home] renamed');
    });

    it('no-ops when session has no topicId', async () => {
      await tm.renameSessionTopic(session);
      expect(bot.editForumTopic).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Lookups
  // =========================================================================

  describe('findSessionByTopicId', () => {
    it('returns session matching topicId', () => {
      session.topicId = 77;

      const found = tm.findSessionByTopicId(77);

      expect(found).not.toBeNull();
      expect(found!.id).toBe('sess-1');
    });

    it('returns null for unknown topicId', () => {
      session.topicId = 77;
      expect(tm.findSessionByTopicId(999)).toBeNull();
    });

    it('returns null when no sessions have topics', () => {
      expect(tm.findSessionByTopicId(1)).toBeNull();
    });
  });

  describe('getTopicId', () => {
    it('returns topicId for a session', () => {
      session.topicId = 55;
      expect(tm.getTopicId('sess-1')).toBe(55);
    });

    it('returns null for session without topicId', () => {
      expect(tm.getTopicId('sess-1')).toBeNull();
    });

    it('returns null for unknown session', () => {
      expect(tm.getTopicId('unknown')).toBeNull();
    });
  });

  // =========================================================================
  // Topic naming
  // =========================================================================

  describe('topic naming', () => {
    it('formats topic name as [InstanceName] session-name', async () => {
      await tm.ensureTopic(session);

      expect(bot.createForumTopic).toHaveBeenCalledWith('[Home] my-session');
    });

    it('uses updated instance name after setInstanceName', async () => {
      tm.setInstanceName('Office');
      await tm.ensureTopic(session);

      expect(bot.createForumTopic).toHaveBeenCalledWith('[Office] my-session');
    });
  });
});
