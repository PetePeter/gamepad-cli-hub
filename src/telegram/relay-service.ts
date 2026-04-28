/**
 * TelegramRelayService — Message broker between Telegram users and CLI sessions.
 *
 * Replaces direct PTY coupling with MCP-based relay workflow.
 * Telegram messages are routed to sessions via MCP, sessions send deliberate replies via MCP.
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

export interface TelegramRelayMessage {
  id: string;
  topicId: number;
  messageId: number;
  userId: number;
  text: string;
  timestamp: number;
  expectsResponse?: boolean;
  replyTo?: string; // Tracking token of original message
}

export interface SessionReplyMessage {
  sessionId: string;
  text: string;
  replyTo?: string;
  timestamp: number;
}

export type OutputMode = 'relay' | 'diagnostic';

interface PendingReply {
  topicId: number;
  originalMessageId: number;
  userId: number;
  timestamp: number;
}

export class TelegramRelayService extends EventEmitter implements TelegramBridge {
  private outputMode: OutputMode = 'relay';
  private pendingReplies = new Map<string, PendingReply>();
  private messageQueue: TelegramRelayMessage[] = [];
  private processingQueue = false;
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
    if (existing) {
      if (input.expectsResponse && !existing.expectsResponse) {
        const updated = { ...existing, expectsResponse: true, updatedAt: Date.now() };
        this.channels.set(updated.id, updated);
        return updated;
      }
      return existing;
    }

    const topicId = await this.topicManager.ensureTopic(session);
    const now = Date.now();
    const channel: TelegramChannel = {
      id: randomUUID(),
      sessionId: session.id,
      sessionName: session.name,
      ...(topicId != null ? { topicId } : {}),
      status: 'open',
      expectsResponse: input.expectsResponse ?? false,
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
      throw new Error('Telegram bot is not running');
    }
    const channel = input.channelId
      ? this.requireOpenChannel(input.channelId)
      : await this.createChannel({
          sessionId: requireString(input.sessionId, 'sessionId is required when channelId is not provided'),
          expectsResponse: input.expectsResponse,
        });

    const expectsResponse = input.expectsResponse ?? channel.expectsResponse;
    const text = formatAgentMessageForTelegram(input.text, expectsResponse);
    const message = channel.topicId
      ? await this.telegramBot.sendToTopic(channel.topicId, text, { parse_mode: 'HTML' })
      : await this.telegramBot.sendMessage(text, { parse_mode: 'HTML' });
    if (!message) {
      throw new Error('Telegram message could not be sent');
    }

    const updated: TelegramChannel = {
      ...channel,
      expectsResponse,
      lastMessageAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.channels.set(updated.id, updated);
    this.emit('message:sent_to_user', { channel: updated, messageId: message.message_id });
    return { sent: true, channel: updated, messageId: message.message_id };
  }

  async handleIncomingTelegramMessage(msg: TelegramBot.Message): Promise<boolean> {
    if (!msg.text || msg.text.startsWith('/')) return false;
    const topicId = msg.message_thread_id;
    if (!topicId) return false;

    const channel = [...this.channels.values()]
      .filter((item) => item.status === 'open' && item.expectsResponse && item.topicId === topicId)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (!channel) return false;

    await this.helmControl.sendTextToSession(channel.sessionId, msg.text, {
      senderSessionId: 'telegram-relay',
      senderSessionName: 'Telegram Relay',
      expectsResponse: false,
    });

    const updated: TelegramChannel = {
      ...channel,
      lastMessageAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.channels.set(updated.id, updated);
    await this.telegramBot.sendToTopic(topicId, 'Sent to session.');
    this.emit('message:received_from_user', { channel: updated, messageId: msg.message_id });
    return true;
  }

  /** Send a message from Telegram user to the target CLI session via MCP relay. */
  async sendToSession(message: TelegramRelayMessage): Promise<string | null> {
    // Resolve target session
    const session = await this.resolveSessionForTopic(message.topicId);
    if (!session) {
      logger.warn(`[TelegramRelay] No session found for topic ${message.topicId}`);
      return null;
    }

    // Generate tracking token for reply correlation
    const trackingToken = randomUUID();

    // Store pending reply mapping
    this.pendingReplies.set(trackingToken, {
      topicId: message.topicId,
      originalMessageId: message.messageId,
      userId: message.userId,
      timestamp: message.timestamp,
    });

    // Relay via MCP
    try {
      await this.helmControl.sendTextToSession(session.id, message.text, {
        senderSessionId: 'telegram-relay',
        senderSessionName: 'Telegram Relay',
        expectsResponse: true,
      });

      logger.info(`[TelegramRelay] Relayed message from topic ${message.topicId} to session ${session.id} (token: ${trackingToken})`);
      this.emit('message:relayed', { trackingToken, sessionId: session.id });
      return trackingToken;
    } catch (err) {
      this.pendingReplies.delete(trackingToken);
      logger.error(`[TelegramRelay] Failed to relay message: ${err}`);
      return null;
    }
  }

  /** Receive a deliberate reply from a CLI session and send to Telegram user. */
  async receiveFromSession(reply: SessionReplyMessage): Promise<boolean> {
    if (!reply.replyTo || !this.pendingReplies.has(reply.replyTo)) {
      logger.warn(`[TelegramRelay] Received reply with unknown tracking token: ${reply.replyTo}`);
      return false;
    }

    const pending = this.pendingReplies.get(reply.replyTo)!;

    try {
      // Send formatted message to Telegram topic
      const formattedMessage = this.formatReplyForTelegram(reply.text);
      await this.telegramBot.sendToTopic(pending.topicId, formattedMessage, { parse_mode: 'HTML' });

      logger.info(`[TelegramRelay] Relayed reply from session ${reply.sessionId} to topic ${pending.topicId}`);
      this.emit('reply:sent', { sessionId: reply.sessionId, topicId: pending.topicId });

      // Clean up after successful delivery
      this.pendingReplies.delete(reply.replyTo);
      return true;
    } catch (err) {
      logger.error(`[TelegramRelay] Failed to send reply to Telegram: ${err}`);
      return false;
    }
  }

  /** Set the output mode (relay or diagnostic mirroring). */
  setOutputMode(mode: OutputMode): void {
    this.outputMode = mode;
    logger.info(`[TelegramRelay] Output mode set to: ${mode}`);
    this.emit('mode:changed', mode);
  }

  /** Get current output mode. */
  getOutputMode(): OutputMode {
    return this.outputMode;
  }

  /** Resolve session for a Telegram topic. */
  private async resolveSessionForTopic(topicId: number) {
    // Try exact topic mapping first
    const mappedSessionId = this.topicManager.getSessionIdByTopic(topicId);
    if (mappedSessionId) {
      return this.sessionManager.getSession(mappedSessionId);
    }

    // Fall back to active session
    return this.sessionManager.getActiveSession();
  }

  /** Format a session reply for Telegram display. */
  private formatReplyForTelegram(text: string): string {
    // Add visual indicator that this is a deliberate reply
    return `📨 <b>Reply from session:</b>\n\n${text}`;
  }

  /** Queue a message for processing (handles rate limiting). */
  enqueueMessage(message: TelegramRelayMessage): void {
    this.messageQueue.push(message);
    void this.processQueue();
  }

  /** Process the message queue. */
  private async processQueue(): Promise<void> {
    if (this.processingQueue || this.messageQueue.length === 0) return;

    this.processingQueue = true;

    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!;
      await this.sendToSession(message);
      // Small delay between messages to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.processingQueue = false;
  }

  /** Clean up old pending replies (should be called periodically). */
  cleanupPendingReplies(maxAge = 3600000): void {
    const now = Date.now();
    for (const [token, pending] of this.pendingReplies.entries()) {
      if (now - pending.timestamp > maxAge) {
        this.pendingReplies.delete(token);
        logger.debug(`[TelegramRelay] Cleaned up expired pending reply: ${token}`);
      }
    }
  }

  /** Get statistics about pending replies. */
  getStats() {
    return {
      pendingReplies: this.pendingReplies.size,
      queuedMessages: this.messageQueue.length,
      outputMode: this.outputMode,
    };
  }

  private requireOpenChannel(channelId: string): TelegramChannel {
    const channel = this.channels.get(channelId);
    if (!channel || channel.status !== 'open') {
      throw new Error(`Open Telegram channel not found: ${channelId}`);
    }
    return channel;
  }
}

function requireString(value: string | undefined, errorMessage: string): string {
  if (!value) {
    throw new Error(errorMessage);
  }
  return value;
}

function formatAgentMessageForTelegram(text: string, expectsResponse: boolean): string {
  const suffix = expectsResponse ? '\n\nReply in this topic and Helm will route it back to the asking session.' : '';
  return `Agent message:\n\n${escapeHtml(text)}${suffix}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
