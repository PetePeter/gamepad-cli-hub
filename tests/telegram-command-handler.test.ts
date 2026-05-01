import { describe, expect, it, vi } from 'vitest';
import { setupCommandHandler, sendPeekOutput } from '../src/telegram/command-handler.js';
import type { TelegramBotCore } from '../src/telegram/bot.js';
import type { SessionManager } from '../src/session/session-manager.js';
import type { PtyManager } from '../src/session/pty-manager.js';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeBot(): { bot: TelegramBotCore; sendMessage: ReturnType<typeof vi.fn> } {
  const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
  return {
    bot: {
      isRunning: vi.fn(() => true),
      getChatId: vi.fn(() => -1001234567890),
      getBot: vi.fn(() => ({ sendMessage })),
      sendMessage,
      sendToTopic: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
      answerCallback: vi.fn().mockResolvedValue(undefined),
    } as unknown as TelegramBotCore,
    sendMessage,
  };
}

function makeSession(id: string, name: string, cliType = 'claude-code') {
  return { id, name, cliType, workingDir: 'X:\\test', state: 'idle' as const };
}

function makePtyManager(tail: string[]): PtyManager {
  return {
    getTerminalTail: vi.fn(() => ({
      stripped: tail,
      raw: tail,
      lastOutputAt: Date.now(),
    })),
  } as unknown as PtyManager;
}

describe('setupCommandHandler', () => {
  it('registers a command:peek listener on the bot', () => {
    const { bot } = makeBot();
    const sm = { getAllSessions: vi.fn(() => []) } as unknown as SessionManager;
    const pm = {} as unknown as PtyManager;

    setupCommandHandler(bot, sm, pm);

    expect(bot.on).toHaveBeenCalledWith('command:peek', expect.any(Function));
  });

  it('cleanup removes the listener', () => {
    const { bot } = makeBot();
    const sm = { getAllSessions: vi.fn(() => []) } as unknown as SessionManager;
    const pm = {} as unknown as PtyManager;

    const cleanup = setupCommandHandler(bot, sm, pm);
    cleanup();

    expect(bot.removeListener).toHaveBeenCalledWith('command:peek', expect.any(Function));
  });
});

describe('command:peek handler', () => {
  it('with one session and no args, peeks at that session', async () => {
    const { bot, sendMessage } = makeBot();
    const sessions = [makeSession('s1', 'worker')];
    const sm = { getAllSessions: vi.fn(() => sessions) } as unknown as SessionManager;
    const pm = makePtyManager(['line 1', 'line 2', 'line 3']);

    setupCommandHandler(bot, sm, pm);

    // Get the registered handler
    const peekHandler = (bot.on as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'command:peek',
    )?.[1];

    expect(peekHandler).toBeDefined();
    await peekHandler!({ message_thread_id: 42 } as any, '');

    expect(sendMessage).toHaveBeenCalled();
    const sentText = sendMessage.mock.calls[0][0];
    expect(sentText).toContain('worker');
    expect(sentText).toContain('line 1');
    expect(sentText).toContain('line 3');
  });

  it('with multiple sessions and no args, sends session picker', async () => {
    const { bot, sendMessage } = makeBot();
    const sessions = [makeSession('s1', 'worker'), makeSession('s2', 'planner')];
    const sm = { getAllSessions: vi.fn(() => sessions) } as unknown as SessionManager;
    const pm = makePtyManager([]);

    setupCommandHandler(bot, sm, pm);

    const peekHandler = (bot.on as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'command:peek',
    )?.[1];

    await peekHandler!({} as any, '');

    expect(sendMessage).toHaveBeenCalled();
    const options = sendMessage.mock.calls[0][1];
    expect(options.reply_markup.inline_keyboard).toBeDefined();
  });

  it('with args matching a session name, peeks at that session', async () => {
    const { bot, sendMessage } = makeBot();
    const sessions = [makeSession('s1', 'worker'), makeSession('s2', 'planner')];
    const sm = { getAllSessions: vi.fn(() => sessions) } as unknown as SessionManager;
    const pm = makePtyManager(['output line']);

    setupCommandHandler(bot, sm, pm);

    const peekHandler = (bot.on as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'command:peek',
    )?.[1];

    await peekHandler!({ message_thread_id: 42 } as any, 'planner');

    expect(sendMessage).toHaveBeenCalled();
    const sentText = sendMessage.mock.calls[0][0];
    expect(sentText).toContain('planner');
  });

  it('with args not matching any session, returns error', async () => {
    const { bot, sendMessage } = makeBot();
    const sessions = [makeSession('s1', 'worker')];
    const sm = { getAllSessions: vi.fn(() => sessions) } as unknown as SessionManager;
    const pm = makePtyManager([]);

    setupCommandHandler(bot, sm, pm);

    const peekHandler = (bot.on as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'command:peek',
    )?.[1];

    await peekHandler!({} as any, 'nonexistent');

    expect(sendMessage).toHaveBeenCalledWith('Session not found: nonexistent');
  });

  it('with no sessions, returns "no active sessions"', async () => {
    const { bot, sendMessage } = makeBot();
    const sm = { getAllSessions: vi.fn(() => []) } as unknown as SessionManager;
    const pm = {} as unknown as PtyManager;

    setupCommandHandler(bot, sm, pm);

    const peekHandler = (bot.on as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'command:peek',
    )?.[1];

    await peekHandler!({} as any, '');

    expect(sendMessage).toHaveBeenCalledWith('No active sessions');
  });
});

describe('sendPeekOutput', () => {
  it('sends cleaned terminal output as HTML-escaped text', async () => {
    const { bot, sendMessage } = makeBot();
    const pm = makePtyManager(['Hello World', 'Second line', 'Third line']);
    const msg = { message_thread_id: 42 } as any;

    await sendPeekOutput(bot, pm, msg, { id: 's1', name: 'test-session' }, 3);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const text = sendMessage.mock.calls[0][0];
    expect(text).toContain('test-session');
    expect(text).toContain('Hello World');
    expect(text).toContain('Third line');
  });

  it('passes message_thread_id from original message', async () => {
    const { bot, sendMessage } = makeBot();
    const pm = makePtyManager(['line']);
    const msg = { message_thread_id: 99 } as any;

    await sendPeekOutput(bot, pm, msg, { id: 's1', name: 'test' }, 1);

    const options = sendMessage.mock.calls[0][1];
    expect(options.message_thread_id).toBe(99);
  });
});
