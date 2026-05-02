/**
 * TelegramRelayService — Simple message broker between CLIs and Telegram topics.
 *
 * CLIs send via MCP → topic. Any user reply in a topic is PTY-injected.
 * No tracking tokens, no pending replies, no output modes.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type TelegramBot from 'node-telegram-bot-api';
import { logger } from '../utils/logger.js';
import type { TelegramBotCore } from './bot.js';
import type { TopicManager } from './topic-manager.js';
import type { SessionManager } from '../session/manager.js';
import type { PtyManager } from '../session/pty-manager.js';
import type { HelmControlService } from '../mcp/helm-control-service.js';
import type {
  TelegramBridge,
  TelegramChannel,
  TelegramChannelCreateInput,
  TelegramSendToUserInput,
  TelegramSendToUserResult,
} from '../types/telegram-channel.js';

export class TelegramRelayService extends EventEmitter implements TelegramBridge {
  private channels = new Map<string, TelegramChannel>();

  constructor(
    private telegramBot: TelegramBotCore,
    private topicManager: TopicManager,
    private sessionManager: SessionManager,
    private ptyManager: PtyManager,
    private helmControl: HelmControlService,
  ) {
    super();
  }

  isRunning(): boolean {
    return this.telegramBot.isRunning();
  }

  isAvailable(): boolean {
    return this.telegramBot.isRunning();
  }

  listChannels(): TelegramChannel[] {
    return [...this.channels.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt || a.sessionName.localeCompare(b.sessionName));
  }

  async createChannel(input: TelegramChannelCreateInput): Promise<TelegramChannel> {
    const session = this.sessionManager.getSession(input.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${input.sessionId}`);
    }

    const existing = [...this.channels.values()].find((channel) => (
      channel.sessionId === session.id && channel.status === 'open'
    ));
    if (existing) return existing;

    const topicId = await this.topicManager.ensureTopic(session);
    const now = Date.now();
    const channel: TelegramChannel = {
      id: randomUUID(),
      sessionId: session.id,
      sessionName: session.name,
      ...(topicId != null ? { topicId } : {}),
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };
    this.channels.set(channel.id, channel);
    this.emit('channel:created', channel);
    return channel;
  }

  closeChannel(channelId: string): TelegramChannel | null {
    const channel = this.channels.get(channelId);
    if (!channel) return null;
    const closed: TelegramChannel = {
      ...channel,
      status: 'closed',
      updatedAt: Date.now(),
    };
    this.channels.set(channelId, closed);
    this.emit('channel:closed', closed);
    return closed;
  }

  async sendToUser(input: TelegramSendToUserInput): Promise<TelegramSendToUserResult> {
    if (!this.telegramBot.isRunning()) {
      return { sent: false, reason: 'Telegram bot is not running' };
    }

    const session = input.sessionId
      ? this.sessionManager.getSession(input.sessionId)
      : undefined;
    const channel = input.channelId
      ? this.requireOpenChannel(input.channelId)
      : session
        ? await this.createChannel({ sessionId: session.id })
        : undefined;

    if (!channel) {
      return { sent: false, reason: 'No session or channel specified' };
    }

    const text = formatMessageForTelegram(input.text);
    const chatId = this.telegramBot.getChatId();
    if (!chatId) {
      return { sent: false, reason: 'Telegram chat not configured' };
    }

    let messageId: number | undefined;

    if (channel.topicId) {
      const message = await this.telegramBot.sendToTopic(channel.topicId, text, {
        parse_mode: 'HTML',
        reply_markup: input.keyboard ? { inline_keyboard: input.keyboard } : undefined,
      });
      if (message) messageId = message.message_id;
    } else {
      const message = await this.telegramBot.sendMessage(text, {
        parse_mode: 'HTML',
        reply_markup: input.keyboard ? { inline_keyboard: input.keyboard } : undefined,
      });
      if (message) messageId = message.message_id;
    }

    if (!messageId) {
      return { sent: false, reason: 'Failed to send message' };
    }

    // Nudge General Chat with first 80 chars + link to topic
    if (channel.topicId) {
      const preview = input.text.substring(0, 80) + (input.text.length > 80 ? '...' : '');
      try {
        await this.telegramBot.getBot()?.sendMessage(
          chatId,
          `${escapeHtml(preview)}`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: 'Go to topic →', url: `https://t.me/c/${String(chatId).replace('-100', '')}/${channel.topicId}` },
              ]],
            },
          },
        );
      } catch (err) {
        logger.warn(`[TelegramRelay] Failed to send General Chat nudge: ${err}`);
      }
    }

    const updated: TelegramChannel = {
      ...channel,
      lastMessageAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.channels.set(updated.id, updated);
    this.emit('message:sent_to_user', { channel: updated, messageId });
    return { sent: true, channel: updated, messageId };
  }

  async handleIncomingTelegramMessage(msg: TelegramBot.Message): Promise<boolean> {
    if (!msg.text || msg.text.startsWith('/')) return false;
    const topicId = msg.message_thread_id;
    if (!topicId) return false;

    const from = msg.from?.username ? `@${msg.from.username}` : 'unknown';
    const chatId = msg.chat.id;
    const wrapped = wrapTelegramEnvelope(msg.text, from, chatId);

    // Find session by topic mapping
    const session = this.topicManager.findSessionByTopicId(topicId);
    if (session) {
      // Raw PTY delivery: Telegram user message injection. Uses hardcoded \r suffix.
      // TODO: Route through deliverPromptSequenceToSession for per-CLI submit suffix and {Send}/{NoSend} support.
      await this.ptyManager.deliverText(session.id, wrapped, { submitSuffix: '\r' });
      logger.info(`[TelegramRelay] Injected user message to session ${session.id}`);
      return true;
    }

    // Fall back to active session
    const active = this.sessionManager.getActiveSession();
    if (active) {
      // Raw PTY delivery: Telegram user message injection (unmapped topic fallback). See TODO above.
      await this.ptyManager.deliverText(active.id, wrapped, { submitSuffix: '\r' });
      logger.info(`[TelegramRelay] Injected user message to active session ${active.id} (unmapped topic ${topicId})`);
      return true;
    }

    return false;
  }

  private requireOpenChannel(channelId: string): TelegramChannel {
    const channel = this.channels.get(channelId);
    if (!channel || channel.status !== 'open') {
      throw new Error(`Open Telegram channel not found: ${channelId}`);
    }
    return channel;
  }
}

function wrapTelegramEnvelope(text: string, from: string, chatId: number): string {
  const fromTag = from === 'unknown' ? '' : ` from:${from}`;
  return `[HELM_TELEGRAM${fromTag} chat:${chatId}]\n${text}\n[/HELM_TELEGRAM]`;
}

function formatMessageForTelegram(text: string): string {
  return `Agent message:\n\n${escapeHtml(text)}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
