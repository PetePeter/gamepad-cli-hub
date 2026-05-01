/**
 * Telegram command handlers — /peek and related slash commands.
 *
 * Listens on `command:{name}` events from TelegramBotCore.
 */

import type TelegramBot from 'node-telegram-bot-api';
import type { TelegramBotCore } from './bot.js';
import type { SessionManager } from '../session/manager.js';
import type { PtyManager } from '../session/pty-manager.js';
import path from 'path';
import { cleanTerminalOutput, escapeHtml } from './utils.js';
import { peekSessionPickerKeyboard, helpKeyboard, directoryListKeyboard } from './keyboards.js';
import { logger } from '../utils/logger.js';

const PEEK_LINE_COUNT = 30;
const TELEGRAM_MSG_LIMIT = 4096;

export const TELEGRAM_COMMANDS: ReadonlyArray<{ command: string; description: string }> = [
  { command: 'help', description: 'List all available commands and features' },
  { command: 'peek', description: 'Show recent terminal output' },
  { command: 'sessions', description: 'List and control active sessions' },
  { command: 'spawn', description: 'Create a new CLI session' },
  { command: 'status', description: 'Show status of all sessions' },
  { command: 'closeall', description: 'Close all active sessions' },
];

export function setupCommandHandler(
  bot: TelegramBotCore,
  sessionManager: SessionManager,
  ptyManager: PtyManager,
): () => void {
  const handlers: Array<() => void> = [];

  const registerCommandHandler = (cmd: string, handler: (msg: TelegramBot.Message, args: string) => Promise<void>) => {
    const wrapper = async (msg: TelegramBot.Message, args: string) => {
      try {
        await handler(msg, args);
      } catch (err) {
        logger.error(`[CommandHandler] /${cmd} failed: ${err}`);
        await bot.sendMessage(`❌ Failed to execute /${cmd}`);
      }
    };
    bot.on(`command:${cmd}`, wrapper);
    handlers.push(() => bot.removeListener(`command:${cmd}`, wrapper));
  };

  registerCommandHandler('help', async (msg) => handleHelp(bot, sessionManager, msg));
  registerCommandHandler('peek', async (msg, args) => handlePeek(bot, sessionManager, ptyManager, msg, args));
  registerCommandHandler('sessions', async (msg) => handleSessionsCommand(bot, sessionManager, msg));
  registerCommandHandler('spawn', async (msg) => handleSpawnCommand(bot, msg));
  registerCommandHandler('status', async (msg) => handleStatusCommand(bot, sessionManager, msg));
  registerCommandHandler('closeall', async (msg) => handleCloseAllCommand(bot, sessionManager, ptyManager, msg));

  return () => {
    for (const dispose of handlers) dispose();
  };
}

async function handleHelp(
  bot: TelegramBotCore,
  sessionManager: SessionManager,
  msg: TelegramBot.Message,
): Promise<void> {
  const lines = [
    '<b>🎮 Helm Telegram – Available Commands</b>',
    '',
    ...TELEGRAM_COMMANDS.map((entry) => `<b>/<code>${escapeHtml(entry.command)}</code></b> – ${escapeHtml(entry.description)}`),
    '',
    '<i>💡 Tip: Use the buttons below for quick access!</i>',
    '<i>📝 Send plain text in a session topic to forward it to that CLI.</i>',
  ];

  const { keyboard } = helpKeyboard(sessionManager);

  await bot.sendMessage(lines.join('\n'), {
    message_thread_id: msg.message_thread_id,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function handleSessionsCommand(
  bot: TelegramBotCore,
  sessionManager: SessionManager,
  msg: TelegramBot.Message,
): Promise<void> {
  const sessions = sessionManager.getAllSessions();
  if (sessions.length === 0) {
    await bot.sendMessage('No active sessions. Use /spawn to create one.', {
      message_thread_id: msg.message_thread_id,
    });
    return;
  }

  const { text, keyboard } = directoryListKeyboard(sessions);
  await bot.sendMessage(text, {
    message_thread_id: msg.message_thread_id,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function handleSpawnCommand(
  bot: TelegramBotCore,
  msg: TelegramBot.Message,
): Promise<void> {
  await bot.sendMessage('Use the button below to spawn a new CLI session:', {
    message_thread_id: msg.message_thread_id,
    reply_markup: {
      inline_keyboard: [[
        { text: '➕ Spawn New Session', callback_data: 'spawn:start' },
      ]],
    },
  });
}

async function handleStatusCommand(
  bot: TelegramBotCore,
  sessionManager: SessionManager,
  msg: TelegramBot.Message,
): Promise<void> {
  const sessions = sessionManager.getAllSessions();
  if (sessions.length === 0) {
    await bot.sendMessage('No active sessions.', { message_thread_id: msg.message_thread_id });
    return;
  }

  const stateEmojis: Record<string, string> = {
    implementing: '🔨', planning: '📐', completed: '🎉', waiting: '⏳', idle: '💤',
  };

  let text = '📊 <b>Session Status</b>\n\n';
  for (const s of sessions) {
    const state = s.state ?? 'idle';
    text += `${stateEmojis[state] ?? '⚪'} <b>${escapeHtml(s.name)}</b> (${escapeHtml(s.cliType)})\n`;
    text += `   📂 ${escapeHtml(path.basename(s.workingDir ?? 'unknown'))}\n`;
    text += `   ${state}\n\n`;
  }

  await bot.sendMessage(text, {
    message_thread_id: msg.message_thread_id,
    parse_mode: 'HTML',
  });
}

async function handleCloseAllCommand(
  bot: TelegramBotCore,
  sessionManager: SessionManager,
  msg: TelegramBot.Message,
): Promise<void> {
  const sessions = sessionManager.getAllSessions();
  if (sessions.length === 0) {
    await bot.sendMessage('No sessions to close.', { message_thread_id: msg.message_thread_id });
    return;
  }

  await bot.sendMessage(
    `⚠️ Close all <b>${sessions.length}</b> session(s)? This cannot be undone.`,
    {
      message_thread_id: msg.message_thread_id,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Confirm', callback_data: 'closeall' },
          { text: '❌ Cancel', callback_data: 'sessions:list' },
        ]],
      },
    },
  );
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
