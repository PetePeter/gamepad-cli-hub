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
import { TelegramRelayService } from './relay-service.js';
import { setupCallbackHandler } from './callback-handler.js';
import { setupSlashCommands } from './commands.js';
import { setupTopicInput } from './topic-input.js';
import { isReplyKeyboardPress } from './reply-keyboard.js';
import { logger } from '../utils/logger.js';
import type { HelmControlService } from '../mcp/helm-control-service.js';

export interface TelegramModules {
  textInput: TextInputManager;
  outputSummarizer: OutputSummarizer;
  terminalMirror: TerminalMirror;
  dashboard: PinnedDashboard;
  relayService: TelegramRelayService;
  /** Feed PTY output — call on every pty:data event */
  feedPtyOutput: (sessionId: string, data: string) => void;
  /** Forward activity-change events — triggers output flush on inactive/idle */
  handleActivityChange: (sessionId: string, level: import('../types/session.js').ActivityLevel) => void;
  /** Forward state-change events — triggers immediate flush on idle/completed */
  handleStateChange: (sessionId: string, newState: import('../types/session.js').SessionState) => void;
  /** Forward question-detected events — triggers delayed flush to capture question rendering */
  handleQuestionDetected: (sessionId: string) => void;
  /** Track in-app PTY input — echoes prompts to Telegram on Enter */
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
  const outputSummarizer = new OutputSummarizer();
  const terminalMirror = new TerminalMirror(bot, topicManager);
  const textInput = new TextInputManager(bot, topicManager, ptyManager, terminalMirror);
  const instanceName = configLoader.getTelegramConfig().instanceName;
  const dashboard = new PinnedDashboard(bot, sessionManager, instanceName);
  const relayService = new TelegramRelayService(bot, topicManager, sessionManager, ptyManager, helmControlService);
  helmControlService.setTelegramBridge(relayService);

  // Wire up MCP event handlers for relay service
  const handleMcpSend = async (data: { sessionId: string; text: string; replyTo?: string; timestamp: number }) => {
    await relayService.receiveFromSession({
      sessionId: data.sessionId,
      text: data.text,
      replyTo: data.replyTo,
      timestamp: data.timestamp,
    });
  };

  const handleMcpSetMode = (data: { mode: 'relay' | 'diagnostic' }) => {
    relayService.setOutputMode(data.mode);
  };

  helmControlService.on('telegram:send', handleMcpSend);
  helmControlService.on('telegram:set_mode', handleMcpSetMode);

  const cleanupCallbacks = setupCallbackHandler(
    bot, topicManager, sessionManager, ptyManager,
    configLoader, textInput, outputSummarizer, draftManager,
  );

  const cleanupCommands = setupSlashCommands({
    bot, topicManager, sessionManager, ptyManager,
    configLoader, outputSummarizer, draftManager,
  });

  const cleanupTopicInput = setupTopicInput(
    bot, topicManager, ptyManager, textInput, terminalMirror, sessionManager, relayService,
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
    relayService,
    feedPtyOutput: (sessionId: string, data: string) => {
      if (!bot.isRunning()) return;
      outputSummarizer.feedOutput(sessionId, data);
      terminalMirror.feedOutput(sessionId, data);
    },
    handleActivityChange: (sessionId: string, level: import('../types/session.js').ActivityLevel) => {
      if (!bot.isRunning()) return;
      terminalMirror.handleActivityChange(sessionId, level);
    },
    handleStateChange: (sessionId: string, newState: import('../types/session.js').SessionState) => {
      if (!bot.isRunning()) return;
      terminalMirror.handleStateChange(sessionId, newState);
    },
    handleQuestionDetected: (sessionId: string) => {
      if (!bot.isRunning()) return;
      terminalMirror.handleQuestionDetected(sessionId);
    },
    trackInput: (sessionId: string, data: string) => {
      if (!bot.isRunning()) return;
      terminalMirror.trackInput(sessionId, data);
    },
    cleanup: () => {
      cleanupCallbacks();
      cleanupCommands();
      cleanupTopicInput();
      bot.removeListener('message', replyKeyboardHandler);
      helmControlService.setTelegramBridge(null);
      helmControlService.off('telegram:send', handleMcpSend);
      helmControlService.off('telegram:set_mode', handleMcpSetMode);
      textInput.dispose();
      outputSummarizer.dispose();
      terminalMirror.dispose();
      dashboard.dispose();
      logger.info('[Telegram] All modules cleaned up');
    },
  };
}
