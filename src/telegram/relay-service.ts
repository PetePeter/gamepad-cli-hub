/**
 * TelegramRelayService — Simple message broker between CLIs and Telegram topics.
 *
 * CLIs send via MCP → topic. Any user reply in a topic is PTY-injected.
 * No tracking tokens, no pending replies, no output modes.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import * as fs from 'fs';
import * as path from 'path';
import type TelegramBot from 'node-telegram-bot-api';
import { logger } from '../utils/logger.js';
import type { TelegramBotCore } from './bot.js';
import type { TopicManager } from './topic-manager.js';
import type { SessionManager } from '../session/manager.js';
import type { PtyManager } from '../session/pty-manager.js';
import type { ConfigLoader } from '../config/loader.js';
import type { HelmControlService } from '../mcp/helm-control-service.js';
import { deliverPromptSequenceToSession } from '../session/sequence-delivery.js';
import type { DeliveryVerificationResult } from '../session/delivery-verification.js';
import {
  buildLargeTextTempFileNotice,
  shouldSendLargeTextAsTempFile,
  writeLargeTextTempFile,
} from '../session/large-text-temp-file.js';
import { decodeBase64Strict } from '../utils/base64.js';
import { escapeHtml, formatAgentMessageForTelegram } from './utils.js';
import { OpenWhisprTranscriber, type AudioTranscriber, type AudioTranscriptionResult } from './openwhispr-transcriber.js';
import type { SessionInfo } from '../types/session.js';
import type {
  TelegramBridge,
  TelegramChannel,
  TelegramChannelCreateInput,
  TelegramSendToUserInput,
  TelegramSendToUserResult,
} from '../types/telegram-channel.js';

/** Telegram's max upload size is 50MB. */
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export class TelegramRelayService extends EventEmitter implements TelegramBridge {
  private channels = new Map<string, TelegramChannel>();

  constructor(
    private telegramBot: TelegramBotCore,
    private topicManager: TopicManager,
    private sessionManager: SessionManager,
    private ptyManager: PtyManager,
    private configLoader: ConfigLoader,
    private helmControl: HelmControlService,
    private audioTranscriber?: AudioTranscriber,
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

    const chatId = this.telegramBot.getChatId();
    if (!chatId) {
      return { sent: false, reason: 'Telegram chat not configured' };
    }

    let messageId: number | undefined;

    if (input.attachment) {
      const attachmentResult = await this.sendAttachment(input.attachment, channel.topicId, input.text);
      if (!attachmentResult.sent) return attachmentResult;
      messageId = attachmentResult.documentId;
    } else {
      const text = formatAgentMessageForTelegram(input.text);
      const message = channel.topicId
        ? await this.telegramBot.sendToTopic(channel.topicId, text, {
            parse_mode: 'HTML',
            reply_markup: input.keyboard ? { inline_keyboard: input.keyboard } : undefined,
          })
        : await this.telegramBot.sendMessage(text, {
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
    if (msg.text && msg.text.startsWith('/')) return false;

    // Handle attachment messages (photo, document, video, voice)
    if (!msg.text) {
      return this.handleIncomingAttachment(msg);
    }
    const topicId = msg.message_thread_id;
    if (!topicId) return false;

    const from = msg.from?.username ? `@${msg.from.username}` : 'unknown';
    const chatId = msg.chat.id;

    // Find session by topic mapping
    const session = this.topicManager.findSessionByTopicId(topicId);
    if (session) {
      const wrapped = wrapTelegramEnvelope(this.resolveTelegramTextPayload(session, msg.text), from, chatId);
      // Set channel affinity and inject first-contact instructions
      let text = wrapped;
      if (session.interactionChannel !== 'telegram') {
        this.sessionManager.updateSession(session.id, { interactionChannel: 'telegram' });
        text = TELEGRAM_MODE_INSTRUCTIONS + '\n\n' + wrapped;
      }
      const verification = await deliverPromptSequenceToSession({
        sessionId: session.id,
        text,
        ptyManager: this.ptyManager,
        sessionManager: this.sessionManager,
        configLoader: this.configLoader,
        verifyDelivery: {
          label: 'telegram message',
          delayMs: 4000,
          retrySubmit: true,
        },
      });
      await this.warnIfDeliveryUnconfirmed(session.id, topicId, verification);
      logger.info(`[TelegramRelay] Injected user message to session ${session.id}`);
      return true;
    }

    // Fall back to active session
    const active = this.sessionManager.getActiveSession();
    if (active) {
      const wrapped = wrapTelegramEnvelope(this.resolveTelegramTextPayload(active, msg.text), from, chatId);
      const verification = await deliverPromptSequenceToSession({
        sessionId: active.id,
        text: wrapped,
        ptyManager: this.ptyManager,
        sessionManager: this.sessionManager,
        configLoader: this.configLoader,
        verifyDelivery: {
          label: 'telegram message',
          delayMs: 4000,
          retrySubmit: true,
        },
      });
      await this.warnIfDeliveryUnconfirmed(active.id, topicId, verification);
      logger.info(`[TelegramRelay] Injected user message to active session ${active.id} (unmapped topic ${topicId})`);
      return true;
    }

    return false;
  }

  private resolveTelegramTextPayload(session: SessionInfo, text: string): string {
    const cliEntry = this.configLoader.getCliTypeEntry(session.cliType);
    if (!shouldSendLargeTextAsTempFile(cliEntry?.largeTextAsTempFile, text)) {
      return text;
    }
    const tempPath = writeLargeTextTempFile(text, 'telegram-message');
    logger.info(`[TelegramRelay] Wrote large Telegram message to temp file for ${session.id}: ${tempPath}`);
    return buildLargeTextTempFileNotice(tempPath, 'Telegram message');
  }

  /**
   * Handle a Telegram message containing an attachment (photo, document, video, voice).
   * Downloads the file to disk and delivers a metadata envelope to the CLI session.
   */
  async handleIncomingAttachment(msg: TelegramBot.Message): Promise<boolean> {
    const attachment = extractAttachmentInfo(msg);
    if (!attachment) return false;

    const destDir = path.join(process.env.APPDATA || process.env.HOME || '.', 'Helm', 'tmp', 'telegram-attachments');

    const filePath = await this.telegramBot.downloadFile(attachment.fileId, destDir, attachment.fileName);
    if (!this.isValidDownloadedFile(filePath)) {
      logger.warn(`[TelegramRelay] Failed to download attachment: ${attachment.fileId}; path=${filePath ?? 'null'}`);
      return false;
    }

    const from = msg.from?.username ? `@${msg.from.username}` : 'unknown';
    const chatId = msg.chat.id;
    const caption = attachment.caption || '';
    const fileSize = attachment.fileSize ?? 0;
    const transcription = await this.transcribeAttachmentIfAudio(attachment.type, filePath, attachment.mimeType);

    const envelope = [
      `[HELM_TELEGRAM_ATTACHMENT${from === 'unknown' ? '' : ` from:${from}`} chat:${chatId}]`,
      `type: ${attachment.type}`,
      `file_name: ${attachment.fileName}`,
      `file_path: ${filePath}`,
      `file_size: ${fileSize}`,
      `mime_type: ${attachment.mimeType}`,
      ...(transcription ? [
        `transcription_path: ${transcription.transcriptPath}`,
        `transcription_text: ${oneLine(transcription.text)}`,
      ] : []),
      ...(caption ? [`caption: ${caption}`] : []),
      `[/HELM_TELEGRAM_ATTACHMENT]`,
      `Respond via telegram_chat MCP tool.`,
    ].join('\n');

    // Find session by topic mapping
    const topicId = msg.message_thread_id;
    const session = topicId
      ? this.topicManager.findSessionByTopicId(topicId)
      : undefined;

    const targetSession = session ?? this.sessionManager.getActiveSession();
    if (!targetSession) return false;

    // Set channel affinity and inject first-contact instructions
    let text = envelope;
    if (targetSession.interactionChannel !== 'telegram') {
      this.sessionManager.updateSession(targetSession.id, { interactionChannel: 'telegram' });
      text = TELEGRAM_MODE_INSTRUCTIONS + '\n\n' + envelope;
    }

    const verification = await deliverPromptSequenceToSession({
      sessionId: targetSession.id,
      text,
      ptyManager: this.ptyManager,
      sessionManager: this.sessionManager,
      configLoader: this.configLoader,
      verifyDelivery: {
        label: 'telegram attachment',
        delayMs: 4000,
        retrySubmit: true,
      },
    });
    await this.warnIfDeliveryUnconfirmed(targetSession.id, topicId, verification);

    logger.info(`[TelegramRelay] Injected attachment (${attachment.type}) to session ${targetSession.id}: ${filePath}`);
    return true;
  }

  /**
   * Handle a Telegram message_reaction event.
   * Delivers a reaction envelope to the active CLI session.
   */
  async handleReaction(reaction: any): Promise<boolean> {
    const active = this.sessionManager.getActiveSession();
    if (!active) return false;

    const from = reaction.user?.username ? `@${reaction.user.username}` : 'unknown';
    const newEmojis = (reaction.new_reaction || []).map((r: any) => r.emoji).join(', ') || 'none';
    const oldEmojis = (reaction.old_reaction || []).map((r: any) => r.emoji).join(', ');

    const envelope = [
      `[HELM_TELEGRAM_REACTION${from === 'unknown' ? '' : ` from:${from}`} chat:${reaction.chat?.id}]`,
      `type: emoji`,
      `emoji: ${newEmojis}`,
      `message_id: ${reaction.message_id}`,
      ...(oldEmojis ? [`(removed: ${oldEmojis})`] : []),
      `[/HELM_TELEGRAM_REACTION]`,
    ].join('\n');

    const verification = await deliverPromptSequenceToSession({
      sessionId: active.id,
      text: envelope,
      ptyManager: this.ptyManager,
      sessionManager: this.sessionManager,
      configLoader: this.configLoader,
      verifyDelivery: {
        label: 'telegram reaction',
        delayMs: 4000,
        retrySubmit: true,
      },
    });
    await this.warnIfDeliveryUnconfirmed(active.id, active.topicId, verification);

    logger.info(`[TelegramRelay] Injected reaction (${newEmojis}) to session ${active.id}`);
    return true;
  }

  private async sendAttachment(
    attachment: { name: string; data: string; mime: string },
    topicId?: number,
    caption?: string,
  ): Promise<TelegramSendToUserResult> {
    const buffer = decodeBase64Strict(attachment.data);
    if (!buffer) {
      return { sent: false, reason: 'Attachment data is not valid base64' };
    }

    if (buffer.length > MAX_ATTACHMENT_BYTES) {
      const mb = (buffer.length / (1024 * 1024)).toFixed(1);
      return { sent: false, reason: `Attachment too large (${mb}MB). Telegram limit is 50MB.` };
    }

    const captionHtml = caption ? formatAgentMessageForTelegram(caption) : undefined;
    const opts = { caption: captionHtml, topicId };

    let message: Awaited<ReturnType<typeof this.telegramBot.sendDocument>> | null = null;
    const mime = attachment.mime.toLowerCase();

    if (mime.startsWith('image/')) {
      message = await this.telegramBot.sendPhoto(buffer, opts);
    } else if (mime.startsWith('video/')) {
      message = await this.telegramBot.sendVideo(buffer, opts);
    } else {
      message = await this.telegramBot.sendDocument(buffer, attachment.name, opts);
    }

    if (!message) {
      return { sent: false, reason: 'Failed to send attachment via Telegram API' };
    }

    return { sent: true, documentId: message.message_id };
  }

  private requireOpenChannel(channelId: string): TelegramChannel {
    const channel = this.channels.get(channelId);
    if (!channel || channel.status !== 'open') {
      throw new Error(`Open Telegram channel not found: ${channelId}`);
    }
    return channel;
  }

  private isValidDownloadedFile(filePath: string | null): filePath is string {
    if (!filePath || filePath.trim().length === 0) return false;
    if (!path.isAbsolute(filePath)) return false;
    try {
      return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    } catch {
      return false;
    }
  }

  private async transcribeAttachmentIfAudio(
    attachmentType: string,
    filePath: string,
    mimeType: string,
  ): Promise<AudioTranscriptionResult | null> {
    if (!isAudioAttachment(attachmentType, mimeType)) return null;

    try {
      const transcriber = this.audioTranscriber ?? this.createConfiguredTranscriber();
      if (!transcriber) return null;
      return await transcriber.transcribe(filePath, mimeType);
    } catch (err) {
      logger.warn(`[TelegramRelay] Audio transcription failed: ${err}`);
      return null;
    }
  }

  private createConfiguredTranscriber(): AudioTranscriber | null {
    const config = this.configLoader.getTelegramConfig();
    if (!config.openWhisprPath) {
      logger.warn('[TelegramRelay] Audio transcription skipped: openWhisprPath is not configured');
      return null;
    }
    return new OpenWhisprTranscriber({
      openWhisprPath: config.openWhisprPath,
      modelPath: config.openWhisprModelPath,
    });
  }

  private async warnIfDeliveryUnconfirmed(
    sessionId: string,
    topicId: number | undefined,
    verification: DeliveryVerificationResult | undefined,
  ): Promise<void> {
    if (!verification || verification.status === 'confirmed' || verification.status === 'retry_confirmed') return;

    logger.warn(`[TelegramRelay] Delivery verification for ${sessionId}: ${verification.status} (${verification.detail})`);
    if (!topicId || !this.telegramBot.isRunning()) return;

    try {
      await this.telegramBot.sendToTopic(
        topicId,
        'Helm could not confirm that the message was submitted. It retried Enter once; check the session if it stays quiet.',
      );
    } catch (error) {
      logger.warn(`[TelegramRelay] Failed to send delivery warning: ${error}`);
    }
  }
}

function isAudioAttachment(attachmentType: string, mimeType: string): boolean {
  return attachmentType === 'voice' || mimeType.toLowerCase().startsWith('audio/');
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Extract attachment metadata from a Telegram message.
 * Returns null if the message has no recognizable attachment.
 */
function extractAttachmentInfo(msg: TelegramBot.Message): {
  fileId: string;
  fileName: string;
  mimeType: string;
  fileSize?: number;
  caption?: string;
  type: string;
} | null {
  // Photo: array of sizes, pick the largest (last element)
  if (msg.photo && msg.photo.length > 0) {
    const largest = msg.photo[msg.photo.length - 1];
    return {
      fileId: largest.file_id,
      fileName: `photo_${msg.message_id}.jpg`,
      mimeType: 'image/jpeg',
      fileSize: largest.file_size,
      caption: msg.caption,
      type: 'photo',
    };
  }

  // Document
  if (msg.document) {
    return {
      fileId: msg.document.file_id,
      fileName: msg.document.file_name || `document_${msg.message_id}`,
      mimeType: msg.document.mime_type || 'application/octet-stream',
      fileSize: msg.document.file_size,
      caption: msg.caption,
      type: 'document',
    };
  }

  // Video
  if (msg.video) {
    return {
      fileId: msg.video.file_id,
      fileName: msg.video.file_name || `video_${msg.message_id}.mp4`,
      mimeType: msg.video.mime_type || 'video/mp4',
      fileSize: msg.video.file_size,
      caption: msg.caption,
      type: 'video',
    };
  }

  // Voice message
  if (msg.voice) {
    return {
      fileId: msg.voice.file_id,
      fileName: `voice_${msg.message_id}.ogg`,
      mimeType: msg.voice.mime_type || 'audio/ogg',
      fileSize: msg.voice.file_size,
      caption: undefined,
      type: 'voice',
    };
  }

  return null;
}

function wrapTelegramEnvelope(text: string, from: string, chatId: number): string {
  const fromTag = from === 'unknown' ? '' : ` from:${from}`;
  return `[HELM_TELEGRAM${fromTag} chat:${chatId}]\n${text}\n[/HELM_TELEGRAM]\nRespond via telegram_chat MCP tool.`;
}

const TELEGRAM_MODE_INSTRUCTIONS =
  '[HELM_TELEGRAM_MODE]\n' +
  'This session is now in Telegram mode. The user is interacting via Telegram and CANNOT see the terminal.\n' +
  'ALL responses MUST go through the telegram_chat MCP tool.\n' +
  'ALL questions and confirmations MUST go through telegram_chat — do NOT use AskUserQuestion.\n' +
  'The user will return to their desk when they type in the terminal, which automatically exits Telegram mode.\n' +
  '[/HELM_TELEGRAM_MODE]';

