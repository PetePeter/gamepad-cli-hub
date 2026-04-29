/**
 * TelegramBotCore unit tests
 *
 * Tests: lifecycle, auth, message/callback/command routing,
 * send/edit/answer wrappers, forum topic API, edit debounce.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// Mock node-telegram-bot-api — hoisted so the factory can access shared state
// ---------------------------------------------------------------------------

/** Shared mutable ref for the latest mock bot instance. */
const shared = vi.hoisted(() => ({ mockBotInstance: null as any }));

vi.mock('node-telegram-bot-api', () => {
  const { EventEmitter: EE } = require('events');

  class MockTelegramBot {
    token: string;
    options: any;
    private emitter = new EE();

    constructor(token: string, options?: any) {
      this.token = token;
      this.options = options;
      if (token.startsWith('INVALID')) throw new Error('Invalid token');
      shared.mockBotInstance = this;
    }

    on(event: string, cb: (...args: any[]) => void) {
      this.emitter.on(event, cb);
    }

    /** Test-only: fire a fake event. */
    _emit(event: string, ...args: any[]) {
      this.emitter.emit(event, ...args);
    }

    startPolling = vi.fn().mockResolvedValue(undefined);
    stopPolling = vi.fn().mockResolvedValue(undefined);
    getMe = vi.fn().mockResolvedValue({
      id: 123, username: 'test_bot', is_bot: true, first_name: 'Test',
    });

    sendMessage = vi.fn().mockImplementation((chatId: number, text: string) =>
      Promise.resolve({ message_id: 1, chat: { id: chatId }, text, date: Date.now() }),
    );

    editMessageText = vi.fn().mockResolvedValue(true);
    answerCallbackQuery = vi.fn().mockResolvedValue(true);

    createForumTopic = vi.fn().mockImplementation((_chatId: number, name: string) =>
      Promise.resolve({ message_thread_id: 100, name }),
    );
    closeForumTopic = vi.fn().mockResolvedValue(true);
    reopenForumTopic = vi.fn().mockResolvedValue(true);
    editForumTopic = vi.fn().mockResolvedValue(true);
  }

  return { default: MockTelegramBot };
});

// Import after mocking
import { TelegramBotCore } from '../src/telegram/bot.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOKEN = 'test-token-12345';
const CHAT_ID = -100123456;
const ALLOWED_USERS = [111, 222];

function startedBot(): TelegramBotCore {
  const core = new TelegramBotCore();
  core.start(TOKEN, CHAT_ID, ALLOWED_USERS);
  return core;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TelegramBotCore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    shared.mockBotInstance = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Lifecycle
  // =========================================================================

  describe('lifecycle', () => {
    it('constructs in stopped state', () => {
      const core = new TelegramBotCore();
      expect(core.isRunning()).toBe(false);
      expect(core.getBot()).toBeNull();
      expect(core.getChatId()).toBeNull();
    });

    it('start() creates bot and sets running flag', () => {
      const core = new TelegramBotCore();
      core.start(TOKEN, CHAT_ID, ALLOWED_USERS);

      expect(core.isRunning()).toBe(true);
      expect(core.getChatId()).toBe(CHAT_ID);
      expect(core.getBot()).not.toBeNull();
    });

    it('start() with invalid token throws and stays stopped', () => {
      const core = new TelegramBotCore();
      expect(() => core.start('INVALID-token', CHAT_ID, [111])).toThrow('Invalid token');
      expect(core.isRunning()).toBe(false);
    });

    it('start() when already running stops first then restarts', () => {
      const core = new TelegramBotCore();
      core.start(TOKEN, CHAT_ID, [111]);
      const firstBot = shared.mockBotInstance;

      core.start(TOKEN, CHAT_ID, [111]);
      expect(firstBot!.stopPolling).toHaveBeenCalled();
      expect(core.isRunning()).toBe(true);
    });

    it('stop() clears state and stops polling', () => {
      const core = startedBot();
      const bot = shared.mockBotInstance!;

      core.stop();

      expect(core.isRunning()).toBe(false);
      expect(core.getBot()).toBeNull();
      expect(bot.stopPolling).toHaveBeenCalled();
    });

    it('stop() when not running is a no-op', () => {
      const core = new TelegramBotCore();
      expect(() => core.stop()).not.toThrow();
      expect(core.isRunning()).toBe(false);
    });

    it('stop() clears pending edit timers', () => {
      const core = startedBot();
      // Queue an edit so a timer is active
      core.editMessageDebounced(CHAT_ID, 1, 'text');
      core.stop();
      // Advancing timers after stop should not cause errors
      vi.advanceTimersByTime(5000);
    });
  });

  // =========================================================================
  // Auth
  // =========================================================================

  describe('auth', () => {
    it('rejects messages from unauthorized users', () => {
      const core = startedBot();
      const handler = vi.fn();
      core.on('message', handler);

      shared.mockBotInstance!._emit('message', {
        message_id: 1,
        chat: { id: CHAT_ID },
        from: { id: 999 },
        text: 'hello',
        date: Date.now(),
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('accepts messages from authorized users', () => {
      const core = startedBot();
      const handler = vi.fn();
      core.on('message', handler);

      shared.mockBotInstance!._emit('message', {
        message_id: 1,
        chat: { id: CHAT_ID },
        from: { id: 111 },
        text: 'hello',
        date: Date.now(),
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('start() throws when allowedUserIds is empty', () => {
      const core = new TelegramBotCore();
      expect(() => core.start(TOKEN, CHAT_ID, []))
        .toThrow('allowedUserIds must not be empty');
      expect(core.isRunning()).toBe(false);
    });

    it('unlisted users are denied', () => {
      const core = new TelegramBotCore();
      core.start(TOKEN, CHAT_ID, [111]);
      const handler = vi.fn();
      core.on('message', handler);

      // User 999 is not in [111] — should be rejected
      shared.mockBotInstance!._emit('message', {
        message_id: 1,
        chat: { id: CHAT_ID },
        from: { id: 999 },
        text: 'hi',
        date: Date.now(),
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('rejects callback queries from unauthorized users', () => {
      const core = startedBot();
      const handler = vi.fn();
      core.on('callback_query', handler);

      shared.mockBotInstance!._emit('callback_query', {
        id: 'q1',
        from: { id: 999 },
        data: 'sessions:list',
        chat_instance: '123',
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('rejects messages with no from field', () => {
      const core = startedBot();
      const handler = vi.fn();
      core.on('message', handler);

      shared.mockBotInstance!._emit('message', {
        message_id: 1,
        chat: { id: CHAT_ID },
        text: 'hello',
        date: Date.now(),
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Rate limiting
  // =========================================================================

  describe('rate limiting', () => {
    it('drops messages from a user who exceeds the rate limit', () => {
      const core = startedBot();
      const handler = vi.fn();
      core.on('message', handler);

      // Send 30 messages (at the limit)
      for (let i = 0; i < 30; i++) {
        shared.mockBotInstance!._emit('message', {
          message_id: i,
          chat: { id: CHAT_ID },
          from: { id: 111 },
          text: `msg ${i}`,
          date: Date.now(),
        });
      }

      expect(handler).toHaveBeenCalledTimes(30);

      // 31st message should be dropped
      shared.mockBotInstance!._emit('message', {
        message_id: 31,
        chat: { id: CHAT_ID },
        from: { id: 111 },
        text: 'over limit',
        date: Date.now(),
      });

      expect(handler).toHaveBeenCalledTimes(30);
    });

    it('drops callbacks from a rate-limited user', () => {
      const core = startedBot();
      const handler = vi.fn();
      core.on('callback_query', handler);

      // Exhaust rate limit with 30 callbacks
      for (let i = 0; i < 30; i++) {
        shared.mockBotInstance!._emit('callback_query', {
          id: `q${i}`,
          from: { id: 111 },
          data: 'sessions:list',
          chat_instance: '123',
        });
      }

      expect(handler).toHaveBeenCalledTimes(30);

      // 31st should be dropped
      shared.mockBotInstance!._emit('callback_query', {
        id: 'q31',
        from: { id: 111 },
        data: 'sessions:list',
        chat_instance: '123',
      });

      expect(handler).toHaveBeenCalledTimes(30);
    });

    it('rate limit resets after the 1-minute window', () => {
      const core = startedBot();
      const handler = vi.fn();
      core.on('message', handler);

      // Exhaust the limit
      for (let i = 0; i < 30; i++) {
        shared.mockBotInstance!._emit('message', {
          message_id: i,
          chat: { id: CHAT_ID },
          from: { id: 111 },
          text: `msg ${i}`,
          date: Date.now(),
        });
      }

      expect(handler).toHaveBeenCalledTimes(30);

      // Advance time past the 1-minute window
      vi.advanceTimersByTime(61_000);

      // Should work again
      shared.mockBotInstance!._emit('message', {
        message_id: 99,
        chat: { id: CHAT_ID },
        from: { id: 111 },
        text: 'after reset',
        date: Date.now(),
      });

      expect(handler).toHaveBeenCalledTimes(31);
    });

    it('rate limits are per-user — one user exhausted does not affect another', () => {
      const core = startedBot();
      const handler = vi.fn();
      core.on('message', handler);

      // Exhaust user 111's limit
      for (let i = 0; i < 30; i++) {
        shared.mockBotInstance!._emit('message', {
          message_id: i,
          chat: { id: CHAT_ID },
          from: { id: 111 },
          text: `msg ${i}`,
          date: Date.now(),
        });
      }

      // User 222 should still be allowed
      shared.mockBotInstance!._emit('message', {
        message_id: 100,
        chat: { id: CHAT_ID },
        from: { id: 222 },
        text: 'from other user',
        date: Date.now(),
      });

      expect(handler).toHaveBeenCalledTimes(31);
    });

    it('stop() clears rate limit state', () => {
      const core = startedBot();
      const handler = vi.fn();
      core.on('message', handler);

      // Exhaust the limit
      for (let i = 0; i < 30; i++) {
        shared.mockBotInstance!._emit('message', {
          message_id: i,
          chat: { id: CHAT_ID },
          from: { id: 111 },
          text: `msg ${i}`,
          date: Date.now(),
        });
      }

      core.stop();

      // Restart and send again — should be allowed (state was cleared)
      core.start(TOKEN, CHAT_ID, ALLOWED_USERS);
      const handler2 = vi.fn();
      core.on('message', handler2);

      shared.mockBotInstance!._emit('message', {
        message_id: 99,
        chat: { id: CHAT_ID },
        from: { id: 111 },
        text: 'after restart',
        date: Date.now(),
      });

      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Routing
  // =========================================================================

  describe('routing', () => {
    it('emits callback_query for authorized callback', () => {
      const core = startedBot();
      const handler = vi.fn();
      core.on('callback_query', handler);

      const query = {
        id: 'q1',
        from: { id: 111 },
        data: 'sessions:list',
        chat_instance: '123',
      };
      shared.mockBotInstance!._emit('callback_query', query);

      expect(handler).toHaveBeenCalledWith(query);
    });

    it('emits message event for non-command text', () => {
      const core = startedBot();
      const handler = vi.fn();
      core.on('message', handler);

      const msg = {
        message_id: 1,
        chat: { id: CHAT_ID },
        from: { id: 222 },
        text: 'some text',
        date: Date.now(),
      };
      shared.mockBotInstance!._emit('message', msg);

      expect(handler).toHaveBeenCalledWith(msg);
    });

    it('emits command:status for /status command', () => {
      const core = startedBot();
      const handler = vi.fn();
      core.on('command:status', handler);

      const msg = {
        message_id: 1,
        chat: { id: CHAT_ID },
        from: { id: 111 },
        text: '/status',
        date: Date.now(),
      };
      shared.mockBotInstance!._emit('message', msg);

      expect(handler).toHaveBeenCalledWith(msg, '');
    });

    it('emits command:help for /help command', () => {
      const core = startedBot();
      const handler = vi.fn();
      core.on('command:help', handler);

      const msg = {
        message_id: 1,
        chat: { id: CHAT_ID },
        from: { id: 111 },
        text: '/help',
        date: Date.now(),
      };
      shared.mockBotInstance!._emit('message', msg);

      expect(handler).toHaveBeenCalledWith(msg, '');
    });

    it('passes args after command name', () => {
      const core = startedBot();
      const handler = vi.fn();
      core.on('command:send', handler);

      const msg = {
        message_id: 1,
        chat: { id: CHAT_ID },
        from: { id: 111 },
        text: '/send hello world',
        date: Date.now(),
      };
      shared.mockBotInstance!._emit('message', msg);

      expect(handler).toHaveBeenCalledWith(msg, 'hello world');
    });

    it('strips @botname from command', () => {
      const core = startedBot();
      const handler = vi.fn();
      core.on('command:start', handler);

      const msg = {
        message_id: 1,
        chat: { id: CHAT_ID },
        from: { id: 111 },
        text: '/start@my_bot extra',
        date: Date.now(),
      };
      shared.mockBotInstance!._emit('message', msg);

      expect(handler).toHaveBeenCalledWith(msg, 'extra');
    });

    it('does not emit message event for commands', () => {
      const core = startedBot();
      const msgHandler = vi.fn();
      const cmdHandler = vi.fn();
      core.on('message', msgHandler);
      core.on('command:test', cmdHandler);

      shared.mockBotInstance!._emit('message', {
        message_id: 1,
        chat: { id: CHAT_ID },
        from: { id: 111 },
        text: '/test',
        date: Date.now(),
      });

      expect(cmdHandler).toHaveBeenCalledTimes(1);
      expect(msgHandler).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Sending messages
  // =========================================================================

  describe('sendMessage', () => {
    it('calls bot.sendMessage with chatId and options', async () => {
      const core = startedBot();
      const result = await core.sendMessage('Hello', { parse_mode: 'HTML' });

      expect(shared.mockBotInstance!.sendMessage).toHaveBeenCalledWith(
        CHAT_ID,
        'Hello',
        { parse_mode: 'HTML' },
      );
      expect(result).not.toBeNull();
      expect(result!.text).toBe('Hello');
    });

    it('returns null when bot is not running', async () => {
      const core = new TelegramBotCore();
      const result = await core.sendMessage('Hello');
      expect(result).toBeNull();
    });

    it('returns null on API error', async () => {
      const core = startedBot();
      shared.mockBotInstance!.sendMessage.mockRejectedValueOnce(new Error('API error'));

      const result = await core.sendMessage('Hello');
      expect(result).toBeNull();
    });
  });

  describe('sendToTopic', () => {
    it('sends message with message_thread_id', async () => {
      const core = startedBot();
      await core.sendToTopic(42, 'Topic message', { parse_mode: 'Markdown' });

      expect(shared.mockBotInstance!.sendMessage).toHaveBeenCalledWith(
        CHAT_ID,
        'Topic message',
        expect.objectContaining({ message_thread_id: 42, parse_mode: 'Markdown' }),
      );
    });
  });

  // =========================================================================
  // Edit debounce
  // =========================================================================

  describe('editMessageDebounced', () => {
    it('flushes edit after debounce period', async () => {
      const core = startedBot();
      const promise = core.editMessageDebounced(CHAT_ID, 1, 'edited text');

      // Not called immediately
      expect(shared.mockBotInstance!.editMessageText).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1500);
      await promise;

      expect(shared.mockBotInstance!.editMessageText).toHaveBeenCalledWith(
        'edited text',
        expect.objectContaining({ chat_id: CHAT_ID, message_id: 1 }),
      );
    });

    it('coalesces rapid edits — only last text is sent', async () => {
      const core = startedBot();
      const p1 = core.editMessageDebounced(CHAT_ID, 1, 'first');
      const p2 = core.editMessageDebounced(CHAT_ID, 1, 'second');
      const p3 = core.editMessageDebounced(CHAT_ID, 1, 'third');

      vi.advanceTimersByTime(1500);
      await Promise.all([p1, p2, p3]);

      // Should only be called once with the latest text
      expect(shared.mockBotInstance!.editMessageText).toHaveBeenCalledTimes(1);
      expect(shared.mockBotInstance!.editMessageText).toHaveBeenCalledWith(
        'third',
        expect.objectContaining({ chat_id: CHAT_ID, message_id: 1 }),
      );
    });

    it('treats different messages independently', async () => {
      const core = startedBot();
      const p1 = core.editMessageDebounced(CHAT_ID, 1, 'msg1');
      const p2 = core.editMessageDebounced(CHAT_ID, 2, 'msg2');

      vi.advanceTimersByTime(1500);
      await Promise.all([p1, p2]);

      expect(shared.mockBotInstance!.editMessageText).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // Answer callback
  // =========================================================================

  describe('answerCallback', () => {
    it('calls answerCallbackQuery with text', async () => {
      const core = startedBot();
      await core.answerCallback('q1', 'Done!');

      expect(shared.mockBotInstance!.answerCallbackQuery).toHaveBeenCalledWith('q1', { text: 'Done!' });
    });

    it('no-ops when bot is not running', async () => {
      const core = new TelegramBotCore();
      await expect(core.answerCallback('q1')).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // Forum topic API wrappers
  // =========================================================================

  describe('forum topic wrappers', () => {
    it('createForumTopic calls API and returns result', async () => {
      const core = startedBot();
      const result = await core.createForumTopic('My Topic');

      expect(shared.mockBotInstance!.createForumTopic).toHaveBeenCalledWith(
        CHAT_ID,
        'My Topic',
        { icon_color: undefined },
      );
      expect(result).toEqual({ message_thread_id: 100, name: 'My Topic' });
    });

    it('createForumTopic returns null when bot not running', async () => {
      const core = new TelegramBotCore();
      const result = await core.createForumTopic('Topic');
      expect(result).toBeNull();
    });

    it('createForumTopic returns null on API error', async () => {
      const core = startedBot();
      shared.mockBotInstance!.createForumTopic.mockRejectedValueOnce(new Error('fail'));
      const result = await core.createForumTopic('Topic');
      expect(result).toBeNull();
    });

    it('closeForumTopic calls API with chatId and topicId', async () => {
      const core = startedBot();
      const result = await core.closeForumTopic(42);

      expect(shared.mockBotInstance!.closeForumTopic).toHaveBeenCalledWith(CHAT_ID, 42);
      expect(result).toBe(true);
    });

    it('closeForumTopic returns false when not running', async () => {
      const core = new TelegramBotCore();
      expect(await core.closeForumTopic(42)).toBe(false);
    });

    it('closeForumTopic returns false on error', async () => {
      const core = startedBot();
      shared.mockBotInstance!.closeForumTopic.mockRejectedValueOnce(new Error('fail'));
      expect(await core.closeForumTopic(42)).toBe(false);
    });

    it('reopenForumTopic calls API', async () => {
      const core = startedBot();
      const result = await core.reopenForumTopic(42);

      expect(shared.mockBotInstance!.reopenForumTopic).toHaveBeenCalledWith(CHAT_ID, 42);
      expect(result).toBe(true);
    });

    it('reopenForumTopic returns false when not running', async () => {
      const core = new TelegramBotCore();
      expect(await core.reopenForumTopic(42)).toBe(false);
    });

    it('editForumTopic calls API with name', async () => {
      const core = startedBot();
      const result = await core.editForumTopic(42, 'New Name');

      expect(shared.mockBotInstance!.editForumTopic).toHaveBeenCalledWith(CHAT_ID, 42, { name: 'New Name' });
      expect(result).toBe(true);
    });

    it('editForumTopic returns false when not running', async () => {
      const core = new TelegramBotCore();
      expect(await core.editForumTopic(42, 'Name')).toBe(false);
    });

    it('editForumTopic returns false on error', async () => {
      const core = startedBot();
      shared.mockBotInstance!.editForumTopic.mockRejectedValueOnce(new Error('fail'));
      expect(await core.editForumTopic(42, 'Name')).toBe(false);
    });
  });

  // =========================================================================
  // API timeout — fail-fast
  // =========================================================================

  describe('API timeout', () => {
    it('sendMessage returns null when the Telegram API hangs past timeout', async () => {
      const core = startedBot();
      shared.mockBotInstance!.sendMessage.mockReturnValueOnce(new Promise(() => {})); // never resolves
      const result = core.sendMessage('hello');
      vi.advanceTimersByTime(10_000);
      await vi.runAllTimersAsync();
      expect(await result).toBeNull();
    });

    it('createForumTopic returns null when the Telegram API hangs past timeout', async () => {
      const core = startedBot();
      shared.mockBotInstance!.createForumTopic.mockReturnValueOnce(new Promise(() => {}));
      const result = core.createForumTopic('session-name');
      vi.advanceTimersByTime(10_000);
      await vi.runAllTimersAsync();
      expect(await result).toBeNull();
    });
  });
});
