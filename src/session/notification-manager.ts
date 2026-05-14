import { Notification, BrowserWindow } from 'electron';
import type { SessionManager } from './manager.js';
import { logger } from '../utils/logger.js';
import type { WindowManager } from '../electron/window-manager.js';

interface NotificationContent {
  title: string;
  body: string;
}

/**
 * Manages notifications for CLI sessions.
 *
 * Only LLM-directed notifications are supported — triggered explicitly via the
 * notify_user Helm MCP tool. Auto-activity notifications have been removed.
 *
 * Routing (notifyLlmDirected):
 * - Screen locked + Telegram configured → Telegram
 * - Screen locked, no Telegram → none
 * - Window hidden → OS toast
 * - Window visible, not focused → OS toast + taskbar flash
 * - Window visible, focused, different session → in-app bubble
 * - Window visible, focused, same session → none
 */
export class NotificationManager {
  private screenLockChecker: (() => boolean) | null = null;
  private telegramNotifier: ((sessionId: string, title: string, content: string) => Promise<void>) | null = null;
  private activeSessionIdGetter: (() => string | null) | null = null;

  constructor(
    private windowManager: WindowManager,
    private sessionManager: SessionManager,
  ) {}

  setScreenLockChecker(fn: () => boolean): void { this.screenLockChecker = fn; }

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
   * Send an LLM-directed notification via the Helm MCP notify_user tool.
   *
   * Routing:
   * - Screen locked + Telegram → 'telegram'
   * - Screen locked, no Telegram → 'none'
   * - Window hidden → 'toast'
   * - Window visible, not focused → 'taskbar_flash' (toast + BrowserWindow.flashFrame)
   * - Window visible, focused, different session → 'bubble'
   * - Window visible, focused, same session → 'none'
   */
  notifyLlmDirected(sessionId: string, title: string, content: string): 'toast' | 'bubble' | 'telegram' | 'taskbar_flash' | 'none' {
    const isLocked = this.screenLockChecker?.() ?? false;
    if (isLocked) {
      if (this.telegramNotifier) {
        void this.telegramNotifier(sessionId, title, content);
        return 'telegram';
      }
      return 'none';
    }

    const visibility = this.getAppVisibility();
    this.dispatchLlmInAppNotification(sessionId, title, content);

    if (visibility === 'hidden') {
      this.showNotification({ title, body: content }, sessionId);
      return 'toast';
    }

    if (visibility === 'visible-background') {
      this.showNotification({ title, body: content }, sessionId);
      const mainWin = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
      mainWin?.flashFrame(true);
      return 'taskbar_flash';
    }

    // visible-focused
    const activeId = this.activeSessionIdGetter?.();
    if (activeId === sessionId) return 'none';
    return 'bubble';
  }

  private dispatchLlmInAppNotification(sessionId: string, title: string, content: string): void {
    const windows = BrowserWindow.getAllWindows();
    const targetWindows = windows.filter((window) => !window.isDestroyed());
    for (const window of targetWindows) {
      window.webContents.send('notification:llmNotify', { sessionId, title, content });
    }
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

  removeSession(_sessionId: string): void {}

  dispose(): void {}
}
