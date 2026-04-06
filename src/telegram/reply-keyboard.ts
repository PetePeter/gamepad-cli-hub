/**
 * Persistent Reply Keyboard
 *
 * Shows a persistent keyboard at the bottom of the Telegram chat with
 * the most-used actions. Unlike inline keyboards (attached to messages),
 * reply keyboards persist below the text input area.
 *
 * Layout:
 *   [ 📂 Sessions ] [ 📊 Status ]
 *   [ ➕ Spawn    ] [ ❓ Help   ]
 */

import type TelegramBot from 'node-telegram-bot-api';
import type { TelegramBotCore } from './bot.js';

/** Build the persistent reply keyboard markup. */
export function buildReplyKeyboard(): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [
        { text: '📂 Sessions' },
        { text: '📊 Status' },
      ],
      [
        { text: '➕ Spawn' },
        { text: '❓ Help' },
      ],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

/** Remove the reply keyboard. */
export function buildRemoveKeyboard(): TelegramBot.ReplyKeyboardRemove {
  return {
    remove_keyboard: true,
  };
}

/**
 * Send a message with the persistent reply keyboard attached.
 * This activates the keyboard for the user.
 */
export async function sendWithReplyKeyboard(
  bot: TelegramBotCore,
  text: string,
  options?: { topicId?: number },
): Promise<void> {
  const keyboard = buildReplyKeyboard();

  if (options?.topicId) {
    await bot.sendToTopic(options.topicId, text, {
      reply_markup: keyboard,
    });
  } else {
    await bot.sendMessage(text, {
      reply_markup: keyboard,
    });
  }
}

/**
 * Handle reply keyboard button presses.
 * These come as regular text messages matching the button labels.
 * Returns the command name if matched, null otherwise.
 */
export function isReplyKeyboardPress(text: string): string | null {
  const mapping: Record<string, string> = {
    '📂 Sessions': 'sessions',
    '📊 Status': 'status',
    '➕ Spawn': 'spawn',
    '❓ Help': 'help',
  };
  return mapping[text] ?? null;
}
