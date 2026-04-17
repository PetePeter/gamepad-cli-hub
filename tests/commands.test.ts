/**
 * Tests for src/telegram/commands.ts
 *
 * Verifies each slash command handler:
 * - Emits the right response text and options
 * - Resolves sessions from topic or active session
 * - Handles missing/empty args gracefully
 * - Cleanup removes all listeners
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../src/telegram/keyboards.js', () => ({
  directoryListKeyboard: vi.fn(() => ({
    text: 'Dir list text',
    keyboard: [[{ text: 'dir1', callback_data: 'dir:dir1' }]],
  })),
  sessionControlKeyboard: vi.fn((session: any) => ({
    text: `Control for ${session.name}`,
    keyboard: [[{ text: 'Close', callback_data: `close:${session.id}` }]],
  })),
  spawnToolKeyboard: vi.fn(() => [[{ text: 'claude', callback_data: 'spawn:claude' }]]),
}));

import { setupSlashCommands, type SlashCommandDeps } from '../src/telegram/commands.js';

// ═══════════════════════════════════════════════════════════════════════
// Mock factories
// ═══════════════════════════════════════════════════════════════════════

function createMockBot() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    sendMessage: vi.fn().mockResolvedValue(null),
    sendToTopic: vi.fn().mockResolvedValue(null),
  });
}

function createMockTopicManager() {
  return {
    findSessionByTopicId: vi.fn().mockReturnValue(null),
    closeSessionTopic: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function createMockSessionManager() {
  return {
    getAllSessions: vi.fn().mockReturnValue([]),
    getActiveSession: vi.fn().mockReturnValue(null),
    setActiveSession: vi.fn(),
    removeSession: vi.fn(),
    getSession: vi.fn().mockReturnValue(null),
  } as any;
}

function createMockPtyManager() {
  return {
    write: vi.fn(),
  } as any;
}

function createMockConfigLoader() {
  return {
    getCliTypes: vi.fn().mockReturnValue(['claude', 'aider']),
  } as any;
}

function createMockOutputSummarizer() {
  return {
    getSummary: vi.fn().mockReturnValue('<b>Output</b>\nSome output here'),
  };
}

function makeMsg(overrides: Partial<{ message_thread_id: number }> = {}): any {
  return { chat: { id: 123 }, message_id: 1, ...overrides };
}

function makeSessions() {
  return [
    {
      id: 'sess-1', name: 'my-project', cliType: 'claude',
      processId: 100, workingDir: '/home/user/my-project', state: 'implementing' as const,
    },
    {
      id: 'sess-2', name: 'other-thing', cliType: 'aider',
      processId: 200, workingDir: '/home/user/other-thing', state: 'idle' as const,
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe('setupSlashCommands', () => {
  let bot: ReturnType<typeof createMockBot>;
  let topicManager: ReturnType<typeof createMockTopicManager>;
  let sessionManager: ReturnType<typeof createMockSessionManager>;
  let ptyManager: ReturnType<typeof createMockPtyManager>;
  let configLoader: ReturnType<typeof createMockConfigLoader>;
  let outputSummarizer: ReturnType<typeof createMockOutputSummarizer>;
  let cleanup: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    bot = createMockBot();
    topicManager = createMockTopicManager();
    sessionManager = createMockSessionManager();
    ptyManager = createMockPtyManager();
    configLoader = createMockConfigLoader();
    outputSummarizer = createMockOutputSummarizer();

    cleanup = setupSlashCommands({
      bot: bot as any,
      topicManager,
      sessionManager,
      ptyManager,
      configLoader,
      outputSummarizer,
    });
  });

  // ════════════════════════════════════════════════════════════════════
  describe('/start', () => {
    it('shows session count and welcome text', async () => {
      sessionManager.getAllSessions.mockReturnValue(makeSessions());
      bot.emit('command:start', makeMsg(), '');
      await vi.waitFor(() => expect(bot.sendMessage).toHaveBeenCalled());

      const text = bot.sendMessage.mock.calls[0][0] as string;
      expect(text).toContain('Helm');
      expect(text).toContain('Helm - steer your fleet of agents');
      expect(text).toContain('Active sessions: 2');
    });

    it('shows zero when no sessions exist', async () => {
      bot.emit('command:start', makeMsg(), '');
      await vi.waitFor(() => expect(bot.sendMessage).toHaveBeenCalled());

      const text = bot.sendMessage.mock.calls[0][0] as string;
      expect(text).toContain('Active sessions: 0');
    });
  });

  // ════════════════════════════════════════════════════════════════════
  describe('/help', () => {
    it('lists all available commands', async () => {
      bot.emit('command:help', makeMsg(), '');
      await vi.waitFor(() => expect(bot.sendMessage).toHaveBeenCalled());

      const text = bot.sendMessage.mock.calls[0][0] as string;
      expect(text).toContain('/sessions');
      expect(text).toContain('/status');
      expect(text).toContain('/switch');
      expect(text).toContain('/send');
      expect(text).toContain('/output');
      expect(text).toContain('/spawn');
      expect(text).toContain('/close');
      expect(text).toContain('/help');
    });

    it('uses HTML parse mode', async () => {
      bot.emit('command:help', makeMsg(), '');
      await vi.waitFor(() => expect(bot.sendMessage).toHaveBeenCalled());

      const opts = bot.sendMessage.mock.calls[0][1];
      expect(opts.parse_mode).toBe('HTML');
    });
  });

  // ════════════════════════════════════════════════════════════════════
  describe('/status', () => {
    it('shows all sessions with state emojis', async () => {
      sessionManager.getAllSessions.mockReturnValue(makeSessions());
      bot.emit('command:status', makeMsg(), '');
      await vi.waitFor(() => expect(bot.sendMessage).toHaveBeenCalled());

      const text = bot.sendMessage.mock.calls[0][0] as string;
      expect(text).toContain('🔨'); // implementing
      expect(text).toContain('💤'); // idle
      expect(text).toContain('my-project');
      expect(text).toContain('other-thing');
      expect(text).toContain('claude');
      expect(text).toContain('aider');
    });

    it('shows empty message when no sessions', async () => {
      bot.emit('command:status', makeMsg(), '');
      await vi.waitFor(() => expect(bot.sendMessage).toHaveBeenCalled());

      const text = bot.sendMessage.mock.calls[0][0] as string;
      expect(text).toContain('No active sessions');
    });
  });

  // ════════════════════════════════════════════════════════════════════
  describe('/sessions', () => {
    it('calls directoryListKeyboard and sends result', async () => {
      const sessions = makeSessions();
      sessionManager.getAllSessions.mockReturnValue(sessions);
      bot.emit('command:sessions', makeMsg(), '');
      await vi.waitFor(() => expect(bot.sendMessage).toHaveBeenCalled());

      const { directoryListKeyboard } = await import('../src/telegram/keyboards.js');
      expect(directoryListKeyboard).toHaveBeenCalledWith(sessions);

      const text = bot.sendMessage.mock.calls[0][0] as string;
      expect(text).toBe('Dir list text');
      expect(bot.sendMessage.mock.calls[0][1]).toHaveProperty('reply_markup');
    });
  });

  // ════════════════════════════════════════════════════════════════════
  describe('/switch', () => {
    it('shows usage when no args given', async () => {
      bot.emit('command:switch', makeMsg(), '');
      await vi.waitFor(() => expect(bot.sendMessage).toHaveBeenCalled());

      const text = bot.sendMessage.mock.calls[0][0] as string;
      expect(text).toContain('Usage');
    });

    it('switches to matching session (case-insensitive)', async () => {
      sessionManager.getAllSessions.mockReturnValue(makeSessions());
      bot.emit('command:switch', makeMsg(), 'MY-PROJECT');
      await vi.waitFor(() => expect(bot.sendMessage).toHaveBeenCalled());

      expect(sessionManager.setActiveSession).toHaveBeenCalledWith('sess-1');
      const text = bot.sendMessage.mock.calls[0][0] as string;
      expect(text).toContain('Switched to');
      expect(text).toContain('my-project');
    });

    it('matches partial names', async () => {
      sessionManager.getAllSessions.mockReturnValue(makeSessions());
      bot.emit('command:switch', makeMsg(), 'other');
      await vi.waitFor(() => expect(bot.sendMessage).toHaveBeenCalled());

      expect(sessionManager.setActiveSession).toHaveBeenCalledWith('sess-2');
    });

    it('shows error when no match found', async () => {
      sessionManager.getAllSessions.mockReturnValue(makeSessions());
      bot.emit('command:switch', makeMsg(), 'nonexistent');
      await vi.waitFor(() => expect(bot.sendMessage).toHaveBeenCalled());

      expect(sessionManager.setActiveSession).not.toHaveBeenCalled();
      const text = bot.sendMessage.mock.calls[0][0] as string;
      expect(text).toContain('No session matching');
    });
  });

  // ════════════════════════════════════════════════════════════════════
  describe('/send', () => {
    it('shows usage when no args given', async () => {
      bot.emit('command:send', makeMsg(), '');
      await vi.waitFor(() => expect(bot.sendMessage).toHaveBeenCalled());

      const text = bot.sendMessage.mock.calls[0][0] as string;
      expect(text).toContain('Usage');
    });

    it('sends to topic session when in a topic', async () => {
      const sessions = makeSessions();
      topicManager.findSessionByTopicId.mockReturnValue(sessions[0]);
      bot.emit('command:send', makeMsg({ message_thread_id: 42 }), 'hello world');
      await vi.waitFor(() => expect(ptyManager.write).toHaveBeenCalled());

      expect(ptyManager.write).toHaveBeenCalledWith('sess-1', 'hello world\r');
      expect(topicManager.findSessionByTopicId).toHaveBeenCalledWith(42);
    });

    it('falls back to active session when not in topic', async () => {
      sessionManager.getActiveSession.mockReturnValue(makeSessions()[1]);
      bot.emit('command:send', makeMsg(), 'ls -la');
      await vi.waitFor(() => expect(ptyManager.write).toHaveBeenCalled());

      expect(ptyManager.write).toHaveBeenCalledWith('sess-2', 'ls -la\r');
    });

    it('shows error when no session available', async () => {
      bot.emit('command:send', makeMsg(), 'test');
      await vi.waitFor(() => expect(bot.sendMessage).toHaveBeenCalled());

      const text = bot.sendMessage.mock.calls[0][0] as string;
      expect(text).toContain('No active session');
    });

    it('confirms what was sent', async () => {
      sessionManager.getActiveSession.mockReturnValue(makeSessions()[0]);
      bot.emit('command:send', makeMsg(), 'npm test');
      await vi.waitFor(() => expect(bot.sendMessage).toHaveBeenCalled());

      const text = bot.sendMessage.mock.calls[0][0] as string;
      expect(text).toContain('Sent');
      expect(text).toContain('npm test');
    });
  });

  // ════════════════════════════════════════════════════════════════════
  describe('/close', () => {
    it('closes the session matching current topic', async () => {
      const session = makeSessions()[0];
      topicManager.findSessionByTopicId.mockReturnValue(session);

      bot.emit('command:close', makeMsg({ message_thread_id: 42 }), '');
      await vi.waitFor(() => expect(sessionManager.removeSession).toHaveBeenCalled());

      expect(sessionManager.removeSession).toHaveBeenCalledWith('sess-1');
      // Topic cleanup handled by session:removed event in handlers.ts

      const text = bot.sendMessage.mock.calls[0][0] as string;
      expect(text).toContain('closed');
      expect(text).toContain('my-project');
    });

    it('shows error when not in a session topic', async () => {
      bot.emit('command:close', makeMsg(), '');
      await vi.waitFor(() => expect(bot.sendMessage).toHaveBeenCalled());

      const text = bot.sendMessage.mock.calls[0][0] as string;
      expect(text).toContain('No session found');
    });

    it('shows error when topic has no matching session', async () => {
      topicManager.findSessionByTopicId.mockReturnValue(null);
      bot.emit('command:close', makeMsg({ message_thread_id: 99 }), '');
      await vi.waitFor(() => expect(bot.sendMessage).toHaveBeenCalled());

      const text = bot.sendMessage.mock.calls[0][0] as string;
      expect(text).toContain('No session found');
    });
  });

  // ════════════════════════════════════════════════════════════════════
  describe('/spawn', () => {
    it('shows tool selection keyboard', async () => {
      bot.emit('command:spawn', makeMsg(), '');
      await vi.waitFor(() => expect(bot.sendMessage).toHaveBeenCalled());

      expect(configLoader.getCliTypes).toHaveBeenCalled();

      const text = bot.sendMessage.mock.calls[0][0] as string;
      expect(text).toContain('Select a CLI tool');
      expect(bot.sendMessage.mock.calls[0][1]).toHaveProperty('reply_markup');
    });
  });

  // ════════════════════════════════════════════════════════════════════
  describe('/output', () => {
    it('shows summary for topic session', async () => {
      topicManager.findSessionByTopicId.mockReturnValue(makeSessions()[0]);
      bot.emit('command:output', makeMsg({ message_thread_id: 42 }), '');
      await vi.waitFor(() => expect(bot.sendMessage).toHaveBeenCalled());

      expect(outputSummarizer.getSummary).toHaveBeenCalledWith('sess-1');
    });

    it('falls back to active session', async () => {
      sessionManager.getActiveSession.mockReturnValue(makeSessions()[1]);
      bot.emit('command:output', makeMsg(), '');
      await vi.waitFor(() => expect(bot.sendMessage).toHaveBeenCalled());

      expect(outputSummarizer.getSummary).toHaveBeenCalledWith('sess-2');
    });

    it('shows error when no session found', async () => {
      bot.emit('command:output', makeMsg(), '');
      await vi.waitFor(() => expect(bot.sendMessage).toHaveBeenCalled());

      const text = bot.sendMessage.mock.calls[0][0] as string;
      expect(text).toContain('No session found');
    });
  });

  // ════════════════════════════════════════════════════════════════════
  describe('/output without summarizer', () => {
    it('shows unavailable message when outputSummarizer not provided', async () => {
      cleanup(); // remove previous handlers

      const cleanupNoSumm = setupSlashCommands({
        bot: bot as any,
        topicManager,
        sessionManager,
        ptyManager,
        configLoader,
        // no outputSummarizer
      });

      sessionManager.getActiveSession.mockReturnValue(makeSessions()[0]);
      bot.emit('command:output', makeMsg(), '');
      await vi.waitFor(() => expect(bot.sendMessage).toHaveBeenCalled());

      const text = bot.sendMessage.mock.calls[0][0] as string;
      expect(text).toContain('not available');

      cleanupNoSumm();
    });
  });

  // ════════════════════════════════════════════════════════════════════
  describe('message_thread_id forwarding', () => {
    it('replies in the same thread as the command', async () => {
      bot.emit('command:help', makeMsg({ message_thread_id: 77 }), '');
      await vi.waitFor(() => expect(bot.sendMessage).toHaveBeenCalled());

      const opts = bot.sendMessage.mock.calls[0][1];
      expect(opts.message_thread_id).toBe(77);
    });

    it('passes undefined thread id for general chat messages', async () => {
      bot.emit('command:help', makeMsg(), '');
      await vi.waitFor(() => expect(bot.sendMessage).toHaveBeenCalled());

      const opts = bot.sendMessage.mock.calls[0][1];
      expect(opts.message_thread_id).toBeUndefined();
    });
  });

  // ════════════════════════════════════════════════════════════════════
  describe('cleanup', () => {
    it('removes all command listeners on cleanup', async () => {
      cleanup();

      bot.emit('command:start', makeMsg(), '');
      bot.emit('command:help', makeMsg(), '');
      bot.emit('command:status', makeMsg(), '');

      // Give any async handlers a tick to potentially fire
      await new Promise(r => setTimeout(r, 10));
      expect(bot.sendMessage).not.toHaveBeenCalled();
    });

    it('returns a function', () => {
      expect(typeof cleanup).toBe('function');
    });
  });

  // ════════════════════════════════════════════════════════════════════
  describe('HTML escaping', () => {
    it('escapes HTML in session names for /status', async () => {
      const sessions = [{
        id: 'sess-x', name: '<b>bad</b>', cliType: 'claude',
        processId: 100, workingDir: '/tmp', state: 'idle' as const,
      }];
      sessionManager.getAllSessions.mockReturnValue(sessions);

      bot.emit('command:status', makeMsg(), '');
      await vi.waitFor(() => expect(bot.sendMessage).toHaveBeenCalled());

      const text = bot.sendMessage.mock.calls[0][0] as string;
      // The session name in status output should be escaped
      expect(text).toContain('&lt;b&gt;bad&lt;/b&gt;');
      expect(text).not.toContain('<b>bad</b>');
    });
  });
});
