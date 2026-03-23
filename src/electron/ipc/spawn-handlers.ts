/**
 * Spawn IPC Handlers
 *
 * Launches CLI processes and registers them as sessions.
 */

import { ipcMain } from 'electron';
import type { SessionManager } from '../../session/manager.js';
import type { ProcessSpawner } from '../../session/spawner.js';

export function setupSpawnHandlers(
  sessionManager: SessionManager,
  processSpawner: ProcessSpawner,
): void {
  ipcMain.handle('spawn:cli', (_event, cliType: string, workingDir?: string) => {
    const result = processSpawner.spawn(cliType, workingDir);
    if (result) {
      sessionManager.addSession({
        id: `session-${result.pid}`,
        name: cliType,
        cliType,
        processId: result.pid,
        windowHandle: '',
      });
      return { success: true, pid: result.pid };
    }
    return { success: false, error: 'Failed to spawn' };
  });
}
