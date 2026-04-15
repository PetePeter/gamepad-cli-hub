/**
 * Session IPC Handlers
 *
 * Manages CLI session lifecycle and active session switching.
 */

import { ipcMain } from 'electron';
import type { SessionManager } from '../../session/manager.js';
import type { PtyManager } from '../../session/pty-manager.js';
import type { DraftManager } from '../../session/draft-manager.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Setup
// ============================================================================

export function setupSessionHandlers(
  sessionManager: SessionManager,
  ptyManager: PtyManager,
  draftManager: DraftManager,
): () => void {
  // --- CRUD & navigation ---------------------------------------------------

  ipcMain.handle('session:getAll', () => {
    return sessionManager.getAllSessions();
  });

  ipcMain.handle('session:setActive', (_event, id: string) => {
    sessionManager.setActiveSession(id);
    return sessionManager.getActiveSession();
  });

  ipcMain.handle('session:getActive', () => {
    return sessionManager.getActiveSession();
  });

  ipcMain.handle('session:remove', (_event, id: string) => {
    sessionManager.removeSession(id);
    return { success: true };
  });

  ipcMain.handle('session:rename', (_event, id: string, newName: string) => {
    try {
      const updatedSession = sessionManager.renameSession(id, newName);
      return { success: true, session: updatedSession };
    } catch (error) {
      logger.error(`[Session] Rename failed: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('session:close', async (_event, id: string) => {
    try {
      const session = sessionManager.getSession(id);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      try {
        ptyManager.kill(id);
      } catch (killError) {
        logger.warn(`[Session] Failed to kill PTY for session ${id}: ${killError}`);
      }

      sessionManager.removeSession(id);
      draftManager.clearSession(id);

      return { success: true };
    } catch (error) {
      logger.error(`[Session] Close failed: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  return () => {
    // no-op — health check removed, PTY exit events handle cleanup
  };
}
