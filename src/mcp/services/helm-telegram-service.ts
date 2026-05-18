import * as fs from 'fs';
import * as path from 'path';
import type { ConfigLoader } from '../../config/loader.js';
import type { SessionManager } from '../../session/manager.js';
import type { SessionInfo } from '../../types/session.js';
import type {
  TelegramBridge,
  TelegramChannel,
  TelegramSendToUserResult,
  TelegramStatus,
} from '../../types/telegram-channel.js';
import type { NotificationManager } from '../../session/notification-manager.js';
import { validateMobileFriendlyTelegramText } from '../../telegram/utils.js';

/**
 * Telegram messaging and LLM notification routing.
 * Delegates to TelegramBridge for channel operations and NotificationManager for smart routing.
 */
export class HelmTelegramService {
  private telegramBridge: TelegramBridge | null = null;
  private notificationManager: NotificationManager | null = null;

  constructor(
    private readonly configLoader: ConfigLoader,
    private readonly sessionManager: SessionManager,
  ) {}

  setTelegramBridge(bridge: TelegramBridge | null): void {
    this.telegramBridge = bridge;
  }

  setNotificationManager(nm: NotificationManager): void {
    this.notificationManager = nm;
  }

  getTelegramStatus(): TelegramStatus {
    const config = this.configLoader.getTelegramConfig();
    const chatConfigured = typeof config.chatId === 'number';
    const allowedUsersConfigured = Array.isArray(config.allowedUserIds) && config.allowedUserIds.length > 0;
    const configured = Boolean(config.botToken && chatConfigured && allowedUsersConfigured);
    const running = this.telegramBridge?.isRunning() ?? false;
    return {
      enabled: config.enabled,
      configured,
      running,
      available: config.enabled && configured && running,
      chatConfigured,
      allowedUsersConfigured,
      openChannels: this.telegramBridge?.listChannels().filter((channel) => channel.status === 'open').length ?? 0,
      guidance: 'Use Telegram only for mobile-friendly urgent blockers or after the user has already engaged through Telegram.',
    };
  }

  async closeTelegramChannel(channelId: string): Promise<TelegramChannel> {
    this.requireTelegramBridge();
    const closed = this.telegramBridge!.closeChannel(channelId);
    if (!closed) {
      throw new Error(`Telegram channel not found: ${channelId}`);
    }
    return closed;
  }

  async sendTelegramChat(
    sessionRef: string,
    message: string,
    filePath?: string,
  ): Promise<{ sent: boolean; reason?: string }> {
    if (!this.telegramBridge?.isRunning()) {
      return { sent: false, reason: 'Telegram bot is not running' };
    }
    if (filePath) {
      if (!path.isAbsolute(filePath)) {
        return { sent: false, reason: 'File path must be absolute' };
      }
      if (!fs.existsSync(filePath)) {
        return { sent: false, reason: `File not found: ${filePath}` };
      }
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        return { sent: false, reason: `Not a file: ${filePath}` };
      }
      if (stats.size > 50 * 1024 * 1024) {
        const mb = (stats.size / (1024 * 1024)).toFixed(1);
        return { sent: false, reason: `File too large (${mb}MB). Telegram limit is 50MB.` };
      }
      if (message.length > 1024) {
        return { sent: false, reason: 'Message caption with attachment must be 1024 characters or fewer' };
      }
    } else {
      validateMobileFriendlyTelegramText(message);
    }
    const session = this.findSession(sessionRef);
    if (!session) return { sent: false, reason: `Session not found: ${sessionRef}` };
    return this.telegramBridge.sendToUser({ sessionId: session.id, text: message, filePath });
  }

  notifyUser(sessionRef: string, title: string, content: string): { delivered: 'toast' | 'bubble' | 'telegram' | 'none' } {
    if (!this.notificationManager) {
      throw new Error('Notification manager is not available');
    }
    const session = this.findSession(sessionRef);
    if (!session) throw new Error(`Session not found: ${sessionRef}`);
    return { delivered: this.notificationManager.notifyLlmDirected(session.id, title, content) };
  }

  getAppVisibility(): {
    visibility: 'visible-focused' | 'visible-background' | 'hidden';
    screenLocked: boolean;
    activeSessionId: string | null;
  } {
    if (!this.notificationManager) {
      throw new Error('Notification manager is not available');
    }
    return this.notificationManager.getAppVisibilityDetails();
  }

  private findSession(sessionRef: string): SessionInfo | null {
    const nameMatches = this.sessionManager.getAllSessions().filter((session) => session.name === sessionRef);
    if (nameMatches.length > 1) {
      throw new Error(`Multiple sessions found with name: ${sessionRef}. Use sessionId instead.`);
    }
    if (nameMatches.length === 1) return nameMatches[0];
    return this.sessionManager.getSession(sessionRef);
  }

  private requireTelegramBridge(): void {
    if (!this.telegramBridge) {
      throw new Error('Telegram bridge is not available');
    }
  }

  private requireTelegramAvailable(): void {
    this.requireTelegramBridge();
    const status = this.getTelegramStatus();
    if (!status.available) {
      throw new Error('Telegram is not available: enable Telegram, configure chat and allowed users, and start the bot first');
    }
  }
}
