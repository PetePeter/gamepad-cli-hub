import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Mock keyboards module — return simple stubs
vi.mock('../src/telegram/keyboards.js', () => ({
  directoryListKeyboard: vi.fn((sessions: any[]) => ({
    text: `📂 ${sessions.length} sessions`,
    keyboard: [[{ text: 'stub', callback_data: 'stub' }]],
  })),
  sessionListKeyboard: vi.fn((_sessions: any[], dir: string) => ({
    text: `📂 ${dir}`,
    keyboard: [[{ text: 'stub', callback_data: 'stub' }]],
  })),
  sessionControlKeyboard: vi.fn((session: any) => ({
    text: `🔨 ${session.name}`,
    keyboard: [[{ text: 'stub', callback_data: 'stub' }]],
  })),
  commandPaletteKeyboard: vi.fn(() => [[{ text: 'stub', callback_data: 'stub' }]]),
  spawnToolKeyboard: vi.fn(() => [[{ text: 'stub', callback_data: 'stub' }]]),
  spawnDirKeyboard: vi.fn(() => [[{ text: 'stub', callback_data: 'stub' }]]),
  // Path registry: in tests, keys are raw paths; resolvePathIndex returns them as-is
  resolvePathIndex: vi.fn((key: string) => key),
}));

import { setupCallbackHandler } from '../src/telegram/callback-handler.js';
import type { TelegramBotCore } from '../src/telegram/bot.js';
import type { TopicManager } from '../src/telegram/topic-manager.js';
import type { SessionManager } from '../src/session/manager.js';
import type { PtyManager } from '../src/session/pty-manager.js';
import type { ConfigLoader } from '../src/config/loader.js';
// TextInputManager and OutputSummarizer removed — stubbed with plain objects until Stage 7

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockBot() {
  return {
    on: vi.fn(),
    removeListener: vi.fn(),
    answerCallback: vi.fn(),
    getBot: vi.fn(() => ({
      editMessageText: vi.fn(),
      sendMessage: vi.fn(),
    })),
    sendToTopic: vi.fn(),
  } as unknown as TelegramBotCore;
}

function createMockTopicManager() {
  return {} as unknown as TopicManager;
}

function createMockSessionManager(sessions: Record<string, any> = {}) {
  return {
    getAllSessions: vi.fn(() => Object.values(sessions)),
    getSession: vi.fn((id: string) => sessions[id] ?? null),
    hasSession: vi.fn((id: string) => id in sessions),
    removeSession: vi.fn((id: string) => { delete sessions[id]; }),
    addSession: vi.fn(),
  } as unknown as SessionManager;
}

function createMockPtyManager() {
  return {
    write: vi.fn(),
    kill: vi.fn(),
  } as unknown as PtyManager;
}

function createMockConfigLoader(
  tools: string[] = [],
  sequences: Record<string, Array<{ label: string; sequence: string }>> = {},
  dirs: Array<{ name: string; path: string }> = [],
) {
  return {
    getCliTypes: vi.fn(() => tools),
    getSequences: vi.fn(() => sequences),
    getWorkingDirectories: vi.fn(() => dirs),
  } as unknown as ConfigLoader;
}

function createMockTextInput() {
  return {
    startInput: vi.fn(),
    confirmInput: vi.fn(),
    cancelInput: vi.fn(),
  } as any;
}

function createMockOutputSummarizer() {
  return {
    getSummary: vi.fn(() => '📋 summary'),
  } as any;
}

function makeQuery(data: string, chatId = 123, messageId = 456, threadId = 789) {
  return {
    id: 'q1',
    data,
    from: { id: 1000, is_bot: false, first_name: 'Test' },
    message: {
      chat: { id: chatId },
      message_id: messageId,
      message_thread_id: threadId,
      date: Date.now(),
    },
    chat_instance: 'test',
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('setupCallbackHandler', () => {
  let bot: ReturnType<typeof createMockBot>;
  let sessionManager: ReturnType<typeof createMockSessionManager>;
  let ptyManager: ReturnType<typeof createMockPtyManager>;
  let configLoader: ReturnType<typeof createMockConfigLoader>;
  let textInput: ReturnType<typeof createMockTextInput>;
  let outputSummarizer: ReturnType<typeof createMockOutputSummarizer>;
  let handler: (query: any) => Promise<void>;

  beforeEach(() => {
    bot = createMockBot();
    sessionManager = createMockSessionManager();
    ptyManager = createMockPtyManager();
    configLoader = createMockConfigLoader();
    textInput = createMockTextInput();
    outputSummarizer = createMockOutputSummarizer();

    setupCallbackHandler(
      bot as any,
      createMockTopicManager(),
      sessionManager as any,
      ptyManager as any,
      configLoader as any,
      textInput as any,
      outputSummarizer as any,
    );

    // Extract the handler that was registered
    handler = (bot.on as any).mock.calls[0][1];
  });

  it('registers a callback_query listener on the bot', () => {
    expect(bot.on).toHaveBeenCalledWith('callback_query', expect.any(Function));
  });

  it('returns a dispose function that removes the listener', () => {
    const dispose = setupCallbackHandler(
      bot as any, createMockTopicManager(), sessionManager as any,
      ptyManager as any, configLoader as any, textInput as any, outputSummarizer as any,
    );

    dispose();
    expect(bot.removeListener).toHaveBeenCalledWith('callback_query', expect.any(Function));
  });

  it('ignores queries with no data', async () => {
    await handler({ id: 'q1', from: { id: 1 }, chat_instance: 'x' });
    expect(bot.answerCallback).not.toHaveBeenCalled();
  });

  describe('sessions:list', () => {
    it('edits message with directory list keyboard', async () => {
      const sessions = { s1: { id: 's1', name: 'Test', workingDir: '/a' } };
      sessionManager = createMockSessionManager(sessions);
      setupCallbackHandler(
        bot as any, createMockTopicManager(), sessionManager as any,
        ptyManager as any, configLoader as any, textInput as any, outputSummarizer as any,
      );
      handler = (bot.on as any).mock.calls.at(-1)[1];

      await handler(makeQuery('sessions:list'));
      expect(sessionManager.getAllSessions).toHaveBeenCalled();
      expect(bot.answerCallback).toHaveBeenCalledWith('q1');
    });
  });

  describe('dir:{path}', () => {
    it('filters sessions by directory and edits message', async () => {
      const sessions = {
        s1: { id: 's1', name: 'A', workingDir: '/proj' },
        s2: { id: 's2', name: 'B', workingDir: '/other' },
      };
      sessionManager = createMockSessionManager(sessions);
      setupCallbackHandler(
        bot as any, createMockTopicManager(), sessionManager as any,
        ptyManager as any, configLoader as any, textInput as any, outputSummarizer as any,
      );
      handler = (bot.on as any).mock.calls.at(-1)[1];

      await handler(makeQuery('dir:/proj'));
      expect(bot.answerCallback).toHaveBeenCalledWith('q1');
    });
  });

  describe('sess:{sessionId}', () => {
    it('shows session controls for a valid session', async () => {
      const sessions = { s1: { id: 's1', name: 'Test', cliType: 'claude', state: 'idle' } };
      sessionManager = createMockSessionManager(sessions);
      setupCallbackHandler(
        bot as any, createMockTopicManager(), sessionManager as any,
        ptyManager as any, configLoader as any, textInput as any, outputSummarizer as any,
      );
      handler = (bot.on as any).mock.calls.at(-1)[1];

      await handler(makeQuery('sess:s1'));
      expect(sessionManager.getSession).toHaveBeenCalledWith('s1');
      expect(bot.answerCallback).toHaveBeenCalledWith('q1');
    });

    it('answers with error for unknown session', async () => {
      await handler(makeQuery('sess:unknown'));
      expect(bot.answerCallback).toHaveBeenCalledWith('q1', '❌ Session not found');
    });
  });

  describe('topic:{sessionId}', () => {
    it('just acknowledges', async () => {
      await handler(makeQuery('topic:s1'));
      expect(bot.answerCallback).toHaveBeenCalledWith('q1', '📌 Go to topic');
    });
  });

  describe('talk:{sessionId}', () => {
    it('ensures topic, writes nudge to PTY, and answers callback', async () => {
      const mockTopicManager = {
        ensureTopic: vi.fn(async () => 42),
      } as unknown as TopicManager;

      const sessions = { s1: { id: 's1', name: 'Test', cliType: 'claude' } };
      sessionManager = createMockSessionManager(sessions);
      setupCallbackHandler(
        bot as any, mockTopicManager as any, sessionManager as any,
        ptyManager as any, configLoader as any, textInput as any, outputSummarizer as any,
      );
      handler = (bot.on as any).mock.calls.at(-1)[1];

      await handler(makeQuery('talk:s1'));

      expect(mockTopicManager.ensureTopic).toHaveBeenCalled();
      expect(ptyManager.write).toHaveBeenCalledWith('s1', expect.stringContaining('User is now available'));
      expect(bot.answerCallback).toHaveBeenCalledWith('q1', expect.stringContaining('Test'));
    });

    it('answers with error when session not found', async () => {
      await handler(makeQuery('talk:nonexistent'));
      expect(bot.answerCallback).toHaveBeenCalledWith('q1', 'Session not found');
    });
  });

  describe('continue:{sessionId}', () => {
    it('writes carriage return to PTY', async () => {
      await handler(makeQuery('continue:s1'));
      expect(ptyManager.write).toHaveBeenCalledWith('s1', '\r');
      expect(bot.answerCallback).toHaveBeenCalledWith('q1', '🚀 Sent continue (Enter)');
    });
  });

  describe('cancel:{sessionId}', () => {
    it('writes Ctrl+C to PTY', async () => {
      await handler(makeQuery('cancel:s1'));
      expect(ptyManager.write).toHaveBeenCalledWith('s1', '\x03');
      expect(bot.answerCallback).toHaveBeenCalledWith('q1', '✋ Sent cancel (Ctrl+C)');
    });
  });

  describe('accept:{sessionId}', () => {
    it('writes Enter to PTY', async () => {
      await handler(makeQuery('accept:s1'));
      expect(ptyManager.write).toHaveBeenCalledWith('s1', '\r');
      expect(bot.answerCallback).toHaveBeenCalledWith('q1', '✅ Sent accept (Enter)');
    });
  });

  describe('prompt:{sessionId}', () => {
    it('starts text input mode', async () => {
      await handler(makeQuery('prompt:s1'));
      expect(textInput.startInput).toHaveBeenCalledWith('s1', 1000);
      expect(bot.answerCallback).toHaveBeenCalledWith('q1', '💬 Type your message in this chat');
    });
  });

  describe('send:confirm / send:cancel', () => {
    it('confirms text input', async () => {
      await handler(makeQuery('send:confirm:s1'));
      expect(textInput.confirmInput).toHaveBeenCalledWith('s1');
      expect(bot.answerCallback).toHaveBeenCalledWith('q1', '✅ Sent!');
    });

    it('cancels text input', async () => {
      await handler(makeQuery('send:cancel:s1'));
      expect(textInput.cancelInput).toHaveBeenCalledWith('s1');
      expect(bot.answerCallback).toHaveBeenCalledWith('q1', '❌ Cancelled');
    });
  });

  describe('output:{sessionId}', () => {
    it('sends output summary to topic', async () => {
      await handler(makeQuery('output:s1'));
      expect(outputSummarizer.getSummary).toHaveBeenCalledWith('s1');
      expect(bot.answerCallback).toHaveBeenCalledWith('q1');
    });
  });

  describe('commands:{sessionId}', () => {
    it('shows command palette when sequences exist', async () => {
      const sessions = { s1: { id: 's1', name: 'Test', cliType: 'claude' } };
      sessionManager = createMockSessionManager(sessions);
      configLoader = createMockConfigLoader([], {
        common: [{ label: 'yes', sequence: 'y{Enter}' }],
      });
      setupCallbackHandler(
        bot as any, createMockTopicManager(), sessionManager as any,
        ptyManager as any, configLoader as any, textInput as any, outputSummarizer as any,
      );
      handler = (bot.on as any).mock.calls.at(-1)[1];

      await handler(makeQuery('commands:s1'));
      expect(configLoader.getSequences).toHaveBeenCalledWith('claude');
      expect(bot.answerCallback).toHaveBeenCalledWith('q1');
    });

    it('answers with "No commands" when no sequences configured', async () => {
      const sessions = { s1: { id: 's1', name: 'Test', cliType: 'claude' } };
      sessionManager = createMockSessionManager(sessions);
      setupCallbackHandler(
        bot as any, createMockTopicManager(), sessionManager as any,
        ptyManager as any, configLoader as any, textInput as any, outputSummarizer as any,
      );
      handler = (bot.on as any).mock.calls.at(-1)[1];

      await handler(makeQuery('commands:s1'));
      expect(bot.answerCallback).toHaveBeenCalledWith('q1', 'No commands configured');
    });
  });

  describe('cmd:{sessionId}:{label}', () => {
    it('writes expanded sequence to PTY', async () => {
      const sessions = { s1: { id: 's1', name: 'Test', cliType: 'claude' } };
      sessionManager = createMockSessionManager(sessions);
      configLoader = createMockConfigLoader([], {
        common: [{ label: 'yes', sequence: 'y{Enter}' }],
      });
      setupCallbackHandler(
        bot as any, createMockTopicManager(), sessionManager as any,
        ptyManager as any, configLoader as any, textInput as any, outputSummarizer as any,
      );
      handler = (bot.on as any).mock.calls.at(-1)[1];

      await handler(makeQuery('cmd:s1:yes'));
      expect(ptyManager.write).toHaveBeenCalledWith('s1', 'y\r');
      expect(bot.answerCallback).toHaveBeenCalledWith('q1', '⚡ Sent: yes');
    });

    it('answers with error when command not found', async () => {
      const sessions = { s1: { id: 's1', name: 'Test', cliType: 'claude' } };
      sessionManager = createMockSessionManager(sessions);
      setupCallbackHandler(
        bot as any, createMockTopicManager(), sessionManager as any,
        ptyManager as any, configLoader as any, textInput as any, outputSummarizer as any,
      );
      handler = (bot.on as any).mock.calls.at(-1)[1];

      await handler(makeQuery('cmd:s1:nonexistent'));
      expect(bot.answerCallback).toHaveBeenCalledWith('q1', '❌ Command not found');
    });
  });

  describe('spawn:start / spawn:tool / spawn:dir', () => {
    it('shows tool selection on spawn:start', async () => {
      configLoader = createMockConfigLoader(['claude', 'codex']);
      setupCallbackHandler(
        bot as any, createMockTopicManager(), sessionManager as any,
        ptyManager as any, configLoader as any, textInput as any, outputSummarizer as any,
      );
      handler = (bot.on as any).mock.calls.at(-1)[1];

      await handler(makeQuery('spawn:start'));
      expect(configLoader.getCliTypes).toHaveBeenCalled();
      expect(bot.answerCallback).toHaveBeenCalledWith('q1');
    });

    it('shows directory selection on spawn:tool:{name}', async () => {
      configLoader = createMockConfigLoader([], {}, [{ name: 'proj', path: '/proj' }]);
      setupCallbackHandler(
        bot as any, createMockTopicManager(), sessionManager as any,
        ptyManager as any, configLoader as any, textInput as any, outputSummarizer as any,
      );
      handler = (bot.on as any).mock.calls.at(-1)[1];

      await handler(makeQuery('spawn:tool:claude'));
      expect(configLoader.getWorkingDirectories).toHaveBeenCalled();
      expect(bot.answerCallback).toHaveBeenCalledWith('q1', 'Selected: claude');
    });

    it('spawns a session on spawn:dir after tool selection', async () => {
      // Set up mocks for actual spawning
      const mockPtyManager = {
        write: vi.fn(),
        spawn: vi.fn(() => ({ pid: 42 })),
      } as unknown as PtyManager;

      const mockTopicManager = {
        ensureTopic: vi.fn(),
      } as unknown as TopicManager;

      const mockSessionManager = {
        getAllSessions: vi.fn(() => []),
        getSession: vi.fn(() => ({ id: 'test', name: 'claude', cliType: 'claude' })),
        addSession: vi.fn(),
      } as unknown as SessionManager;

      configLoader = createMockConfigLoader(['claude'], {}, [{ name: 'proj', path: '/proj' }]);
      (configLoader as any).getCliTypeEntry = vi.fn(() => ({ command: 'claude', spawnCommand: 'claude --session-id {cliSessionName}' }));

      const innerBot = { editMessageText: vi.fn(), sendMessage: vi.fn() };
      (bot.getBot as any).mockReturnValue(innerBot);

      setupCallbackHandler(
        bot as any, mockTopicManager as any, mockSessionManager as any,
        mockPtyManager as any, configLoader as any, textInput as any, outputSummarizer as any,
      );
      const spawnHandler = (bot.on as any).mock.calls.at(-1)[1];

      // Step 1: select tool (stores wizard state for user 1000)
      await spawnHandler(makeQuery('spawn:tool:claude'));

      // Step 2: select directory (triggers actual spawn)
      await spawnHandler(makeQuery('spawn:dir:/proj'));

      expect(mockPtyManager.spawn).toHaveBeenCalledWith(
        expect.objectContaining({ cwd: '/proj' }),
      );
      expect(mockSessionManager.addSession).toHaveBeenCalledWith(
        expect.objectContaining({ cliType: 'claude', workingDir: '/proj' }),
      );
      // ensureTopic is handled by session:added event in handlers.ts, not by handleSpawnExec
      expect(bot.answerCallback).toHaveBeenCalledWith('q1', '🚀 Spawned claude!');
    });

    it('reports error when spawn:dir called without prior tool selection', async () => {
      await handler(makeQuery('spawn:dir:/proj'));
      expect(bot.answerCallback).toHaveBeenCalledWith('q1', '❌ No tool selected or wizard expired. Start over with /spawn');
    });
  });

  describe('status:all', () => {
    it('sends status overview when sessions exist', async () => {
      const sessions = {
        s1: { id: 's1', name: 'A', cliType: 'claude', state: 'implementing' },
        s2: { id: 's2', name: 'B', cliType: 'codex', state: 'idle' },
      };
      sessionManager = createMockSessionManager(sessions);

      // Stable inner bot mock so getBot() always returns the same object
      const innerBot = { editMessageText: vi.fn(), sendMessage: vi.fn() };
      (bot.getBot as any).mockReturnValue(innerBot);

      setupCallbackHandler(
        bot as any, createMockTopicManager(), sessionManager as any,
        ptyManager as any, configLoader as any, textInput as any, outputSummarizer as any,
      );
      handler = (bot.on as any).mock.calls.at(-1)[1];

      await handler(makeQuery('status:all'));
      expect(innerBot.sendMessage).toHaveBeenCalled();
      const sentText = innerBot.sendMessage.mock.calls[0][1] as string;
      expect(sentText).toContain('Session Status');
      expect(sentText).toContain('A');
      expect(sentText).toContain('B');
    });

    it('answers with "No active sessions" when empty', async () => {
      await handler(makeQuery('status:all'));
      expect(bot.answerCallback).toHaveBeenCalledWith('q1', 'No active sessions');
    });
  });

  describe('closeall', () => {
    it('kills PTYs and removes all sessions', async () => {
      const sessions = {
        s1: { id: 's1', name: 'A', cliType: 'claude', topicId: 10 },
        s2: { id: 's2', name: 'B', cliType: 'codex', topicId: 20 },
      };
      sessionManager = createMockSessionManager(sessions);

      setupCallbackHandler(
        bot as any, createMockTopicManager(), sessionManager as any,
        ptyManager as any, configLoader as any, textInput as any, outputSummarizer as any,
      );
      handler = (bot.on as any).mock.calls.at(-1)[1];

      await handler(makeQuery('closeall'));

      expect(ptyManager.kill).toHaveBeenCalledWith('s1');
      expect(ptyManager.kill).toHaveBeenCalledWith('s2');
      expect(sessionManager.removeSession).toHaveBeenCalledWith('s1');
      expect(sessionManager.removeSession).toHaveBeenCalledWith('s2');
      expect(bot.answerCallback).toHaveBeenCalledWith('q1', '🗑️ Closed 2 session(s)');
    });

    it('reports "No sessions to close" when empty', async () => {
      await handler(makeQuery('closeall'));
      expect(bot.answerCallback).toHaveBeenCalledWith('q1', 'No sessions to close');
    });

    it('continues closing remaining sessions when one fails', async () => {
      const sessions = {
        s1: { id: 's1', name: 'A', cliType: 'claude' },
        s2: { id: 's2', name: 'B', cliType: 'codex' },
      };
      sessionManager = createMockSessionManager(sessions);
      (ptyManager.kill as any).mockImplementationOnce(() => { throw new Error('boom'); });

      setupCallbackHandler(
        bot as any, createMockTopicManager(), sessionManager as any,
        ptyManager as any, configLoader as any, textInput as any, outputSummarizer as any,
      );
      handler = (bot.on as any).mock.calls.at(-1)[1];

      await handler(makeQuery('closeall'));

      // First session fails, second succeeds
      expect(bot.answerCallback).toHaveBeenCalledWith('q1', '🗑️ Closed 1 session(s)');
    });
  });

  describe('unknown action', () => {
    it('answers with unknown action', async () => {
      await handler(makeQuery('foobar:xyz'));
      expect(bot.answerCallback).toHaveBeenCalledWith('q1', '❓ Unknown action');
    });
  });

  describe('error handling', () => {
    it('catches errors and answers with error message', async () => {
      // Make ptyManager.write throw
      (ptyManager.write as any).mockImplementation(() => { throw new Error('boom'); });

      await handler(makeQuery('continue:s1'));
      expect(bot.answerCallback).toHaveBeenCalledWith('q1', '❌ Error processing action');
    });
  });
});
