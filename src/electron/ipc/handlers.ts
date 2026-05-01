/**
 * IPC Handler Orchestrator
 *
 * Creates shared dependencies and delegates to domain-specific handler modules.
 * This is the single entry point called from main.ts — individual handler files
 * are never imported directly by the application.
 */

import { BrowserWindow, dialog, ipcMain, powerMonitor } from 'electron';
import { SessionManager } from '../../session/manager.js';
import { PtyManager } from '../../session/pty-manager.js';
import { StateDetector } from '../../session/state-detector.js';
import { PipelineQueue } from '../../session/pipeline-queue.js';
import { NotificationManager } from '../../session/notification-manager.js';
import { DraftManager } from '../../session/draft-manager.js';
import { PlanManager } from '../../session/plan-manager.js';
import { PlanBackupManager } from '../../session/plan-backup-manager.js';
import { PatternMatcher } from '../../session/pattern-matcher.js';
import { ScheduledTaskManager } from '../../session/scheduled-task-manager.js';
import { setupPowerMonitor } from '../../session/power-monitor.js';
import { configLoader } from '../../config/loader.js';
import { keyboard } from '../../output/keyboard.js';
import { logger } from '../../utils/logger.js';

import { TelegramBotCore } from '../../telegram/bot.js';
import { TopicManager } from '../../telegram/topic-manager.js';
import { TelegramNotifier } from '../../telegram/notifier.js';
import { initTelegramModules } from '../../telegram/orchestrator.js';

import { setupSessionHandlers } from './session-handlers.js';
import { setupConfigHandlers } from './config-handlers.js';
import { setupEditorHandlers } from './editor-handlers.js';
import { setupProfileHandlers } from './profile-handlers.js';
import { setupToolsHandlers } from './tools-handlers.js';
import { setupKeyboardHandlers } from './keyboard-handlers.js';
import { setupSystemHandlers, cleanupWorkTempFiles } from './system-handlers.js';
import { setupPtyHandlers, cancelAllPrompts } from './pty-handlers.js';
import { setupTelegramHandlers } from './telegram-handlers.js';
import { setupDraftHandlers } from './draft-handlers.js';
import { setupPlanHandlers } from './plan-handlers.js';
import { setupScheduledTaskHandlers } from './scheduled-task-handlers.js';
import { setupBackupPlanHandlers } from './plan-backup-handlers.js';
import { RendererTextDeliverer } from './text-delivery.js';
import { loadDrafts } from '../../session/persistence.js';
import { IncomingPlansWatcher } from '../../session/incoming-plans-watcher.js';
import { WindowManager } from '../window-manager.js';
import { HelmControlService } from '../../mcp/helm-control-service.js';
import { LocalhostMcpServer } from '../../mcp/localhost-mcp-server.js';

const TELEGRAM_AUTOSTART_DELAY_MS = 60_000;


/**
 * Register all IPC handlers.
 *
 * Dependencies are created/imported here and injected into each domain module
 * so handler files never import singletons directly.
 */
export function registerIPCHandlers(
  dirname?: string,
): { cleanup: () => void; sessionManager: SessionManager; ptyManager: PtyManager; incomingWatcher: IncomingPlansWatcher; windowManager: WindowManager } {
  logger.info('[IPC] Registering handlers');

  const windowManager = new WindowManager();

  // Clean up stale temp files from previous sessions
  if (dirname) {
    cleanupWorkTempFiles(dirname);
  }

  // Load config eagerly so individual handlers don't need to call load()
  try {
    configLoader.load();
    logger.info(`[IPC] Config loaded: ${configLoader.getCliTypes()}`);
  } catch (error) {
    logger.error(`[IPC] Failed to load config: ${error}`);
  }

  // SessionManager is created here and shared via dependency injection
  const sessionManager = new SessionManager();
  const ptyManager = new PtyManager();
  const stateDetector = new StateDetector();
  const pipelineQueue = new PipelineQueue();
  const draftManager = new DraftManager();
  const planManager = new PlanManager();
  const backupManager = new PlanBackupManager(planManager);
  const scheduledTaskManager = new ScheduledTaskManager(sessionManager, ptyManager, planManager, configLoader);
  const notificationManager = new NotificationManager(
    windowManager, sessionManager, configLoader,
    (sessionId) => stateDetector.getState(sessionId),
  );

  // Power monitor with full session/PTY diagnostics and screen lock tracking
  const powerMonitorResult = setupPowerMonitor(powerMonitor, { sessionManager, ptyManager });
  notificationManager.setScreenLockChecker(powerMonitorResult.isScreenLocked);
  notificationManager.setActiveSessionIdGetter(() => sessionManager.getActiveSession()?.id ?? null);

  // Create HelmControlService before Telegram modules (Telegram relay needs it)
  const helmControlService = new HelmControlService(planManager, sessionManager, ptyManager, configLoader);
  helmControlService.setNotificationManager(notificationManager);

  const telegramBot = new TelegramBotCore();
  const topicManager = new TopicManager(telegramBot, sessionManager, configLoader.getTelegramConfig().instanceName);
  const telegramNotifier = new TelegramNotifier(telegramBot, topicManager, sessionManager, () => configLoader.getTelegramConfig());

  // Wire the Telegram notifier to the notification manager for LLM-directed notifications when screen is locked
  notificationManager.setTelegramNotifier(async (_sessionId: string, title: string, content: string) => {
    if (!telegramBot.isRunning()) return;
    const config = configLoader.getTelegramConfig();
    const text = `${title}\n\n${content}`;
    try {
      await telegramBot.sendMessage(text);
    } catch (error) {
      logger.error(`[IPC] Failed to send LLM notification via Telegram: ${error}`);
    }
  });

  // Initialize all telegram modules (Phase 1+2+3)
  const telegramModules = initTelegramModules(
    telegramBot, topicManager, telegramNotifier,
    sessionManager, ptyManager, configLoader, helmControlService, draftManager,
  );

  // Restore sessions persisted from previous run
  const restored = sessionManager.restoreSessions();
  logger.info(`[IPC] Restored ${restored.length} session(s) from previous run`);

  draftManager.importAll(loadDrafts());
  // PlanManager loads from disk in its constructor — no explicit importAll needed

  const incomingWatcher = new IncomingPlansWatcher(planManager);
  const textDeliverer = new RendererTextDeliverer(windowManager, sessionManager, configLoader);
  ptyManager.setTextDeliveryHandler((sessionId, text, options) => textDeliverer.deliver(sessionId, text, options));
  const localhostMcpServer = new LocalhostMcpServer(helmControlService, {
    enabled: configLoader.getMcpConfig().enabled,
    port: configLoader.getMcpConfig().port,
    token: configLoader.getMcpConfig().authToken,
  });

  const patternMatcher = new PatternMatcher(
    (sessionId, data) => ptyManager.deliverText(sessionId, data),
    (cliType) => configLoader.getPatterns(cliType),
  );

  const cleanupSession = setupSessionHandlers(sessionManager, ptyManager, draftManager, windowManager, configLoader);
  setupConfigHandlers(configLoader, localhostMcpServer);
  setupEditorHandlers(configLoader);
  setupProfileHandlers(configLoader);
  setupToolsHandlers(configLoader);
  setupKeyboardHandlers(keyboard);
  setupSystemHandlers(dirname ?? process.cwd());
  setupDraftHandlers(draftManager);
  setupPlanHandlers(planManager, windowManager, incomingWatcher);
  setupScheduledTaskHandlers(scheduledTaskManager, windowManager);
  setupPtyHandlers(ptyManager, stateDetector, sessionManager, pipelineQueue, windowManager, configLoader, notificationManager, undefined, undefined, undefined, patternMatcher);
  setupBackupPlanHandlers(ipcMain, windowManager, () => backupManager);

  // Wire automatic backup scheduling: backup a directory when plans change,
  // but only if enough time has passed since the last backup for that dir.
  const lastBackupByDir = new Map<string, number>();
  planManager.on('plan:changed', (dirPath: string) => {
    const config = backupManager.getConfig();
    if (!config.enabled) return;
    if (config.excludePaths?.includes(dirPath)) return;

    const now = Date.now();
    const lastBackup = lastBackupByDir.get(dirPath) ?? 0;
    if (now - lastBackup < config.snapshotIntervalMs) return;

    lastBackupByDir.set(dirPath, now);
    try {
      backupManager.createSnapshot(dirPath);
    } catch (error) {
      logger.warn('Auto-backup failed', { dirPath, error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Wire events ONCE (no-ops when bot not running — notifier checks isRunning)
  stateDetector.on('state-change', (transition) => telegramNotifier.handleStateChange(transition));
  sessionManager.on('session:added', async (event) => {
    // Push to renderer so it can adopt externally-spawned terminals (e.g. Telegram)
    const win = windowManager.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('session:spawned-externally', event);
    }

    if (!telegramBot.isRunning()) return;
    const session = sessionManager.getSession(event.id);
    if (session) await topicManager.ensureTopic(session);
  });
  sessionManager.on('session:removed', (event) => {
    // Auto-bookmark directory when a session with cliSessionName is removed
    if (event.session?.cliSessionName && event.session?.workingDir) {
      configLoader.addBookmarkedDir(event.session.workingDir);
    }

    if (!telegramBot.isRunning()) return;
    telegramNotifier.removeSession(event.sessionId);
    if (event.session?.topicId) {
      topicManager.closeSessionTopic(event.session).catch(err =>
        logger.error(`[Telegram] Failed to close topic for ${event.sessionId}: ${err}`),
      );
    }
  });

  const cleanupTelegram = setupTelegramHandlers(configLoader, telegramBot, topicManager, telegramNotifier, sessionManager, stateDetector);

  // Auto-start Telegram bot if configured, but always wait for app startup to settle first.
  const telegramAutoStartTimer = configLoader.getTelegramConfig().autoStart
    ? setTimeout(() => {
        const telegramConfig = configLoader.getTelegramConfig();
        if (!telegramConfig.autoStart) return;
        if (telegramBot.isRunning()) return;
        if (!telegramConfig.botToken || !telegramConfig.chatId) {
          logger.warn('[IPC] Telegram auto-start skipped: botToken or chatId not configured');
          return;
        }
        if (!telegramConfig.allowedUserIds || telegramConfig.allowedUserIds.length === 0) {
          logger.warn('[IPC] Telegram auto-start skipped: no allowedUserIds configured');
          return;
        }
        try {
          telegramBot.start(telegramConfig.botToken, telegramConfig.chatId, telegramConfig.allowedUserIds);
          topicManager.setInstanceName(telegramConfig.instanceName);
          topicManager.ensureAllTopics().catch(err => logger.error(`[Telegram] Failed to ensure topics: ${err}`));
          telegramModules.dashboard.start().catch(err => logger.error(`[Telegram] Dashboard start failed: ${err}`));
          logger.info('[IPC] Telegram bot auto-started after 60 seconds');
        } catch (err) {
          logger.error(`[IPC] Failed to auto-start Telegram bot: ${err}`);
        }
      }, TELEGRAM_AUTOSTART_DELAY_MS)
    : null;

  logger.info('[IPC] All handlers registered');

  // Start scheduled task manager
  scheduledTaskManager.start();

  void localhostMcpServer.start().catch((error) => {
    const isAddrInUse = error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE';
    const port = localhostMcpServer.getAddress()?.port ?? configLoader.getMcpConfig().port;
    if (isAddrInUse) {
      dialog.showErrorBox(
        'MCP Server Failed to Start — Port Already in Use',
        `Helm's MCP server could not start because port ${port} is already in use by another process.\n\n` +
        `The MCP feature allows external AI tools to control Helm. Without it, those tools will not work.\n\n` +
        `To fix this:\n` +
        `1. Close the other application using port ${port}, or\n` +
        `2. Change the MCP port in Helm Settings → MCP Server\n\n` +
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    logger.error(`[MCP] Failed to start localhost MCP server: ${error}`);
  });

  return {
    cleanup: () => {
      if (telegramAutoStartTimer) clearTimeout(telegramAutoStartTimer);
      cleanupTelegram();
      telegramModules.cleanup();
      cleanupSession();
      cancelAllPrompts();
      stateDetector.dispose();
      patternMatcher.dispose();
      textDeliverer.dispose();
      notificationManager.dispose();
      ptyManager.killAll();
      void incomingWatcher.close();
      scheduledTaskManager.stop();
      void localhostMcpServer.close();
      logger.info('[IPC] Cleanup complete');
    },
    sessionManager,
    ptyManager,
    incomingWatcher,
    windowManager,
  };
}
