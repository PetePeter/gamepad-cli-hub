import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { setupTopicInput } from '../src/telegram/topic-input.js';
import type { TelegramBotCore } from '../src/telegram/bot.js';
import type { TopicManager } from '../src/telegram/topic-manager.js';
import type { PtyManager } from '../src/session/pty-manager.js';
import type { TextInputManager } from '../src/telegram/text-input.js';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockBot() {
  return {
    on: vi.fn(),
    removeListener: vi.fn(),
    sendToTopic: vi.fn().mockResolvedValue({ message_id: 1 }),
  } as unknown as TelegramBotCore;
}

function createMockTopicManager() {
  return {
    findSessionByTopicId: vi.fn().mockReturnValue({ id: 'sess-1', name: 'test' }),
  } as unknown as TopicManager;
}

function createMockPtyManager() {
  return {
    write: vi.fn(),
  } as unknown as PtyManager;
}

function createMockTextInput() {
  return {
    handleMessage: vi.fn().mockResolvedValue(false),
  } as unknown as TextInputManager;
}

/** Extract the message handler registered via bot.on('message', handler). */
function getMessageHandler(bot: ReturnType<typeof createMockBot>) {
  const onCalls = (bot.on as any).mock.calls;
  const messageCall = onCalls.find(
    (call: any[]) => call[0] === 'message',
  );
  return messageCall?.[1] as (msg: any) => Promise<void>;
}

describe('setupTopicInput', () => {
  let bot: ReturnType<typeof createMockBot>;
  let topicManager: ReturnType<typeof createMockTopicManager>;
  let ptyManager: ReturnType<typeof createMockPtyManager>;
  let textInput: ReturnType<typeof createMockTextInput>;
  let cleanup: () => void;

  beforeEach(() => {
    bot = createMockBot();
    topicManager = createMockTopicManager();
    ptyManager = createMockPtyManager();
    textInput = createMockTextInput();
    cleanup = setupTopicInput(
      bot as any,
      topicManager as any,
      ptyManager as any,
      textInput as any,
    );
  });

  // -------------------------------------------------------------------------
  // Listener registration / cleanup
  // -------------------------------------------------------------------------

  it('registers a message listener on the bot', () => {
    expect(bot.on).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('cleanup removes the message listener', () => {
    cleanup();

    expect(bot.removeListener).toHaveBeenCalledWith(
      'message',
      expect.any(Function),
    );

    // The same handler reference should be removed
    const registeredHandler = (bot.on as any).mock.calls[0][1];
    const removedHandler = (bot.removeListener as any).mock.calls[0][1];
    expect(registeredHandler).toBe(removedHandler);
  });

  // -------------------------------------------------------------------------
  // Message filtering
  // -------------------------------------------------------------------------

  it('ignores messages without text', async () => {
    const handler = getMessageHandler(bot);
    await handler({ message_thread_id: 42 });

    expect(ptyManager.write).not.toHaveBeenCalled();
    expect(bot.sendToTopic).not.toHaveBeenCalled();
  });

  it('ignores messages starting with /', async () => {
    const handler = getMessageHandler(bot);
    await handler({ text: '/start', message_thread_id: 42 });

    expect(ptyManager.write).not.toHaveBeenCalled();
    expect(bot.sendToTopic).not.toHaveBeenCalled();
  });

  it('ignores messages without message_thread_id', async () => {
    const handler = getMessageHandler(bot);
    await handler({ text: 'hello' });

    expect(ptyManager.write).not.toHaveBeenCalled();
    expect(bot.sendToTopic).not.toHaveBeenCalled();
  });

  it('ignores messages for unknown topics', async () => {
    (topicManager.findSessionByTopicId as any).mockReturnValue(null);

    const handler = getMessageHandler(bot);
    await handler({ text: 'hello', message_thread_id: 999 });

    expect(ptyManager.write).not.toHaveBeenCalled();
    expect(bot.sendToTopic).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // TextInputManager interception
  // -------------------------------------------------------------------------

  it('does not forward to PTY when TextInputManager consumes the message', async () => {
    (textInput.handleMessage as any).mockResolvedValue(true);

    const handler = getMessageHandler(bot);
    await handler({ text: 'consumed', message_thread_id: 42 });

    expect(textInput.handleMessage).toHaveBeenCalled();
    expect(ptyManager.write).not.toHaveBeenCalled();
    expect(bot.sendToTopic).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Normal forwarding
  // -------------------------------------------------------------------------

  it('forwards text to PTY with \\r appended', async () => {
    const handler = getMessageHandler(bot);
    await handler({ text: 'ls -la', message_thread_id: 42 });

    expect(ptyManager.write).toHaveBeenCalledWith('sess-1', 'ls -la\r');
  });

  it('sends confirmation echo to the topic', async () => {
    const handler = getMessageHandler(bot);
    await handler({ text: 'ls -la', message_thread_id: 42 });

    expect(bot.sendToTopic).toHaveBeenCalledWith(
      42,
      expect.stringContaining('ls -la'),
      expect.objectContaining({ parse_mode: 'HTML' }),
    );
  });
});
