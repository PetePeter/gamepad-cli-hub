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
const NORMAL_FLUSH_MS = 1500;
const HIGH_LOAD_FLUSH_MS = 3000;
const HIGH_LOAD_THRESHOLD = 5000;

describe('TerminalMirror', () => {
  let bot: ReturnType<typeof createMockBot>;
  let topicManager: ReturnType<typeof createMockTopicManager>;
  let mirror: TerminalMirror;

  beforeEach(() => {
    vi.useFakeTimers();
    bot = createMockBot();
    topicManager = createMockTopicManager({ 'sess-1': 42 });
    mirror = new TerminalMirror(bot as any, topicManager as any);
  });

  afterEach(() => {
    mirror.dispose();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // feedOutput basics
  // -------------------------------------------------------------------------

  it('ignores feed when topicManager.getTopicId returns null', () => {
    mirror.feedOutput('unknown-session', 'hello');

    vi.advanceTimersByTime(NORMAL_FLUSH_MS + 100);

    expect((bot.sendToTopic as any)).not.toHaveBeenCalled();
    expect((bot.editMessageDebounced as any)).not.toHaveBeenCalled();
  });

  it('creates state and schedules flush on first feedOutput', async () => {
    mirror.feedOutput('sess-1', 'hello');

    // Timer should be pending — nothing sent yet
    expect((bot.sendToTopic as any)).not.toHaveBeenCalled();

    // Advance past normal flush interval
    vi.advanceTimersByTime(NORMAL_FLUSH_MS + 100);
    // Let async flush settle
    await vi.runAllTimersAsync();

    expect((bot.sendToTopic as any)).toHaveBeenCalled();
  });

  it('does nothing when session is paused', async () => {
    // Feed once to create state
    mirror.feedOutput('sess-1', 'initial');
    mirror.pause('sess-1');

    // Feed again while paused
    mirror.feedOutput('sess-1', 'should-be-ignored');

    vi.advanceTimersByTime(NORMAL_FLUSH_MS + 100);
    await vi.runAllTimersAsync();

    // Only one sendToTopic from the initial feed, not the paused one
    const calls = (bot.sendToTopic as any).mock.calls;
    // The initial feed's flush should contain only 'initial'
    if (calls.length > 0) {
      expect(calls[0][1]).not.toContain('should-be-ignored');
    }
  });

  // -------------------------------------------------------------------------
  // pause / resume / isPaused
  // -------------------------------------------------------------------------

  describe('pause / resume / isPaused', () => {
    it('isPaused returns false for unknown session', () => {
      expect(mirror.isPaused('nonexistent')).toBe(false);
    });

    it('pause → isPaused true, resume → isPaused false', () => {
      mirror.feedOutput('sess-1', 'x'); // create state
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

      vi.advanceTimersByTime(NORMAL_FLUSH_MS + 100);
      await vi.runAllTimersAsync();

      expect((bot.sendToTopic as any)).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // flush: send new vs edit existing
  // -------------------------------------------------------------------------

  it('sends a new message when no messageId exists', async () => {
    mirror.feedOutput('sess-1', 'first output');

    vi.advanceTimersByTime(NORMAL_FLUSH_MS + 100);
    await vi.runAllTimersAsync();

    expect((bot.sendToTopic as any)).toHaveBeenCalledWith(
      42,
      expect.stringContaining('first output'),
      expect.objectContaining({ parse_mode: 'HTML' }),
    );
  });

  it('edits existing message when messageId exists', async () => {
    // First feed → creates new message (gets messageId=1)
    mirror.feedOutput('sess-1', 'first');
    vi.advanceTimersByTime(NORMAL_FLUSH_MS + 100);
    await vi.runAllTimersAsync();

    expect((bot.sendToTopic as any)).toHaveBeenCalledTimes(1);

    // Second feed → should edit, not send new
    mirror.feedOutput('sess-1', ' second');
    vi.advanceTimersByTime(NORMAL_FLUSH_MS + 100);
    await vi.runAllTimersAsync();

    expect((bot.editMessageDebounced as any)).toHaveBeenCalledWith(
      123,
      1,
      expect.stringContaining('second'),
      expect.objectContaining({ parse_mode: 'HTML', message_thread_id: 42 }),
      42,
    );
  });

  // -------------------------------------------------------------------------
  // ANSI stripping
  // -------------------------------------------------------------------------

  describe('ANSI stripping', () => {
    it('strips CSI color codes', async () => {
      mirror.feedOutput('sess-1', '\x1b[31mred text\x1b[0m');

      vi.advanceTimersByTime(NORMAL_FLUSH_MS + 100);
      await vi.runAllTimersAsync();

      const sentHtml = (bot.sendToTopic as any).mock.calls[0][1] as string;
      expect(sentHtml).toContain('red text');
      expect(sentHtml).not.toContain('\x1b');
    });

    it('strips OSC sequences', async () => {
      mirror.feedOutput('sess-1', '\x1b]0;window title\x07visible');

      vi.advanceTimersByTime(NORMAL_FLUSH_MS + 100);
      await vi.runAllTimersAsync();

      const sentHtml = (bot.sendToTopic as any).mock.calls[0][1] as string;
      expect(sentHtml).toContain('visible');
      expect(sentHtml).not.toContain('window title');
    });

    it('strips carriage returns', async () => {
      mirror.feedOutput('sess-1', 'line1\r\nline2\r');

      vi.advanceTimersByTime(NORMAL_FLUSH_MS + 100);
      await vi.runAllTimersAsync();

      const sentHtml = (bot.sendToTopic as any).mock.calls[0][1] as string;
      expect(sentHtml).not.toContain('\r');
      expect(sentHtml).toContain('line1');
      expect(sentHtml).toContain('line2');
    });
  });

  // -------------------------------------------------------------------------
  // Message rotation (freeze + new message)
  // -------------------------------------------------------------------------

  it('freezes message and starts new when content exceeds 90% of limit', async () => {
    // Fill first message near the 90% threshold
    const bigChunk = 'x'.repeat(Math.floor(MAX_MESSAGE_CHARS * 0.92));
    mirror.feedOutput('sess-1', bigChunk);

    vi.advanceTimersByTime(NORMAL_FLUSH_MS + 100);
    await vi.runAllTimersAsync();

    // First call: sendToTopic (new message)
    expect((bot.sendToTopic as any)).toHaveBeenCalledTimes(1);

    // Feed more data — should trigger freeze → new message
    mirror.feedOutput('sess-1', 'new chunk after freeze');
    vi.advanceTimersByTime(NORMAL_FLUSH_MS + 100);
    await vi.runAllTimersAsync();

    // Second call should be a new sendToTopic, not editMessageDebounced
    expect((bot.sendToTopic as any)).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Middle-line truncation
  // -------------------------------------------------------------------------

  it('truncates middle lines when text exceeds MAX_MESSAGE_CHARS', async () => {
    // Build text with many lines that exceeds the limit
    const lines = Array.from({ length: 100 }, (_, i) => `line-${i}-${'a'.repeat(50)}`);
    const bigText = lines.join('\n');
    expect(bigText.length).toBeGreaterThan(MAX_MESSAGE_CHARS);

    mirror.feedOutput('sess-1', bigText);

    vi.advanceTimersByTime(NORMAL_FLUSH_MS + 100);
    await vi.runAllTimersAsync();

    const sentHtml = (bot.sendToTopic as any).mock.calls[0][1] as string;
    expect(sentHtml).toContain('lines omitted');
  });

  // -------------------------------------------------------------------------
  // removeSession / dispose
  // -------------------------------------------------------------------------

  it('removeSession clears state for that session', async () => {
    mirror.feedOutput('sess-1', 'data');
    mirror.removeSession('sess-1');

    vi.advanceTimersByTime(NORMAL_FLUSH_MS + 100);
    await vi.runAllTimersAsync();

    // Flush should not send because state was removed
    expect((bot.sendToTopic as any)).not.toHaveBeenCalled();
  });

  it('dispose clears all session states', async () => {
    // Create a second session mapping
    (topicManager.getTopicId as any).mockImplementation(
      (id: string) => (id === 'sess-1' ? 42 : id === 'sess-2' ? 99 : null),
    );

    mirror.feedOutput('sess-1', 'data1');
    mirror.feedOutput('sess-2', 'data2');

    mirror.dispose();

    vi.advanceTimersByTime(NORMAL_FLUSH_MS + 100);
    await vi.runAllTimersAsync();

    expect((bot.sendToTopic as any)).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // High-load mode
  // -------------------------------------------------------------------------

  it('uses longer flush interval under high load', async () => {
    // Feed data exceeding HIGH_LOAD_THRESHOLD in one burst
    const bigData = 'x'.repeat(HIGH_LOAD_THRESHOLD + 1000);
    mirror.feedOutput('sess-1', bigData);

    // At NORMAL_FLUSH_MS, flush should NOT have fired yet
    vi.advanceTimersByTime(NORMAL_FLUSH_MS + 100);
    // Let microtasks settle but don't advance more timers
    await Promise.resolve();

    expect((bot.sendToTopic as any)).not.toHaveBeenCalled();

    // Advance to HIGH_LOAD_FLUSH_MS — flush should fire now
    vi.advanceTimersByTime(HIGH_LOAD_FLUSH_MS - NORMAL_FLUSH_MS);
    await vi.runAllTimersAsync();

    expect((bot.sendToTopic as any)).toHaveBeenCalled();
  });
});
