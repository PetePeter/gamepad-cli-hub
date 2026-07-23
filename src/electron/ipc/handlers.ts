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
import { ProjectStore } from '../../session/project-store.js';
import { ContextManager } from '../../session/context-manager.js';
import { SkillManager } from '../../session/skill-manager.js';
import { SkillAnalyticsManager } from '../../session/skill-analytics-manager.js';
import { PlanBackupManager } from '../../session/plan-backup-manager.js';
import { PatternMatcher } from '../../session/pattern-matcher.js';
import { ScheduledTaskManager } from '../../session/scheduled-task-manager.js';
import { ScheduledTaskHistoryManager } from '../../session/scheduled-task-history-manager.js';
import { RecycleBinManager, recordRemovedSession } from '../../session/recycle-bin-manager.js';
import { RuntimeGroupManager } from '../../session/runtime-group-manager.js';
import { saveRuntimeGroups, loadRuntimeGroups } from '../../session/runtime-group-persistence.js';
import { ArtifactManager } from '../../session/artifact-manager.js';
import { saveArtifacts, loadArtifacts } from '../../session/artifact-persistence.js';
import { setupPowerMonitor } from '../../session/power-monitor.js';
import { ConfigLoader } from '../../config/loader.js';
import { keyboard } from '../../output/keyboard.js';
import { logger } from '../../utils/logger.js';

import { TelegramBotCore } from '../../telegram/bot.js';
import { TopicManager } from '../../telegram/topic-manager.js';
import { TelegramNotifier } from '../../telegram/notifier.js';
import { initTelegramModules } from '../../telegram/orchestrator.js';

import { setupSessionHandlers } from './session-handlers.js';
import { setupConfigHandlers } from './config-handlers.js';
import { setupEditorHandlers } from './editor-handlers.js';
import { setupToolsHandlers } from './tools-handlers.js';
import { setupKeyboardHandlers } from './keyboard-handlers.js';
import { setupSystemHandlers, cleanupWorkTempFiles } from './system-handlers.js';
import { setupPtyHandlers, cancelAllPrompts } from './pty-handlers.js';
import { setupTelegramHandlers } from './telegram-handlers.js';
import { setupDraftHandlers } from './draft-handlers.js';
import { setupPlanHandlers } from './plan-handlers.js';
import { setupScheduledTaskHandlers } from './scheduled-task-handlers.js';
import { setupRecycleBinHandlers } from './recycle-bin-handlers.js';
import { setupRuntimeGroupHandlers } from './runtime-group-handlers.js';
import { setupArtifactHandlers } from './artifact-handlers.js';
import { setupBackupPlanHandlers } from './plan-backup-handlers.js';
import { setupProjectHandlers } from './project-handlers.js';
import { setupSkillHandlers } from './skill-handlers.js';
import { setupPromptTemplateHandlers } from './prompt-template-handlers.js';
import { RendererTextDeliverer } from './text-delivery.js';
import { loadDrafts, saveDrafts } from '../../session/persistence.js';
import { IncomingPlansWatcher } from '../../session/incoming-plans-watcher.js';
import { WindowManager } from '../window-manager.js';
import { HelmControlService } from '../../mcp/helm-control-service.js';
import { LocalhostMcpServer } from '../../mcp/localhost-mcp-server.js';
import { PromptTemplateManager } from '../../session/prompt-template-manager.js';
import { loadPromptTemplates } from '../../session/prompt-template-persistence.js';
import { getConfigDir } from '../../utils/app-paths.js';
import { join } from 'node:path';

const TELEGRAM_AUTOSTART_DELAY_MS = 60_000;
// On restart the previous instance may still be releasing the fixed MCP port.
// Retry the same port (never a fallback) with backoff until it frees.
const MCP_BIND_ATTEMPTS = 20;
const MCP_BIND_RETRY_DELAY_MS = 250;

export interface IpcStartupOptions {
  startupDelayMs?: number;
}


/**
 * Register all IPC handlers.
 *
 * Dependencies are created/imported here and injected into each domain module
 * so handler files never import singletons directly.
 */
export function registerIPCHandlers(
  dirname?: string,
  configLoader: ConfigLoader = new ConfigLoader(),
  options: IpcStartupOptions = {},
): { cleanup: () => Promise<void>; sessionManager: SessionManager; ptyManager: PtyManager; incomingWatcher: IncomingPlansWatcher; windowManager: WindowManager; helmControlService: HelmControlService; runtimeGroupManager: RuntimeGroupManager } {
  logger.info('[IPC] Registering handlers');
  const startupDelayMs = Math.max(0, options.startupDelayMs ?? 0);

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

  // SessionManager is created here and shared via dependency injection.
  // Projects are the single source of truth for working directories, so the
  // ConfigLoader derives them from the project store.
  const projectStore = new ProjectStore();
  configLoader.setProjectStore(projectStore);

  const sessionManager = new SessionManager(projectStore);
  const ptyManager = new PtyManager();
  const stateDetector = new StateDetector();
  const pipelineQueue = new PipelineQueue();
  const draftManager = new DraftManager(saveDrafts);
  const artifactManager = new ArtifactManager((all) => saveArtifacts(all));
  artifactManager.importAll(loadArtifacts());
  const planManager = new PlanManager(projectStore);
  const contextManager = new ContextManager(planManager);
  const getSkillsPath = (configLoader as ConfigLoader & { getSkillsPath?: () => string }).getSkillsPath;
  const getSkillAnalyticsPath = (configLoader as ConfigLoader & { getSkillAnalyticsPath?: () => string }).getSkillAnalyticsPath;
  const skillManager = new SkillManager(getSkillsPath ? getSkillsPath.call(configLoader) : 'src/config/skills.yaml');
  const skillAnalyticsManager = new SkillAnalyticsManager(getSkillAnalyticsPath ? getSkillAnalyticsPath.call(configLoader) : 'src/config/skill-analytics.json');
  const backupManager = new PlanBackupManager(planManager);
  const scheduledTaskHistoryManager = new ScheduledTaskHistoryManager();
  const recycleBinManager = new RecycleBinManager();
  const runtimeGroupManager = new RuntimeGroupManager(saveRuntimeGroups);
  runtimeGroupManager.importAll(loadRuntimeGroups());
  const scheduledTaskManager = new ScheduledTaskManager(sessionManager, ptyManager, planManager, configLoader, scheduledTaskHistoryManager);
  const notificationManager = new NotificationManager(windowManager, sessionManager);

  // Power monitor with full session/PTY diagnostics and screen lock tracking
  const powerMonitorResult = setupPowerMonitor(powerMonitor, { sessionManager, ptyManager });
  notificationManager.setScreenLockChecker(powerMonitorResult.isScreenLocked);
  notificationManager.setActiveSessionIdGetter(() => sessionManager.getActiveSession()?.id ?? null);

  // Create HelmControlService before Telegram modules (Telegram relay needs it)
  const helmControlService = new HelmControlService(planManager, sessionManager, ptyManager, configLoader, undefined, contextManager, scheduledTaskManager, projectStore, skillManager, skillAnalyticsManager);
  helmControlService.setNotificationManager(notificationManager);
  helmControlService.setRuntimeGroupManager(runtimeGroupManager);
  helmControlService.setArtifactManager(artifactManager);

  const telegramBot = new TelegramBotCore();
  const topicManager = new TopicManager(telegramBot, sessionManager, configLoader.getTelegramConfig().instanceName);
  const telegramNotifier = new TelegramNotifier(telegramBot, topicManager, sessionManager, () => configLoader.getTelegramConfig());

  // Wire the Telegram notifier to the notification manager for LLM-directed notifications when screen is locked
  notificationManager.setTelegramNotifier(async (sessionId: string, title: string, content: string) => {
    if (!telegramBot.isRunning()) return;
    const session = sessionManager.getSession(sessionId);
    if (!session) return;
    const topicId = await topicManager.ensureTopic(session);
    if (topicId == null) return;
    const text = `${title}\n\n${content}`;
    try {
      await telegramBot.sendToTopic(topicId, text);
    } catch (error) {
      logger.error(`[IPC] Failed to send LLM notification via Telegram: ${error}`);
    }
  });

  // Initialize all telegram modules (Phase 1+2+3)
  const telegramModules = initTelegramModules(
    telegramBot, topicManager, telegramNotifier,
    sessionManager, ptyManager, configLoader, helmControlService, draftManager, projectStore,
  );

  // Restore sessions persisted from previous run
  const restored = sessionManager.restoreSessions();
  logger.info(`[IPC] Restored ${restored.length} session(s) from previous run`);

  // Artifacts are ephemeral to a session. On a clean close they are dropped via
  // the session:removed listener, but a crash can leave orphans in artifacts.yaml
  // for sessions that did not survive the restore. Drop those now — live restored
  // sessions keep theirs; closed/recycle-restored sessions get a fresh id and so
  // never match an orphaned key.
  const liveSessionIds = new Set(sessionManager.getAllSessions().map(s => s.id));
  for (const sessionId of Object.keys(artifactManager.exportAll())) {
    if (!liveSessionIds.has(sessionId)) artifactManager.clearSession(sessionId);
  }

  draftManager.importAll(loadDrafts());
  // PlanManager loads from disk in its constructor — no explicit importAll needed

  // PromptTemplateManager: global tree, persisted to prompt-templates.yaml
  const promptTemplateManager = new PromptTemplateManager();
  const promptTemplatesPath = dirname
    ? join(getConfigDir(dirname), 'prompt-templates.yaml')
    : undefined;
  if (promptTemplatesPath) {
    loadPromptTemplates(promptTemplatesPath, promptTemplateManager);
  }

  const incomingWatcher = new IncomingPlansWatcher(planManager);
  const textDeliverer = new RendererTextDeliverer(windowManager, sessionManager, configLoader);
  ptyManager.setTextDeliveryHandler((sessionId, text, options) => textDeliverer.deliver(sessionId, text, options));
  const localhostMcpServer = new LocalhostMcpServer(helmControlService, {
    enabled: configLoader.getMcpConfig().enabled,
    port: configLoader.getMcpConfig().port,
    token: configLoader.getMcpConfig().authToken,
  }, ptyManager);

  // Pattern matcher uses raw deliverText for send-text rule actions.
  const patternMatcher = new PatternMatcher(
    (sessionId, data) => ptyManager.deliverText(sessionId, data),
    (cliType) => configLoader.getPatterns(cliType),
  );

  const cleanupSession = setupSessionHandlers(sessionManager, ptyManager, draftManager, windowManager, configLoader);
  setupConfigHandlers(configLoader, localhostMcpServer, projectStore);
  setupEditorHandlers(configLoader);
  setupToolsHandlers(configLoader);
  setupKeyboardHandlers(keyboard);
  setupSystemHandlers(dirname ?? process.cwd());
  setupDraftHandlers(draftManager);
  setupProjectHandlers(projectStore, planManager, contextManager);
  setupSkillHandlers(skillManager, skillAnalyticsManager);
  setupPlanHandlers(planManager, contextManager, windowManager, incomingWatcher, dirname);
  setupScheduledTaskHandlers(scheduledTaskManager, scheduledTaskHistoryManager, windowManager);
  setupRecycleBinHandlers(recycleBinManager, windowManager);
  setupRuntimeGroupHandlers(runtimeGroupManager, windowManager);
  setupArtifactHandlers(artifactManager, windowManager);

  // Forward artifact mutations/reveals to the main window AND the session's own
  // popout window (mirrors the session:updated dual-window forwarding below), so
  // whichever window is showing the session sees the change. Channel literals are
  // spelled out per-window so the IPC contract test can find the main sender.
  const artifactWindowsFor = (sessionId: string): BrowserWindow[] => {
    const targets: BrowserWindow[] = [];
    const mainWin = windowManager.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) targets.push(mainWin);
    const sessionWindowId = windowManager.getWindowIdForSession(sessionId);
    if (sessionWindowId !== undefined) {
      const sessionWindow = windowManager.getWindow(sessionWindowId);
      if (sessionWindow && !sessionWindow.isDestroyed()) targets.push(sessionWindow);
    }
    return targets;
  };
  artifactManager.on('artifact:changed', (sessionId: string) => {
    for (const win of artifactWindowsFor(sessionId)) {
      win.webContents.send('artifact:changed', { sessionId });
    }
  });
  artifactManager.on('artifact:reveal', (sessionId: string, artifactId: string) => {
    for (const win of artifactWindowsFor(sessionId)) {
      win.webContents.send('artifact:reveal', { sessionId, artifactId });
    }
  });
  setupPtyHandlers(ptyManager, stateDetector, sessionManager, pipelineQueue, windowManager, configLoader, notificationManager, undefined, undefined, undefined, patternMatcher);
  setupBackupPlanHandlers(ipcMain, windowManager, () => backupManager);
  const cleanupPromptTemplates = promptTemplatesPath
    ? setupPromptTemplateHandlers(promptTemplateManager, promptTemplatesPath)
    : () => {};

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

  // Wire events ONCE (no-ops when bot not running — notifier checks isRunning).
  // AIAGENT phase changes are now explicit MCP state updates, not PTY text
  // parsing, so StateDetector transitions must not drive Telegram notifications.
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
  sessionManager.on('session:updated', (event) => {
    const win = windowManager.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('session:updated', event);
    }

    if (telegramBot.isRunning()) {
      topicManager.renameSessionTopic(event).catch(err =>
        logger.error(`[Telegram] Failed to rename topic for ${event.id}: ${err}`),
      );
    }

    const sessionWindowId = windowManager.getWindowIdForSession(event.id);
    if (sessionWindowId === undefined) return;
    const sessionWindow = windowManager.getWindow(sessionWindowId);
    if (sessionWindow && !sessionWindow.isDestroyed()) {
      sessionWindow.webContents.send('session:updated', event);
    }
  });
  sessionManager.on('session:removed', (event) => {
    // Recoverable (has a cliSessionName) closed sessions go to the recycle bin,
    // and their directory is auto-bookmarked so the group header persists. Tag
    // the bin entry with the session's runtime group (if any) so restore can
    // re-attach it, then evict the closed session from that group.
    const runtimeGroup = runtimeGroupManager.groupForSession(event.sessionId);
    recordRemovedSession(
      event,
      recycleBinManager,
      dir => configLoader.addBookmarkedDir(dir),
      runtimeGroup ? { id: runtimeGroup.id, name: runtimeGroup.name } : undefined,
    );
    runtimeGroupManager.removeSessionEverywhere(event.sessionId);

    // Artifacts are ephemeral to a live session — drop them on close. Recycle-bin
    // restore mints a fresh sessionId, so a restored session naturally has none.
    artifactManager.clearSession(event.sessionId);

    if (!telegramBot.isRunning()) return;
    telegramNotifier.removeSession(event.sessionId);
    if (event.session?.topicId) {
      topicManager.closeSessionTopic(event.session).catch(err =>
        logger.error(`[Telegram] Failed to close topic for ${event.sessionId}: ${err}`),
      );
    }
  });

  const cleanupTelegram = setupTelegramHandlers(configLoader, telegramBot, topicManager, telegramNotifier, sessionManager, stateDetector, () => helmControlService.invalidateCapabilityCache());

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
          logger.info('[IPC] Telegram bot auto-started after 60 seconds');
        } catch (err) {
          logger.error(`[IPC] Failed to auto-start Telegram bot: ${err}`);
        }
      }, TELEGRAM_AUTOSTART_DELAY_MS + startupDelayMs)
    : null;

  logger.info('[IPC] All handlers registered');

  // Start scheduled task manager
  scheduledTaskManager.start();

  const startMcpServer = () => {
    void localhostMcpServer.start({ attempts: MCP_BIND_ATTEMPTS, delayMs: MCP_BIND_RETRY_DELAY_MS }).catch((error) => {
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
  };
  const mcpStartTimer = startupDelayMs > 0
    ? setTimeout(startMcpServer, startupDelayMs)
    : null;
  if (!mcpStartTimer) startMcpServer();

  return {
    cleanup: async () => {
      if (telegramAutoStartTimer) clearTimeout(telegramAutoStartTimer);
      if (mcpStartTimer) clearTimeout(mcpStartTimer);
      cleanupTelegram();
      telegramModules.cleanup();
      cleanupSession();
      cleanupPromptTemplates();
      cancelAllPrompts();
      stateDetector.dispose();
      patternMatcher.dispose();
      textDeliverer.dispose();
      notificationManager.dispose();
      ptyManager.killAll();
      await incomingWatcher.close();
      scheduledTaskManager.stop();
      // Await the socket close so the next instance can bind the fixed port.
      await localhostMcpServer.close();
      logger.info('[IPC] Cleanup complete');
    },
    sessionManager,
    ptyManager,
    incomingWatcher,
    windowManager,
    helmControlService,
    runtimeGroupManager,
  };
}
