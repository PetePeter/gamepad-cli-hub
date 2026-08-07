/**
 * Telegram command handlers — /peek and related slash commands.
 *
 * Listens on `command:{name}` events from TelegramBotCore.
 */

import type * as TelegramBot from 'node-telegram-bot-api';
import type { TelegramBotCore } from './bot.js';
import type { SessionManager } from '../session/manager.js';
import type { PtyManager } from '../session/pty-manager.js';
import type { TopicManager } from './topic-manager.js';
import type { HelmControlService } from '../mcp/helm-control-service.js';
import type { ConfigLoader } from '../config/loader.js';
import path from 'path';
import { cleanTerminalOutput, escapeHtml } from './utils.js';
import { peekSessionPickerKeyboard, helpKeyboard, directoryListKeyboard } from './keyboards.js';
import { logger } from '../utils/logger.js';
import { cliLabel } from './cli-label.js';

const PEEK_LINE_COUNT = 30;
const TELEGRAM_MSG_LIMIT = 4096;

export const TELEGRAM_COMMANDS: ReadonlyArray<{ command: string; description: string }> = [
  { command: 'help', description: 'List all available commands and features' },
  { command: 'peek', description: 'Show recent terminal output' },
  { command: 'sessions', description: 'List and control active sessions' },
  { command: 'spawn', description: 'Create a new CLI session' },
  { command: 'status', description: 'Show status of all sessions' },
  { command: 'rename', description: 'Rename the session linked to this topic' },
  { command: 'close', description: 'Close the session linked to this topic' },
  { command: 'closeall', description: 'Close all active sessions' },
  { command: 'restart', description: 'Restart Helm and resume existing sessions' },
  { command: 'restart_force', description: 'Restart Helm WITHOUT resuming sessions (closes all first)' },
];

export function setupCommandHandler(
  bot: TelegramBotCore,
  sessionManager: SessionManager,
  ptyManager: PtyManager,
  topicManager: TopicManager,
  helmControlService: HelmControlService,
  configLoader?: ConfigLoader,
): () => void {
  const handlers: Array<() => void> = [];

  const registerCommandHandler = (cmd: string, handler: (msg: TelegramBot.Message, args: string) => Promise<void>) => {
    const wrapper = async (msg: TelegramBot.Message, args: string) => {
      try {
        await handler(msg, args);
      } catch (err) {
        logger.error(`[CommandHandler] /${cmd} failed: ${err}`);
        await bot.sendMessage(`❌ Failed to execute /${cmd}`, {
          message_thread_id: msg.message_thread_id,
        });
      }
    };
    bot.on(`command:${cmd}`, wrapper);
    handlers.push(() => bot.removeListener(`command:${cmd}`, wrapper));
  };

  registerCommandHandler('help', async (msg) => handleHelp(bot, sessionManager, topicManager, msg));
  registerCommandHandler('peek', async (msg, args) => handlePeek(bot, sessionManager, ptyManager, topicManager, configLoader, msg, args));
  registerCommandHandler('sessions', async (msg) => handleSessionsCommand(bot, sessionManager, msg));
  registerCommandHandler('spawn', async (msg) => handleSpawnCommand(bot, msg));
  registerCommandHandler('status', async (msg) => handleStatusCommand(bot, sessionManager, msg));
  registerCommandHandler('rename', async (msg, args) => handleRename(bot, sessionManager, topicManager, msg, args));
  registerCommandHandler('close', async (msg) => handleClose(bot, sessionManager, ptyManager, topicManager, msg));
  registerCommandHandler('closeall', async (msg) => handleCloseAllCommand(bot, sessionManager, msg));
  registerCommandHandler('restart', async (msg) => handleRestart(bot, helmControlService, msg, true));
  registerCommandHandler('restart_force', async (msg) => handleRestart(bot, helmControlService, msg, false));

  return () => {
    for (const dispose of handlers) dispose();
  };
}

export async function handleHelp(
  bot: TelegramBotCore,
  sessionManager: SessionManager,
  topicManager: TopicManager,
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

  const topicSession = msg.message_thread_id
    ? topicManager.findSessionByTopicId(msg.message_thread_id) ?? undefined
    : undefined;

  const { keyboard } = helpKeyboard(sessionManager, topicSession?.id);

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
    text += `${stateEmojis[state] ?? '⚪'} <b>${escapeHtml(s.name)}</b> (${escapeHtml(cliLabel(s.cliType))})\n`;
    text += `   📂 ${escapeHtml(path.basename(s.workingDir ?? 'unknown'))}\n`;
    text += `   ${state}\n\n`;
  }

  await bot.sendMessage(text, {
    message_thread_id: msg.message_thread_id,
    parse_mode: 'HTML',
  });
}

async function handleRename(
  bot: TelegramBotCore,
  sessionManager: SessionManager,
  topicManager: TopicManager,
  msg: TelegramBot.Message,
  args: string,
): Promise<void> {
  const topicId = msg.message_thread_id;
  if (!topicId) {
    await bot.sendMessage('❌ Use /rename inside a session topic.', { message_thread_id: topicId });
    return;
  }

  const newName = args.trim();
  if (!newName) {
    await bot.sendMessage('❌ Usage: /rename <name>', { message_thread_id: topicId });
    return;
  }

  const session = topicManager.findSessionByTopicId(topicId);
  if (!session) {
    await bot.sendMessage('❌ No session linked to this topic.', { message_thread_id: topicId });
    return;
  }

  // Renaming the session fires session:updated, which renameSessionTopic()
  // picks up to rename the Telegram topic — same path as the MCP session_rename.
  sessionManager.renameSession(session.id, newName);

  await bot.sendMessage(`✏️ Renamed to <b>${escapeHtml(newName)}</b>`, {
    message_thread_id: topicId,
    parse_mode: 'HTML',
  });
}

async function handleClose(
  bot: TelegramBotCore,
  sessionManager: SessionManager,
  ptyManager: PtyManager,
  topicManager: TopicManager,
  msg: TelegramBot.Message,
): Promise<void> {
  const topicId = msg.message_thread_id;
  if (!topicId) {
    await bot.sendMessage('❌ Use /close inside a session topic.', { message_thread_id: topicId });
    return;
  }

  const session = topicManager.findSessionByTopicId(topicId);
  if (!session) {
    await bot.sendMessage('❌ No session linked to this topic.', { message_thread_id: topicId });
    return;
  }

  ptyManager.kill(session.id);

  // Explicitly delete the forum topic before removing the session so the
  // Telegram API call completes synchronously within this update handler.
  // The session:removed handler in handlers.ts will also attempt closeSessionTopic()
  // as a fallback for other removal paths — a second call on an already-deleted
  // topic fails silently, so leaving that intact is safe.
  try {
    await topicManager.closeSessionTopic(session);
  } catch (err) {
    logger.warn('[CommandHandler] closeSessionTopic failed during /close — proceeding with session removal', { err });
  }

  if (sessionManager.hasSession(session.id)) {
    sessionManager.removeSession(session.id);
  }
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

async function handleRestart(
  bot: TelegramBotCore,
  helmControlService: HelmControlService,
  msg: TelegramBot.Message,
  resume: boolean,
): Promise<void> {
  const text = resume
    ? '🔄 Restarting Helm (sessions will resume)...'
    : '🔄 Force-restarting Helm (sessions will NOT resume)...';
  await bot.sendMessage(text, { message_thread_id: msg.message_thread_id });
  helmControlService.restartHelm(resume);
}

async function handlePeek(
  bot: TelegramBotCore,
  sessionManager: SessionManager,
  ptyManager: PtyManager,
  topicManager: TopicManager,
  configLoader: ConfigLoader | undefined,
  msg: TelegramBot.Message,
  args: string,
): Promise<void> {
  const sessions = sessionManager.getAllSessions();
  if (sessions.length === 0) {
    await bot.sendMessage('No active sessions', { message_thread_id: msg.message_thread_id });
    return;
  }

  let targetSession: { id: string; name: string } | undefined;

  if (args.trim()) {
    const needle = args.trim();
    // A user types a CLI's label, not its uuid — resolve the arg once so
    // "/peek claude" still matches sessions stored under the uuid.
    const cliTypeId = configLoader?.resolveCliType(needle)?.id;
    const match = sessions.find(
      s => s.name.toLowerCase() === needle.toLowerCase()
        || (cliTypeId !== undefined && s.cliType === cliTypeId)
        || s.id.startsWith(needle),
    );
    if (!match) {
      await bot.sendMessage(`Session not found: ${escapeHtml(args.trim())}`, {
        message_thread_id: msg.message_thread_id,
      });
      return;
    }
    targetSession = { id: match.id, name: match.name };
  } else if (msg.message_thread_id != null) {
    // No arg — infer the session from the topic the message was sent in
    const linked = topicManager.findSessionByTopicId(msg.message_thread_id);
    if (linked) {
      targetSession = { id: linked.id, name: linked.name };
    }
  }

  if (!targetSession && sessions.length === 1) {
    targetSession = { id: sessions[0].id, name: sessions[0].name };
  }

  if (targetSession) {
    await sendPeekOutput(bot, ptyManager, msg, targetSession);
  } else {
    // Multiple sessions, no name given — show picker
    const { text, keyboard } = peekSessionPickerKeyboard(sessions, (s) => topicManager.getFormattedName(s));
    await bot.sendMessage(text, {
      message_thread_id: msg.message_thread_id,
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
