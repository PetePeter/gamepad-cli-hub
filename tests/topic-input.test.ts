import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { setupTopicInput } from '../src/telegram/topic-input.js';
import type { TelegramBotCore } from '../src/telegram/bot.js';
import type { TopicManager } from '../src/telegram/topic-manager.js';
import type { PtyManager } from '../src/session/pty-manager.js';
import type { TextInputManager } from '../src/telegram/text-input.js';
import type { SessionManager } from '../src/session/manager.js';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockBot() {
  return {
    on: vi.fn(),
    removeListener: vi.fn(),
    sendToTopic: vi.fn().mockResolvedValue({ message_id: 1 }),
    sendMessage: vi.fn().mockResolvedValue({ message_id: 2 }),
  } as unknown as TelegramBotCore;
}

function createMockTopicManager() {
  return {
    findSessionByTopicId: vi.fn().mockReturnValue({ id: 'sess-1', name: 'test' }),
    getTopicId: vi.fn().mockReturnValue(null),
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

function createMockSessionManager(active?: { id: string; name: string }) {
  return {
    getActiveSession: vi.fn().mockReturnValue(active ?? null),
  } as unknown as SessionManager;
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
  let sessionManager: ReturnType<typeof createMockSessionManager>;
  let cleanup: () => void;

  beforeEach(() => {
    bot = createMockBot();
    topicManager = createMockTopicManager();
    ptyManager = createMockPtyManager();
    textInput = createMockTextInput();
    sessionManager = createMockSessionManager();
    cleanup = setupTopicInput(
      bot as any,
      topicManager as any,
      ptyManager as any,
      textInput as any,
      undefined,
      sessionManager as any,
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

  it('sends error when no active session and no topic mapping', async () => {
    const handler = getMessageHandler(bot);
    await handler({ text: 'hello' });

    expect(ptyManager.write).not.toHaveBeenCalled();
    expect(bot.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('No active session'),
      expect.any(Object),
    );
  });

  it('sends error for unknown topics when no active session', async () => {
    (topicManager.findSessionByTopicId as any).mockReturnValue(null);

    const handler = getMessageHandler(bot);
    await handler({ text: 'hello', message_thread_id: 999 });

    expect(ptyManager.write).not.toHaveBeenCalled();
    expect(bot.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('No active session'),
      expect.objectContaining({ message_thread_id: 999 }),
    );
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

  // -------------------------------------------------------------------------
  // Echo registration with TerminalMirror
  // -------------------------------------------------------------------------

  it('registers echo with TerminalMirror when forwarding to PTY', async () => {
    const mockMirror = { registerEcho: vi.fn() };
    const cleanupWithMirror = setupTopicInput(
      bot as any,
      topicManager as any,
      ptyManager as any,
      textInput as any,
      mockMirror as any,
    );

    const onCalls = (bot.on as any).mock.calls;
    const handler = onCalls[onCalls.length - 1][1] as (msg: any) => Promise<void>;
    await handler({ text: 'hello', message_thread_id: 42 });

    expect(mockMirror.registerEcho).toHaveBeenCalledWith('sess-1', 'hello');
    cleanupWithMirror();
  });

  it('works without TerminalMirror (optional param)', async () => {
    const handler = getMessageHandler(bot);
    // Should not throw when no mirror is provided
    await handler({ text: 'hello', message_thread_id: 42 });
    expect(ptyManager.write).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Active session fallback (direct text routing)
  // -------------------------------------------------------------------------

  it('falls back to active session when message has no thread_id', async () => {
    (sessionManager.getActiveSession as any).mockReturnValue({ id: 'active-1', name: 'main' });

    const handler = getMessageHandler(bot);
    await handler({ text: 'hello' });

    expect(ptyManager.write).toHaveBeenCalledWith('active-1', 'hello\r');
  });

  it('falls back to active session for unmapped topic', async () => {
    (topicManager.findSessionByTopicId as any).mockReturnValue(null);
    (sessionManager.getActiveSession as any).mockReturnValue({ id: 'active-1', name: 'main' });

    const handler = getMessageHandler(bot);
    await handler({ text: 'pwd', message_thread_id: 999 });

    expect(ptyManager.write).toHaveBeenCalledWith('active-1', 'pwd\r');
  });

  it('sends echo via sendMessage (not sendToTopic) when no thread_id', async () => {
    (sessionManager.getActiveSession as any).mockReturnValue({ id: 'active-1', name: 'main' });

    const handler = getMessageHandler(bot);
    await handler({ text: 'hello' });

    expect(bot.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('hello'),
      expect.objectContaining({ parse_mode: 'HTML' }),
    );
    expect(bot.sendToTopic).not.toHaveBeenCalled();
  });

  it('skips reply keyboard buttons', async () => {
    (sessionManager.getActiveSession as any).mockReturnValue({ id: 'active-1', name: 'main' });

    const handler = getMessageHandler(bot);
    // Test with a known reply keyboard label
    await handler({ text: '📂 Sessions' });

    expect(ptyManager.write).not.toHaveBeenCalled();
  });
});
