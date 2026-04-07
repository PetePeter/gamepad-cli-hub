// src/telegram/terminal-mirror.ts

/**
 * Streams PTY output to Telegram forum topics as continuously-edited messages.
 *
 * Each session gets a "current message" in its topic. New output is appended
 * to this message via editMessageText. When the message reaches the size limit,
 * it's frozen and a new message is started.
 *
 * Backpressure: when output rate exceeds threshold, dynamically increases
 * debounce interval and truncates middle lines with "... N lines omitted ...".
 */

import type { TelegramBotCore } from './bot.js';
import type { TopicManager } from './topic-manager.js';
import { escapeHtml, cleanTerminalOutput } from './utils.js';
import { logger } from '../utils/logger.js';

/** Max chars in a single Telegram message (leave room for formatting) */
const MAX_MESSAGE_CHARS = 3500;

/** Normal flush interval (ms) */
const NORMAL_FLUSH_MS = 1500;

/** High-load flush interval (ms) */
const HIGH_LOAD_FLUSH_MS = 3000;

/** Bytes/sec threshold to trigger high-load mode */
const HIGH_LOAD_THRESHOLD = 5000;

/** Max lines to show when truncating (head + tail) */
const TRUNCATE_HEAD_LINES = 10;
const TRUNCATE_TAIL_LINES = 15;

interface MirrorState {
  /** Accumulated unflushed output */
  buffer: string;
  /** The content of the current Telegram message */
  currentContent: string;
  /** Message ID of the current editable message, null if none yet */
  messageId: number | null;
  /** Topic ID for this session */
  topicId: number;
  /** Timer for debounced flushing */
  flushTimer: ReturnType<typeof setTimeout> | null;
  /** Whether streaming is paused */
  paused: boolean;
  /** Output rate tracking: bytes received in the last second */
  recentBytes: number;
  /** Timestamp of last rate reset */
  rateResetTime: number;
}

export class TerminalMirror {
  private mirrors: Map<string, MirrorState> = new Map();

  constructor(
    private bot: TelegramBotCore,
    private topicManager: TopicManager,
  ) {}

  /**
   * Feed PTY output for a session.
   * Called on every pty:data event.
   */
  feedOutput(sessionId: string, data: string): void {
    const topicId = this.topicManager.getTopicId(sessionId);
    if (!topicId) return;

    let state = this.mirrors.get(sessionId);
    if (!state) {
      state = this.createState(topicId);
      this.mirrors.set(sessionId, state);
    }

    if (state.paused) return;

    this.updateRate(state, data.length);
    state.buffer += data;
    this.scheduleFlush(sessionId, state);
  }

  /** Pause output streaming for a session. */
  pause(sessionId: string): void {
    const state = this.mirrors.get(sessionId);
    if (state) state.paused = true;
  }

  /** Resume output streaming for a session. */
  resume(sessionId: string): void {
    const state = this.mirrors.get(sessionId);
    if (state) state.paused = false;
  }

  /** Check if a session's mirror is paused. */
  isPaused(sessionId: string): boolean {
    return this.mirrors.get(sessionId)?.paused ?? false;
  }

  /** Remove a session's mirror state. */
  removeSession(sessionId: string): void {
    const state = this.mirrors.get(sessionId);
    if (state?.flushTimer) clearTimeout(state.flushTimer);
    this.mirrors.delete(sessionId);
  }

  /** Clean up all mirrors. */
  dispose(): void {
    for (const [, state] of this.mirrors) {
      if (state.flushTimer) clearTimeout(state.flushTimer);
    }
    this.mirrors.clear();
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private createState(topicId: number): MirrorState {
    return {
      buffer: '',
      currentContent: '',
      messageId: null,
      topicId,
      flushTimer: null,
      paused: false,
      recentBytes: 0,
      rateResetTime: Date.now(),
    };
  }

  private updateRate(state: MirrorState, byteCount: number): void {
    const now = Date.now();
    if (now - state.rateResetTime > 1000) {
      state.recentBytes = 0;
      state.rateResetTime = now;
    }
    state.recentBytes += byteCount;
  }

  private scheduleFlush(sessionId: string, state: MirrorState): void {
    if (state.flushTimer) return;

    const interval = state.recentBytes > HIGH_LOAD_THRESHOLD
      ? HIGH_LOAD_FLUSH_MS
      : NORMAL_FLUSH_MS;
    state.flushTimer = setTimeout(() => this.flush(sessionId), interval);
  }

  private async flush(sessionId: string): Promise<void> {
    const state = this.mirrors.get(sessionId);
    if (!state || state.buffer.length === 0) {
      if (state) state.flushTimer = null;
      return;
    }

    state.flushTimer = null;

    const newText = cleanTerminalOutput(state.buffer);
    state.buffer = '';

    if (!newText.trim()) return;

    const combined = this.buildContent(state, newText);
    state.currentContent = combined;

    await this.sendOrEdit(sessionId, state, combined);
  }

  /**
   * Combine new text with existing content. If the current message is nearly
   * full, freeze it and start fresh with only the new text.
   */
  private buildContent(state: MirrorState, newText: string): string {
    const shouldFreeze =
      state.currentContent.length > MAX_MESSAGE_CHARS * 0.9 && state.messageId;

    if (shouldFreeze) {
      state.messageId = null;
      state.currentContent = '';
      return fitToLimit(newText);
    }

    return fitToLimit(state.currentContent + newText);
  }

  private async sendOrEdit(
    sessionId: string,
    state: MirrorState,
    content: string,
  ): Promise<void> {
    const formatted = `<code>${escapeHtml(content)}</code>`;

    try {
      if (state.messageId) {
        await this.editExisting(state, formatted);
      } else {
        await this.sendNew(state, formatted);
      }
    } catch (err) {
      logger.error(`[TerminalMirror] Flush failed for ${sessionId}: ${err}`);
    }
  }

  private async editExisting(
    state: MirrorState,
    formatted: string,
  ): Promise<void> {
    const chatId = this.bot.getChatId();
    if (!chatId || !state.messageId) return;

    await this.bot.editMessageDebounced(
      chatId,
      state.messageId,
      formatted,
      { parse_mode: 'HTML', message_thread_id: state.topicId },
      state.topicId,
    );
  }

  private async sendNew(
    state: MirrorState,
    formatted: string,
  ): Promise<void> {
    const msg = await this.bot.sendToTopic(state.topicId, formatted, {
      parse_mode: 'HTML',
    });
    if (msg) {
      state.messageId = msg.message_id;
    }
  }
}

// ==========================================================================
// Helpers (module-private)
// ==========================================================================

/** Ensure content fits within MAX_MESSAGE_CHARS, truncating middle if needed. */
function fitToLimit(text: string): string {
  if (text.length <= MAX_MESSAGE_CHARS) return text;
  return truncateMiddle(text, MAX_MESSAGE_CHARS);
}

/**
 * Truncate content by removing middle lines, keeping head and tail.
 * Inserts "... N lines omitted ..." in the middle.
 */
function truncateMiddle(text: string, maxChars: number): string {
  const lines = text.split('\n');
  const minLines = TRUNCATE_HEAD_LINES + TRUNCATE_TAIL_LINES + 1;

  if (lines.length <= minLines) {
    // Not enough lines to truncate meaningfully — keep the tail
    return text.slice(-maxChars);
  }

  const head = lines.slice(0, TRUNCATE_HEAD_LINES);
  const tail = lines.slice(-TRUNCATE_TAIL_LINES);
  const omitted = lines.length - TRUNCATE_HEAD_LINES - TRUNCATE_TAIL_LINES;

  const result = [...head, `\n... ${omitted} lines omitted ...\n`, ...tail].join('\n');

  // If still too long after line-based truncation, hard-trim from end
  if (result.length > maxChars) {
    return result.slice(-maxChars);
  }

  return result;
}


