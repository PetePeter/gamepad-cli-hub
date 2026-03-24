/**
 * Gamepad IPC Handlers
 *
 * Forwards gamepad events to the renderer and exposes gamepad state queries.
 */

import { ipcMain, BrowserWindow } from 'electron';
import type { GamepadInput } from '../../input/gamepad.js';

function getMainWindow(): BrowserWindow | null {
  const win = BrowserWindow.getAllWindows()[0];
  return win && !win.isDestroyed() ? win : null;
}

export function setupGamepadHandlers(gamepadInput: GamepadInput): void {
  gamepadInput.on('button-press', (event) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('gamepad:event', {
        button: event.button,
        gamepadIndex: event.gamepadIndex,
        timestamp: event.timestamp,
      });
    }
  });

  gamepadInput.on('connection-change', (event) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('gamepad:connection', {
        connected: event.connected,
        count: event.count,
        timestamp: event.timestamp,
      });
    }
  });

  ipcMain.handle('gamepad:getCount', () => {
    return gamepadInput.getConnectedGamepadCount();
  });

  ipcMain.handle('gamepad:vibrate', (_event, leftMotor: number, rightMotor: number, durationMs: number) => {
    try {
      gamepadInput.vibrate(leftMotor, rightMotor, durationMs);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}
