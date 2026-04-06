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
import { TextInputManager } from './text-input.js';
import { OutputSummarizer } from './output-summarizer.js';
import { TerminalMirror } from './terminal-mirror.js';
import { PinnedDashboard } from './pinned-dashboard.js';
import { setupCallbackHandler } from './callback-handler.js';
import { setupSlashCommands } from './commands.js';
import { setupTopicInput } from './topic-input.js';
import { isReplyKeyboardPress } from './reply-keyboard.js';
import { logger } from '../utils/logger.js';

export interface TelegramModules {
  textInput: TextInputManager;
  outputSummarizer: OutputSummarizer;
  terminalMirror: TerminalMirror;
  dashboard: PinnedDashboard;
  /** Feed PTY output — call on every pty:data event */
  feedPtyOutput: (sessionId: string, data: string) => void;
  cleanup: () => void;
}

export function initTelegramModules(
  bot: TelegramBotCore,
  topicManager: TopicManager,
  _notifier: TelegramNotifier,
  sessionManager: SessionManager,
  ptyManager: PtyManager,
  configLoader: ConfigLoader,
): TelegramModules {
  const textInput = new TextInputManager(bot, topicManager, ptyManager);
  const outputSummarizer = new OutputSummarizer();
  const terminalMirror = new TerminalMirror(bot, topicManager);
  const instanceName = configLoader.getTelegramConfig().instanceName;
  const dashboard = new PinnedDashboard(bot, sessionManager, instanceName);

  const cleanupCallbacks = setupCallbackHandler(
    bot, topicManager, sessionManager, ptyManager,
    configLoader, textInput, outputSummarizer,
  );

  const cleanupCommands = setupSlashCommands({
    bot, topicManager, sessionManager, ptyManager,
    configLoader, outputSummarizer,
  });

  const cleanupTopicInput = setupTopicInput(
    bot, topicManager, ptyManager, textInput,
  );

  // Reply keyboard text → slash command routing
  const replyKeyboardHandler = async (msg: import('node-telegram-bot-api').Message) => {
    if (!msg.text) return;
    const command = isReplyKeyboardPress(msg.text);
    if (command) {
      bot.emit(`command:${command}`, msg, '');
    }
  };
  bot.on('message', replyKeyboardHandler);

  logger.info('[Telegram] All modules initialized');

  return {
    textInput,
    outputSummarizer,
    terminalMirror,
    dashboard,
    feedPtyOutput: (sessionId: string, data: string) => {
      if (!bot.isRunning()) return;
      outputSummarizer.feedOutput(sessionId, data);
      terminalMirror.feedOutput(sessionId, data);
    },
    cleanup: () => {
      cleanupCallbacks();
      cleanupCommands();
      cleanupTopicInput();
      bot.removeListener('message', replyKeyboardHandler);
      textInput.dispose();
      outputSummarizer.dispose();
      terminalMirror.dispose();
      dashboard.dispose();
      logger.info('[Telegram] All modules cleaned up');
    },
  };
}
