import TelegramBot from 'node-telegram-bot-api';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

/**
 * Forum topic returned by the Telegram Bot API.
 * Not present in @types/node-telegram-bot-api — defined locally.
 */
interface ForumTopic {
  message_thread_id: number;
  name: string;
  icon_color?: number;
  icon_custom_emoji_id?: string;
}

/**
 * Queued message edit to prevent hitting Telegram rate limits.
 * Only the latest edit per (chatId, messageId) is kept.
 */
interface PendingEdit {
  chatId: number;
  messageId: number;
  text: string;
  options?: TelegramBot.EditMessageTextOptions;
  resolveList: Array<(msg: TelegramBot.Message | boolean) => void>;
  rejectList: Array<(err: Error) => void>;
}

/** Minimum interval between edits to the same message (ms). */
const EDIT_DEBOUNCE_MS = 1500;

/** Maximum edits per topic per minute. */
const MAX_EDITS_PER_MIN = 20;

/** Maximum incoming messages per user per minute before rate limiting. */
const MAX_RECV_PER_MIN = 30;

/**
 * Core Telegram bot wrapper.
 *
 * Responsibilities:
 * - Bot lifecycle (start/stop long-polling)
 * - User-ID whitelist authentication
 * - Callback query routing (emits events)
 * - Message edit queue with debounce and rate limiting
 *
 * Events:
 * - 'callback_query' (query: TelegramBot.CallbackQuery) — authenticated callback
 * - 'message' (msg: TelegramBot.Message) — authenticated non-command message
 * - 'command:{name}' (msg: TelegramBot.Message, args: string) — slash command
 */
export class TelegramBotCore extends EventEmitter {
  private bot: TelegramBot | null = null;
  private chatId: number | null = null;
  private allowedUserIds: Set<number> = new Set();
  private running = false;

  // Edit queue: key = `chatId:messageId`, coalesces rapid edits
  private pendingEdits: Map<string, PendingEdit> = new Map();
  private editTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  // Rate tracking: key = topicId (message_thread_id), value = timestamps of recent edits
  private editRateLog: Map<number, number[]> = new Map();
  // Inbound rate tracking: key = userId, value = timestamps of recent messages
  private recvRateLog: Map<number, number[]> = new Map();

  /** Start the bot with the given token and config. */
  start(token: string, chatId: number, allowedUserIds: number[]): void {
    if (!allowedUserIds || allowedUserIds.length === 0) {
      throw new Error('allowedUserIds must not be empty — at least one authorized user is required');
    }

    if (this.running) {
      logger.warn('[Telegram] Bot already running, stopping first');
      this.stop();
    }

    this.chatId = chatId;
    this.allowedUserIds = new Set(allowedUserIds);

    try {
      this.bot = new TelegramBot(token, { polling: true });
      this.running = true;
      logger.info('[Telegram] Bot started with long-polling');

      this.bot.on('message', (msg) => this.handleMessage(msg));
      this.bot.on('callback_query', (query) => this.handleCallbackQuery(query));
      this.bot.on('polling_error', (err) => {
        logger.error(`[Telegram] Polling error: ${err.message}`);
      });
    } catch (err) {
      logger.error(`[Telegram] Failed to start bot: ${err}`);
      this.running = false;
      throw err;
    }
  }

  /** Stop the bot and flush pending edits. */
  stop(): void {
    if (!this.running || !this.bot) return;

    // Clear all pending edit timers
    for (const timer of this.editTimers.values()) clearTimeout(timer);
    this.editTimers.clear();
    this.pendingEdits.clear();
    this.editRateLog.clear();
    this.recvRateLog.clear();

    this.bot.stopPolling();
    this.bot = null;
    this.running = false;
    logger.info('[Telegram] Bot stopped');
  }

  /** Check if the bot is currently running. */
  isRunning(): boolean {
    return this.running;
  }

  /** Get the underlying TelegramBot instance (for direct API calls). */
  getBot(): TelegramBot | null {
    return this.bot;
  }

  /** Get the configured chat ID. */
  getChatId(): number | null {
    return this.chatId;
  }

  // ==========================================================================
  // Sending messages
  // ==========================================================================

  /** Send a message to the configured chat, optionally in a specific topic. */
  async sendMessage(
    text: string,
    options?: TelegramBot.SendMessageOptions,
  ): Promise<TelegramBot.Message | null> {
    if (!this.bot || !this.chatId) return null;
    try {
      return await this.bot.sendMessage(this.chatId, text, options);
    } catch (err) {
      logger.error(`[Telegram] sendMessage failed: ${err}`);
      return null;
    }
  }

  /** Send a message to a specific forum topic. */
  async sendToTopic(
    topicId: number,
    text: string,
    options?: TelegramBot.SendMessageOptions,
  ): Promise<TelegramBot.Message | null> {
    return this.sendMessage(text, {
      ...options,
      message_thread_id: topicId,
    });
  }

  /**
   * Edit a message with debounce + rate limiting.
   * Rapid edits to the same message are coalesced — only the latest text is sent.
   */
  editMessageDebounced(
    chatId: number,
    messageId: number,
    text: string,
    options?: TelegramBot.EditMessageTextOptions,
    topicId?: number,
  ): Promise<TelegramBot.Message | boolean> {
    const key = `${chatId}:${messageId}`;

    return new Promise((resolve, reject) => {
      const existing = this.pendingEdits.get(key);
      if (existing) {
        // Coalesce: update text, add promise callbacks
        existing.text = text;
        existing.options = options;
        existing.resolveList.push(resolve);
        existing.rejectList.push(reject);
        return;
      }

      const pending: PendingEdit = {
        chatId,
        messageId,
        text,
        options,
        resolveList: [resolve],
        rejectList: [reject],
      };
      this.pendingEdits.set(key, pending);

      const timer = setTimeout(() => {
        this.flushEdit(key, topicId);
      }, EDIT_DEBOUNCE_MS);
      this.editTimers.set(key, timer);
    });
  }

  /** Answer a callback query with a toast message. */
  async answerCallback(callbackQueryId: string, text?: string): Promise<void> {
    if (!this.bot) return;
    try {
      await this.bot.answerCallbackQuery(callbackQueryId, { text });
    } catch (err) {
      logger.error(`[Telegram] answerCallback failed: ${err}`);
    }
  }

  // ==========================================================================
  // Forum topic management
  // ==========================================================================

  /**
   * Create a forum topic in the configured supergroup.
   * Note: @types/node-telegram-bot-api types createForumTopic as Promise<boolean>,
   * but the actual Telegram API returns a ForumTopic object.
   */
  async createForumTopic(
    name: string,
    iconColor?: number,
  ): Promise<ForumTopic | null> {
    if (!this.bot || !this.chatId) return null;
    try {
      const result = await this.bot.createForumTopic(
        this.chatId,
        name,
        { icon_color: iconColor },
      ) as unknown as ForumTopic;
      return result;
    } catch (err) {
      logger.error(`[Telegram] createForumTopic failed: ${err}`);
      return null;
    }
  }

  /** Close a forum topic. */
  async closeForumTopic(topicId: number): Promise<boolean> {
    if (!this.bot || !this.chatId) return false;
    try {
      await this.bot.closeForumTopic(this.chatId, topicId);
      return true;
    } catch (err) {
      logger.error(`[Telegram] closeForumTopic failed: ${err}`);
      return false;
    }
  }

  /** Reopen a forum topic. */
  async reopenForumTopic(topicId: number): Promise<boolean> {
    if (!this.bot || !this.chatId) return false;
    try {
      await this.bot.reopenForumTopic(this.chatId, topicId);
      return true;
    } catch (err) {
      logger.error(`[Telegram] reopenForumTopic failed: ${err}`);
      return false;
    }
  }

  /** Delete a forum topic permanently. */
  async deleteForumTopic(topicId: number): Promise<boolean> {
    if (!this.bot || !this.chatId) return false;
    try {
      await (this.bot as any).deleteForumTopic(this.chatId, topicId);
      return true;
    } catch (err) {
      logger.error(`[Telegram] deleteForumTopic failed: ${err}`);
      return false;
    }
  }

  /** Edit a forum topic name/icon. */
  async editForumTopic(topicId: number, name: string): Promise<boolean> {
    if (!this.bot || !this.chatId) return false;
    try {
      await this.bot.editForumTopic(this.chatId, topicId, { name });
      return true;
    } catch (err) {
      logger.error(`[Telegram] editForumTopic failed: ${err}`);
      return false;
    }
  }

  // ==========================================================================
  // Private handlers
  // ==========================================================================

  private isAuthorized(userId: number | undefined): boolean {
    if (!userId) return false;
    if (this.allowedUserIds.size === 0) return false;
    return this.allowedUserIds.has(userId);
  }

  /** Check if a user has exceeded the inbound rate limit. */
  private isRateLimited(userId: number): boolean {
    const now = Date.now();
    const timestamps = this.recvRateLog.get(userId) ?? [];
    const recent = timestamps.filter(t => now - t < 60_000);

    if (recent.length >= MAX_RECV_PER_MIN) {
      logger.warn(`[Telegram] Rate limit exceeded for user ${userId}`);
      return true;
    }

    recent.push(now);
    this.recvRateLog.set(userId, recent);
    return false;
  }

  private handleMessage(msg: TelegramBot.Message): void {
    if (!this.isAuthorized(msg.from?.id)) {
      logger.warn(`[Telegram] Unauthorized message from user ${msg.from?.id}`);
      return;
    }

    if (this.isRateLimited(msg.from!.id)) return;

    // Check for bot commands
    if (msg.text?.startsWith('/')) {
      const parts = msg.text.split(' ');
      const command = parts[0].replace('/', '').replace(/@.*$/, ''); // strip @botname
      const args = parts.slice(1).join(' ');
      this.emit(`command:${command}`, msg, args);
      return;
    }

    this.emit('message', msg);
  }

  private handleCallbackQuery(query: TelegramBot.CallbackQuery): void {
    if (!this.isAuthorized(query.from?.id)) {
      logger.warn(`[Telegram] Unauthorized callback from user ${query.from?.id}`);
      return;
    }

    if (this.isRateLimited(query.from!.id)) {
      this.answerCallback(query.id, '⚠️ Rate limited — slow down').catch(() => {});
      return;
    }

    this.emit('callback_query', query);
  }

  private async flushEdit(key: string, topicId?: number): Promise<void> {
    this.editTimers.delete(key);
    const pending = this.pendingEdits.get(key);
    if (!pending) return;
    this.pendingEdits.delete(key);

    // Rate limit check
    if (topicId != null) {
      const now = Date.now();
      const log = this.editRateLog.get(topicId) ?? [];
      // Remove entries older than 1 minute
      const recent = log.filter(t => now - t < 60_000);
      if (recent.length >= MAX_EDITS_PER_MIN) {
        // Over rate limit — drop this edit
        logger.warn(`[Telegram] Edit rate limit exceeded for topic ${topicId}, dropping edit`);
        for (const resolve of pending.resolveList) resolve(false);
        this.editRateLog.set(topicId, recent);
        return;
      }
      recent.push(now);
      this.editRateLog.set(topicId, recent);
    }

    if (!this.bot) {
      for (const reject of pending.rejectList) reject(new Error('Bot not running'));
      return;
    }

    try {
      const result = await this.bot.editMessageText(pending.text, {
        chat_id: pending.chatId,
        message_id: pending.messageId,
        ...pending.options,
      });
      for (const resolve of pending.resolveList) resolve(result);
    } catch (err) {
      logger.error(`[Telegram] editMessageText failed: ${err}`);
      for (const reject of pending.rejectList) reject(err as Error);
    }
  }
}
