/**
 * System IPC Handlers
 *
 * OS-level operations — logs folder access, external editor.
 */

import { ipcMain, shell } from 'electron';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logger, logDir } from '../../utils/logger.js';
import { getTempDir } from '../../utils/app-paths.js';

export function setupSystemHandlers(): void {
  ipcMain.handle('system:openLogsFolder', async () => {
    try {
      const errorMessage = await shell.openPath(logDir);
      if (errorMessage) {
        logger.error(`[IPC] Failed to open logs folder: ${errorMessage}`);
        return { success: false, error: errorMessage };
      }
      return { success: true };
    } catch (error) {
      logger.error(`[IPC] Failed to open logs folder: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  // editor:openExternal — Ctrl+G: open temp file in Notepad, return contents on close
  ipcMain.handle('editor:openExternal', async () => {
    const tmpDir = getTempDir(__dirname);
    try {
      fs.mkdirSync(tmpDir, { recursive: true });
    } catch (err) {
      logger.warn(`[System] Could not create tmp dir ${tmpDir}: ${err}`);
    }
    const tmpFile = path.join(tmpDir, `helm-prompt-${Date.now()}.md`);
    try {
      fs.writeFileSync(tmpFile, '', 'utf-8');
      logger.info(`[System] Opening external editor: ${tmpFile}`);

      await new Promise<void>((resolve, reject) => {
        const editor = spawn('notepad.exe', [tmpFile], { stdio: 'ignore' });
        editor.on('close', () => resolve());
        editor.on('error', (err) => reject(err));
      });

      const content = fs.readFileSync(tmpFile, 'utf-8');
      logger.info(`[System] Editor closed, content length: ${content.length}`);
      return { success: true, text: content };
    } catch (error) {
      logger.error(`[System] External editor failed: ${error}`);
      return { success: false, error: String(error) };
    } finally {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore cleanup errors */ }
    }
  });
}
