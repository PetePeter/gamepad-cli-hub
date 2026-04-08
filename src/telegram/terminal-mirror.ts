// src/telegram/terminal-mirror.ts

/**
 * Activity-gated PTY output mirroring to Telegram forum topics.
 *
 * Instead of streaming output in real-time, buffers PTY data while the session
 * is active (green dot). Flushes settled content as a single new message when
 * the session transitions to inactive (blue dot, >10s silence) or idle.
 *
 * Also tracks user input from the in-app terminal and echoes prompts to
 * Telegram immediately on Enter — creating a natural prompt→response flow.
 */

import type { TelegramBotCore } from './bot.js';
import type { TopicManager } from './topic-manager.js';
import type { ActivityLevel } from '../types/session.js';
import { escapeHtml, cleanTerminalOutput, stripAnsi } from './utils.js';
import { logger } from '../utils/logger.js';

/** Max chars in a single Telegram message (leave room for formatting) */
const MAX_MESSAGE_CHARS = 3500;

/** Safety cap: flush immediately if buffer grows beyond this */
const MAX_BUFFER_CHARS = 50_000;

/** Max lines to show when truncating (head + tail) */
const TRUNCATE_HEAD_LINES = 10;
const TRUNCATE_TAIL_LINES = 15;

interface MirrorState {
  /** Accumulated unflushed PTY output */
  buffer: string;
  /** Topic ID for this session */
  topicId: number;
  /** Whether streaming is paused */
  paused: boolean;
  /** Accumulated user input (for prompt echo) */
  inputBuffer: string;
}

export class TerminalMirror {
  private mirrors: Map<string, MirrorState> = new Map();

  constructor(
    private bot: TelegramBotCore,
    private topicManager: TopicManager,
  ) {}

  /**
   * Feed PTY output for a session.
   * Buffers data without flushing — waits for activity-change trigger.
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

    state.buffer += data;

    if (state.buffer.length > MAX_BUFFER_CHARS) {
      this.flush(sessionId);
    }
  }

  /**
   * Handle activity level change from StateDetector.
   * Flushes buffered output when session goes inactive or idle.
   */
  handleActivityChange(sessionId: string, level: ActivityLevel): void {
    if (level === 'inactive' || level === 'idle') {
      this.flush(sessionId);
    }
  }

  /**
   * Track user input from the in-app terminal (pty:write IPC).
   * Accumulates typed characters; sends prompt to Telegram on Enter.
   * Skips non-printable-only input (Ctrl+C, arrows, Enter alone).
   */
  trackInput(sessionId: string, data: string): void {
    const topicId = this.topicManager.getTopicId(sessionId);
    if (!topicId) return;

    let state = this.mirrors.get(sessionId);
    if (!state) {
      state = this.createState(topicId);
      this.mirrors.set(sessionId, state);
    }

    state.inputBuffer += data;

    if (data.includes('\r') || data.includes('\n')) {
      const text = stripInputToText(state.inputBuffer);
      state.inputBuffer = '';
      if (!text) return;

      const formatted = `📝 ${escapeHtml(text)}`;
      this.bot.sendToTopic(topicId, formatted, { parse_mode: 'HTML' }).catch(err =>
        logger.error(`[TerminalMirror] Prompt echo failed for ${sessionId}: ${err}`),
      );
    }
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
    this.mirrors.delete(sessionId);
  }

  /** Clean up all mirrors. */
  dispose(): void {
    this.mirrors.clear();
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private createState(topicId: number): MirrorState {
    return {
      buffer: '',
      topicId,
      paused: false,
      inputBuffer: '',
    };
  }

  private async flush(sessionId: string): Promise<void> {
    const state = this.mirrors.get(sessionId);
    if (!state || !state.buffer) return;

    const raw = state.buffer;
    state.buffer = '';

    const cleaned = cleanTerminalOutput(raw);
    if (!cleaned.trim()) return;

    const content = fitToLimit(cleaned);
    const formatted = `<code>${escapeHtml(content)}</code>`;

    try {
      await this.bot.sendToTopic(state.topicId, formatted, { parse_mode: 'HTML' });
    } catch (err) {
      logger.error(`[TerminalMirror] Flush failed for ${sessionId}: ${err}`);
    }
  }
}

// ==========================================================================
// Helpers (module-private)
// ==========================================================================

/** Strip escape sequences and control chars from input, returning printable text only. */
function stripInputToText(raw: string): string {
  let text = stripAnsi(raw);
  // Remove control characters (keep printable + space + common unicode)
  text = text.replace(/[\x00-\x1f\x7f]/g, '');
  return text.trim();
}

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
    return text.slice(-maxChars);
  }

  const head = lines.slice(0, TRUNCATE_HEAD_LINES);
  const tail = lines.slice(-TRUNCATE_TAIL_LINES);
  const omitted = lines.length - TRUNCATE_HEAD_LINES - TRUNCATE_TAIL_LINES;

  const result = [...head, `\n... ${omitted} lines omitted ...\n`, ...tail].join('\n');

  if (result.length > maxChars) {
    return result.slice(-maxChars);
  }

  return result;
}