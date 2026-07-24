/**
 * Artifact IPC Handlers
 *
 * Renderer-facing read/reveal/delete/export surface for session artifacts.
 * Create and update are AI-driven via MCP, so no create/update channel is
 * exposed here — the renderer only consumes artifacts.
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';
import type { ArtifactManager } from '../../session/artifact-manager.js';
import type { WindowManager } from '../window-manager.js';
import { logger } from '../../utils/logger.js';

/** Reduce a title to a safe file stem (no path separators or reserved chars). */
function sanitizeFilename(title: string): string {
  const cleaned = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  return cleaned.length > 0 ? cleaned.slice(0, 120) : 'artifact';
}

export function setupArtifactHandlers(
  artifactManager: ArtifactManager,
  windowManager?: WindowManager,
): void {
  ipcMain.handle('artifact:list', (_event, sessionId: string) => {
    return artifactManager.getForSession(sessionId);
  });

  // Version-agnostic artifact count per session, for the session-card badges.
  ipcMain.handle('artifact:counts', (): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const [sessionId, artifacts] of Object.entries(artifactManager.exportAll())) {
      counts[sessionId] = artifacts.length;
    }
    return counts;
  });

  ipcMain.handle('artifact:get', (_event, artifactId: string) => {
    return artifactManager.get(artifactId);
  });

  ipcMain.handle('artifact:delete', (_event, artifactId: string) => {
    return artifactManager.delete(artifactId);
  });

  ipcMain.handle('artifact:deleteAll', (_event, sessionId: string) => {
    artifactManager.deleteAllForSession(sessionId);
    return true;
  });

  ipcMain.handle('artifact:reveal', (_event, artifactId: string) => {
    return artifactManager.reveal(artifactId);
  });

  ipcMain.handle('artifact:export', async (_event, artifactId: string): Promise<string | null> => {
    const artifact = artifactManager.get(artifactId);
    if (!artifact) return null;

    const ext = artifact.kind === 'html' ? 'html' : 'md';
    const filterName = artifact.kind === 'html' ? 'HTML' : 'Markdown';
    const focusedWindow = windowManager?.getMainWindow() ?? BrowserWindow.getFocusedWindow();
    const options: Electron.SaveDialogOptions = {
      title: 'Export Artifact',
      defaultPath: `${sanitizeFilename(artifact.title)}.${ext}`,
      filters: [
        { name: filterName, extensions: [ext] },
        { name: 'All Files', extensions: ['*'] },
      ],
    };

    const result = focusedWindow
      ? await dialog.showSaveDialog(focusedWindow, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;

    const latest = artifact.versions[artifact.versions.length - 1];
    try {
      await writeFile(result.filePath, latest.content, 'utf8');
      logger.info(`[IPC] Exported artifact ${artifactId} to ${result.filePath}`);
      return result.filePath;
    } catch (err) {
      logger.error(`[artifact:export] Failed to write ${result.filePath}: ${err}`);
      return null;
    }
  });

  logger.info('[IPC] Artifact handlers registered');
}
