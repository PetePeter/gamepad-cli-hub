import { shell } from 'electron';
import type { BrowserWindow } from 'electron';
import { logger } from '../utils/logger.js';

/**
 * Lock a privileged BrowserWindow to its own app content.
 *
 * These windows load the Helm preload, which exposes the full IPC bridge, so
 * they must never navigate to remote content — a link or redirect from
 * AI-authored artifact HTML (or any injected markup) could otherwise drive the
 * privileged webContents to an attacker page with the bridge still attached.
 *
 * The renderer is always loaded from the local bundle (`loadFile` → `file:`),
 * so only `file:` (and the empty `about:blank`) count as internal. Anything else
 * is blocked; ordinary web URLs are handed to the OS browser instead. Reloads and
 * hash/query routing do not trigger `will-navigate`, so in-app behavior is
 * unaffected.
 */
export function applyNavigationPolicy(win: BrowserWindow): void {
  const wc = win.webContents;

  const isInternal = (target: string): boolean => {
    if (target === 'about:blank') return true;
    try {
      return new URL(target).protocol === 'file:';
    } catch {
      return false;
    }
  };

  wc.on('will-navigate', (event, target) => {
    if (isInternal(target)) return;
    event.preventDefault();
    logger.warn(`[nav] Blocked in-window navigation to: ${target}`);
    if (/^https?:\/\//i.test(target)) void shell.openExternal(target);
  });

  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
}
