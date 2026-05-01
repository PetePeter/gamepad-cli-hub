/**
 * Pinned Dashboard
 *
 * Maintains an auto-updating pinned message in the Telegram group
 * showing a live overview of all sessions. The message is edited
 * periodically to reflect current state.
 *
 * Layout:
 *   🖥️ Helm — [Home PC]
 *   ━━━━━━━━━━━━━━━━━━━━
 *   📂 helm (3 sessions)
 *     🔨 refactor-auth — implementing
 *     ⏳ fix-tests — waiting
 *     💤 cleanup — idle
 *
 *   📂 other-project (1 session)
 *     🎉 feature-x — completed
 *   ━━━━━━━━━━━━━━━━━━━━
 *   Last updated: 12:34 PM
 */

import type { TelegramBotCore } from './bot.js';
import type TelegramBot from 'node-telegram-bot-api';
import type { SessionManager } from '../session/manager.js';
import type { SessionInfo, SessionState } from '../types/session.js';
import { escapeHtml } from './utils.js';
import { sessionTalkButton, buildDashboardKeyboardWithTopics } from './keyboards.js';
import { logger } from '../utils/logger.js';
import path from 'path';

const STATE_EMOJI: Record<string, string> = {
  implementing: '🔨',
  planning: '📐',
  completed: '🎉',
  waiting: '⏳',
  idle: '💤',
};

/** Dashboard update interval (ms) — 30 seconds. */
const UPDATE_INTERVAL_MS = 30_000;

export class PinnedDashboard {
  private messageId: number | null = null;
  private updateTimer: ReturnType<typeof setInterval> | null = null;
  private instanceName: string;

  constructor(
    private bot: TelegramBotCore,
    private sessionManager: SessionManager,
    instanceName: string,
  ) {
    this.instanceName = instanceName;
  }

  /** Set the instance name for the dashboard header. */
  setInstanceName(name: string): void {
    this.instanceName = name;
  }

  /**
   * Start the dashboard — creates the pinned message
   * and begins periodic updates.
   */
  async start(): Promise<void> {
    await this.createOrUpdate();

    this.updateTimer = setInterval(async () => {
      try {
        await this.update();
      } catch (err) {
        logger.error(`[PinnedDashboard] Update failed: ${err}`);
      }
    }, UPDATE_INTERVAL_MS);

    logger.info('[PinnedDashboard] Started with periodic updates');
  }

  /** Stop periodic updates. */
  stop(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  /** Force an immediate update. */
  async update(): Promise<void> {
    if (!this.messageId) {
      await this.createOrUpdate();
      return;
    }

    const text = this.buildDashboardText();
    const chatId = this.bot.getChatId();
    if (!chatId) return;

    try {
      await this.bot.getBot()?.editMessageText(text, {
        chat_id: chatId,
        message_id: this.messageId,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: this.buildDashboardKeyboard() },
      });
    } catch (err) {
      this.handleEditError(err);
    }
  }

  /** Clean up timer and state. */
  dispose(): void {
    this.stop();
    this.messageId = null;
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private async createOrUpdate(): Promise<void> {
    const text = this.buildDashboardText();
    const keyboard = this.buildDashboardKeyboard();
    const msg = await this.bot.sendMessage(text, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard },
    });

    if (msg) {
      this.messageId = msg.message_id;
      await this.pinMessage(msg.message_id);
    }
  }

  private async pinMessage(messageId: number): Promise<void> {
    const chatId = this.bot.getChatId();
    if (!chatId) return;

    try {
      await this.bot.getBot()?.pinChatMessage(chatId, messageId, {
        disable_notification: true,
      });
    } catch (err) {
      logger.warn(`[PinnedDashboard] Failed to pin message: ${err}`);
    }
  }

  private handleEditError(err: unknown): void {
    const errStr = String(err);

    // "message is not modified" — content unchanged, not a real error
    if (errStr.includes('message is not modified')) return;

    // Message was deleted — recreate on next update
    if (errStr.includes('message to edit not found')) {
      this.messageId = null;
      return;
    }

    logger.error(`[PinnedDashboard] Edit failed: ${err}`);
  }

  /** Inline keyboard buttons shown on the pinned dashboard message. */
  private buildDashboardKeyboard(): TelegramBot.InlineKeyboardButton[][] {
    const sessions = this.sessionManager.getAllSessions();

    // Build topic ID map from sessions that have topicId set
    const topicMap = new Map<string, number>();
    for (const session of sessions) {
      if (session.topicId != null) {
        topicMap.set(session.id, session.topicId);
      }
    }

    // Use the new function which handles state-based sorting and topic buttons
    return buildDashboardKeyboardWithTopics(sessions, topicMap);
  }

  private buildDashboardText(): string {
    const sessions = this.sessionManager.getAllSessions();
    const lines: string[] = [];

    lines.push(`🖥️ <b>Helm</b> — ${escapeHtml(this.instanceName)}`);
    lines.push(`<i>Helm - steer your fleet of agents</i>`);
    lines.push('━━━━━━━━━━━━━━━━━━━━');

    if (sessions.length === 0) {
      lines.push('');
      lines.push('💤 No active sessions');
    } else {
      this.appendSessionGroups(lines, sessions);
    }

    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push(`🕐 Updated: ${new Date().toLocaleTimeString()}`);

    return lines.join('\n');
  }

  private appendSessionGroups(lines: string[], sessions: SessionInfo[]): void {
    const groups = groupByDirectory(sessions);

    for (const [dir, dirSessions] of groups) {
      const dirName = path.basename(dir);
      lines.push('');
      lines.push(`📂 <b>${escapeHtml(dirName)}</b> (${dirSessions.length})`);

      for (const s of dirSessions) {
        const state: SessionState = s.state ?? 'idle';
        const emoji = STATE_EMOJI[state] ?? '⚪';
        lines.push(`  ${emoji} ${escapeHtml(s.name)} — ${state}`);
      }
    }
  }
}

// ==========================================================================
// Helpers
// ==========================================================================

function groupByDirectory(sessions: SessionInfo[]): Map<string, SessionInfo[]> {
  const groups = new Map<string, SessionInfo[]>();
  for (const s of sessions) {
    const dir = s.workingDir ?? 'unknown';
    const list = groups.get(dir) ?? [];
    list.push(s);
    groups.set(dir, list);
  }
  return groups;
}


