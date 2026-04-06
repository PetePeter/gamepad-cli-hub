/**
 * Manages free-text input from Telegram users to PTY sessions.
 *
 * Flow:
 * 1. User taps "💬 Send" button → startInput(sessionId)
 * 2. User types a message in Telegram → handleMessage() captures it
 * 3. Shows confirmation with preview → "✅ Send" / "❌ Cancel"
 * 4. On confirm → writes to PTY stdin
 *
 * Safe mode (default): always shows confirmation before sending.
 * Quick mode: sends immediately without confirmation.
 */

import type TelegramBot from 'node-telegram-bot-api';
import type { TelegramBotCore } from './bot.js';
import type { TopicManager } from './topic-manager.js';
import type { PtyManager } from '../session/pty-manager.js';
import { confirmSendKeyboard } from './keyboards.js';
import { escapeHtml } from './utils.js';
import { logger } from '../utils/logger.js';

interface PendingInput {
  sessionId: string;
  userId: number;
  text?: string;
  createdAt: number;
}

/** Pending inputs expire after 5 minutes of inactivity. */
const INPUT_TIMEOUT_MS = 5 * 60 * 1000;

export class TextInputManager {
  private pendingInputs = new Map<string, PendingInput>();
  private safeMode = true;

  constructor(
    private bot: TelegramBotCore,
    private topicManager: TopicManager,
    private ptyManager: PtyManager,
  ) {}

  /** Toggle safe mode (confirmation step before sending). */
  setSafeMode(enabled: boolean): void {
    this.safeMode = enabled;
  }

  /** Start text input mode for a session. Called when user taps "💬 Send". */
  startInput(sessionId: string, userId: number): void {
    this.pendingInputs.set(sessionId, {
      sessionId,
      userId,
      createdAt: Date.now(),
    });
  }

  /**
   * Handle an incoming Telegram message.
   * If the user has a pending input for this topic, capture the text.
   * Returns true if the message was consumed as input.
   */
  async handleMessage(msg: TelegramBot.Message): Promise<boolean> {
    if (!msg.text || msg.text.startsWith('/')) return false;

    const topicId = msg.message_thread_id;
    if (!topicId) return false;

    const session = this.topicManager.findSessionByTopicId(topicId);
    if (!session) return false;

    const pending = this.pendingInputs.get(session.id);
    if (!pending) return false;
    if (pending.userId !== msg.from?.id) return false;

    if (isExpired(pending)) {
      this.pendingInputs.delete(session.id);
      return false;
    }

    if (this.safeMode) {
      await this.showConfirmation(topicId, session.id, msg.text, pending);
    } else {
      await this.sendImmediately(topicId, session.id, msg.text);
    }

    return true;
  }

  /** Confirm and send the pending input to PTY. */
  async confirmInput(sessionId: string): Promise<void> {
    const pending = this.pendingInputs.get(sessionId);
    if (!pending?.text) return;

    this.ptyManager.write(sessionId, pending.text + '\r');
    this.pendingInputs.delete(sessionId);

    const topicId = this.topicManager.getTopicId(sessionId);
    if (topicId) {
      await this.bot.sendToTopic(
        topicId,
        `✅ Sent: <code>${escapeHtml(pending.text)}</code>`,
        { parse_mode: 'HTML' },
      );
    }

    logger.info(`[TextInput] Confirmed and sent to session ${sessionId}`);
  }

  /** Cancel the pending input. */
  cancelInput(sessionId: string): void {
    this.pendingInputs.delete(sessionId);
    logger.info(`[TextInput] Cancelled input for session ${sessionId}`);
  }

  /** Check if a session has a pending (non-expired) input. */
  hasPendingInput(sessionId: string): boolean {
    const pending = this.pendingInputs.get(sessionId);
    if (!pending) return false;

    if (isExpired(pending)) {
      this.pendingInputs.delete(sessionId);
      return false;
    }
    return true;
  }

  /** Clean up all pending inputs. */
  dispose(): void {
    this.pendingInputs.clear();
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private async showConfirmation(
    topicId: number,
    sessionId: string,
    text: string,
    pending: PendingInput,
  ): Promise<void> {
    pending.text = text;
    const keyboard = confirmSendKeyboard(sessionId);

    await this.bot.sendToTopic(
      topicId,
      `📝 Preview:\n\n<code>${escapeHtml(text)}</code>\n\nSend this to the terminal?`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } },
    );
  }

  private async sendImmediately(
    topicId: number,
    sessionId: string,
    text: string,
  ): Promise<void> {
    this.ptyManager.write(sessionId, text + '\r');
    this.pendingInputs.delete(sessionId);

    await this.bot.sendToTopic(
      topicId,
      `✅ Sent: <code>${escapeHtml(text)}</code>`,
      { parse_mode: 'HTML' },
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isExpired(pending: PendingInput): boolean {
  return Date.now() - pending.createdAt > INPUT_TIMEOUT_MS;
}


