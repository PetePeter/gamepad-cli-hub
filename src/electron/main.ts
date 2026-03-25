/**
 * Electron Main Process
 *
 * Entry point for the Gamepad CLI Hub desktop application.
 * Manages window creation, IPC communication, and application lifecycle.
 */

import { app, BrowserWindow, ipcMain, Menu, screen } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { registerIPCHandlers } from './ipc/handlers.js';
import { gamepadInput } from '../input/gamepad.js';
import { configLoader } from '../config/loader.js';
import { logger } from '../utils/logger.js';

// Enable Chromium gamepad extensions for Bluetooth controller support
app.commandLine.appendSwitch('enable-gamepad-extensions');
app.commandLine.appendSwitch('enable-features', 'WebGamepad');

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let cleanupIPC: (() => void) | null = null;

/**
 * Create the main application window as a docked sidebar
 */
function createWindow(): void {
  const preloadPath = join(__dirname, 'preload.cjs');
  logger.debug(`[Main] Preload path: ${preloadPath}`);

  // Read sidebar preferences (config already loaded by registerIPCHandlers)
  let sidebarPrefs = { side: 'left' as const, width: 320 };
  try {
    sidebarPrefs = configLoader.getSidebarPrefs();
  } catch {
    logger.warn('[Main] Could not read sidebar prefs, using defaults');
  }

  // Position sidebar against monitor edge, respecting taskbar
  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;
  const x = sidebarPrefs.side === 'left'
    ? workArea.x
    : workArea.x + workArea.width - sidebarPrefs.width;

  mainWindow = new BrowserWindow({
    width: sidebarPrefs.width,
    height: workArea.height,
    x,
    y: workArea.y,
    minWidth: 250,
    maxWidth: 450,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    backgroundColor: '#0a0a0a',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    title: 'Gamepad CLI Hub',
  });

  // Load the renderer HTML
  const rendererPath = join(process.cwd(), 'renderer', 'index.html');
  mainWindow.loadFile(rendererPath);

  // Show window when ready — maximize for embedded terminal usage
  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize();
    mainWindow?.show();
    logger.info('[Main] Window shown (maximized)');
  });

  // Preload check
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.executeJavaScript('typeof window.gamepadCli')
      .then(result => logger.debug(`[Main] Preload check: window.gamepadCli is ${result}`))
      .catch(err => logger.error(`[Main] Preload check failed: ${err}`));
  });

  // Log renderer console output
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (sourceId?.includes('preload') || message.includes('Preload') || level >= 2) {
      logger.debug(`[WebContents:${level}] ${message} (${sourceId}:${line})`);
    }
  });

  // DevTools — only open in development
  if (process.env.NODE_ENV !== 'production' && !app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  // Re-snap sidebar after resize (debounced) — persists width + locks height/position
  let isRepositioning = false;
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;

  mainWindow.on('resize', () => {
    if (!mainWindow || isRepositioning) return;
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      isRepositioning = true;
      const [width] = mainWindow.getSize();
      try {
        const prefs = configLoader.getSidebarPrefs();
        const wa = screen.getPrimaryDisplay().workArea;
        const snapX = prefs.side === 'left' ? wa.x : wa.x + wa.width - width;
        mainWindow.setBounds({ x: snapX, y: wa.y, width, height: wa.height });
        configLoader.setSidebarPrefs({ width });
      } catch { /* config may not be ready */ }
      setTimeout(() => { isRepositioning = false; }, 100);
    }, 300);
  });

  // Re-snap when display layout changes (e.g. resolution, taskbar moved)
  screen.on('display-metrics-changed', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      const prefs = configLoader.getSidebarPrefs();
      const wa = screen.getPrimaryDisplay().workArea;
      const snapX = prefs.side === 'left' ? wa.x : wa.x + wa.width - prefs.width;
      mainWindow.setBounds({ x: snapX, y: wa.y, width: prefs.width, height: wa.height });
    } catch { /* ignore */ }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    logger.info('[Main] Window closed');
  });

  logger.info(`[Main] Sidebar created (${sidebarPrefs.side}, ${sidebarPrefs.width}px)`);
}

/**
 * Application lifecycle - Ready
 */
app.whenReady().then(() => {
  logger.info('[Main] App ready');

  // Register IPC handlers
  cleanupIPC = registerIPCHandlers(() => mainWindow);

  // Remove default application menu (no File/Edit/View/Window/Help needed)
  Menu.setApplicationMenu(null);

  // Create main window
  createWindow();

  // Start gamepad input listener
  gamepadInput.start();
  logger.info('[Main] Gamepad listener started');

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
  logger.info('[Main] All windows closed');

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
  logger.info('[Main] App quitting');

  // Stop gamepad input
  gamepadInput.stop();

  if (cleanupIPC) {
    cleanupIPC();
    cleanupIPC = null;
  }
});

/**
 * Application lifecycle - Will quit
 */
app.on('will-quit', (event) => {
  logger.info('[Main] App will quit');

  // Prevent default quit to allow cleanup
  // event.preventDefault();

  // Cleanup will be handled by before-quit
});

/**
 * Handle uncaught errors
 */
process.on('uncaughtException', (error) => {
  logger.error(`[Main] Uncaught exception: ${error}`);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`[Main] Unhandled rejection at: ${promise} reason: ${reason}`);
});

/**
 * Export for testing
 */
export { mainWindow };
