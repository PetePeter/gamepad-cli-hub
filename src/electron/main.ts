/**
 * Electron Main Process
 *
 * Entry point for the Gamepad CLI Hub desktop application.
 * Manages window creation, IPC communication, and application lifecycle.
 */

import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { registerIPCHandlers } from './ipc/handlers.js';
import { gamepadInput } from '../input/gamepad.js';

// Enable Chromium gamepad extensions for Bluetooth controller support
app.commandLine.appendSwitch('enable-gamepad-extensions');
app.commandLine.appendSwitch('enable-features', 'WebGamepad');

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

/**
 * Create the main application window
 */
function createWindow(): void {
  const preloadPath = join(__dirname, 'preload.cjs');
  console.log('[Main] Preload path:', preloadPath);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0a0a0a',
    show: false, // Don't show until ready-to-show
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Needed for gamepad access
    },
    titleBarStyle: 'default',
    title: 'Gamepad CLI Hub',
  });

  // Load the renderer HTML
  // In development, renderer is at project root /renderer
  // In production, it would be packaged differently
  const rendererPath = join(process.cwd(), 'renderer', 'index.html');
  mainWindow.loadFile(rendererPath);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    console.log('[Main] Window shown');
  });

  // Check preload worked after renderer loads
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.executeJavaScript('typeof window.gamepadCli')
      .then(result => console.log('[Main] Preload check: window.gamepadCli is', result))
      .catch(err => console.error('[Main] Preload check failed:', err));
  });

  // Log any renderer/preload console output to terminal
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (sourceId?.includes('preload') || message.includes('Preload') || level >= 2) {
      console.log(`[WebContents:${level}] ${message} (${sourceId}:${line})`);
    }
  });

  // DevTools (always for now, to debug)
  mainWindow.webContents.openDevTools();

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
    console.log('[Main] Window closed');
  });

  console.log('[Main] Window created');
}

/**
 * Application lifecycle - Ready
 */
app.whenReady().then(() => {
  console.log('[Main] App ready');

  // Register IPC handlers
  registerIPCHandlers();

  // Remove default application menu (no File/Edit/View/Window/Help needed)
  Menu.setApplicationMenu(null);

  // Create main window
  createWindow();

  // Start gamepad input listener
  gamepadInput.start();
  console.log('[Main] Gamepad listener started');

  // Handle macOS dock behavior
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/**
 * Application lifecycle - All windows closed
 */
app.on('window-all-closed', () => {
  console.log('[Main] All windows closed');

  // Stop gamepad input
  gamepadInput.stop();

  // On macOS, don't quit the app
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * Application lifecycle - Before quit
 */
app.on('before-quit', () => {
  console.log('[Main] App quitting');

  // Stop gamepad input
  gamepadInput.stop();
});

/**
 * Application lifecycle - Will quit
 */
app.on('will-quit', (event) => {
  console.log('[Main] App will quit');

  // Prevent default quit to allow cleanup
  // event.preventDefault();

  // Cleanup will be handled by before-quit
});

/**
 * Handle uncaught errors
 */
process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main] Unhandled rejection at:', promise, 'reason:', reason);
});

/**
 * Export for testing
 */
export { mainWindow };
