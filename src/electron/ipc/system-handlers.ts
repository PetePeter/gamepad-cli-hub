/**
 * System IPC Handlers
 *
 * OS-level operations — logs folder access, external editor, temp file cleanup.
 */

import { ipcMain, shell, app } from 'electron';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logger, logDir } from '../../utils/logger.js';
import { getTempDir } from '../../utils/app-paths.js';

export function setupSystemHandlers(): void {
  ipcMain.handle('app:getVersion', () => app.getVersion());

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

  // temp:writeContent — write text to a temp file for draft/plan apply
  // Returns the file path on success, or { success: false, error } on failure
  ipcMain.handle('temp:writeContent', async (_, content: string): Promise<{ success: boolean; path?: string; error?: string }> => {
    const tmpDir = getTempDir(__dirname);
    try {
      fs.mkdirSync(tmpDir, { recursive: true });
    } catch (err) {
      logger.warn(`[System] Could not create tmp dir ${tmpDir}: ${err}`);
    }

    const tmpFile = path.join(tmpDir, `helm-work-${Date.now()}.md`);
    try {
      fs.writeFileSync(tmpFile, content, 'utf-8');
      logger.info(`[System] Wrote temp file: ${tmpFile} (${content.length} bytes)`);
      return { success: true, path: tmpFile };
    } catch (error) {
      logger.error(`[System] Failed to write temp file: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  // temp:deleteContent — delete a temp file (best-effort, non-critical)
  ipcMain.handle('temp:deleteContent', async (_, filePath: string): Promise<void> => {
    try {
      fs.unlinkSync(filePath);
      logger.debug(`[System] Deleted temp file: ${filePath}`);
    } catch (error) {
      logger.debug(`[System] Could not delete temp file ${filePath}: ${error}`);
      /* best-effort cleanup — ignore errors */
    }
  });
}

/**
 * Clean up stale temp files (helm-work-* and helm-prompt-*) from previous sessions.
 * Called on startup to prevent accumulation. Best-effort — errors are logged but not fatal.
 */
export function cleanupWorkTempFiles(dirname: string): void {
  const tmpDir = getTempDir(dirname);
  try {
    if (!fs.existsSync(tmpDir)) return;
    const files = fs.readdirSync(tmpDir);
    for (const file of files) {
      if (file.startsWith('helm-work-') || file.startsWith('helm-prompt-')) {
        const filePath = path.join(tmpDir, file);
        try {
          fs.unlinkSync(filePath);
          logger.debug(`[System] Cleaned up temp file: ${filePath}`);
        } catch (err) {
          logger.debug(`[System] Could not delete temp file ${filePath}: ${err}`);
        }
      }
    }
  } catch (error) {
    logger.warn(`[System] Failed to cleanup temp directory: ${error}`);
  }
}
