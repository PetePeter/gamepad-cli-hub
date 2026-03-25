/**
 * Keyboard IPC Handlers
 *
 * @deprecated Keyboard handlers will be removed once all input routes through PTY.
 *
 * Keyboard simulation — key sequences and text typing.
 */

import { ipcMain } from 'electron';
import type { KeyboardSimulator } from '../../output/keyboard.js';

export function setupKeyboardHandlers(keyboard: KeyboardSimulator): void {
  ipcMain.handle('keyboard:sendKeys', (_event, keys: string[]) => {
    keyboard.sendKeys(keys);
    return { success: true };
  });

  ipcMain.handle('keyboard:typeString', (_event, text: string) => {
    keyboard.typeString(text);
    return { success: true };
  });

  ipcMain.handle('keyboard:comboDown', (_event, keys: string[]) => {
    keyboard.comboDown(keys);
    return { success: true };
  });

  ipcMain.handle('keyboard:comboUp', (_event, keys: string[]) => {
    keyboard.comboUp(keys);
    return { success: true };
  });
}
