import type { ProjectStore } from './project-store.js';
import type { MessManager } from './mess-manager.js';
import type { MessEntry } from '../types/mess.js';
import type { SessionManager } from './manager.js';
import type { StateDetector, ActivityChange } from './state-detector.js';
import { getMessProjectSettings } from '../types/project.js';
import { logger } from '../utils/logger.js';

export interface SystemReminderDelivery {
  sendSystemReminder(sessionId: string, text: string, options?: { onVerification?: (verified: boolean) => void }): Promise<void>;
}

export interface MessNotifierOptions {
  now?: () => number;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
}

/** Best-effort, output-silence-based reminder coordinator for project Mess. */
export class MessNotifier {
  private readonly now: () => number;
  private readonly setTimer: typeof setTimeout;
  private readonly clearTimer: typeof clearTimeout;
  private readonly retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly lastDeliveredAt = new Map<string, number>();
  private readonly inFlight = new Set<string>();
  private disposed = false;

  private readonly onActivityChange = (event: ActivityChange): void => {
    if (event.level === 'idle') void this.consider(event.sessionId);
  };

  private readonly onMessAppended = (entry: MessEntry): void => {
    for (const session of this.sessionManager.getAllSessions()) {
      if (entry.projectId !== this.messManager.getProjectIdForSession(session.id)) continue;
      if (entry.toSessionId !== undefined && entry.toSessionId !== session.id) continue;
      if (entry.fromSessionId === session.id) continue;
      void this.consider(session.id);
    }
  };

  private readonly onSessionRemoved = (event: { sessionId: string }): void => {
    this.clearSession(event.sessionId);
  };

  constructor(
    private readonly messManager: MessManager,
    private readonly sessionManager: SessionManager,
    private readonly stateDetector: StateDetector,
    private readonly projectStore: ProjectStore,
    private readonly delivery: SystemReminderDelivery,
    private readonly isSessionRunning: (sessionId: string) => boolean,
    options: MessNotifierOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.setTimer = options.setTimeout ?? setTimeout;
    this.clearTimer = options.clearTimeout ?? clearTimeout;
    this.stateDetector.on('activity-change', this.onActivityChange);
    this.messManager.on('mess:appended', this.onMessAppended);
    this.sessionManager.on('session:removed', this.onSessionRemoved);
  }

  /** Stop subscriptions and cancel every pending retry. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stateDetector.off('activity-change', this.onActivityChange);
    this.messManager.off('mess:appended', this.onMessAppended);
    this.sessionManager.off('session:removed', this.onSessionRemoved);
    for (const timer of this.retryTimers.values()) this.clearTimer(timer);
    this.retryTimers.clear();
    this.lastDeliveredAt.clear();
    this.inFlight.clear();
  }

  private async consider(sessionId: string): Promise<void> {
    if (this.disposed || this.inFlight.has(sessionId)) return;
    const session = this.sessionManager.getSession(sessionId);
    if (!session || session.activityLevel !== 'idle') return;
    if (!this.isSessionRunning(sessionId)) return;

    let unread: number;
    try {
      unread = this.messManager.unreadCount(sessionId);
    } catch (error) {
      logger.warn(`[MessNotifier] Could not inspect unread Mess for ${sessionId}: ${error}`);
      return;
    }
    if (unread <= 0) return;

    const cooldownMs = this.cooldownMs(sessionId);
    const last = this.lastDeliveredAt.get(sessionId);
    if (last !== undefined && this.now() < last + cooldownMs) {
      this.scheduleRetry(sessionId, last + cooldownMs);
      return;
    }

    // A fresh event can win the race with the retry callback at the cooldown
    // boundary. Cancel that stale callback before delivering immediately.
    this.cancelRetry(sessionId);
    this.inFlight.add(sessionId);
    let deliveryRecordedAt: number | undefined;
    let verificationFailedBeforeRecord = false;
    try {
      await this.delivery.sendSystemReminder(sessionId, `[HELM_MESS] ${unread} new — call mess_check`, {
        onVerification: verified => {
          if (verified) return;
          if (deliveryRecordedAt === undefined) {
            verificationFailedBeforeRecord = true;
            return;
          }
          if (this.lastDeliveredAt.get(sessionId) !== deliveryRecordedAt) return;
          this.lastDeliveredAt.delete(sessionId);
          this.cancelRetry(sessionId);
          if (!this.disposed && this.sessionManager.getSession(sessionId)) {
            this.scheduleRetry(sessionId, this.now() + cooldownMs);
          }
        },
      });
      if (!verificationFailedBeforeRecord && !this.disposed && this.sessionManager.getSession(sessionId)) {
        deliveryRecordedAt = this.now();
        this.lastDeliveredAt.set(sessionId, deliveryRecordedAt);
        this.scheduleRetry(sessionId, deliveryRecordedAt + cooldownMs);
      }
    } catch (error) {
      // A failed write never starts the cooldown. Retry later without allowing
      // a broken PTY to create a tight event-driven loop.
      logger.warn(`[MessNotifier] System reminder failed for ${sessionId}: ${error}`);
      if (!this.disposed && this.sessionManager.getSession(sessionId)) {
        this.scheduleRetry(sessionId, this.now() + cooldownMs);
      }
    } finally {
      this.inFlight.delete(sessionId);
    }
  }

  private scheduleRetry(sessionId: string, dueAt: number): void {
    if (this.retryTimers.has(sessionId)) return;
    const timer = this.setTimer(() => {
      this.retryTimers.delete(sessionId);
      void this.consider(sessionId);
    }, Math.max(0, dueAt - this.now()));
    this.retryTimers.set(sessionId, timer);
  }

  private cancelRetry(sessionId: string): void {
    const timer = this.retryTimers.get(sessionId);
    if (!timer) return;
    this.clearTimer(timer);
    this.retryTimers.delete(sessionId);
  }

  private cooldownMs(sessionId: string): number {
    const projectId = this.messManager.getProjectIdForSession(sessionId);
    const project = projectId ? this.projectStore.getById(projectId) : undefined;
    return (project ? getMessProjectSettings(project).messPokeCooldownMinutes : 15) * 60_000;
  }

  private clearSession(sessionId: string): void {
    this.cancelRetry(sessionId);
    this.lastDeliveredAt.delete(sessionId);
    this.inFlight.delete(sessionId);
  }
}
