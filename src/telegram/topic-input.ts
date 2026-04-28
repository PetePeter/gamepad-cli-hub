// src/telegram/topic-input.ts

/**
 * Forwards Telegram messages to PTY stdin.
 *
 * When a user sends a message in a session's topic, the text is written
 * to that session's PTY. Messages in unmapped topics (e.g. General) fall
 * back to the active session. Supports safe mode (confirmation before send)
 * and filters out bot commands (starting with /).
 */

import type TelegramBot from 'node-telegram-bot-api';
import type { TelegramBotCore } from './bot.js';
import type { TopicManager } from './topic-manager.js';
import type { PtyManager } from '../session/pty-manager.js';
import type { TextInputManager } from './text-input.js';
import type { TerminalMirror } from './terminal-mirror.js';
import type { SessionManager } from '../session/manager.js';
import type { TelegramRelayService } from './relay-service.js';
import { isReplyKeyboardPress } from './reply-keyboard.js';
import { escapeHtml } from './utils.js';
import { logger } from '../utils/logger.js';

function deliverViaManager(ptyManager: PtyManager, sessionId: string, text: string): Promise<void> {
  const maybeDeliver = (ptyManager as Partial<PtyManager>).deliverText;
  if (typeof maybeDeliver === 'function') {
    return maybeDeliver.call(ptyManager, sessionId, text);
  }
  ptyManager.write(sessionId, text);
  return Promise.resolve();
}

/**
 * Set up topic input forwarding.
 * Listens for messages and routes them to PTY — first by topic mapping,
 * then by falling back to the active session.
 * Returns a cleanup function.
 */
export function setupTopicInput(
  bot: TelegramBotCore,
  topicManager: TopicManager,
  ptyManager: PtyManager,
  textInput: TextInputManager,
  terminalMirror?: TerminalMirror,
  sessionManager?: SessionManager,
  relayService?: TelegramRelayService,
): () => void {
  const handler = async (msg: TelegramBot.Message) => {
    if (!msg.text) return;
    if (msg.text.startsWith('/')) return;
    if (isReplyKeyboardPress(msg.text)) return;

    if (await relayService?.handleIncomingTelegramMessage(msg)) {
      return;
    }

    // Try to find session from topic mapping
    let sessionId: string | null = null;

    if (msg.message_thread_id) {
      const session = topicManager.findSessionByTopicId(msg.message_thread_id);
      if (session) sessionId = session.id;
    }

    // Fall back to active session when not in a mapped topic
    if (!sessionId && sessionManager) {
      const active = sessionManager.getActiveSession();
      if (active) sessionId = active.id;
    }

    if (!sessionId) {
      await bot.sendMessage('❌ No active session. Use /sessions to browse.', {
        message_thread_id: msg.message_thread_id,
      });
      return;
    }

    // Let TextInputManager handle if it has a pending confirmation flow
    const consumed = await textInput.handleMessage(msg);
    if (consumed) return;

    await forwardToSession(bot, ptyManager, sessionId, msg.message_thread_id, msg.text, terminalMirror);
  };

  bot.on('message', handler);

  return () => {
    bot.removeListener('message', handler);
  };
}

/** Write text to PTY and send a confirmation echo. */
async function forwardToSession(
  bot: TelegramBotCore,
  ptyManager: PtyManager,
  sessionId: string,
  replyTopicId: number | undefined,
  text: string,
  terminalMirror?: TerminalMirror,
): Promise<void> {
  terminalMirror?.registerEcho(sessionId, text);
  await deliverViaManager(ptyManager, sessionId, text + '\r');

  const echoText = `➡️ <code>${escapeHtml(text)}</code>`;
  if (replyTopicId) {
    await bot.sendToTopic(replyTopicId, echoText, { parse_mode: 'HTML' });
  } else {
    await bot.sendMessage(echoText, { parse_mode: 'HTML' });
  }

  logger.info(
    `[TopicInput] Forwarded message to session ${sessionId}: ${text.substring(0, 50)}`,
  );
}


