import type { StateTransition } from '../session/state-detector.js';
import type { TelegramBotCore } from './bot.js';
import type { TopicManager } from './topic-manager.js';
import type { SessionManager } from '../session/manager.js';
import type { TelegramConfig } from '../config/loader.js';
import type { SessionState } from '../types/session.js';
import { notificationKeyboard } from './keyboards.js';
import { logger } from '../utils/logger.js';
import path from 'path';

/** States considered "active" (CLI is working). */
const ACTIVE_STATES: ReadonlySet<SessionState> = new Set(['implementing', 'planning']);

/** Dedup guard window — skip duplicate notifications for the same session within this period. */
const DEDUP_WINDOW_MS = 15_000;

/** Max notifications per minute across all sessions. */
const MAX_NOTIFICATIONS_PER_MIN = 3;

const STATE_LABELS: Record<string, { emoji: string; title: string; verb: string }> = {
  completed: { emoji: '🎉', title: 'Session Completed', verb: 'is done' },
  idle: { emoji: '💤', title: 'Session Idle', verb: 'is idle' },
  waiting: { emoji: '⏳', title: 'Session Needs Attention', verb: 'needs input' },
};

/**
 * Sends Telegram notifications when session state changes.
 *
 * Triggers on:
 * - State change: active → non-active (implementing/planning → completed/idle/waiting)
 * - Crash/error events (future)
 *
 * Each notification includes inline action buttons and is sent to
 * both the session's topic (if exists) and the General topic.
 */
export class TelegramNotifier {
  private lastNotificationTime: Map<string, number> = new Map();
  private globalNotificationTimes: number[] = [];

  constructor(
    private bot: TelegramBotCore,
    private topicManager: TopicManager,
    private sessionManager: SessionManager,
    private getConfig: () => TelegramConfig,
  ) {}

  /**
   * Handle a state change from StateDetector.
   * Only notifies on active → non-active transitions.
   */
  handleStateChange(transition: StateTransition): void {
    if (!ACTIVE_STATES.has(transition.previousState)) return;
    if (ACTIVE_STATES.has(transition.newState)) return;

    const config = this.getConfig();

    // Check per-event notification settings
    if (transition.newState === 'completed' && !config.notifyOnComplete) return;
    if (transition.newState === 'idle' && !config.notifyOnIdle) return;
    if (transition.newState === 'waiting' && !config.notifyOnError) return;

    const labelInfo = STATE_LABELS[transition.newState];
    if (!labelInfo) return;

    this.sendNotification(transition.sessionId, transition.newState, labelInfo);
  }

  /** Remove dedup tracking for a session. */
  removeSession(sessionId: string): void {
    this.lastNotificationTime.delete(sessionId);
  }

  /** Clean up all tracking. */
  dispose(): void {
    this.lastNotificationTime.clear();
    this.globalNotificationTimes = [];
  }

  private async sendNotification(
    sessionId: string,
    newState: SessionState,
    labelInfo: { emoji: string; title: string; verb: string },
  ): Promise<void> {
    if (!this.shouldNotify(sessionId)) return;

    const session = this.sessionManager.getSession(sessionId);
    if (!session) return;

    const dirName = session.workingDir ? path.basename(session.workingDir) : 'unknown';

    const text = [
      `${labelInfo.emoji} ${labelInfo.title}`,
      '',
      `"${session.name}" in ${dirName}`,
      `${session.cliType} — ${labelInfo.verb}`,
    ].join('\n');

    const keyboard = notificationKeyboard(sessionId, newState);

    // Send to the session's topic
    const topicId = this.topicManager.getTopicId(sessionId);
    if (topicId) {
      await this.bot.sendToTopic(topicId, text, {
        reply_markup: { inline_keyboard: keyboard },
      });
    }

    this.lastNotificationTime.set(sessionId, Date.now());
    this.globalNotificationTimes.push(Date.now());
    logger.info(`[TelegramNotifier] ${labelInfo.title} — ${session.name}`);
  }

  private shouldNotify(sessionId: string): boolean {
    if (!this.bot.isRunning()) return false;

    const config = this.getConfig();
    if (!config.enabled) return false;

    // Per-session dedup
    const lastTime = this.lastNotificationTime.get(sessionId) ?? 0;
    if (Date.now() - lastTime < DEDUP_WINDOW_MS) return false;

    // Global rate limit
    const now = Date.now();
    this.globalNotificationTimes = this.globalNotificationTimes.filter(t => now - t < 60_000);
    if (this.globalNotificationTimes.length >= MAX_NOTIFICATIONS_PER_MIN) return false;

    return true;
  }
}
