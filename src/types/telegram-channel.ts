export interface TelegramChannel {
  id: string;
  sessionId: string;
  sessionName: string;
  topicId?: number;
  status: 'open' | 'closed';
  createdAt: number;
  updatedAt: number;
  lastMessageAt?: number;
}

export interface TelegramStatus {
  enabled: boolean;
  configured: boolean;
  running: boolean;
  available: boolean;
  chatConfigured: boolean;
  allowedUsersConfigured: boolean;
  openChannels: number;
  guidance: string;
}

export interface TelegramChannelCreateInput {
  sessionId: string;
}

export interface TelegramSendToUserInput {
  sessionId?: string;
  channelId?: string;
  text: string;
  attachment?: { name: string; data: string; mime: string };
}

export type TelegramSendResult = { sent: boolean; reason?: string };

export interface TelegramSendToUserResult extends TelegramSendResult {
  channel?: TelegramChannel;
  messageId?: number;
}

export interface TelegramBridge {
  isRunning(): boolean;
  listChannels(): TelegramChannel[];
  createChannel(input: TelegramChannelCreateInput): Promise<TelegramChannel>;
  closeChannel(channelId: string): TelegramChannel | null;
  sendToUser(input: TelegramSendToUserInput): Promise<TelegramSendToUserResult>;
}
