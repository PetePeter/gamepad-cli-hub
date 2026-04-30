/**
 * Handles callback queries from Telegram inline keyboards.
 * Routes button presses to the appropriate action.
 *
 * Callback data format (defined by keyboards.ts):
 *   topic:{sessionId}   — Navigate to topic
 *   continue:{sessionId} — Send Enter to session
 *   prompt:{sessionId}  — Enter text input mode
 *   sessions:list       — Show directory list
 *   dir:{path}          — Drill into directory
 *   sess:{sessionId}    — Show session controls
 *   spawn:start / spawn:tool:{name} / spawn:dir:{path} — Spawn wizard
 *   output:{sessionId}  — Show output summary
 *   commands:{sessionId} — Show command palette
 *   cmd:{sessionId}:{label} — Execute a command
 *   cancel:{sessionId}  — Ctrl+C
 *   accept:{sessionId}  — Enter (accept)
 *   send:confirm:{sessionId} / send:cancel:{sessionId} — Text input confirm/cancel
 *   status:all          — Full status overview
 */

import type TelegramBot from 'node-telegram-bot-api';
import { randomUUID } from 'crypto';
import type { TelegramBotCore } from './bot.js';
import type { TopicManager } from './topic-manager.js';
import type { SessionManager } from '../session/manager.js';
import type { PtyManager } from '../session/pty-manager.js';
import type { ConfigLoader } from '../config/loader.js';
// TextInputManager and OutputSummarizer removed in Stage 1 — stubbed until Stage 7 rewire
import {
  directoryListKeyboard,
  sessionListKeyboard,
  sessionControlKeyboard,
  commandPaletteKeyboard,
  spawnToolKeyboard,
  spawnDirKeyboard,
  resolvePathIndex,
} from './keyboards.js';
import { escapeHtml } from './utils.js';
import { scheduleInitialPrompt } from '../session/initial-prompt.js';
import { logger } from '../utils/logger.js';

function deliverViaManager(ptyManager: PtyManager, sessionId: string, text: string): Promise<void> {
  const maybeDeliver = (ptyManager as Partial<PtyManager>).deliverText;
  if (typeof maybeDeliver === 'function') {
    return maybeDeliver.call(ptyManager, sessionId, text);
  }
  ptyManager.write(sessionId, text);
  return Promise.resolve();
}

/** Generate a random session ID using UUID v4. */
function randomId(): string {
  return randomUUID();
}

/**
 * Register callback query handler on the bot.
 * Returns a dispose function that removes the listener.
 */
export function setupCallbackHandler(
  bot: TelegramBotCore,
  topicManager: TopicManager,
  sessionManager: SessionManager,
  ptyManager: PtyManager,
  configLoader: ConfigLoader,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  textInput: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  outputSummarizer: any,
  draftManager?: { clearSession(sessionId: string): void },
): () => void {
  const handler = async (query: TelegramBot.CallbackQuery) => {
    const data = query.data;
    if (!data) return;

    try {
      await routeCallback(
        data, query, bot, topicManager,
        sessionManager, ptyManager, configLoader,
        textInput, outputSummarizer, draftManager,
      );
    } catch (err) {
      logger.error(`[CallbackHandler] Error processing ${data}: ${err}`);
      await bot.answerCallback(query.id, '❌ Error processing action');
    }
  };

  bot.on('callback_query', handler);

  return () => {
    bot.removeListener('callback_query', handler);
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

async function routeCallback(
  data: string,
  query: TelegramBot.CallbackQuery,
  bot: TelegramBotCore,
  topicManager: TopicManager,
  sessionManager: SessionManager,
  ptyManager: PtyManager,
  configLoader: ConfigLoader,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  textInput: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  outputSummarizer: any,
  draftManager?: { clearSession(sessionId: string): void },
): Promise<void> {
  const [action, ...rest] = data.split(':');
  const payload = rest.join(':');

  switch (action) {
    case 'sessions':
      await handleSessionsList(bot, sessionManager, query);
      break;
    case 'dir':
      await handleDirectoryDrill(bot, sessionManager, payload, query);
      break;
    case 'sess':
      await handleSessionSelect(bot, sessionManager, payload, query);
      break;
    case 'topic':
      await bot.answerCallback(query.id, '📌 Go to topic');
      break;
    case 'continue':
      await handleContinue(bot, ptyManager, payload, query);
      break;
    case 'prompt':
      await handlePromptStart(bot, textInput, payload, query);
      break;
    case 'cancel':
      await handleCancel(bot, ptyManager, payload, query);
      break;
    case 'accept':
      await handleAccept(bot, ptyManager, payload, query);
      break;
    case 'output':
      await handleOutput(bot, outputSummarizer, payload, query);
      break;
    case 'commands':
      await handleCommandPalette(bot, sessionManager, configLoader, payload, query);
      break;
    case 'cmd':
      await handleCommandExec(bot, ptyManager, sessionManager, configLoader, payload, query);
      break;
    case 'spawn':
      await handleSpawn(bot, topicManager, sessionManager, ptyManager, configLoader, payload, query);
      break;
    case 'send':
      await handleSend(bot, textInput, payload, query);
      break;
    case 'status':
      await handleStatus(bot, sessionManager, query);
      break;
    case 'closeall':
      await handleCloseAll(bot, sessionManager, ptyManager, draftManager, query);
      break;
    default:
      logger.warn(`[CallbackHandler] Unknown callback: ${data}`);
      await bot.answerCallback(query.id, '❓ Unknown action');
  }
}

// ---------------------------------------------------------------------------
// Session navigation
// ---------------------------------------------------------------------------

async function handleSessionsList(
  bot: TelegramBotCore,
  sessionManager: SessionManager,
  query: TelegramBot.CallbackQuery,
): Promise<void> {
  const sessions = sessionManager.getAllSessions();
  const { text, keyboard } = directoryListKeyboard(sessions);

  await editOriginalMessage(bot, query, text, keyboard);
  await bot.answerCallback(query.id);
}

async function handleDirectoryDrill(
  bot: TelegramBotCore,
  sessionManager: SessionManager,
  pathIndex: string,
  query: TelegramBot.CallbackQuery,
): Promise<void> {
  const directory = resolvePathIndex(pathIndex);
  if (!directory) {
    await bot.answerCallback(query.id, '❌ Directory not found');
    return;
  }

  const all = sessionManager.getAllSessions();
  const dirSessions = all.filter(s => s.workingDir === directory);
  const { text, keyboard } = sessionListKeyboard(dirSessions, directory);

  await editOriginalMessage(bot, query, text, keyboard);
  await bot.answerCallback(query.id);
}

async function handleSessionSelect(
  bot: TelegramBotCore,
  sessionManager: SessionManager,
  sessionId: string,
  query: TelegramBot.CallbackQuery,
): Promise<void> {
  const session = sessionManager.getSession(sessionId);
  if (!session) {
    await bot.answerCallback(query.id, '❌ Session not found');
    return;
  }

  const { text, keyboard } = sessionControlKeyboard(session);

  await editOriginalMessage(bot, query, text, keyboard);
  await bot.answerCallback(query.id);
}

// ---------------------------------------------------------------------------
// Session actions
// ---------------------------------------------------------------------------

async function handleContinue(
  bot: TelegramBotCore,
  ptyManager: PtyManager,
  sessionId: string,
  query: TelegramBot.CallbackQuery,
): Promise<void> {
  ptyManager.write(sessionId, '\r');
  await bot.answerCallback(query.id, '🚀 Sent continue (Enter)');
}

async function handleCancel(
  bot: TelegramBotCore,
  ptyManager: PtyManager,
  sessionId: string,
  query: TelegramBot.CallbackQuery,
): Promise<void> {
  ptyManager.write(sessionId, '\x03');
  await bot.answerCallback(query.id, '✋ Sent cancel (Ctrl+C)');
}

async function handleAccept(
  bot: TelegramBotCore,
  ptyManager: PtyManager,
  sessionId: string,
  query: TelegramBot.CallbackQuery,
): Promise<void> {
  ptyManager.write(sessionId, '\r');
  await bot.answerCallback(query.id, '✅ Sent accept (Enter)');
}

// ---------------------------------------------------------------------------
// Text input
// ---------------------------------------------------------------------------

async function handlePromptStart(
  bot: TelegramBotCore,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  textInput: any,
  sessionId: string,
  query: TelegramBot.CallbackQuery,
): Promise<void> {
  textInput?.startInput(sessionId, query.from.id);
  await bot.answerCallback(query.id, '💬 Type your message in this chat');

  const msg = query.message;
  if (msg) {
    await bot.getBot()?.sendMessage(
      msg.chat.id,
      '✏️ Type your message and I\'ll send it to the session.\nSend /cancel to abort.',
      { message_thread_id: msg.message_thread_id },
    );
  }
}

async function handleSend(
  bot: TelegramBotCore,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  textInput: any,
  payload: string,
  query: TelegramBot.CallbackQuery,
): Promise<void> {
  // payload = "confirm:{sessionId}" or "cancel:{sessionId}"
  const colonIdx = payload.indexOf(':');
  if (colonIdx === -1) return;

  const subAction = payload.substring(0, colonIdx);
  const sessionId = payload.substring(colonIdx + 1);

  if (subAction === 'confirm') {
    await textInput?.confirmInput(sessionId);
    await bot.answerCallback(query.id, '✅ Sent!');
  } else {
    textInput?.cancelInput(sessionId);
    await bot.answerCallback(query.id, '❌ Cancelled');
  }
}

// ---------------------------------------------------------------------------
// Output summary
// ---------------------------------------------------------------------------

async function handleOutput(
  bot: TelegramBotCore,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  outputSummarizer: any,
  sessionId: string,
  query: TelegramBot.CallbackQuery,
): Promise<void> {
  const summary = outputSummarizer?.getSummary(sessionId) ?? '(output summary unavailable)';
  const msg = query.message;

  if (msg) {
    await bot.getBot()?.sendMessage(msg.chat.id, summary, {
      message_thread_id: msg.message_thread_id,
      parse_mode: 'HTML',
    });
  }
  await bot.answerCallback(query.id);
}

// ---------------------------------------------------------------------------
// Command palette
// ---------------------------------------------------------------------------

async function handleCommandPalette(
  bot: TelegramBotCore,
  sessionManager: SessionManager,
  configLoader: ConfigLoader,
  sessionId: string,
  query: TelegramBot.CallbackQuery,
): Promise<void> {
  const session = sessionManager.getSession(sessionId);
  if (!session) {
    await bot.answerCallback(query.id, '❌ Session not found');
    return;
  }

  const seqGroups = configLoader.getSequences(session.cliType);
  const commands = flattenSequences(seqGroups);

  if (commands.length === 0) {
    await bot.answerCallback(query.id, 'No commands configured');
    return;
  }

  const keyboard = commandPaletteKeyboard(sessionId, commands);

  await editOriginalMessage(bot, query, `⚡ Commands for ${session.cliType}`, keyboard);
  await bot.answerCallback(query.id);
}

async function handleCommandExec(
  bot: TelegramBotCore,
  ptyManager: PtyManager,
  sessionManager: SessionManager,
  configLoader: ConfigLoader,
  payload: string,
  query: TelegramBot.CallbackQuery,
): Promise<void> {
  // payload = "{sessionId}:{label}"
  const colonIdx = payload.indexOf(':');
  if (colonIdx === -1) return;

  const sessionId = payload.substring(0, colonIdx);
  const label = payload.substring(colonIdx + 1);

  const session = sessionManager.getSession(sessionId);
  if (!session) {
    await bot.answerCallback(query.id, '❌ Session not found');
    return;
  }

  const sequence = findSequenceByLabel(configLoader, session.cliType, label);
  if (!sequence) {
    await bot.answerCallback(query.id, '❌ Command not found');
    return;
  }

  const ptyText = expandSequence(sequence);
  await deliverViaManager(ptyManager, sessionId, ptyText);
  await bot.answerCallback(query.id, `⚡ Sent: ${label}`);
}

// ---------------------------------------------------------------------------
// Spawn wizard
// ---------------------------------------------------------------------------

/** Tracks which tool a user selected in step 1 of the spawn wizard. TTL: 5 min. */
const spawnWizardState = new Map<number, { tool: string; createdAt: number }>();
const SPAWN_WIZARD_TTL_MS = 5 * 60 * 1000;

async function handleSpawn(
  bot: TelegramBotCore,
  topicManager: TopicManager,
  sessionManager: SessionManager,
  ptyManager: PtyManager,
  configLoader: ConfigLoader,
  payload: string,
  query: TelegramBot.CallbackQuery,
): Promise<void> {
  if (payload === 'start') {
    await handleSpawnToolSelect(bot, configLoader, query);
  } else if (payload.startsWith('tool:')) {
    await handleSpawnDirSelect(bot, configLoader, payload.substring(5), query);
  } else if (payload.startsWith('dir:')) {
    await handleSpawnExec(bot, topicManager, sessionManager, ptyManager, configLoader, payload.substring(4), query);
  }
}

async function handleSpawnToolSelect(
  bot: TelegramBotCore,
  configLoader: ConfigLoader,
  query: TelegramBot.CallbackQuery,
): Promise<void> {
  const tools = configLoader.getCliTypes();
  const keyboard = spawnToolKeyboard(tools);

  await editOriginalMessage(bot, query, '🛠️ Select a CLI tool:', keyboard);
  await bot.answerCallback(query.id);
}

async function handleSpawnDirSelect(
  bot: TelegramBotCore,
  configLoader: ConfigLoader,
  toolName: string,
  query: TelegramBot.CallbackQuery,
): Promise<void> {
  // Store selected tool so we can retrieve it when the dir is picked
  spawnWizardState.set(query.from.id, { tool: toolName, createdAt: Date.now() });

  const dirs = configLoader.getWorkingDirectories();
  const keyboard = spawnDirKeyboard(dirs);

  await editOriginalMessage(bot, query, `📂 Select directory for ${toolName}:`, keyboard);
  await bot.answerCallback(query.id, `Selected: ${toolName}`);
}

/** Step 3: actually spawn the session and create a topic for it. */
async function handleSpawnExec(
  bot: TelegramBotCore,
  topicManager: TopicManager,
  sessionManager: SessionManager,
  ptyManager: PtyManager,
  configLoader: ConfigLoader,
  pathIndex: string,
  query: TelegramBot.CallbackQuery,
): Promise<void> {
  const userId = query.from.id;
  const entry = spawnWizardState.get(userId);
  spawnWizardState.delete(userId);

  if (!entry || Date.now() - entry.createdAt > SPAWN_WIZARD_TTL_MS) {
    await bot.answerCallback(query.id, '❌ No tool selected or wizard expired. Start over with /spawn');
    return;
  }
  const cliType = entry.tool;

  const dirPath = resolvePathIndex(pathIndex);
  if (!dirPath) {
    await bot.answerCallback(query.id, '❌ Directory not found. Start over with /spawn');
    return;
  }

  try {
    const sessionId = randomId();
    const cliSessionName = randomId();
    const cfg = configLoader.getCliTypeEntry(cliType);

    // Resolve the spawn command: prefer spawnCommand template, fall back to the
    // normalized spawn config if the template is unexpectedly absent.
    let rawCommand: string | undefined;
    let command: string | undefined;
    let args: string[] | undefined;
    if (cfg?.spawnCommand) {
      rawCommand = cfg.spawnCommand.replaceAll('{cliSessionName}', cliSessionName);
    } else {
      const spawnConfig = configLoader.getSpawnConfig(cliType);
      command = spawnConfig?.command || cliType;
      args = spawnConfig?.args || [];
    }

    const pty = ptyManager.spawn({
      sessionId,
      command: rawCommand ? undefined : command,
      args: rawCommand ? undefined : args,
      rawCommand,
      cwd: dirPath,
    });

    sessionManager.addSession({
      id: sessionId,
      name: cliType,
      cliType,
      processId: pty.pid,
      workingDir: dirPath,
      cliSessionName,
    });

    // Schedule initial prompt (rename command, startup sequences)
    const cliConfig = configLoader.getCliTypeEntry?.(cliType);
    if (cliConfig) {
      const renameCommand = cliConfig.renameCommand && cliSessionName
        ? cliConfig.renameCommand.replace('{cliSessionName}', cliSessionName)
        : undefined;
      scheduleInitialPrompt(sessionId, {
        initialPrompt: cliConfig.initialPrompt,
        initialPromptDelay: cliConfig.initialPromptDelay,
        renameCommand,
      }, (sid, data) => {
        ptyManager.write(sid, data);
      }, (sid, text) => {
        return deliverViaManager(ptyManager, sid, text);
      });
    }

    // Topic creation handled by session:added event in handlers.ts — no duplicate call here

    await bot.answerCallback(query.id, `🚀 Spawned ${cliType}!`);

    const msg = query.message;
    if (msg) {
      await bot.getBot()?.sendMessage(
        msg.chat.id,
        `✅ Spawned <b>${escapeHtml(cliType)}</b> in <code>${escapeHtml(dirPath)}</code>\nSession: ${sessionId.substring(0, 8)}…`,
        { parse_mode: 'HTML', message_thread_id: msg.message_thread_id },
      );
    }

    logger.info(`[SpawnWizard] Spawned ${cliType} in ${dirPath} → session ${sessionId}`);
  } catch (err) {
    logger.error(`[SpawnWizard] Spawn failed: ${err}`);
    await bot.answerCallback(query.id, '❌ Spawn failed');
  }
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

async function handleStatus(
  bot: TelegramBotCore,
  sessionManager: SessionManager,
  query: TelegramBot.CallbackQuery,
): Promise<void> {
  const sessions = sessionManager.getAllSessions();

  if (sessions.length === 0) {
    await bot.answerCallback(query.id, 'No active sessions');
    return;
  }

  const stateEmojis: Record<string, string> = {
    implementing: '🔨', planning: '📐', completed: '🎉', waiting: '⏳', idle: '💤',
  };

  let text = '📊 <b>Session Status</b>\n\n';
  for (const s of sessions) {
    const state = s.state ?? 'idle';
    text += `${stateEmojis[state] ?? '⚪'} <b>${escapeHtml(s.name)}</b> (${escapeHtml(s.cliType)})\n`;
    text += `   ${state}\n\n`;
  }

  const msg = query.message;
  if (msg) {
    await bot.getBot()?.sendMessage(msg.chat.id, text, {
      parse_mode: 'HTML',
      message_thread_id: msg.message_thread_id,
    });
  }
  await bot.answerCallback(query.id);
}

// ---------------------------------------------------------------------------
// Close All
// ---------------------------------------------------------------------------

async function handleCloseAll(
  bot: TelegramBotCore,
  sessionManager: SessionManager,
  ptyManager: PtyManager,
  draftManager: { clearSession(sessionId: string): void } | undefined,
  query: TelegramBot.CallbackQuery,
): Promise<void> {
  const sessions = sessionManager.getAllSessions();
  if (sessions.length === 0) {
    await bot.answerCallback(query.id, 'No sessions to close');
    return;
  }

  let closed = 0;
  for (const session of sessions) {
    try {
      ptyManager.kill(session.id);
      // removeSession triggers session:removed → topic cleanup + notifier/mirror/summarizer cleanup
      if (sessionManager.hasSession(session.id)) {
        sessionManager.removeSession(session.id);
      }
      draftManager?.clearSession(session.id);
      closed++;
    } catch (err) {
      logger.error(`[CloseAll] Failed to close session ${session.id}: ${err}`);
    }
  }

  await bot.answerCallback(query.id, `🗑️ Closed ${closed} session(s)`);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Edit the message that contained the inline keyboard the user tapped. */
async function editOriginalMessage(
  bot: TelegramBotCore,
  query: TelegramBot.CallbackQuery,
  text: string,
  keyboard: TelegramBot.InlineKeyboardButton[][],
): Promise<void> {
  const msg = query.message;
  if (!msg) return;

  try {
    await bot.getBot()?.editMessageText(text, {
      chat_id: msg.chat.id,
      message_id: msg.message_id,
      reply_markup: { inline_keyboard: keyboard },
    });
  } catch (err) {
    const errStr = String(err);
    if (!errStr.includes('message is not modified')) {
      logger.error(`[CallbackHandler] editOriginalMessage failed: ${err}`);
    }
  }
}

/** Flatten all sequence groups into a single command list. */
function flattenSequences(
  groups: Record<string, Array<{ label: string; sequence: string }>>,
): Array<{ label: string; sequence: string }> {
  const commands: Array<{ label: string; sequence: string }> = [];
  for (const items of Object.values(groups)) {
    for (const item of items) {
      commands.push(item);
    }
  }
  return commands;
}

/** Find a sequence item by its label (or truncated label prefix) across all groups. */
function findSequenceByLabel(
  configLoader: ConfigLoader,
  cliType: string,
  label: string,
): string | null {
  const groups = configLoader.getSequences(cliType);
  for (const items of Object.values(groups)) {
    const match = items.find(i => i.label === label || i.label.startsWith(label));
    if (match) return match.sequence;
  }
  return null;
}

/** Expand {Enter}, {Ctrl+C} etc. into control characters. */
function expandSequence(sequence: string): string {
  return sequence
    .replace(/\{Enter\}/g, '\r')
    .replace(/\{Ctrl\+C\}/g, '\x03');
}


