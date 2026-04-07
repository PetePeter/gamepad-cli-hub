/**
 * IPC Handler Orchestrator
 *
 * Creates shared dependencies and delegates to domain-specific handler modules.
 * This is the single entry point called from main.ts — individual handler files
 * are never imported directly by the application.
 */

import type { BrowserWindow } from 'electron';
import { SessionManager } from '../../session/manager.js';
import { PtyManager } from '../../session/pty-manager.js';
import { StateDetector } from '../../session/state-detector.js';
import { PipelineQueue } from '../../session/pipeline-queue.js';
import { NotificationManager } from '../../session/notification-manager.js';
import { configLoader } from '../../config/loader.js';
import { keyboard } from '../../output/keyboard.js';
import { logger } from '../../utils/logger.js';

import { TelegramBotCore } from '../../telegram/bot.js';
import { TopicManager } from '../../telegram/topic-manager.js';
import { TelegramNotifier } from '../../telegram/notifier.js';
import { initTelegramModules } from '../../telegram/orchestrator.js';

import { setupSessionHandlers } from './session-handlers.js';
import { setupConfigHandlers } from './config-handlers.js';
import { setupProfileHandlers } from './profile-handlers.js';
import { setupToolsHandlers } from './tools-handlers.js';
import { setupKeyboardHandlers } from './keyboard-handlers.js';
import { setupSystemHandlers } from './system-handlers.js';
import { setupPtyHandlers, cancelAllPrompts } from './pty-handlers.js';
import { setupTelegramHandlers } from './telegram-handlers.js';


/**
 * Register all IPC handlers.
 *
 * Dependencies are created/imported here and injected into each domain module
 * so handler files never import singletons directly.
 */
export function registerIPCHandlers(
  getMainWindow: () => BrowserWindow | null,
): { cleanup: () => void; sessionManager: SessionManager; ptyManager: PtyManager } {
  logger.info('[IPC] Registering handlers');

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
  const notificationManager = new NotificationManager(getMainWindow, sessionManager, configLoader);

  const telegramBot = new TelegramBotCore();
  const topicManager = new TopicManager(telegramBot, sessionManager, configLoader.getTelegramConfig().instanceName);
  const telegramNotifier = new TelegramNotifier(telegramBot, topicManager, sessionManager, () => configLoader.getTelegramConfig());

  // Initialize all telegram modules (Phase 1+2+3)
  const telegramModules = initTelegramModules(
    telegramBot, topicManager, telegramNotifier,
    sessionManager, ptyManager, configLoader,
  );

  // Restore sessions persisted from previous run and start health check
  const restored = sessionManager.restoreSessions();
  logger.info(`[IPC] Restored ${restored.length} session(s) from previous run`);
  sessionManager.startHealthCheck(30000);

  const cleanupSession = setupSessionHandlers(sessionManager, ptyManager);
  setupConfigHandlers(configLoader);
  setupProfileHandlers(configLoader);
  setupToolsHandlers(configLoader);
  setupKeyboardHandlers(keyboard);
  setupSystemHandlers();
  setupPtyHandlers(ptyManager, stateDetector, sessionManager, pipelineQueue, getMainWindow, configLoader, notificationManager, telegramModules.feedPtyOutput);

  // Wire events ONCE (no-ops when bot not running — notifier checks isRunning)
  stateDetector.on('state-change', (transition) => telegramNotifier.handleStateChange(transition));
  sessionManager.on('session:added', async (event) => {
    // Push to renderer so it can adopt externally-spawned terminals (e.g. Telegram)
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('session:spawned-externally', event);
    }

    if (!telegramBot.isRunning()) return;
    const session = sessionManager.getSession(event.id);
    if (session) await topicManager.ensureTopic(session);
  });
  sessionManager.on('session:removed', (event) => {
    if (!telegramBot.isRunning()) return;
    telegramNotifier.removeSession(event.sessionId);
    telegramModules.terminalMirror.removeSession(event.sessionId);
    telegramModules.outputSummarizer.clearBuffer(event.sessionId);
    if (event.session?.topicId) {
      topicManager.closeSessionTopic(event.session).catch(err =>
        logger.error(`[Telegram] Failed to close topic for ${event.sessionId}: ${err}`),
      );
    }
  });

  const cleanupTelegram = setupTelegramHandlers(configLoader, telegramBot, topicManager, telegramNotifier, sessionManager, stateDetector);

  // Auto-start Telegram bot if configured
  const telegramConfig = configLoader.getTelegramConfig();
  if (telegramConfig.enabled && telegramConfig.botToken && telegramConfig.chatId) {
    try {
      telegramBot.start(telegramConfig.botToken, telegramConfig.chatId, telegramConfig.allowedUserIds);
      topicManager.ensureAllTopics().catch(err => logger.error(`[Telegram] Failed to ensure topics: ${err}`));
      telegramModules.dashboard.start().catch(err => logger.error(`[Telegram] Dashboard start failed: ${err}`));
      logger.info('[IPC] Telegram bot auto-started');
    } catch (err) {
      logger.error(`[IPC] Failed to auto-start Telegram bot: ${err}`);
    }
  }

  logger.info('[IPC] All handlers registered');

  return {
    cleanup: () => {
      cleanupTelegram();
      telegramModules.cleanup();
      cleanupSession();
      cancelAllPrompts();
      sessionManager.stopHealthCheck();
      stateDetector.dispose();
      notificationManager.dispose();
      ptyManager.killAll();
      logger.info('[IPC] Cleanup complete');
    },
    sessionManager,
    ptyManager,
  };
}