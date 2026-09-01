import type { ProjectStore } from './project-store.js';
import type { MessManager } from './mess-manager.js';
import type { MessEntry } from '../types/mess.js';
import type { SessionManager } from './manager.js';
import type { StateDetector, ActivityChange } from './state-detector.js';
import type { ActivityLevel } from '../types/session.js';
import { getMessProjectSettings } from '../types/project.js';
import { logger } from '../utils/logger.js';

export interface SystemReminderDelivery {
  sendSystemReminder(sessionId: string, text: string, options?: { onVerification?: (verified: boolean) => void }): Promise<void>;
}

/**
 * Silence deep enough to risk a poke.
 *
 * `idle` alone is 5 minutes of quiet, so a post landing on a session that just
 * printed anything waited up to 5 minutes — or forever while the session kept
 * working. `inactive` is 10 seconds of quiet: still not proof the CLI is at a
 * prompt (IDLE IS NOT READINESS), but it is the same best-effort bet made far
 * sooner, and it is what lets a missed post be caught up on the next lull.
 */
function isReceptive(level: ActivityLevel | undefined): boolean {
  return level === 'idle' || level === 'inactive';
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
  /** Sessions holding mail that arrived while they were busy and was never announced. */
  private readonly unannounced = new Set<string>();
  private readonly inFlight = new Set<string>();
  private disposed = false;

  private readonly onActivityChange = (event: ActivityChange): void => {
    if (isReceptive(event.level)) void this.consider(event.sessionId);
  };

  private readonly onMessAppended = (entry: MessEntry): void => {
    for (const session of this.sessionManager.getAllSessions()) {
      if (entry.projectId !== this.messManager.getProjectIdForSession(session.id)) continue;
      if (entry.toSessionId !== undefined && entry.toSessionId !== session.id) continue;
      if (entry.fromSessionId === session.id) continue;
      // Recorded before the attempt: if the session is busy right now the poke
      // is dropped, and this is what tells the next transition that the mail
      // still owes an announcement.
      this.unannounced.add(session.id);
      void this.consider(session.id, true);
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
    this.unannounced.clear();
    this.inFlight.clear();
  }

  /**
   * @param newPost a fresh Mess entry triggered this.
   *
   * The cooldown is bypassed whenever the session is *owed* an announcement —
   * either a post just arrived, or one arrived earlier while the session was
   * busy and was dropped. Mail nobody has been told about is never delayed.
   *
   * What the cooldown still guards is re-announcing mail already delivered: the
   * poke is itself PTY output, bouncing the session back through active to
   * inactive, which would otherwise re-poke every few seconds forever.
   */
  private async consider(sessionId: string, newPost = false): Promise<void> {
    if (this.disposed || this.inFlight.has(sessionId)) return;
    const session = this.sessionManager.getSession(sessionId);
    if (!session || !isReceptive(session.activityLevel)) return;
    if (!this.isSessionRunning(sessionId)) return;

    let unread: number;
    try {
      unread = this.messManager.unreadCount(sessionId);
    } catch (error) {
      logger.warn(`[MessNotifier] Could not inspect unread Mess for ${sessionId}: ${error}`);
      return;
    }
    if (unread <= 0) {
      this.unannounced.delete(sessionId);
      return;
    }

    const cooldownMs = this.cooldownMs(sessionId);
    const last = this.lastDeliveredAt.get(sessionId);
    const owed = newPost || this.unannounced.has(sessionId);
    if (!owed && last !== undefined && this.now() < last + cooldownMs) {
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
        this.unannounced.delete(sessionId);
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
    this.unannounced.delete(sessionId);
    this.inFlight.delete(sessionId);
  }
}
