import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { TerminalMirror } from '../src/telegram/terminal-mirror.js';
import type { TelegramBotCore } from '../src/telegram/bot.js';
import type { TopicManager } from '../src/telegram/topic-manager.js';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockBot() {
  return {
    sendToTopic: vi.fn().mockResolvedValue({ message_id: 1 }),
    editMessageDebounced: vi.fn().mockResolvedValue(undefined),
    getChatId: vi.fn().mockReturnValue(123),
    getBot: vi.fn().mockReturnValue(null),
  } as unknown as TelegramBotCore;
}

function createMockTopicManager(mapping: Record<string, number> = {}) {
  return {
    getTopicId: vi.fn((sessionId: string) => mapping[sessionId] ?? null),
    findSessionByTopicId: vi.fn(),
  } as unknown as TopicManager;
}

// ---------------------------------------------------------------------------
// Constants (mirrored from source for assertions)
// ---------------------------------------------------------------------------

const MAX_MESSAGE_CHARS = 3500;
const MAX_BUFFER_CHARS = 50_000;

describe('TerminalMirror', () => {
  let bot: ReturnType<typeof createMockBot>;
  let topicManager: ReturnType<typeof createMockTopicManager>;
  let mirror: TerminalMirror;

  beforeEach(() => {
    bot = createMockBot();
    topicManager = createMockTopicManager({ 'sess-1': 42 });
    mirror = new TerminalMirror(bot as any, topicManager as any);
  });

  afterEach(() => {
    mirror.dispose();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Activity-gated output buffering
  // =========================================================================

  describe('feedOutput buffering', () => {
    it('does not flush immediately — only buffers', async () => {
      mirror.feedOutput('sess-1', 'hello world');

      await Promise.resolve();

      expect(bot.sendToTopic).not.toHaveBeenCalled();
      expect(bot.editMessageDebounced).not.toHaveBeenCalled();
    });

    it('ignores feed when topicManager.getTopicId returns null', () => {
      mirror.feedOutput('unknown-session', 'hello');
      mirror.handleActivityChange('unknown-session', 'inactive');

      expect(bot.sendToTopic).not.toHaveBeenCalled();
    });

    it('does nothing when session is paused', async () => {
      mirror.feedOutput('sess-1', 'initial');
      mirror.pause('sess-1');
      mirror.feedOutput('sess-1', 'should-be-ignored');

      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      const calls = (bot.sendToTopic as any).mock.calls;
      if (calls.length > 0) {
        expect(calls[0][1]).not.toContain('should-be-ignored');
      }
    });

    it('accumulates multiple feedOutput calls before flush', async () => {
      mirror.feedOutput('sess-1', 'part1 ');
      mirror.feedOutput('sess-1', 'part2 ');
      mirror.feedOutput('sess-1', 'part3');

      expect(bot.sendToTopic).not.toHaveBeenCalled();

      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      const sentHtml = (bot.sendToTopic as any).mock.calls[0][1] as string;
      expect(sentHtml).toContain('part1');
      expect(sentHtml).toContain('part2');
      expect(sentHtml).toContain('part3');
    });
  });

  // =========================================================================
  // handleActivityChange
  // =========================================================================

  describe('handleActivityChange', () => {
    it('flushes buffer on inactive', async () => {
      mirror.feedOutput('sess-1', 'buffered content');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      expect(bot.sendToTopic).toHaveBeenCalledWith(
        42,
        expect.stringContaining('buffered content'),
        expect.objectContaining({ parse_mode: 'HTML' }),
      );
    });

    it('flushes buffer on idle', async () => {
      mirror.feedOutput('sess-1', 'idle content');
      mirror.handleActivityChange('sess-1', 'idle');
      await Promise.resolve();

      expect(bot.sendToTopic).toHaveBeenCalledWith(
        42,
        expect.stringContaining('idle content'),
        expect.objectContaining({ parse_mode: 'HTML' }),
      );
    });

    it('does not flush on active', async () => {
      mirror.feedOutput('sess-1', 'active content');
      mirror.handleActivityChange('sess-1', 'active');
      await Promise.resolve();

      expect(bot.sendToTopic).not.toHaveBeenCalled();
    });

    it('does nothing when buffer is empty', async () => {
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      expect(bot.sendToTopic).not.toHaveBeenCalled();
    });

    it('does nothing when buffer is whitespace-only', async () => {
      mirror.feedOutput('sess-1', '   \n\n  ');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      expect(bot.sendToTopic).not.toHaveBeenCalled();
    });

    it('clears buffer after flush', async () => {
      mirror.feedOutput('sess-1', 'first burst');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      expect(bot.sendToTopic).toHaveBeenCalledTimes(1);

      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      expect(bot.sendToTopic).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Message lifecycle — new message per burst
  // =========================================================================

  describe('message lifecycle', () => {
    it('sends a new message on each flush (no edit-in-place)', async () => {
      mirror.feedOutput('sess-1', 'burst one');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      mirror.feedOutput('sess-1', 'burst two');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      expect(bot.sendToTopic).toHaveBeenCalledTimes(2);
      expect(bot.editMessageDebounced).not.toHaveBeenCalled();
    });

    it('rapid active→inactive→active→inactive sends two messages', async () => {
      mirror.feedOutput('sess-1', 'first');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      mirror.handleActivityChange('sess-1', 'active');
      mirror.feedOutput('sess-1', 'second');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      expect(bot.sendToTopic).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // Safety flush
  // =========================================================================

  describe('safety flush', () => {
    it('triggers flush when buffer exceeds MAX_BUFFER_CHARS', async () => {
      const bigData = 'x'.repeat(MAX_BUFFER_CHARS + 100);
      mirror.feedOutput('sess-1', bigData);
      await Promise.resolve();

      expect(bot.sendToTopic).toHaveBeenCalledTimes(1);
    });

    it('resets buffer after safety flush', async () => {
      const bigData = 'x'.repeat(MAX_BUFFER_CHARS + 100);
      mirror.feedOutput('sess-1', bigData);
      await Promise.resolve();

      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      expect(bot.sendToTopic).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Content quality
  // =========================================================================

  describe('content quality', () => {
    it('strips ANSI escape codes from flushed content', async () => {
      mirror.feedOutput('sess-1', '\x1b[31mred text\x1b[0m');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      const sentHtml = (bot.sendToTopic as any).mock.calls[0][1] as string;
      expect(sentHtml).toContain('red text');
      expect(sentHtml).not.toContain('\x1b');
    });

    it('collapses carriage-return overwrites (no duplicates)', async () => {
      mirror.feedOutput('sess-1', 'progress 50%\rprogress 100%\n');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      const sentHtml = (bot.sendToTopic as any).mock.calls[0][1] as string;
      expect(sentHtml).toContain('progress 100%');
      expect(sentHtml).not.toContain('progress 50%');
    });

    it('removes noise patterns (spinners, AIAGENT tags)', async () => {
      mirror.feedOutput('sess-1', 'useful\nAIAGENT-IMPLEMENTING\n⠋ Thinking...\nmore useful');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      const sentHtml = (bot.sendToTopic as any).mock.calls[0][1] as string;
      expect(sentHtml).toContain('useful');
      expect(sentHtml).toContain('more useful');
      expect(sentHtml).not.toContain('AIAGENT');
      expect(sentHtml).not.toContain('⠋');
    });

    it('escapes HTML entities in the Telegram message', async () => {
      mirror.feedOutput('sess-1', '<script>alert("xss")</script>');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      const sentHtml = (bot.sendToTopic as any).mock.calls[0][1] as string;
      expect(sentHtml).toContain('&lt;script&gt;');
      expect(sentHtml).not.toContain('<script>');
    });

    it('wraps content in <code> tags', async () => {
      mirror.feedOutput('sess-1', 'some output');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      const sentHtml = (bot.sendToTopic as any).mock.calls[0][1] as string;
      expect(sentHtml).toMatch(/^<code>.*<\/code>$/s);
    });

    it('truncates content via fitToLimit when exceeding MAX_MESSAGE_CHARS', async () => {
      const lines = Array.from({ length: 100 }, (_, i) => `line-${i}-${'a'.repeat(50)}`);
      const bigText = lines.join('\n');
      expect(bigText.length).toBeGreaterThan(MAX_MESSAGE_CHARS);

      mirror.feedOutput('sess-1', bigText);
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      const sentHtml = (bot.sendToTopic as any).mock.calls[0][1] as string;
      expect(sentHtml).toContain('lines omitted');
    });
  });

  // =========================================================================
  // Prompt echo (input tracking)
  // =========================================================================

  describe('trackInput', () => {
    it('accumulates characters in inputBuffer', () => {
      mirror.trackInput('sess-1', 'h');
      mirror.trackInput('sess-1', 'i');

      expect(bot.sendToTopic).not.toHaveBeenCalled();
    });

    it('sends prompt to Telegram on carriage return', async () => {
      mirror.trackInput('sess-1', 'fix the auth bug\r');
      await Promise.resolve();

      expect(bot.sendToTopic).toHaveBeenCalledWith(
        42,
        expect.stringContaining('📝'),
        expect.objectContaining({ parse_mode: 'HTML' }),
      );
      expect(bot.sendToTopic).toHaveBeenCalledWith(
        42,
        expect.stringContaining('fix the auth bug'),
        expect.any(Object),
      );
    });

    it('sends prompt on newline too', async () => {
      mirror.trackInput('sess-1', 'hello\n');
      await Promise.resolve();

      expect(bot.sendToTopic).toHaveBeenCalledWith(
        42,
        expect.stringContaining('hello'),
        expect.any(Object),
      );
    });

    it('strips escape sequences and control chars from prompt', async () => {
      mirror.trackInput('sess-1', 'my \x1b[31mprompt\x1b[0m text\r');
      await Promise.resolve();

      const sentText = (bot.sendToTopic as any).mock.calls[0][1] as string;
      expect(sentText).toContain('my prompt text');
      expect(sentText).not.toContain('\x1b');
    });

    it('skips empty prompts (Enter-only)', () => {
      mirror.trackInput('sess-1', '\r');

      expect(bot.sendToTopic).not.toHaveBeenCalled();
    });

    it('skips control-only input (Ctrl+C)', () => {
      mirror.trackInput('sess-1', '\x03\r');

      expect(bot.sendToTopic).not.toHaveBeenCalled();
    });

    it('skips arrow key sequences', () => {
      mirror.trackInput('sess-1', '\x1b[A\r');

      expect(bot.sendToTopic).not.toHaveBeenCalled();
    });

    it('clears inputBuffer after sending', async () => {
      mirror.trackInput('sess-1', 'first prompt\r');
      await Promise.resolve();

      (bot.sendToTopic as any).mockClear();

      mirror.trackInput('sess-1', '\r');
      expect(bot.sendToTopic).not.toHaveBeenCalled();
    });

    it('formats message as "📝 prompt text"', async () => {
      mirror.trackInput('sess-1', 'test prompt\r');
      await Promise.resolve();

      const sentText = (bot.sendToTopic as any).mock.calls[0][1] as string;
      expect(sentText).toBe('📝 test prompt');
    });

    it('does nothing when no topic ID exists', () => {
      mirror.trackInput('unknown-session', 'hello\r');

      expect(bot.sendToTopic).not.toHaveBeenCalled();
    });

    it('accumulates across multiple trackInput calls before Enter', async () => {
      mirror.trackInput('sess-1', 'he');
      mirror.trackInput('sess-1', 'llo');
      mirror.trackInput('sess-1', ' world\r');
      await Promise.resolve();

      const sentText = (bot.sendToTopic as any).mock.calls[0][1] as string;
      expect(sentText).toContain('hello world');
    });

    it('escapes HTML in prompt text', async () => {
      mirror.trackInput('sess-1', '<b>bold</b>\r');
      await Promise.resolve();

      const sentText = (bot.sendToTopic as any).mock.calls[0][1] as string;
      expect(sentText).toContain('&lt;b&gt;bold&lt;/b&gt;');
    });
  });

  // =========================================================================
  // pause / resume / isPaused
  // =========================================================================

  describe('pause / resume / isPaused', () => {
    it('isPaused returns false for unknown session', () => {
      expect(mirror.isPaused('nonexistent')).toBe(false);
    });

    it('pause → isPaused true, resume → isPaused false', () => {
      mirror.feedOutput('sess-1', 'x');
      expect(mirror.isPaused('sess-1')).toBe(false);

      mirror.pause('sess-1');
      expect(mirror.isPaused('sess-1')).toBe(true);

      mirror.resume('sess-1');
      expect(mirror.isPaused('sess-1')).toBe(false);
    });

    it('resume re-enables output streaming', async () => {
      mirror.feedOutput('sess-1', 'before-pause');
      mirror.pause('sess-1');
      mirror.resume('sess-1');

      mirror.feedOutput('sess-1', ' after-resume');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      expect(bot.sendToTopic).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // removeSession / dispose
  // =========================================================================

  describe('removeSession / dispose', () => {
    it('removeSession clears buffer and state', async () => {
      mirror.feedOutput('sess-1', 'data');
      mirror.removeSession('sess-1');

      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      expect(bot.sendToTopic).not.toHaveBeenCalled();
    });

    it('dispose clears all session states', async () => {
      (topicManager.getTopicId as any).mockImplementation(
        (id: string) => (id === 'sess-1' ? 42 : id === 'sess-2' ? 99 : null),
      );

      mirror.feedOutput('sess-1', 'data1');
      mirror.feedOutput('sess-2', 'data2');

      mirror.dispose();

      mirror.handleActivityChange('sess-1', 'inactive');
      mirror.handleActivityChange('sess-2', 'inactive');
      await Promise.resolve();

      expect(bot.sendToTopic).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Echo stripping — registerEcho
  // =========================================================================

  describe('echo stripping', () => {
    it('strips in-app prompt echo from flush content', async () => {
      // User types "fix the bug" → trackInput sends 📝, PTY echoes it
      mirror.trackInput('sess-1', 'fix the bug\r');
      await Promise.resolve();
      (bot.sendToTopic as any).mockClear();

      // PTY echoes the command then produces real output
      mirror.feedOutput('sess-1', 'fix the bug\nActual useful output\n');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      const sentHtml = (bot.sendToTopic as any).mock.calls[0][1] as string;
      expect(sentHtml).toContain('Actual useful output');
      expect(sentHtml).not.toContain('>fix the bug');
    });

    it('strips Telegram-originated echo from flush content', async () => {
      mirror.registerEcho('sess-1', 'hello world');

      mirror.feedOutput('sess-1', 'hello world\nCLI response here\n');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      const sentHtml = (bot.sendToTopic as any).mock.calls[0][1] as string;
      expect(sentHtml).toContain('CLI response here');
      expect(sentHtml).not.toContain('hello world');
    });

    it('strips only first occurrence of echo (not all matching lines)', async () => {
      mirror.registerEcho('sess-1', 'repeat me');

      mirror.feedOutput('sess-1', 'repeat me\nsome output\nrepeat me\n');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      const sentHtml = (bot.sendToTopic as any).mock.calls[0][1] as string;
      expect(sentHtml).toContain('some output');
      // Second occurrence should remain
      expect(sentHtml).toContain('repeat me');
    });

    it('strips echo only from start of content (first N lines)', async () => {
      // Build output where the echo text appears only deep in the content
      const lines = Array.from({ length: 20 }, (_, i) => `line-${i}`);
      lines.push('my command');
      mirror.registerEcho('sess-1', 'my command');

      mirror.feedOutput('sess-1', lines.join('\n') + '\n');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      const sentHtml = (bot.sendToTopic as any).mock.calls[0][1] as string;
      // Echo appears after first 10 lines, so should NOT be stripped
      expect(sentHtml).toContain('my command');
    });

    it('does not strip expired echoes (>30s)', async () => {
      vi.useFakeTimers();
      try {
        mirror.registerEcho('sess-1', 'old echo');

        // Advance past expiry
        vi.advanceTimersByTime(31_000);

        mirror.feedOutput('sess-1', 'old echo\nfresh output\n');
        mirror.handleActivityChange('sess-1', 'inactive');
        await Promise.resolve();

        const sentHtml = (bot.sendToTopic as any).mock.calls[0][1] as string;
        expect(sentHtml).toContain('old echo');
        expect(sentHtml).toContain('fresh output');
      } finally {
        vi.useRealTimers();
      }
    });

    it('leaves non-matching echoes alone', async () => {
      mirror.registerEcho('sess-1', 'something else');

      mirror.feedOutput('sess-1', 'actual output\nmore output\n');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      const sentHtml = (bot.sendToTopic as any).mock.calls[0][1] as string;
      expect(sentHtml).toContain('actual output');
      expect(sentHtml).toContain('more output');
    });

    it('strips multiple echoes in sequence', async () => {
      mirror.registerEcho('sess-1', 'cmd1');
      mirror.registerEcho('sess-1', 'cmd2');

      mirror.feedOutput('sess-1', 'cmd1\ncmd2\nreal output\n');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      const sentHtml = (bot.sendToTopic as any).mock.calls[0][1] as string;
      expect(sentHtml).toContain('real output');
      expect(sentHtml).not.toContain('cmd1');
      expect(sentHtml).not.toContain('cmd2');
    });

    it('handles echo with special chars (HTML entities)', async () => {
      mirror.registerEcho('sess-1', 'fix <div> & "quotes"');

      mirror.feedOutput('sess-1', 'fix <div> & "quotes"\nactual output\n');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      const sentHtml = (bot.sendToTopic as any).mock.calls[0][1] as string;
      expect(sentHtml).toContain('actual output');
    });

    it('clears matched echoes after flush', async () => {
      mirror.registerEcho('sess-1', 'one-time');

      mirror.feedOutput('sess-1', 'one-time\nfirst burst\n');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();
      (bot.sendToTopic as any).mockClear();

      // Second burst — echo should no longer be registered
      mirror.feedOutput('sess-1', 'one-time\nsecond burst\n');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      const sentHtml = (bot.sendToTopic as any).mock.calls[0][1] as string;
      expect(sentHtml).toContain('one-time');
      expect(sentHtml).toContain('second burst');
    });

    it('does nothing when no topic ID for registerEcho', () => {
      // Should not throw
      mirror.registerEcho('unknown-session', 'test');
    });
  });

  // =========================================================================
  // Content fingerprint guard
  // =========================================================================

  describe('content fingerprint guard', () => {
    it('suppresses identical flush content within window', async () => {
      mirror.feedOutput('sess-1', 'same content');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      expect(bot.sendToTopic).toHaveBeenCalledTimes(1);
      (bot.sendToTopic as any).mockClear();

      // Feed identical content again
      mirror.feedOutput('sess-1', 'same content');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      expect(bot.sendToTopic).not.toHaveBeenCalled();
    });

    it('sends different content normally', async () => {
      mirror.feedOutput('sess-1', 'content A');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      mirror.feedOutput('sess-1', 'content B');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      expect(bot.sendToTopic).toHaveBeenCalledTimes(2);
    });

    it('allows same content after window expires (>3 different messages)', async () => {
      mirror.feedOutput('sess-1', 'original');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      // Send 3 different messages to push original out of window
      for (let i = 0; i < 3; i++) {
        mirror.feedOutput('sess-1', `filler ${i}`);
        mirror.handleActivityChange('sess-1', 'inactive');
        await Promise.resolve();
      }

      (bot.sendToTopic as any).mockClear();

      // Now original content should be allowed again
      mirror.feedOutput('sess-1', 'original');
      mirror.handleActivityChange('sess-1', 'inactive');
      await Promise.resolve();

      expect(bot.sendToTopic).toHaveBeenCalledTimes(1);
    });
  });
});
