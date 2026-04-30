/**
 * Telegram Module Orchestrator
 *
 * Wires together all Telegram integration modules and exposes PTY data hooks.
 * Called from the IPC handler orchestrator after bot, topicManager, and notifier
 * are created. Returns module instances + cleanup function.
 */

import type { TelegramBotCore } from './bot.js';
import type { TopicManager } from './topic-manager.js';
import type { TelegramNotifier } from './notifier.js';
import type { SessionManager } from '../session/manager.js';
import type { PtyManager } from '../session/pty-manager.js';
import type { ConfigLoader } from '../config/loader.js';
import { PinnedDashboard } from './pinned-dashboard.js';
import { TelegramRelayService } from './relay-service.js';
import { setupCallbackHandler } from './callback-handler.js';
import { setupTopicInput } from './topic-input.js';
import { logger } from '../utils/logger.js';
import type { HelmControlService } from '../mcp/helm-control-service.js';

export interface TelegramModules {
  dashboard: PinnedDashboard;
  relayService: TelegramRelayService;
  /** Feed PTY output — no-op after terminal-mirror removal */
  feedPtyOutput: (sessionId: string, data: string) => void;
  /** No-op after terminal-mirror removal */
  handleActivityChange: (sessionId: string, level: import('../types/session.js').ActivityLevel) => void;
  /** No-op after terminal-mirror removal */
  handleStateChange: (sessionId: string, newState: import('../types/session.js').SessionState) => void;
  /** No-op after terminal-mirror removal */
  handleQuestionDetected: (sessionId: string) => void;
  /** No-op after terminal-mirror removal */
  trackInput: (sessionId: string, data: string) => void;
  cleanup: () => void;
}

export function initTelegramModules(
  bot: TelegramBotCore,
  topicManager: TopicManager,
  _notifier: TelegramNotifier,
  sessionManager: SessionManager,
  ptyManager: PtyManager,
  configLoader: ConfigLoader,
  helmControlService: HelmControlService,
  draftManager?: { clearSession(sessionId: string): void },
): TelegramModules {
  const instanceName = configLoader.getTelegramConfig().instanceName;
  const dashboard = new PinnedDashboard(bot, sessionManager, instanceName);
  const relayService = new TelegramRelayService(bot, topicManager, sessionManager, ptyManager, helmControlService);
  helmControlService.setTelegramBridge(relayService);

  // Stub: callback handler still references TextInputManager/OutputSummarizer in its signature.
  // These types no longer exist — pass null placeholders. Full rewire in Stage 7.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stubAny = null as any;

  const cleanupCallbacks = setupCallbackHandler(
    bot, topicManager, sessionManager, ptyManager,
    configLoader, stubAny, stubAny, draftManager,
  );

  const cleanupTopicInput = setupTopicInput(
    bot, topicManager, ptyManager, sessionManager, relayService,
  );

  // Listen for forum_topic_closed events from Telegram
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topicClosedHandler = (msg: any) => {
    if (msg.forum_topic_closed && msg.message_thread_id) {
      topicManager.handleTopicClosed(msg.message_thread_id);
    }
  };
  bot.on('message', topicClosedHandler);

  // No-op stubs for deleted module hooks (removed in Stage 7 from handlers.ts)
  const noop = () => {};

  logger.info('[Telegram] All modules initialized');

  return {
    dashboard,
    relayService,
    feedPtyOutput: noop,
    handleActivityChange: noop,
    handleStateChange: noop,
    handleQuestionDetected: noop,
    trackInput: noop,
    cleanup: () => {
      cleanupCallbacks();
      cleanupTopicInput();
      bot.removeListener('message', topicClosedHandler);
      helmControlService.setTelegramBridge(null);
      dashboard.dispose();
      logger.info('[Telegram] All modules cleaned up');
    },
  };
}
