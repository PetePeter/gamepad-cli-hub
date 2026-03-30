/**
 * Electron Main Process
 *
 * Entry point for the Gamepad CLI Hub desktop application.
 * Manages window creation, IPC communication, and application lifecycle.
 */

import { app, BrowserWindow, Menu, powerMonitor, crashReporter } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { registerIPCHandlers } from './ipc/handlers.js';
import { setupPowerMonitor } from '../session/power-monitor.js';
import { configLoader } from '../config/loader.js';
import { logger } from '../utils/logger.js';

// Enable Chromium gamepad extensions for Bluetooth controller support
app.commandLine.appendSwitch('enable-gamepad-extensions');
app.commandLine.appendSwitch('enable-features', 'WebGamepad');
// Prevent GPU sandbox crashes on hibernate/resume
app.commandLine.appendSwitch('disable-gpu-sandbox');
// Don't kill app after repeated GPU process crashes
app.commandLine.appendSwitch('disable-gpu-process-crash-limit');

// Enable crash reporter to capture native crash dumps for diagnosis
crashReporter.start({
  submitURL: '',
  uploadToServer: false,
});

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let cleanupIPC: (() => void) | null = null;

/**
 * Create the main application window.
 *
 * Now a maximised desktop app (no longer a sidebar) so embedded
 * terminals have room to render.  Window bounds are persisted and
 * restored on next launch.
 */
function createWindow(): void {
  const preloadPath = join(__dirname, 'preload.cjs');
  logger.debug(`[Main] Preload path: ${preloadPath}`);

  // Read persisted window bounds (falls back to sensible defaults)
  let windowBounds = { width: 1280, height: 800, x: undefined as number | undefined, y: undefined as number | undefined };
  try {
    const prefs = configLoader.getSidebarPrefs();
    if (prefs.width) windowBounds.width = Math.max(prefs.width, 800);
    if (prefs.height) windowBounds.height = prefs.height;
    if (prefs.x !== undefined) windowBounds.x = prefs.x;
    if (prefs.y !== undefined) windowBounds.y = prefs.y;
  } catch {
    logger.warn('[Main] Could not read window prefs, using defaults');
  }

  mainWindow = new BrowserWindow({
    width: windowBounds.width,
    height: windowBounds.height,
    x: windowBounds.x,
    y: windowBounds.y,
    minWidth: 640,
    minHeight: 400,
    frame: true,
    resizable: true,
    backgroundColor: '#0a0a0a',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required: preload needs Node.js APIs for contextBridge IPC
    },
    title: 'Gamepad CLI Hub',
  });

  // Load the renderer HTML
  const rendererPath = join(process.cwd(), 'renderer', 'index.html');
  mainWindow.loadFile(rendererPath);

  // Show window when ready — maximise on first launch
  mainWindow.once('ready-to-show', () => {
    if (!windowBounds.x && !windowBounds.y) {
      mainWindow?.maximize();
    }
    mainWindow?.show();
    logger.info('[Main] Window shown');
  });

  // Preload check
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.executeJavaScript('typeof window.gamepadCli')
      .then(result => logger.debug(`[Main] Preload check: window.gamepadCli is ${result}`))
      .catch(err => logger.error(`[Main] Preload check failed: ${err}`));
  });

  // Log renderer console output
  // TRACE: forward ALL renderer console logs for pipeline debugging
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    logger.info(`[WebContents:${level}] ${message} (${sourceId}:${line})`);
  });

  // Renderer crash recovery — Chromium GPU process often crashes on hibernate resume
  let lastReloadTime = 0;
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logger.error(`[Main] Render process gone: reason=${details.reason}, exitCode=${details.exitCode}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      const now = Date.now();
      if (now - lastReloadTime < 5000) {
        logger.error('[Main] Renderer crashing in a loop — not reloading again');
        return;
      }
      lastReloadTime = now;
      logger.info('[Main] Attempting renderer reload after crash');
      mainWindow.webContents.reload();
    }
  });

  mainWindow.webContents.on('unresponsive', () => {
    logger.warn('[Main] Renderer became unresponsive');
  });

  mainWindow.webContents.on('responsive', () => {
    logger.info('[Main] Renderer became responsive again');
  });

  // DevTools — only open via Ctrl+Shift+I (not auto-opened)
  // if (process.env.NODE_ENV !== 'production' && !app.isPackaged) {
  //   mainWindow.webContents.openDevTools();
  // }

  // Persist window bounds on resize/move (debounced)
  let boundsTimer: ReturnType<typeof setTimeout> | null = null;
  const persistBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMaximized()) return;
    if (boundsTimer) clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const bounds = mainWindow.getBounds();
      try {
        configLoader.setSidebarPrefs({ width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y });
      } catch { /* config may not be ready */ }
    }, 500);
  };
  mainWindow.on('resize', persistBounds);
  mainWindow.on('move', persistBounds);

  mainWindow.on('closed', () => {
    mainWindow = null;
    logger.info('[Main] Window closed');
  });

  logger.info(`[Main] Window created (${windowBounds.width}x${windowBounds.height})`);
}

/**
 * Application lifecycle - Ready
 */
app.whenReady().then(() => {
  logger.info('[Main] App ready');
  logger.info(`[Main] Crash dumps directory: ${app.getPath('crashDumps')}`);

  // Register IPC handlers
  const ipc = registerIPCHandlers(() => mainWindow);
  cleanupIPC = ipc.cleanup;

  // Power monitor with full session/PTY diagnostics
  setupPowerMonitor(powerMonitor, {
    sessionManager: ipc.sessionManager,
    ptyManager: ipc.ptyManager,
  });

  // Remove default application menu (no File/Edit/View/Window/Help needed)
  Menu.setApplicationMenu(null);

  // Create main window
  createWindow();

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
  logger.error(`[Main] Uncaught exception: ${error.stack || error}`);
  // Don't exit — try to keep the app alive
});

process.on('unhandledRejection', (reason) => {
  logger.error(`[Main] Unhandled rejection: ${reason}`);
  // Don't exit — try to keep the app alive
});

/**
 * Export for testing
 */
export { mainWindow };
