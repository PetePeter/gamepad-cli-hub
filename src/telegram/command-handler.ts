/**
 * Telegram command handlers — /peek and related slash commands.
 *
 * Listens on `command:{name}` events from TelegramBotCore.
 */

import type TelegramBot from 'node-telegram-bot-api';
import type { TelegramBotCore } from './bot.js';
import type { SessionManager } from '../session/manager.js';
import type { PtyManager } from '../session/pty-manager.js';
import { cleanTerminalOutput, escapeHtml } from './utils.js';
import { peekSessionPickerKeyboard } from './keyboards.js';
import { logger } from '../utils/logger.js';

const PEEK_LINE_COUNT = 30;
const TELEGRAM_MSG_LIMIT = 4096;

export function setupCommandHandler(
  bot: TelegramBotCore,
  sessionManager: SessionManager,
  ptyManager: PtyManager,
): () => void {
  const peekHandler = async (msg: TelegramBot.Message, args: string) => {
    try {
      await handlePeek(bot, sessionManager, ptyManager, msg, args);
    } catch (err) {
      logger.error(`[CommandHandler] /peek failed: ${err}`);
      await bot.sendMessage('❌ Failed to peek at session');
    }
  };

  bot.on('command:peek', peekHandler);

  return () => {
    bot.removeListener('command:peek', peekHandler);
  };
}

async function handlePeek(
  bot: TelegramBotCore,
  sessionManager: SessionManager,
  ptyManager: PtyManager,
  msg: TelegramBot.Message,
  args: string,
): Promise<void> {
  const sessions = sessionManager.getAllSessions();
  if (sessions.length === 0) {
    await bot.sendMessage('No active sessions');
    return;
  }

  let targetSession: { id: string; name: string } | undefined;

  if (args.trim()) {
    const match = sessions.find(
      s => s.name.toLowerCase() === args.trim().toLowerCase()
        || s.cliType.toLowerCase() === args.trim().toLowerCase()
        || s.id.startsWith(args.trim()),
    );
    if (!match) {
      await bot.sendMessage(`Session not found: ${escapeHtml(args.trim())}`);
      return;
    }
    targetSession = { id: match.id, name: match.name };
  } else if (sessions.length === 1) {
    targetSession = { id: sessions[0].id, name: sessions[0].name };
  }

  if (targetSession) {
    await sendPeekOutput(bot, ptyManager, msg, targetSession);
  } else {
    // Multiple sessions, no name given — show picker
    const { text, keyboard } = peekSessionPickerKeyboard(sessions);
    await bot.sendMessage(text, {
      reply_markup: { inline_keyboard: keyboard },
    });
  }
}

export async function sendPeekOutput(
  bot: TelegramBotCore,
  ptyManager: PtyManager,
  msg: TelegramBot.Message,
  session: { id: string; name: string },
  lineCount = PEEK_LINE_COUNT,
): Promise<void> {
  const tail = ptyManager.getTerminalTail(session.id, lineCount, 'stripped');
  const rawLines = tail.stripped ?? [];
  const cleaned = cleanTerminalOutput(rawLines.join('\n'));
  const lines = cleaned.split('\n').filter(l => l.trim());

  const header = `📺 <b>${escapeHtml(session.name)}</b> (last ${lines.length} lines):\n─────────────────`;
  const chunks = chunkMessage(header + '\n' + escapeHtml(lines.join('\n')), TELEGRAM_MSG_LIMIT);

  for (const chunk of chunks) {
    await bot.sendMessage(chunk, {
      message_thread_id: msg.message_thread_id,
    });
  }
}

function chunkMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt < maxLen * 0.5) splitAt = maxLen;
    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).replace(/^\n+/, '');
  }
  return chunks;
}
