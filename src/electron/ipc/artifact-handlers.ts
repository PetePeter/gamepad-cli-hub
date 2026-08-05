/**
 * Artifact IPC Handlers
 *
 * Renderer-facing surface for session artifacts. Includes:
 * - Read/consume operations (list, get, counts, reveal, export)
 * - Manual creation operations (createText, createWithFile, pickAndReadFile, rename)
 *
 * AI-driven create/update remain MCP-only; the renderer gains create access
 * for user-initiated manual artifacts.
 */

import { ipcMain, dialog, BrowserWindow, shell } from 'electron';
import { readFile, stat, writeFile as fsWriteFile } from 'node:fs/promises';
import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { ArtifactManager } from '../../session/artifact-manager.js';
import type { ArtifactAttachmentManager } from '../../session/artifact-attachment-manager.js';
import type { WindowManager } from '../window-manager.js';
import { mimeForPath } from '../helm-img-protocol.js';
import { setPendingDocument } from '../helm-artifact-protocol.js';
import { sanitizeFilename, artifactExtension, artifactTempFileName } from '../../session/artifact-temp-file.js';
import { getTempDir } from '../../utils/app-paths.js';
import { logger } from '../../utils/logger.js';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function setupArtifactHandlers(
  artifactManager: ArtifactManager,
  attachmentManager: ArtifactAttachmentManager,
  windowManager?: WindowManager,
  moduleDirname?: string,
): void {
  // ── Read operations (existing) ───────────────────────────────────────────

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

  // Hand a built HTML artifact document to the helm-artifact:// handler and
  // return the nonce the renderer puts in the iframe src. The renderer builds
  // the document because that is where DOMParser lives; main only serves it,
  // with the CSP response header that makes the isolation real.
  ipcMain.handle('artifact:prepareRender', (_event, html: string): string => {
    return setPendingDocument(html);
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

    const ext = artifactExtension(artifact.kind);
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
      await fsWriteFile(result.filePath, latest.content, 'utf8');
      logger.info(`[IPC] Exported artifact ${artifactId} to ${result.filePath}`);
      return result.filePath;
    } catch (err) {
      logger.error(`[artifact:export] Failed to write ${result.filePath}: ${err}`);
      return null;
    }
  });

  /**
   * Materialise one artifact version to a temp file and hand it to the OS default
   * app. `version` defaults to the latest; an unknown number falls back to it too,
   * matching the viewer's own tolerance.
   *
   * The copy is left behind deliberately — the external app still holds it. It is
   * marked read-only (edits there would be silently lost, since artifacts.yaml is
   * the source of truth) and reaped on next startup by `cleanupWorkTempFiles`.
   */
  ipcMain.handle('artifact:openExternal', async (
    _event,
    artifactId: string,
    version?: number,
  ): Promise<{ success: boolean; path?: string; error?: string }> => {
    const artifact = artifactManager.get(artifactId);
    if (!artifact || artifact.versions.length === 0) {
      return { success: false, error: 'Artifact not found' };
    }

    const shown = artifact.versions.find(v => v.version === version)
      ?? artifact.versions[artifact.versions.length - 1];

    const tmpDir = getTempDir(moduleDirname ?? '');
    const tmpPath = join(tmpDir, artifactTempFileName(artifact.title, artifact.kind, Date.now()));
    try {
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(tmpPath, shown.content, 'utf8');
      try { chmodSync(tmpPath, 0o444); } catch (err) {
        logger.warn(`[artifact:openExternal] Could not mark ${tmpPath} read-only: ${err}`);
      }

      // openPath resolves a non-empty message on failure rather than throwing —
      // e.g. Windows with no application registered for .md.
      const openErr = await shell.openPath(tmpPath);
      if (openErr) {
        logger.warn(`[artifact:openExternal] ${tmpPath}: ${openErr}`);
        return { success: false, error: openErr };
      }

      logger.info(`[IPC] Opened artifact ${artifactId} v${shown.version} externally: ${tmpPath}`);
      return { success: true, path: tmpPath };
    } catch (err) {
      logger.error(`[artifact:openExternal] Failed for ${artifactId}: ${err}`);
      return { success: false, error: String(err) };
    }
  });

  // ── Manual creation operations (new) ───────────────────────────────────────

  /** Create a manual text/markdown artifact. */
  ipcMain.handle('artifact:createText', (_event, sessionId: string, title: string, content: string, kind?: 'markdown' | 'html') => {
    return artifactManager.create(sessionId, title, kind ?? 'markdown', content, 'manual');
  });

  /** Create a manual artifact from a base64-encoded file (clipboard paste or drag-drop). */
  ipcMain.handle('artifact:createWithFile', (_event, sessionId: string, input: {
    filename: string;
    contentBase64: string;
    contentType?: string;
  }) => {
    // Validate size before decoding (base64 is ~4/3 of raw size)
    const rawSize = Math.ceil(input.contentBase64.length * 3 / 4);
    if (rawSize > MAX_ATTACHMENT_BYTES) {
      throw new Error('File exceeds 10MB size limit');
    }
    const buffer = Buffer.from(input.contentBase64, 'base64');

    // Create the artifact first (empty content, will update after storing attachment)
    const artifact = artifactManager.create(sessionId, input.filename, 'markdown', '', 'manual');

    // Store the attachment on disk
    const attachment = attachmentManager.add(artifact.id, {
      filename: input.filename,
      content: buffer,
      contentType: input.contentType,
    });

    // Build markdown content referencing the stored file
    const absPath = attachmentManager.getPath(artifact.id, attachment.id);
    const isImage = input.contentType?.startsWith('image/');
    let mdContent: string;
    if (isImage) {
      mdContent = `![${input.filename}](${absPath})\n`;
    } else {
      mdContent = `**${input.filename}** — ${formatBytes(buffer.length)} — ${input.contentType ?? 'application/octet-stream'}\n\n📎 [Open in system viewer](${absPath})\n`;
    }

    // Update the artifact with the real content (version 2, since v1 was empty)
    artifactManager.update(artifact.id, mdContent);

    return { artifact, attachment };
  });

  /** Open a native file picker, read the file, return base64-encoded content. */
  ipcMain.handle('artifact:pickAndReadFile', async () => {
    const focusedWindow = windowManager?.getMainWindow() ?? BrowserWindow.getFocusedWindow();
    const result = focusedWindow
      ? await dialog.showOpenDialog(focusedWindow, {
          properties: ['openFile'],
          title: 'Attach File to Artifact',
        })
      : await dialog.showOpenDialog({
          properties: ['openFile'],
          title: 'Attach File to Artifact',
        });
    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    try {
      const fileStat = await stat(filePath);
      if (fileStat.size > MAX_ATTACHMENT_BYTES) {
        throw new Error('File exceeds 10MB size limit');
      }
      const buffer = await readFile(filePath);
      const filename = basename(filePath);
      const mime = mimeForPath(filePath);

      return {
        filename,
        contentBase64: buffer.toString('base64'),
        contentType: mime ?? undefined,
      };
    } catch (err) {
      logger.error(`[artifact:pickAndReadFile] Failed to read ${filePath}: ${err}`);
      throw err;
    }
  });

  /** Rename an artifact. */
  ipcMain.handle('artifact:rename', (_event, artifactId: string, newTitle: string) => {
    return artifactManager.rename(artifactId, newTitle);
  });

  /** Open an attachment file in the system's default app. */
  ipcMain.handle('artifact:openAttachment', async (_event, artifactId: string, attachmentId: string) => {
    try {
      const absPath = attachmentManager.getPath(artifactId, attachmentId);
      await shell.openPath(absPath);
      return true;
    } catch (err) {
      logger.error(`[artifact:openAttachment] Failed to open ${attachmentId}: ${err}`);
      return false;
    }
  });

  logger.info('[IPC] Artifact handlers registered');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
