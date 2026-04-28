import { describe, expect, it, vi } from 'vitest';
import { TelegramRelayService } from '../src/telegram/relay-service.js';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeRelay() {
  const bot = {
    isRunning: vi.fn(() => true),
    sendToTopic: vi.fn().mockResolvedValue({ message_id: 12 }),
    sendMessage: vi.fn().mockResolvedValue({ message_id: 13 }),
  };
  const session = { id: 's1', name: 'Claude', cliType: 'claude-code', topicId: 42 };
  const topicManager = {
    ensureTopic: vi.fn(async () => 42),
    getSessionIdByTopic: vi.fn(() => 's1'),
  };
  const sessionManager = {
    getSession: vi.fn((id: string) => id === 's1' ? session : null),
    getActiveSession: vi.fn(() => session),
  };
  const ptyManager = {};
  const helmControl = {
    sendTextToSession: vi.fn().mockResolvedValue({ success: true, sessionId: 's1', name: 'Claude' }),
  };
  const relay = new TelegramRelayService(
    bot as any,
    topicManager as any,
    sessionManager as any,
    ptyManager as any,
    helmControl as any,
  );
  return { relay, bot, topicManager, sessionManager, helmControl };
}

describe('TelegramRelayService channels', () => {
  it('creates a session channel and sends mobile-safe HTML through the topic', async () => {
    const { relay, bot, topicManager } = makeRelay();

    const channel = await relay.createChannel({ sessionId: 's1', expectsResponse: true });
    const sent = await relay.sendToUser({
      channelId: channel.id,
      text: 'Use <main> branch?',
      expectsResponse: true,
    });

    expect(topicManager.ensureTopic).toHaveBeenCalled();
    expect(bot.sendToTopic).toHaveBeenCalledWith(
      42,
      expect.stringContaining('Use &lt;main&gt; branch?'),
      { parse_mode: 'HTML' },
    );
    expect(sent.sent).toBe(true);
    expect(sent.channel.expectsResponse).toBe(true);
  });

  it('upgrades a reused channel when a response is later requested', async () => {
    const { relay } = makeRelay();

    const first = await relay.createChannel({ sessionId: 's1', expectsResponse: false });
    const second = await relay.createChannel({ sessionId: 's1', expectsResponse: true });

    expect(second.id).toBe(first.id);
    expect(second.expectsResponse).toBe(true);
  });

  it('routes Telegram replies back to the originating session before topic fallback', async () => {
    const { relay, helmControl, bot } = makeRelay();
    const channel = await relay.createChannel({ sessionId: 's1', expectsResponse: true });
    expect(channel.topicId).toBe(42);

    const consumed = await relay.handleIncomingTelegramMessage({
      message_id: 77,
      message_thread_id: 42,
      text: 'Yes, ship it',
    } as any);

    expect(consumed).toBe(true);
    expect(helmControl.sendTextToSession).toHaveBeenCalledWith('s1', 'Yes, ship it', {
      senderSessionId: 'telegram-relay',
      senderSessionName: 'Telegram Relay',
      expectsResponse: false,
    });
    expect(bot.sendToTopic).toHaveBeenCalledWith(42, 'Sent to session.');
  });

  it('does not consume ordinary topic messages when no pending channel expects a reply', async () => {
    const { relay, helmControl } = makeRelay();
    await relay.createChannel({ sessionId: 's1', expectsResponse: false });

    const consumed = await relay.handleIncomingTelegramMessage({
      message_id: 77,
      message_thread_id: 42,
      text: 'normal terminal input',
    } as any);

    expect(consumed).toBe(false);
    expect(helmControl.sendTextToSession).not.toHaveBeenCalled();
  });

  it('sends compatibility replies back to the pending Telegram topic', async () => {
    const { relay, bot } = makeRelay();
    await relay.sendToSession({
      id: 'msg1',
      topicId: 42,
      messageId: 7,
      userId: 99,
      text: 'Question for the session',
      timestamp: Date.now(),
    });
    const token = (relay as any).pendingReplies.keys().next().value as string;

    await expect(relay.receiveFromSession({
      sessionId: 's1',
      text: 'Session answer',
      replyTo: token,
      timestamp: Date.now(),
    })).resolves.toBe(true);

    expect(bot.sendToTopic).toHaveBeenCalledWith(
      42,
      expect.stringContaining('Session answer'),
      { parse_mode: 'HTML' },
    );
  });
});
