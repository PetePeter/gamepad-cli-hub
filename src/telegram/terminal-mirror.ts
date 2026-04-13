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
import type { ActivityLevel, SessionState } from '../types/session.js';
import { escapeHtml, cleanTerminalOutput, stripAnsi } from './utils.js';
import { logger } from '../utils/logger.js';

/** Max chars in a single Telegram message (leave room for formatting) */
const MAX_MESSAGE_CHARS = 3500;

/** Safety cap: flush immediately if buffer grows beyond this */
const MAX_BUFFER_CHARS = 50_000;

/** Max lines to show when truncating (head + tail) */
const TRUNCATE_HEAD_LINES = 10;
const TRUNCATE_TAIL_LINES = 15;

/** Max lines from the start of content to scan for echo matches */
const ECHO_SCAN_LINES = 10;

/** How long (ms) to keep registered echoes before they expire */
const ECHO_EXPIRY_MS = 30_000;

/** Number of recent content hashes to keep for dedup guard */
const DIGEST_WINDOW = 3;

interface PendingEcho {
  text: string;
  registeredAt: number;
}

interface MirrorState {
  /** Accumulated unflushed PTY output */
  buffer: string;
  /** Topic ID for this session */
  topicId: number;
  /** Whether streaming is paused */
  paused: boolean;
  /** Accumulated user input (for prompt echo) */
  inputBuffer: string;
  /** Recently-inputted text whose shell echo should be stripped from the next flush */
  pendingEchoes: PendingEcho[];
  /** Hashes of the last N flushed messages (FIFO) for dedup guard */
  recentDigests: string[];
}

/** Delay (ms) for follow-up flush after state change (captures post-transition content) */
const FOLLOW_UP_FLUSH_MS = 3000;

/** Delay (ms) for flush after question detection */
const QUESTION_FLUSH_MS = 2000;

export class TerminalMirror {
  private mirrors: Map<string, MirrorState> = new Map();
  private followUpTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

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
   * Handle AIAGENT state change from StateDetector.
   * Immediately flushes buffered output when CLI enters idle or completed state,
   * then schedules a follow-up flush to capture post-transition content (e.g., questions).
   */
  handleStateChange(sessionId: string, newState: SessionState): void {
    if (newState === 'idle' || newState === 'completed') {
      this.flush(sessionId);
      this.scheduleFollowUpFlush(sessionId, FOLLOW_UP_FLUSH_MS);
    }
  }

  /**
   * Handle question detection from StateDetector.
   * Schedules a short delayed flush to capture the full question rendering.
   */
  handleQuestionDetected(sessionId: string): void {
    this.scheduleFollowUpFlush(sessionId, QUESTION_FLUSH_MS);
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

      // Register as pending echo so the PTY echo is stripped from the next flush
      state.pendingEchoes.push({ text, registeredAt: Date.now() });

      const formatted = `📝 ${escapeHtml(text)}`;
      this.bot.sendToTopic(topicId, formatted, { parse_mode: 'HTML' }).catch(err =>
        logger.error(`[TerminalMirror] Prompt echo failed for ${sessionId}: ${err}`),
      );
    }
  }

  /**
   * Register text that was sent to PTY from an external source (e.g. Telegram).
   * The shell echo of this text will be stripped from the next flush.
   */
  registerEcho(sessionId: string, text: string): void {
    const topicId = this.topicManager.getTopicId(sessionId);
    if (!topicId) return;

    let state = this.mirrors.get(sessionId);
    if (!state) {
      state = this.createState(topicId);
      this.mirrors.set(sessionId, state);
    }

    const stripped = text.trim();
    if (stripped) {
      state.pendingEchoes.push({ text: stripped, registeredAt: Date.now() });
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
    this.cancelFollowUpTimer(sessionId);
    this.mirrors.delete(sessionId);
  }

  /** Clean up all mirrors. */
  dispose(): void {
    for (const timer of this.followUpTimers.values()) {
      clearTimeout(timer);
    }
    this.followUpTimers.clear();
    this.mirrors.clear();
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  /**
   * Schedule a delayed follow-up flush for a session.
   * Cancels any existing follow-up timer for the same session.
   */
  private scheduleFollowUpFlush(sessionId: string, delayMs: number): void {
    this.cancelFollowUpTimer(sessionId);
    const timer = setTimeout(() => {
      this.followUpTimers.delete(sessionId);
      this.flush(sessionId);
    }, delayMs);
    this.followUpTimers.set(sessionId, timer);
  }

  private cancelFollowUpTimer(sessionId: string): void {
    const existing = this.followUpTimers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
      this.followUpTimers.delete(sessionId);
    }
  }

  private createState(topicId: number): MirrorState {
    return {
      buffer: '',
      topicId,
      paused: false,
      inputBuffer: '',
      pendingEchoes: [],
      recentDigests: [],
    };
  }

  private async flush(sessionId: string): Promise<void> {
    const state = this.mirrors.get(sessionId);
    if (!state || !state.buffer) return;

    const raw = state.buffer;
    state.buffer = '';

    // Diagnostic: log raw buffer sample for debugging question capture
    const rawSample = raw.slice(-500).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '·');
    logger.debug(`[TerminalMirror] Flush raw tail (${raw.length} chars): ${rawSample}`);

    let cleaned = cleanTerminalOutput(raw);
    if (!cleaned.trim()) {
      logger.debug(`[TerminalMirror] Flush for ${sessionId}: cleaned content empty, skipping`);
      return;
    }

    // Strip shell echoes of recently-inputted commands
    cleaned = stripEchoes(cleaned, state.pendingEchoes);
    if (!cleaned.trim()) return;

    // Diagnostic: log cleaned content sample
    const cleanedSample = cleaned.slice(-500);
    logger.debug(`[TerminalMirror] Flush cleaned tail (${cleaned.length} chars): ${cleanedSample}`);

    // Content fingerprint guard — skip if identical to a recent message
    const digest = simpleHash(cleaned);
    if (state.recentDigests.includes(digest)) return;

    state.recentDigests.push(digest);
    if (state.recentDigests.length > DIGEST_WINDOW) {
      state.recentDigests.shift();
    }

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
 * Strip shell echoes of recently-inputted commands from the start of content.
 * Scans only the first ECHO_SCAN_LINES lines. Removes matched echoes from the
 * pending list so each echo is only stripped once.
 */
function stripEchoes(content: string, echoes: PendingEcho[]): string {
  if (echoes.length === 0) return content;

  const now = Date.now();
  // Purge expired echoes
  for (let i = echoes.length - 1; i >= 0; i--) {
    if (now - echoes[i].registeredAt > ECHO_EXPIRY_MS) {
      echoes.splice(i, 1);
    }
  }

  if (echoes.length === 0) return content;

  const lines = content.split('\n');
  const scanLimit = Math.min(lines.length, ECHO_SCAN_LINES);

  for (let i = 0; i < scanLimit; i++) {
    const trimmedLine = lines[i].trim();
    if (!trimmedLine) continue;

    const matchIdx = echoes.findIndex(e => trimmedLine === e.text);
    if (matchIdx !== -1) {
      lines[i] = '';
      echoes.splice(matchIdx, 1);
      if (echoes.length === 0) break;
    }
  }

  return lines.join('\n').replace(/^\n+/, '');
}

/** Simple string hash for content fingerprint guard (not cryptographic). */
function simpleHash(text: string): string {
  let hash = 0;
  const normalized = text.trim();
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return String(hash);
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