// src/telegram/topic-input.ts

/**
 * Forwards Telegram messages to PTY stdin.
 *
 * When a user sends a message in a session's topic, the text is written
 * to that session's PTY. Messages in unmapped topics fall back to the
 * active session. Filters out bot commands (starting with /).
 */

import type TelegramBot from 'node-telegram-bot-api';
import type { TelegramBotCore } from './bot.js';
import type { TopicManager } from './topic-manager.js';
import type { PtyManager } from '../session/pty-manager.js';
import type { SessionManager } from '../session/manager.js';
import type { TelegramRelayService } from './relay-service.js';
import type { ConfigLoader } from '../config/loader.js';
import { deliverPromptSequenceToSession } from '../session/sequence-delivery.js';
import { escapeHtml } from './utils.js';
import { logger } from '../utils/logger.js';

/**
 * Set up topic input forwarding.
 * Routes non-command messages: first to RelayService, then by topic mapping,
 * then by falling back to the active session.
 * Returns a cleanup function.
 */
export function setupTopicInput(
  bot: TelegramBotCore,
  topicManager: TopicManager,
  ptyManager: PtyManager,
  configLoader: ConfigLoader,
  sessionManager?: SessionManager,
  relayService?: TelegramRelayService,
): () => void {
  const handler = async (msg: TelegramBot.Message) => {
    if (!msg.text) return;
    if (msg.text.startsWith('/')) return;

    if (await relayService?.handleIncomingTelegramMessage(msg)) {
      return;
    }

    let sessionId: string | null = null;

    if (msg.message_thread_id) {
      const session = topicManager.findSessionByTopicId(msg.message_thread_id);
      if (session) sessionId = session.id;
    }

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

    await forwardToSession(bot, ptyManager, configLoader, sessionManager, sessionId, msg.message_thread_id, msg.text, msg);
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
  configLoader: ConfigLoader,
  sessionManager: SessionManager | undefined,
  sessionId: string,
  replyTopicId: number | undefined,
  text: string,
  msg: TelegramBot.Message,
): Promise<void> {
  const from = msg.from?.username ? `@${msg.from.username}` : 'unknown';
  const fromTag = from === 'unknown' ? '' : ` from:${from}`;
  const wrapped = `[HELM_TELEGRAM${fromTag} chat:${msg.chat.id}]\n${text}\n[/HELM_TELEGRAM]`;
  if (!sessionManager) throw new Error('SessionManager is required for Telegram prompt delivery');
  await deliverPromptSequenceToSession({
    sessionId,
    text: wrapped,
    ptyManager,
    sessionManager,
    configLoader,
  });

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
