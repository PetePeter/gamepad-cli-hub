import { ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import type { SessionManager } from '../../session/manager.js';
import type { ConfigLoader } from '../../config/loader.js';
import { logger } from '../../utils/logger.js';
import type { WindowManager } from '../window-manager.js';

interface PendingRequest {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const REQUEST_TIMEOUT_MS = 1500;

export class RendererTextDeliverer {
  private pending = new Map<string, PendingRequest>();
  private rendererReady = false;

  constructor(
    private windowManager: WindowManager,
    private sessionManager: SessionManager,
    private configLoader: ConfigLoader,
  ) {
    ipcMain.handle('text:deliver-response', (_event, requestId: string, success: boolean, error?: string) => {
      const pending = this.pending.get(requestId);
      if (!pending) return { success: false };
      clearTimeout(pending.timer);
      this.pending.delete(requestId);
      if (success) pending.resolve();
      else pending.reject(new Error(error || 'Renderer text delivery failed'));
      return { success: true };
    });

    ipcMain.handle('text:deliver-ready', () => {
      this.rendererReady = true;
      return { success: true };
    });
  }

  async deliver(sessionId: string, text: string, options?: { withReturn?: boolean; submitSuffix?: string }): Promise<void> {
    if (!text) return;

    const session = this.sessionManager.getSession(sessionId);
    const pasteMode = session
      ? this.configLoader.getCliTypeEntry(session.cliType)?.pasteMode
      : undefined;

    const win = this.windowManager.getWindowForSession(sessionId);
    if (!this.rendererReady || !win || win.isDestroyed()) {
      if (pasteMode === 'clippaste' || pasteMode === 'sendkeys' || pasteMode === 'sendkeysindividual') {
        throw new Error(`Renderer delivery unavailable for pasteMode=${pasteMode}`);
      }
      throw new Error('Renderer delivery unavailable');
    }

    const requestId = randomUUID();
    const promise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Renderer delivery timed out after ${REQUEST_TIMEOUT_MS}ms`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, reject, timer });
    });

    win.webContents.send('text:deliver-request', { requestId, sessionId, text, withReturn: options?.withReturn, submitSuffix: options?.submitSuffix });
    await promise;
  }

  dispose(): void {
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Renderer text deliverer disposed'));
      this.pending.delete(requestId);
    }
    ipcMain.removeHandler('text:deliver-response');
    ipcMain.removeHandler('text:deliver-ready');
  }
}
