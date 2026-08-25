/**
 * Keyboard IPC Handlers (Voice Bindings Only)
 *
 * OS-level key tap and hold operations for voice binding triggers.
 * Regular terminal input routes through PTY — these handlers are ONLY
 * for voice bindings that need OS-level key events.
 */

import { ipcMain } from 'electron';
import type { KeyboardSimulator } from '../../output/keyboard.js';

export function setupKeyboardHandlers(keyboard: KeyboardSimulator): void {
  /** Tap a single key (voice tap mode) */
  ipcMain.handle('keyboard:keyTap', (_event, key: string) => {
    keyboard.keyTap(key);
    return { success: true };
  });

  /** Tap a key combo (voice tap mode with modifiers) */
  ipcMain.handle('keyboard:sendKeyCombo', (_event, keys: string[]) => {
    keyboard.sendKeyCombo(keys);
    return { success: true };
  });

  /** Hold keys down (voice hold mode — press on button down) */
  ipcMain.handle('keyboard:comboDown', (_event, keys: string[]) => {
    keyboard.comboDown(keys);
    return { success: true };
  });

  /** Release held keys (voice hold mode — release on button up) */
  ipcMain.handle('keyboard:comboUp', (_event, keys: string[]) => {
    keyboard.comboUp(keys);
    return { success: true };
  });
}
