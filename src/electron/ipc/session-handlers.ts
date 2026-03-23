/**
 * Session IPC Handlers
 *
 * Manages CLI session lifecycle, active session switching,
 * and foreground window synchronisation.
 */

import { ipcMain, BrowserWindow } from 'electron';
import type { SessionManager } from '../../session/manager.js';
import type { WindowsWindowManager } from '../../output/windows.js';
import type { SessionInfo } from '../../types/session.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Helpers
// ============================================================================

function getMainWindow(): BrowserWindow | null {
  const win = BrowserWindow.getAllWindows()[0];
  return win && !win.isDestroyed() ? win : null;
}

function detectCliTypeFromTitle(title: string): string {
  const lowerTitle = title.toLowerCase();

  if (lowerTitle.includes('claude') || lowerTitle.includes('cc')) {
    return 'claude-code';
  }
  if (lowerTitle.includes('copilot') || lowerTitle.includes('gh copilot')) {
    return 'copilot-cli';
  }

  return 'generic-terminal';
}

// ============================================================================
// Setup
// ============================================================================

export function setupSessionHandlers(
  sessionManager: SessionManager,
  windowManager: WindowsWindowManager,
): void {
  /** Get active session and focus its window */
  async function getActiveAndFocus(): Promise<SessionInfo | null> {
    const session = sessionManager.getActiveSession();
    if (session?.windowHandle) {
      await windowManager.focusWindow(session.windowHandle);
    }
    return session;
  }

  // --- CRUD & navigation ---------------------------------------------------

  ipcMain.handle('session:refresh', async () => {
    try {
      const terminals = await windowManager.findTerminalWindows();
      let addedCount = 0;

      for (const terminal of terminals) {
        const sessionId = `session-${terminal.processId}`;
        if (!sessionManager.getSession(sessionId)) {
          const cliType = detectCliTypeFromTitle(terminal.title);
          const name = `${cliType} (${terminal.processId})`;

          sessionManager.addSession({
            id: sessionId,
            name,
            cliType,
            processId: terminal.processId,
            windowHandle: terminal.hwnd,
          });
          addedCount++;
        }
      }

      return { success: true, count: addedCount, total: sessionManager.getSessionCount() };
    } catch (error) {
      logger.error(`Failed to refresh sessions: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('session:getAll', () => {
    return sessionManager.getAllSessions();
  });

  ipcMain.handle('session:get', (_event, id: string) => {
    return sessionManager.getSession(id);
  });

  ipcMain.handle('session:setActive', async (_event, id: string) => {
    sessionManager.setActiveSession(id);
    return getActiveAndFocus();
  });

  ipcMain.handle('session:getActive', () => {
    return sessionManager.getActiveSession();
  });

  ipcMain.handle('session:add', (_event, session: { id: string; name: string; cliType: string; processId: number }) => {
    sessionManager.addSession({
      id: session.id,
      name: session.name,
      cliType: session.cliType,
      processId: session.processId,
      windowHandle: '',
    });
    return { success: true };
  });

  ipcMain.handle('session:remove', (_event, id: string) => {
    sessionManager.removeSession(id);
    return { success: true };
  });

  ipcMain.handle('session:close', async (_event, id: string) => {
    try {
      const session = sessionManager.getSession(id);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      try {
        process.kill(session.processId);
      } catch (killError) {
        logger.warn(`[Session] Failed to kill process ${session.processId}: ${killError}`);
      }

      sessionManager.removeSession(id);

      return { success: true };
    } catch (error) {
      logger.error(`[Session] Close failed: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('session:next', async () => {
    sessionManager.nextSession();
    return getActiveAndFocus();
  });

  ipcMain.handle('session:previous', async () => {
    sessionManager.previousSession();
    return getActiveAndFocus();
  });

  // --- Foreground sync ------------------------------------------------------

  let foregroundSyncInterval: ReturnType<typeof setInterval> | null = null;
  let lastMatchedSessionId: string | null = null;

  ipcMain.handle('session:startForegroundSync', () => {
    if (foregroundSyncInterval) return { success: true, already: true };

    foregroundSyncInterval = setInterval(async () => {
      try {
        const activeWindow = await windowManager.getActiveWindow();
        if (!activeWindow) return;

        const sessions = sessionManager.getAllSessions();
        const matched = sessions.find(s => s.windowHandle === activeWindow.hwnd);

        if (matched && matched.id !== lastMatchedSessionId) {
          lastMatchedSessionId = matched.id;
          const mainWindow = getMainWindow();
          if (mainWindow) {
            mainWindow.webContents.send('session:foreground-changed', {
              sessionId: matched.id,
              windowHandle: matched.windowHandle,
              timestamp: Date.now(),
            });
          }
        } else if (!matched && lastMatchedSessionId !== null) {
          lastMatchedSessionId = null;
          const mainWindow = getMainWindow();
          if (mainWindow) {
            mainWindow.webContents.send('session:foreground-changed', {
              sessionId: null,
              windowHandle: activeWindow.hwnd,
              timestamp: Date.now(),
            });
          }
        }
      } catch (error) {
        logger.error(`[ForegroundSync] Poll error: ${error}`);
      }
    }, 500);

    logger.info('[IPC] Foreground sync started (500ms interval)');
    return { success: true };
  });

  ipcMain.handle('session:stopForegroundSync', () => {
    if (foregroundSyncInterval) {
      clearInterval(foregroundSyncInterval);
      foregroundSyncInterval = null;
      lastMatchedSessionId = null;
      logger.info('[IPC] Foreground sync stopped');
    }
    return { success: true };
  });
}
