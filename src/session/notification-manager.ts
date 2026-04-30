import { Notification, BrowserWindow } from 'electron';
import path from 'path';
import type { ActivityChange } from './state-detector.js';
import type { SessionManager } from './manager.js';
import type { ConfigLoader } from '../config/loader.js';
import type { SessionState } from '../types/session.js';
import { logger } from '../utils/logger.js';
import { stripAnsi } from '../utils/strip-ansi.js';
import type { WindowManager } from '../electron/window-manager.js';

/** States considered "active" (CLI is working) — only notify for these. */
const ACTIVE_STATES: ReadonlySet<SessionState> = new Set(['implementing', 'planning']);

/** Dedup guard window — skip duplicate notifications for the same session within this period. */
const DEDUP_WINDOW_MS = 15_000;

/** Number of recent PTY output lines to include in notification body. */
const PREVIEW_LINES = 5;

/** Max completed lines kept per session (ring buffer). */
const MAX_BUFFER_LINES = 10;

interface NotificationContent {
  title: string;
  body: string;
}

interface OutputBuffer {
  lines: string[];
  partial: string;
}

const ACTIVITY_LABELS: Record<string, { emoji: string; label: string; verb: string }> = {
  inactive: { emoji: '🔇', label: 'Inactive', verb: 'went quiet' },
  idle: { emoji: '💤', label: 'Idle', verb: 'went idle' },
};

function buildContent(
  sessionName: string,
  cliTypeName: string,
  workingDir: string | undefined,
  labelInfo: { emoji: string; label: string; verb: string },
  outputLines: string[] = [],
): NotificationContent {
  const dirName = workingDir ? path.basename(workingDir) : 'unknown';
  let body = `"${sessionName}" in ${dirName} ${labelInfo.verb}.`;
  if (outputLines.length > 0) {
    body += '\n' + outputLines.join('\n');
  }
  return {
    title: `${labelInfo.emoji} ${labelInfo.label} — ${cliTypeName}`,
    body,
  };
}

/**
 * Manages Windows toast notifications for CLI session activity transitions.
 *
 * Triggers: activity change from active → inactive (>10s silence) or idle (>5min silence),
 * but only when the session's detected state is active (implementing/planning).
 *
 * Conditions: window not focused + notifications setting enabled.
 * Click action: focuses window + switches to the triggering session.
 */
export class NotificationManager {
  private lastNotificationTime: Map<string, number> = new Map();
  private outputBuffers: Map<string, OutputBuffer> = new Map();
  private screenLockChecker: (() => boolean) | null = null;
  private telegramNotifier: ((sessionId: string, title: string, content: string) => Promise<void>) | null = null;
  private activeSessionIdGetter: (() => string | null) | null = null;

  constructor(
    private windowManager: WindowManager,
    private sessionManager: SessionManager,
    private configLoader: ConfigLoader,
    private getSessionState: (sessionId: string) => SessionState,
  ) {}

  /**
   * Inject the screen lock state checker (from power-monitor).
   */
  setScreenLockChecker(fn: () => boolean): void { this.screenLockChecker = fn; }

  /**
   * Inject the Telegram notifier (for sending messages when screen is locked).
   */
  setTelegramNotifier(fn: (sessionId: string, title: string, content: string) => Promise<void>): void { this.telegramNotifier = fn; }

  setActiveSessionIdGetter(fn: () => string | null): void { this.activeSessionIdGetter = fn; }

  getAppVisibility(): 'visible-focused' | 'visible-background' | 'hidden' {
    const focusedWin = BrowserWindow.getAllWindows().find(w => w.isFocused());
    if (focusedWin && !focusedWin.isDestroyed()) return 'visible-focused';
    const anyWin = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.isVisible());
    if (anyWin) return 'visible-background';
    return 'hidden';
  }

  getAppVisibilityDetails(): {
    visibility: 'visible-focused' | 'visible-background' | 'hidden';
    screenLocked: boolean;
    activeSessionId: string | null;
  } {
    return {
      visibility: this.getAppVisibility(),
      screenLocked: this.screenLockChecker?.() ?? false,
      activeSessionId: this.activeSessionIdGetter?.() ?? null,
    };
  }

  /**
   * Send an LLM-directed notification.
   *
   * Behavior is determined by screen lock state and window visibility:
   * - Screen locked + Telegram configured: send via Telegram (returns 'telegram')
   * - Screen locked, no Telegram: return 'none' (no notification)
   * - Window hidden: show native toast notification (returns 'toast')
   * - Window visible + different session: send in-app bubble (returns 'bubble')
   * - Window visible + same session: return 'none' (no notification needed)
   *
   * Requires notificationMode === 'llm', otherwise throws an error.
   *
   * @param sessionId The session ID to notify for
   * @param title Notification title
   * @param content Notification body/content
   * @returns The delivery mechanism used ('toast', 'bubble', 'telegram', or 'none')
   * @throws If notificationMode is not 'llm'
   */
  notifyLlmDirected(sessionId: string, title: string, content: string): 'toast' | 'bubble' | 'telegram' | 'none' {
    const mode = this.configLoader.getNotificationMode();
    if (mode !== 'llm') {
      throw new Error(`LLM-directed notifications require notificationMode=llm; current mode is ${mode}`);
    }

    const isLocked = this.screenLockChecker?.() ?? false;
    if (isLocked) {
      if (this.telegramNotifier) {
        void this.telegramNotifier(sessionId, title, content);
        return 'telegram';
      }
      return 'none';
    }

    const visibility = this.getAppVisibility();
    if (visibility === 'hidden') {
      this.showNotification({ title, body: content }, sessionId);
      return 'toast';
    }

    if (visibility === 'visible-focused') {
      const activeId = this.activeSessionIdGetter?.();
      if (activeId === sessionId) return 'none';
      const windows = BrowserWindow.getAllWindows();
      const win = windows.find(w => !w.isDestroyed() && w.isFocused())
        ?? windows.find(w => !w.isDestroyed() && (typeof w.isVisible !== 'function' || w.isVisible()));
      win?.webContents.send('notification:llmNotify', { sessionId, title, content });
      return 'bubble';
    }

    this.showNotification({ title, body: content }, sessionId);
    return 'toast';
  }

  /** Feed raw PTY output to maintain a small ring buffer per session. */
  feedOutput(sessionId: string, data: string): void {
    let buf = this.outputBuffers.get(sessionId);
    if (!buf) {
      buf = { lines: [], partial: '' };
      this.outputBuffers.set(sessionId, buf);
    }

    const clean = stripAnsi(data).replace(/\r\n/g, '\n');
    const combined = buf.partial + clean;
    const parts = combined.split('\n');
    buf.partial = parts.pop() ?? '';

    for (const rawLine of parts) {
      const crIndex = rawLine.lastIndexOf('\r');
      const line = crIndex >= 0 ? rawLine.substring(crIndex + 1) : rawLine;
      if (line.trim()) {
        buf.lines.push(line);
      }
    }

    if (buf.lines.length > MAX_BUFFER_LINES) {
      buf.lines = buf.lines.slice(-MAX_BUFFER_LINES);
    }
  }

  /** Get the last N non-empty lines from the output buffer. */
  getLastLines(sessionId: string, count: number): string[] {
    const buf = this.outputBuffers.get(sessionId);
    if (!buf) return [];
    const allLines = buf.partial?.trim() ? [...buf.lines, buf.partial] : [...buf.lines];
    return allLines.slice(-count);
  }

  /** Call when StateDetector emits 'activity-change'. Notifies on active → non-active
   *  only when the session is in an active AI state (implementing/planning). */
  handleActivityChange(event: ActivityChange): void {
    if (event.level === 'active') return;

    const state = this.getSessionState(event.sessionId);
    if (!ACTIVE_STATES.has(state)) return;

    const labelInfo = ACTIVITY_LABELS[event.level] ?? ACTIVITY_LABELS.inactive;
    this.maybeNotify(event.sessionId, labelInfo);
  }

  private maybeNotify(
    sessionId: string,
    labelInfo: { emoji: string; label: string; verb: string },
  ): void {
    if (!this.shouldNotify(sessionId)) return;

    const session = this.sessionManager.getSession(sessionId);
    if (!session) return;

    const cliTypeName = session.cliType || 'Unknown';
    const outputLines = this.getLastLines(sessionId, PREVIEW_LINES);
    const content = buildContent(session.name, cliTypeName, session.workingDir, labelInfo, outputLines);

    this.showNotification(content, sessionId);
    this.lastNotificationTime.set(sessionId, Date.now());
  }

  private shouldNotify(sessionId: string): boolean {
    if (!Notification.isSupported()) return false;

    try {
      const mode = this.configLoader.getNotificationMode();
      if (mode !== 'auto' && mode !== 'off') return false;
      if (mode === 'off') return false;
    } catch {
      return false;
    }

    const focusedWin = BrowserWindow.getAllWindows().find(w => w.isFocused());
    if (focusedWin && !focusedWin.isDestroyed()) return false;

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
        const win = this.windowManager.getWindowForSession(sessionId);
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

  /** Remove dedup tracking and output buffer for a session (call on session removal). */
  removeSession(sessionId: string): void {
    this.lastNotificationTime.delete(sessionId);
    this.outputBuffers.delete(sessionId);
  }

  /** Clean up all tracking. */
  dispose(): void {
    this.lastNotificationTime.clear();
    this.outputBuffers.clear();
  }
}
