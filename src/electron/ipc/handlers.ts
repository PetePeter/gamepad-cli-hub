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
import { configLoader } from '../../config/loader.js';
import { keyboard } from '../../output/keyboard.js';
import { logger } from '../../utils/logger.js';

import { setupSessionHandlers } from './session-handlers.js';
import { setupConfigHandlers } from './config-handlers.js';
import { setupProfileHandlers } from './profile-handlers.js';
import { setupToolsHandlers } from './tools-handlers.js';
import { setupHubHandlers } from './hub-handlers.js';
import { setupKeyboardHandlers } from './keyboard-handlers.js';
import { setupAppHandlers } from './app-handlers.js';
import { setupSystemHandlers } from './system-handlers.js';
import { setupPtyHandlers, cancelAllPrompts } from './pty-handlers.js';


/**
 * Register all IPC handlers.
 *
 * Dependencies are created/imported here and injected into each domain module
 * so handler files never import singletons directly.
 */
export function registerIPCHandlers(getMainWindow: () => BrowserWindow | null): () => void {
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

  const cleanupSession = setupSessionHandlers(sessionManager);
  setupConfigHandlers(configLoader);
  setupProfileHandlers(configLoader);
  setupToolsHandlers(configLoader);
  setupHubHandlers(configLoader);
  setupKeyboardHandlers(keyboard);
  setupAppHandlers();
  setupSystemHandlers();
  setupPtyHandlers(ptyManager, stateDetector, sessionManager, pipelineQueue, getMainWindow, configLoader);

  logger.info('[IPC] All handlers registered');

  return () => {
    cleanupSession();
    cancelAllPrompts();
    ptyManager.killAll();
    logger.info('[IPC] Cleanup complete');
  };
}