import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../src/telegram/keyboards.js', () => ({
  confirmSendKeyboard: vi.fn((sessionId: string) => [[
    { text: '✅ Send', callback_data: `send:confirm:${sessionId}` },
    { text: '❌ Cancel', callback_data: `send:cancel:${sessionId}` },
  ]]),
}));

import { TextInputManager } from '../src/telegram/text-input.js';
import type { TelegramBotCore } from '../src/telegram/bot.js';
import type { TopicManager } from '../src/telegram/topic-manager.js';
import type { PtyManager } from '../src/session/pty-manager.js';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockBot() {
  return {
    sendToTopic: vi.fn(),
    getBot: vi.fn(() => ({ sendMessage: vi.fn() })),
  } as unknown as TelegramBotCore;
}

function createMockTopicManager(mapping: Record<number, any> = {}, reverseMapping: Record<string, number> = {}) {
  return {
    findSessionByTopicId: vi.fn((topicId: number) => mapping[topicId] ?? null),
    getTopicId: vi.fn((sessionId: string) => reverseMapping[sessionId] ?? null),
  } as unknown as TopicManager;
}

function createMockPtyManager() {
  return {
    write: vi.fn(),
  } as unknown as PtyManager;
}

function makeMessage(text: string, userId: number, topicId?: number) {
  return {
    text,
    from: { id: userId },
    message_thread_id: topicId,
    chat: { id: 100 },
    date: Date.now(),
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TextInputManager', () => {
  let bot: ReturnType<typeof createMockBot>;
  let topicManager: ReturnType<typeof createMockTopicManager>;
  let ptyManager: ReturnType<typeof createMockPtyManager>;
  let manager: TextInputManager;

  beforeEach(() => {
    bot = createMockBot();
    topicManager = createMockTopicManager(
      { 10: { id: 's1', name: 'Test' } },
      { s1: 10 },
    );
    ptyManager = createMockPtyManager();
    manager = new TextInputManager(bot as any, topicManager as any, ptyManager as any);
  });

  describe('startInput', () => {
    it('registers a pending input for the session', () => {
      manager.startInput('s1', 1000);
      expect(manager.hasPendingInput('s1')).toBe(true);
    });

    it('replaces a previous pending input for the same session', () => {
      manager.startInput('s1', 1000);
      manager.startInput('s1', 2000);
      expect(manager.hasPendingInput('s1')).toBe(true);
    });
  });

  describe('hasPendingInput', () => {
    it('returns false for sessions with no pending input', () => {
      expect(manager.hasPendingInput('s1')).toBe(false);
    });

    it('returns false for expired inputs', () => {
      manager.startInput('s1', 1000);
      // Manually expire the pending input
      const pending = (manager as any).pendingInputs.get('s1');
      pending.createdAt = Date.now() - 6 * 60 * 1000; // 6 minutes ago

      expect(manager.hasPendingInput('s1')).toBe(false);
    });
  });

  describe('handleMessage — safe mode (default)', () => {
    it('returns false for messages without text', async () => {
      manager.startInput('s1', 1000);
      const result = await manager.handleMessage({ message_thread_id: 10, from: { id: 1000 } } as any);
      expect(result).toBe(false);
    });

    it('returns false for command messages', async () => {
      manager.startInput('s1', 1000);
      const result = await manager.handleMessage(makeMessage('/status', 1000, 10));
      expect(result).toBe(false);
    });

    it('returns false when not in a topic', async () => {
      manager.startInput('s1', 1000);
      const result = await manager.handleMessage(makeMessage('hello', 1000));
      expect(result).toBe(false);
    });

    it('returns false when topic has no matching session', async () => {
      topicManager = createMockTopicManager();
      manager = new TextInputManager(bot as any, topicManager as any, ptyManager as any);
      manager.startInput('s1', 1000);

      const result = await manager.handleMessage(makeMessage('hello', 1000, 10));
      expect(result).toBe(false);
    });

    it('returns false when no pending input for the session', async () => {
      const result = await manager.handleMessage(makeMessage('hello', 1000, 10));
      expect(result).toBe(false);
    });

    it('returns false when message is from a different user', async () => {
      manager.startInput('s1', 1000);
      const result = await manager.handleMessage(makeMessage('hello', 9999, 10));
      expect(result).toBe(false);
    });

    it('shows confirmation preview in safe mode', async () => {
      manager.startInput('s1', 1000);
      const result = await manager.handleMessage(makeMessage('hello world', 1000, 10));

      expect(result).toBe(true);
      expect(bot.sendToTopic).toHaveBeenCalledWith(
        10,
        expect.stringContaining('hello world'),
        expect.objectContaining({ parse_mode: 'HTML' }),
      );
      // Should NOT write to PTY yet
      expect(ptyManager.write).not.toHaveBeenCalled();
    });

    it('escapes HTML in the preview', async () => {
      manager.startInput('s1', 1000);
      await manager.handleMessage(makeMessage('<script>alert(1)</script>', 1000, 10));

      const sentText = (bot.sendToTopic as any).mock.calls[0][1];
      expect(sentText).toContain('&lt;script&gt;');
      expect(sentText).not.toContain('<script>');
    });
  });

  describe('handleMessage — quick mode', () => {
    it('sends immediately without confirmation', async () => {
      manager.setSafeMode(false);
      manager.startInput('s1', 1000);

      const result = await manager.handleMessage(makeMessage('hello', 1000, 10));

      expect(result).toBe(true);
      expect(ptyManager.write).toHaveBeenCalledWith('s1', 'hello\r');
      expect(manager.hasPendingInput('s1')).toBe(false);
    });
  });

  describe('confirmInput', () => {
    it('writes text + CR to PTY and clears pending', async () => {
      manager.startInput('s1', 1000);
      // Simulate user typing
      await manager.handleMessage(makeMessage('my prompt', 1000, 10));

      await manager.confirmInput('s1');

      expect(ptyManager.write).toHaveBeenCalledWith('s1', 'my prompt\r');
      expect(manager.hasPendingInput('s1')).toBe(false);
    });

    it('sends confirmation message to topic', async () => {
      manager.startInput('s1', 1000);
      await manager.handleMessage(makeMessage('test input', 1000, 10));
      vi.mocked(bot.sendToTopic).mockClear();

      await manager.confirmInput('s1');

      expect(bot.sendToTopic).toHaveBeenCalledWith(
        10,
        expect.stringContaining('test input'),
        expect.objectContaining({ parse_mode: 'HTML' }),
      );
    });

    it('does nothing when no pending text', async () => {
      manager.startInput('s1', 1000);
      // Don't send a message, so no text captured
      await manager.confirmInput('s1');

      expect(ptyManager.write).not.toHaveBeenCalled();
    });
  });

  describe('cancelInput', () => {
    it('clears the pending input', () => {
      manager.startInput('s1', 1000);
      manager.cancelInput('s1');
      expect(manager.hasPendingInput('s1')).toBe(false);
    });
  });

  describe('dispose', () => {
    it('clears all pending inputs', () => {
      manager.startInput('s1', 1000);
      manager.startInput('s2', 2000);
      manager.dispose();

      expect(manager.hasPendingInput('s1')).toBe(false);
      expect(manager.hasPendingInput('s2')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Echo registration with TerminalMirror
  // -------------------------------------------------------------------------

  describe('echo registration', () => {
    it('registers echo with TerminalMirror on confirmInput', async () => {
      const mockMirror = { registerEcho: vi.fn() };
      const managerWithMirror = new TextInputManager(
        bot as any, topicManager as any, ptyManager as any, mockMirror as any,
      );

      managerWithMirror.startInput('s1', 1000);
      await managerWithMirror.handleMessage(makeMessage('my prompt', 1000, 10));
      await managerWithMirror.confirmInput('s1');

      expect(mockMirror.registerEcho).toHaveBeenCalledWith('s1', 'my prompt');
    });

    it('registers echo with TerminalMirror on sendImmediately (quick mode)', async () => {
      const mockMirror = { registerEcho: vi.fn() };
      const managerWithMirror = new TextInputManager(
        bot as any, topicManager as any, ptyManager as any, mockMirror as any,
      );

      managerWithMirror.setSafeMode(false);
      managerWithMirror.startInput('s1', 1000);
      await managerWithMirror.handleMessage(makeMessage('quick msg', 1000, 10));

      expect(mockMirror.registerEcho).toHaveBeenCalledWith('s1', 'quick msg');
    });

    it('works without TerminalMirror (optional param)', async () => {
      // manager constructed without mirror in beforeEach — should not throw
      manager.startInput('s1', 1000);
      await manager.handleMessage(makeMessage('test', 1000, 10));
      await manager.confirmInput('s1');
      expect(ptyManager.write).toHaveBeenCalled();
    });
  });
});
