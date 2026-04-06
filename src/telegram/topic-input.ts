// src/telegram/topic-input.ts

/**
 * Forwards Telegram messages in forum topics to PTY stdin.
 *
 * When a user sends a message in a session's topic, the text is written
 * to that session's PTY. Supports safe mode (confirmation before send)
 * and filters out bot commands (starting with /).
 */

import type TelegramBot from 'node-telegram-bot-api';
import type { TelegramBotCore } from './bot.js';
import type { TopicManager } from './topic-manager.js';
import type { PtyManager } from '../session/pty-manager.js';
import type { TextInputManager } from './text-input.js';
import { escapeHtml } from './utils.js';
import { logger } from '../utils/logger.js';

/**
 * Set up topic input forwarding.
 * Listens for messages in topics and routes them to PTY.
 * Returns a cleanup function.
 */
export function setupTopicInput(
  bot: TelegramBotCore,
  topicManager: TopicManager,
  ptyManager: PtyManager,
  textInput: TextInputManager,
): () => void {
  const handler = async (msg: TelegramBot.Message) => {
    if (!isForwardableMessage(msg)) return;

    const topicId = msg.message_thread_id!;
    const session = topicManager.findSessionByTopicId(topicId);
    if (!session) return;

    // Let TextInputManager handle if it has a pending confirmation flow
    const consumed = await textInput.handleMessage(msg);
    if (consumed) return;

    await forwardToSession(bot, ptyManager, session.id, topicId, msg.text!);
  };

  bot.on('message', handler);

  return () => {
    bot.removeListener('message', handler);
  };
}

/** Check whether a message should be forwarded to PTY. */
function isForwardableMessage(msg: TelegramBot.Message): boolean {
  if (!msg.text) return false;
  if (msg.text.startsWith('/')) return false;
  if (!msg.message_thread_id) return false;
  return true;
}

/** Write text to PTY and send a confirmation echo in the topic. */
async function forwardToSession(
  bot: TelegramBotCore,
  ptyManager: PtyManager,
  sessionId: string,
  topicId: number,
  text: string,
): Promise<void> {
  ptyManager.write(sessionId, text + '\r');

  await bot.sendToTopic(topicId, `➡️ <code>${escapeHtml(text)}</code>`, {
    parse_mode: 'HTML',
  });

  logger.info(
    `[TopicInput] Forwarded message to session ${sessionId}: ${text.substring(0, 50)}`,
  );
}


