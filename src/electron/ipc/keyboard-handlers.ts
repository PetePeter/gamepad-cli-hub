/**
 * Keyboard IPC Handlers
 *
 * Keyboard simulation — key sequences, text typing, long presses.
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

  ipcMain.handle('keyboard:longPress', (_event, key: string, duration: number) => {
    keyboard.longPress(key, duration);
    return { success: true };
  });
}
