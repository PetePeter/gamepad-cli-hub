/**
 * Electron Main Process
 *
 * Entry point for the Helm desktop application.
 * Manages window creation, IPC communication, and application lifecycle.
 */

import { app, BrowserWindow, Menu, crashReporter, ipcMain } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync, readFileSync } from 'fs';
import { registerIPCHandlers } from './ipc/handlers.js';
import { WindowManager } from './window-manager.js';
import { resolveWindowIconPath } from './window-icon.js';
import { buildSplashHtml } from './splash-html.js';
import { migrateOldPlans } from '../session/plan-migration.js';
import { configLoader } from '../config/loader.js';
import { logger } from '../utils/logger.js';
import { getRendererHtmlPath, isPackaged, seedConfigIfNeeded, getConfigDir } from '../utils/app-paths.js';

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

// Set app identity so Windows toast notifications show our name, not "Electron"
app.setAppUserModelId('com.gamepadcli.hub');

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let cleanupIPC: (() => void) | null = null;
let windowBounds = { width: 1280, height: 800, x: undefined as number | undefined, y: undefined as number | undefined };
let mainWindowReadyToShow = false;
let rendererStartupReady = false;
let startupFallbackTimer: ReturnType<typeof setTimeout> | null = null;

function readWindowBounds(): void {
  windowBounds = { width: 1280, height: 800, x: undefined as number | undefined, y: undefined as number | undefined };
  try {
    const prefs = configLoader.getSidebarPrefs();
    if (prefs.width) windowBounds.width = Math.max(prefs.width, 800);
    if (prefs.height) windowBounds.height = prefs.height;
    if (prefs.x !== undefined) windowBounds.x = prefs.x;
    if (prefs.y !== undefined) windowBounds.y = prefs.y;
  } catch {
    logger.warn('[Main] Could not read window prefs, using defaults');
  }
}

function resolveSplashLogoUrl(): string | undefined {
  const svgCandidates = [
    join(app.getAppPath(), 'dist', 'renderer', 'assets', 'helm-paper-boat.svg'),
    join(app.getAppPath(), 'renderer', 'assets', 'helm-paper-boat.svg'),
    join(process.resourcesPath, 'app.asar', 'dist', 'renderer', 'assets', 'helm-paper-boat.svg'),
    join(process.cwd(), 'renderer', 'assets', 'helm-paper-boat.svg'),
    join(__dirname, '..', '..', 'renderer', 'assets', 'helm-paper-boat.svg'),
  ];
  const svgPath = svgCandidates.find(p => existsSync(p));
  if (svgPath) {
    const svg = readFileSync(svgPath, 'utf8');
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  const pngCandidates = [
    join(process.resourcesPath, 'build', 'icon.png'),
    join(process.cwd(), 'build', 'icon.png'),
    join(__dirname, '..', '..', 'build', 'icon.png'),
  ];
  const logoPath = pngCandidates.find(p => existsSync(p));
  return logoPath ? pathToFileURL(logoPath).href : undefined;
}

function clearStartupFallbackTimer(): void {
  if (!startupFallbackTimer) return;
  clearTimeout(startupFallbackTimer);
  startupFallbackTimer = null;
}

function closeSplashWindow(): void {
  clearStartupFallbackTimer();
  if (!splashWindow || splashWindow.isDestroyed()) {
    splashWindow = null;
    return;
  }
  splashWindow.close();
  splashWindow = null;
}

function maybeShowMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindowReadyToShow || !rendererStartupReady) return;

  if (!windowBounds.x && !windowBounds.y) {
    mainWindow.maximize();
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show();
    logger.info('[Main] Window shown');
  }
  mainWindow.focus();
  closeSplashWindow();
}

function createSplashWindow(windowIcon?: string): void {
  closeSplashWindow();
  const splashLogoUrl = resolveSplashLogoUrl();

  splashWindow = new BrowserWindow({
    width: 460,
    height: 320,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    movable: false,
    fullscreenable: false,
    show: false,
    center: true,
    skipTaskbar: true,
    backgroundColor: '#0a0a0a',
    alwaysOnTop: true,
    icon: windowIcon,
  });

  splashWindow.setMenuBarVisibility(false);
  void splashWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(buildSplashHtml(app.getVersion(), splashLogoUrl))}`);
  splashWindow.once('ready-to-show', () => splashWindow?.show());
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

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

  readWindowBounds();
  mainWindowReadyToShow = false;
  rendererStartupReady = false;

  const windowIcon = resolveWindowIconPath(__dirname);
  createSplashWindow(windowIcon);

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
    icon: windowIcon,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required: preload needs Node.js APIs for contextBridge IPC
    },
    title: `Helm — steer your fleet of agents v${app.getVersion()}`,
  });

  // Load the renderer HTML (__dirname-relative, works inside asar)
  const rendererPath = getRendererHtmlPath(__dirname);
  mainWindow.loadFile(rendererPath);

  // Keep our BrowserWindow title (prevents HTML <title> from overriding it)
  mainWindow.on('page-title-updated', (e) => e.preventDefault());

  // Wait for both Chromium paint readiness and renderer bootstrap readiness.
  mainWindow.once('ready-to-show', () => {
    mainWindowReadyToShow = true;
    maybeShowMainWindow();
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
      mainWindowReadyToShow = false;
      rendererStartupReady = false;
      createSplashWindow(windowIcon);
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
    clearStartupFallbackTimer();
    closeSplashWindow();
    mainWindow = null;
    mainWindowReadyToShow = false;
    rendererStartupReady = false;
    logger.info('[Main] Window closed');
  });

  clearStartupFallbackTimer();
  startupFallbackTimer = setTimeout(() => {
    logger.warn('[Main] Renderer startup-ready signal timed out; showing main window anyway');
    rendererStartupReady = true;
    maybeShowMainWindow();
  }, 15000);

  logger.info(`[Main] Window created (${windowBounds.width}x${windowBounds.height})`);
}

/**
 * Application lifecycle - Ready
 */
app.whenReady().then(async () => {
  logger.info('[Main] App ready');
  logger.info(`[Main] Crash dumps directory: ${app.getPath('crashDumps')}`);

  // Belt-and-suspenders: seed config from main.ts in case module-level seed didn't run
  if (isPackaged(__dirname)) {
    const bundled = join(__dirname, '..', 'config');
    const target = getConfigDir(__dirname);
    seedConfigIfNeeded(bundled, target);
  }

  // Migrate monolithic plans.yaml → individual files if still present
  try {
    const r = migrateOldPlans();
    if (r.migratedPlans > 0 || r.migratedDeps > 0) {
      logger.info(`[Main] Plan migration: ${r.migratedPlans} plan(s), ${r.migratedDeps} dep(s)`);
    }
  } catch (err) {
    logger.error(`[Main] Plan migration failed: ${err}`);
  }

  // Register IPC handlers (passes __dirname for temp file cleanup on startup)
  const ipc = registerIPCHandlers(__dirname);
  cleanupIPC = ipc.cleanup;
  const windowManager = ipc.windowManager;

  // Start watching for incoming plan files from CLIs
  ipc.incomingWatcher.start();

  // Remove default application menu (no File/Edit/View/Window/Help needed)
  Menu.setApplicationMenu(null);

  // Create main window
  createWindow();

  // Register main window with WindowManager
  if (mainWindow) {
    windowManager.setMainWindow(mainWindow);
  }

  // Handle macOS dock behavior
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

ipcMain.on('app:startupReady', (event) => {
  const senderWin = BrowserWindow.fromWebContents(event.sender);
  if (!senderWin || senderWin.isDestroyed()) return;

  rendererStartupReady = true;
  logger.info('[Main] Renderer signaled startup ready');
  maybeShowMainWindow();
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

  closeSplashWindow();

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
