/**
 * IPC Handler Orchestrator
 *
 * Creates shared dependencies and delegates to domain-specific handler modules.
 * This is the single entry point called from main.ts — individual handler files
 * are never imported directly by the application.
 */

import { SessionManager } from '../../session/manager.js';
import { gamepadInput } from '../../input/gamepad.js';
import { configLoader } from '../../config/loader.js';
import { windowManager } from '../../output/windows.js';
import { keyboard } from '../../output/keyboard.js';
import { processSpawner } from '../../session/spawner.js';
import { logger } from '../../utils/logger.js';

import { setupGamepadHandlers } from './gamepad-handlers.js';
import { setupSessionHandlers } from './session-handlers.js';
import { setupConfigHandlers } from './config-handlers.js';
import { setupProfileHandlers } from './profile-handlers.js';
import { setupToolsHandlers } from './tools-handlers.js';
import { setupWindowHandlers } from './window-handlers.js';
import { setupSpawnHandlers } from './spawn-handlers.js';
import { setupKeyboardHandlers } from './keyboard-handlers.js';
import { setupAppHandlers } from './app-handlers.js';
import { setupSystemHandlers } from './system-handlers.js';


/**
 * Register all IPC handlers.
 *
 * Dependencies are created/imported here and injected into each domain module
 * so handler files never import singletons directly.
 */
export function registerIPCHandlers(): void {
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

  setupGamepadHandlers(gamepadInput);
  setupSessionHandlers(sessionManager, windowManager);
  setupConfigHandlers(configLoader);
  setupProfileHandlers(configLoader);
  setupToolsHandlers(configLoader);
  setupWindowHandlers(windowManager);
  setupSpawnHandlers(sessionManager, processSpawner);
  setupKeyboardHandlers(keyboard);
  setupAppHandlers();
  setupSystemHandlers();

  logger.info('[IPC] All handlers registered');
}