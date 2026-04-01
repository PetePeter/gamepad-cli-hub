import { Notification, type BrowserWindow } from 'electron';
import path from 'path';
import type { StateTransition, ActivityChange } from './state-detector.js';
import type { SessionManager } from './manager.js';
import type { ConfigLoader } from '../config/loader.js';
import type { SessionState } from '../types/session.js';
import { logger } from '../utils/logger.js';

/** States considered "active" (CLI is working). */
const ACTIVE_STATES: ReadonlySet<SessionState> = new Set(['implementing', 'planning']);

/** Dedup guard window — skip duplicate notifications for the same session within this period. */
const DEDUP_WINDOW_MS = 10_000;

interface NotificationContent {
  title: string;
  body: string;
}

const STATE_LABELS: Record<string, { emoji: string; label: string; verb: string }> = {
  completed: { emoji: '🎉', label: 'Completed', verb: 'is done' },
  idle: { emoji: '💤', label: 'Idle', verb: 'is idle' },
  waiting: { emoji: '⏳', label: 'Waiting', verb: 'needs input' },
};

const INACTIVE_LABEL = { emoji: '🔇', label: 'Inactive', verb: 'went quiet' };

function buildContent(
  sessionName: string,
  cliTypeName: string,
  workingDir: string | undefined,
  labelInfo: { emoji: string; label: string; verb: string },
): NotificationContent {
  const dirName = workingDir ? path.basename(workingDir) : 'unknown';
  return {
    title: `${labelInfo.emoji} ${labelInfo.label} — ${cliTypeName}`,
    body: `"${sessionName}" in ${dirName} ${labelInfo.verb}.`,
  };
}

/**
 * Manages Windows toast notifications for CLI session state/activity transitions.
 *
 * Triggers:
 * 1. State change: active → non-active (implementing/planning → completed/idle/waiting)
 * 2. Activity change: active → inactive (output stopped for >10s)
 *
 * Conditions: window not focused + notifications setting enabled.
 * Click action: focuses window + switches to the triggering session.
 */
export class NotificationManager {
  private lastNotificationTime: Map<string, number> = new Map();

  constructor(
    private getMainWindow: () => BrowserWindow | null,
    private sessionManager: SessionManager,
    private configLoader: ConfigLoader,
  ) {}

  /** Call when StateDetector emits 'state-change'. */
  handleStateChange(transition: StateTransition): void {
    if (!ACTIVE_STATES.has(transition.previousState)) return;
    if (ACTIVE_STATES.has(transition.newState)) return;

    const labelInfo = STATE_LABELS[transition.newState];
    if (!labelInfo) return;

    this.maybeNotify(transition.sessionId, labelInfo);
  }

  /** Call when StateDetector emits 'activity-change'. Notifies on active → non-active. */
  handleActivityChange(event: ActivityChange): void {
    if (event.level === 'active') return;
    this.maybeNotify(event.sessionId, INACTIVE_LABEL);
  }

  private maybeNotify(
    sessionId: string,
    labelInfo: { emoji: string; label: string; verb: string },
  ): void {
    if (!this.shouldNotify(sessionId)) return;

    const session = this.sessionManager.getSession(sessionId);
    if (!session) return;

    const cliTypeName = session.cliType || 'Unknown';
    const content = buildContent(session.name, cliTypeName, session.workingDir, labelInfo);

    this.showNotification(content, sessionId);
    this.lastNotificationTime.set(sessionId, Date.now());
  }

  private shouldNotify(sessionId: string): boolean {
    if (!Notification.isSupported()) return false;

    try {
      if (!this.configLoader.getNotifications()) return false;
    } catch {
      return false;
    }

    const win = this.getMainWindow();
    if (win && !win.isDestroyed() && win.isFocused()) return false;

    const lastTime = this.lastNotificationTime.get(sessionId) ?? 0;
    if (Date.now() - lastTime < DEDUP_WINDOW_MS) return false;

    return true;
  }

  private showNotification(content: NotificationContent, sessionId: string): void {
    try {
      const notification = new Notification({
        title: content.title,
        body: content.body,
        silent: true,
      });

      notification.on('click', () => {
        const win = this.getMainWindow();
        if (win && !win.isDestroyed()) {
          win.show();
          win.focus();
          win.webContents.send('notification:click', { sessionId });
        }
      });

      notification.show();
      logger.info(`[Notification] ${content.title} — ${content.body}`);
    } catch (error) {
      logger.error(`[Notification] Failed to show: ${error}`);
    }
  }

  /** Remove dedup tracking for a session (call on session removal). */
  removeSession(sessionId: string): void {
    this.lastNotificationTime.delete(sessionId);
  }

  /** Clean up all tracking. */
  dispose(): void {
    this.lastNotificationTime.clear();
  }
}
