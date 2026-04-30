import { describe, expect, it, vi } from 'vitest';
import { TelegramRelayService } from '../src/telegram/relay-service.js';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeRelay() {
  const innerBot = { sendMessage: vi.fn().mockResolvedValue({ message_id: 99 }) };
  const bot = {
    isRunning: vi.fn(() => true),
    getChatId: vi.fn(() => -1001234567890),
    getBot: vi.fn(() => innerBot),
    sendToTopic: vi.fn().mockResolvedValue({ message_id: 12 }),
    sendMessage: vi.fn().mockResolvedValue({ message_id: 13 }),
  };
  const session = { id: 's1', name: 'Claude', cliType: 'claude-code', topicId: 42 };
  const topicManager = {
    ensureTopic: vi.fn(async () => 42),
    findSessionByTopicId: vi.fn((topicId: number) => topicId === 42 ? session : undefined),
  };
  const sessionManager = {
    getSession: vi.fn((id: string) => id === 's1' ? session : null),
    getActiveSession: vi.fn(() => session),
  };
  const ptyManager = {
    write: vi.fn(),
  };
  const helmControl = {};
  const relay = new TelegramRelayService(
    bot as any,
    topicManager as any,
    sessionManager as any,
    ptyManager as any,
    helmControl as any,
  );
  return { relay, bot, topicManager, sessionManager, ptyManager };
}

describe('TelegramRelayService', () => {
  it('sendToUser() creates topic if none exists and sends message', async () => {
    const { relay, bot, topicManager, sessionManager } = makeRelay();

    const result = await relay.sendToUser({ sessionId: 's1', text: 'Hello from CLI' });

    expect(topicManager.ensureTopic).toHaveBeenCalled();
    expect(bot.sendToTopic).toHaveBeenCalledWith(
      42,
      expect.stringContaining('Hello from CLI'),
      { parse_mode: 'HTML' },
    );
    expect(result.sent).toBe(true);
  });

  it('sendToUser() returns { sent: false, reason } when bot offline', async () => {
    const { relay, bot } = makeRelay();
    bot.isRunning.mockReturnValue(false);

    const result = await relay.sendToUser({ sessionId: 's1', text: 'Hello' });

    expect(result.sent).toBe(false);
    expect(result.reason).toBe('Telegram bot is not running');
  });

  it('handleIncomingTelegramMessage() writes text+\\r to mapped session PTY', async () => {
    const { relay, ptyManager } = makeRelay();

    const consumed = await relay.handleIncomingTelegramMessage({
      message_id: 77,
      message_thread_id: 42,
      text: 'Yes, ship it',
    } as any);

    expect(consumed).toBe(true);
    expect(ptyManager.write).toHaveBeenCalledWith('s1', 'Yes, ship it\r');
  });

  it('handleIncomingTelegramMessage() writes to active session when topic not mapped', async () => {
    const { relay, ptyManager } = makeRelay();

    const consumed = await relay.handleIncomingTelegramMessage({
      message_id: 78,
      message_thread_id: 999,
      text: 'Unmapped topic message',
    } as any);

    expect(consumed).toBe(true);
    expect(ptyManager.write).toHaveBeenCalledWith('s1', 'Unmapped topic message\r');
  });

  it('sends General Chat nudge after successful topic message', async () => {
    const { relay, bot } = makeRelay();
    const innerBot = bot.getBot();

    await relay.sendToUser({ sessionId: 's1', text: 'A message that is longer than 80 characters so it gets truncated in the General Chat nudge preview text' });

    expect(innerBot.sendMessage).toHaveBeenCalledWith(
      -1001234567890,
      expect.stringContaining('...'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({ text: 'Go to topic →' }),
            ]),
          ]),
        }),
      }),
    );
  });

  it('isAvailable() returns true when bot is running', () => {
    const { relay } = makeRelay();
    expect(relay.isAvailable()).toBe(true);
  });

  it('isAvailable() returns false when bot is not running', () => {
    const { relay, bot } = makeRelay();
    bot.isRunning.mockReturnValue(false);
    expect(relay.isAvailable()).toBe(false);
  });
});
