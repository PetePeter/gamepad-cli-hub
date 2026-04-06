// src/telegram/commands.ts

/**
 * Telegram Slash Command Handlers
 *
 * Registers handlers for bot commands emitted as 'command:{name}' events:
 * - /start — Welcome message + session count
 * - /status — Show all session states
 * - /sessions — Show directory → session navigation
 * - /switch <name> — Switch active session by name (fuzzy match)
 * - /send <text> — Send text to active session's PTY
 * - /close — Close the current topic's session
 * - /spawn — Start spawn wizard (CLI tool picker)
 * - /output — Show output summary for current topic's session
 * - /help — List available commands
 */

import type TelegramBot from 'node-telegram-bot-api';
import type { TelegramBotCore } from './bot.js';
import type { TopicManager } from './topic-manager.js';
import type { SessionManager } from '../session/manager.js';
import type { PtyManager } from '../session/pty-manager.js';
import { directoryListKeyboard, sessionControlKeyboard, spawnToolKeyboard } from './keyboards.js';
import { escapeHtml } from './utils.js';
import type { ConfigLoader } from '../config/loader.js';
import { logger } from '../utils/logger.js';
import path from 'path';

/** Minimal contract for output summarization — module may not exist yet. */
export interface OutputSummaryProvider {
  getSummary(sessionId: string): string;
}

export interface SlashCommandDeps {
  bot: TelegramBotCore;
  topicManager: TopicManager;
  sessionManager: SessionManager;
  ptyManager: PtyManager;
  configLoader: ConfigLoader;
  outputSummarizer?: OutputSummaryProvider;
}

/**
 * Registers all slash-command event listeners on the bot and returns
 * a cleanup function that removes them.
 */
export function setupSlashCommands(deps: SlashCommandDeps): () => void {
  const { bot, topicManager, sessionManager, ptyManager, configLoader, outputSummarizer } = deps;

  // ── Handler registry ────────────────────────────────────────────────
  const handlers: Array<[string, (msg: TelegramBot.Message, args: string) => Promise<void>]> = [
    ['start', handleStart],
    ['help', handleHelp],
    ['status', handleStatus],
    ['sessions', handleSessions],
    ['switch', handleSwitch],
    ['send', handleSend],
    ['close', handleClose],
    ['spawn', handleSpawn],
    ['output', handleOutput],
  ];

  // ── /start ──────────────────────────────────────────────────────────
  async function handleStart(msg: TelegramBot.Message): Promise<void> {
    const count = sessionManager.getAllSessions().length;

    let text = `👋 <b>Gamepad CLI Hub</b>\n\n`;
    text += `Active sessions: ${count}\n`;
    text += `Use /sessions to browse, /help for commands.`;

    await reply(msg, text, { parse_mode: 'HTML' });
  }

  // ── /help ───────────────────────────────────────────────────────────
  async function handleHelp(msg: TelegramBot.Message): Promise<void> {
    const text = [
      '📖 <b>Available Commands</b>',
      '',
      '/sessions — Browse sessions by directory',
      '/status — Show all session states',
      '/switch &lt;name&gt; — Switch active session',
      '/send &lt;text&gt; — Send text to current session',
      '/output — Show output summary',
      '/spawn — Start a new CLI session',
      '/close — Close the current topic\'s session',
      '/help — Show this message',
    ].join('\n');

    await reply(msg, text, { parse_mode: 'HTML' });
  }

  // ── /status ─────────────────────────────────────────────────────────
  async function handleStatus(msg: TelegramBot.Message): Promise<void> {
    const sessions = sessionManager.getAllSessions();

    if (sessions.length === 0) {
      await reply(msg, '💤 No active sessions.');
      return;
    }

    const stateEmojis: Record<string, string> = {
      implementing: '🔨',
      planning: '📐',
      completed: '🎉',
      waiting: '⏳',
      idle: '💤',
    };

    let text = '📊 <b>Session Status</b>\n\n';
    for (const s of sessions) {
      const state = s.state ?? 'idle';
      const emoji = stateEmojis[state] ?? '⚪';
      const dir = s.workingDir ? path.basename(s.workingDir) : 'unknown';
      text += `${emoji} <b>${escapeHtml(s.name)}</b>\n`;
      text += `   ${s.cliType} · ${dir} · ${state}\n\n`;
    }

    await reply(msg, text, { parse_mode: 'HTML' });
  }

  // ── /sessions ───────────────────────────────────────────────────────
  async function handleSessions(msg: TelegramBot.Message): Promise<void> {
    const sessions = sessionManager.getAllSessions();
    const { text, keyboard } = directoryListKeyboard(sessions);

    await reply(msg, text, { reply_markup: { inline_keyboard: keyboard } });
  }

  // ── /switch <name> ──────────────────────────────────────────────────
  async function handleSwitch(msg: TelegramBot.Message, args: string): Promise<void> {
    if (!args.trim()) {
      await reply(msg, 'Usage: /switch &lt;session name&gt;', { parse_mode: 'HTML' });
      return;
    }

    const needle = args.trim().toLowerCase();
    const sessions = sessionManager.getAllSessions();
    const match = sessions.find(s => s.name.toLowerCase().includes(needle));

    if (!match) {
      await reply(msg, `❌ No session matching "${escapeHtml(args.trim())}"`, { parse_mode: 'HTML' });
      return;
    }

    sessionManager.setActiveSession(match.id);
    const { text, keyboard } = sessionControlKeyboard(match);
    await reply(msg, `✅ Switched to: ${escapeHtml(match.name)}\n\n${text}`, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  // ── /send <text> ────────────────────────────────────────────────────
  async function handleSend(msg: TelegramBot.Message, args: string): Promise<void> {
    if (!args.trim()) {
      await reply(msg, 'Usage: /send &lt;text to send to terminal&gt;', { parse_mode: 'HTML' });
      return;
    }

    const sessionId = resolveSessionId(msg);
    if (!sessionId) {
      await reply(msg, '❌ No active session to send to.');
      return;
    }

    ptyManager.write(sessionId, args.trim() + '\r');
    await reply(msg, `✅ Sent: <code>${escapeHtml(args.trim())}</code>`, { parse_mode: 'HTML' });
  }

  // ── /close ──────────────────────────────────────────────────────────
  async function handleClose(msg: TelegramBot.Message): Promise<void> {
    if (msg.message_thread_id) {
      const session = topicManager.findSessionByTopicId(msg.message_thread_id);
      if (session) {
        sessionManager.removeSession(session.id);
        await topicManager.closeSessionTopic(session);
        await reply(msg, `🔒 Session "${escapeHtml(session.name)}" closed.`, { parse_mode: 'HTML' });
        return;
      }
    }

    await reply(msg, '❌ No session found for this topic. Use /sessions to browse.');
  }

  // ── /spawn ──────────────────────────────────────────────────────────
  async function handleSpawn(msg: TelegramBot.Message): Promise<void> {
    const tools = configLoader.getCliTypes();
    const keyboard = spawnToolKeyboard(tools);

    await reply(msg, '🛠️ Select a CLI tool to spawn:', {
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  // ── /output ─────────────────────────────────────────────────────────
  async function handleOutput(msg: TelegramBot.Message): Promise<void> {
    if (!outputSummarizer) {
      await reply(msg, '⚠️ Output summarizer is not available.');
      return;
    }

    const sessionId = resolveSessionId(msg);
    if (!sessionId) {
      await reply(msg, '❌ No session found.');
      return;
    }

    const summary = outputSummarizer.getSummary(sessionId);
    await reply(msg, summary, { parse_mode: 'HTML' });
  }

  // ── Shared helpers ──────────────────────────────────────────────────

  /** Resolve a session from the topic thread, falling back to the active session. */
  function resolveSessionId(msg: TelegramBot.Message): string | null {
    if (msg.message_thread_id) {
      const session = topicManager.findSessionByTopicId(msg.message_thread_id);
      if (session) return session.id;
    }
    const active = sessionManager.getActiveSession();
    return active?.id ?? null;
  }

  /** Send a message in the same thread the command came from. */
  async function reply(
    msg: TelegramBot.Message,
    text: string,
    options?: Omit<TelegramBot.SendMessageOptions, 'message_thread_id'>,
  ): Promise<void> {
    try {
      await bot.sendMessage(text, {
        ...options,
        message_thread_id: msg.message_thread_id,
      });
    } catch (err) {
      logger.error('[Commands] Failed to send reply', err);
    }
  }

  // ── Register listeners ──────────────────────────────────────────────
  for (const [name, handler] of handlers) {
    bot.on(`command:${name}`, handler as (...args: unknown[]) => void);
  }

  logger.info(`[Commands] Registered ${handlers.length} slash command handlers`);

  // ── Cleanup ─────────────────────────────────────────────────────────
  return () => {
    for (const [name, handler] of handlers) {
      bot.removeListener(`command:${name}`, handler as (...args: unknown[]) => void);
    }
    logger.info('[Commands] Removed all slash command handlers');
  };
}
