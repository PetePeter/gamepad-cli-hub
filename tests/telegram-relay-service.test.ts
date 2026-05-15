import { describe, expect, it, vi } from 'vitest';
import { TelegramRelayService } from '../src/telegram/relay-service.js';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeRelay() {
  const innerBot = { sendMessage: vi.fn().mockResolvedValue({ message_id: 99 }) };
  const bot = {
    isRunning: vi.fn(() => true),
    getChatId: vi.fn(() => -1001234567890),
    getBot: vi.fn(() => innerBot),
    sendToTopic: vi.fn().mockResolvedValue({ message_id: 12 }),
    sendMessage: vi.fn().mockResolvedValue({ message_id: 13 }),
    sendDocument: vi.fn().mockResolvedValue({ message_id: 100 }),
    sendPhoto: vi.fn().mockResolvedValue({ message_id: 101 }),
    sendVideo: vi.fn().mockResolvedValue({ message_id: 102 }),
    downloadFile: vi.fn().mockResolvedValue('/tmp/test/photo.jpg'),
  };
  const session = { id: 's1', name: 'Claude', cliType: 'claude-code', topicId: 42 };
  const topicManager = {
    ensureTopic: vi.fn(async () => 42),
    findSessionByTopicId: vi.fn((topicId: number) => topicId === 42 ? session : undefined),
  };
  const sessionManager = {
    getSession: vi.fn((id: string) => id === 's1' ? session : null),
    getActiveSession: vi.fn(() => session),
  };
  const ptyManager = {
    write: vi.fn(),
    deliverText: vi.fn().mockResolvedValue(undefined),
  };
  const configLoader = {
    getCliTypeEntry: vi.fn(() => ({ submitSuffix: '\\r' })),
  };
  const helmControl = {};
  const relay = new TelegramRelayService(
    bot as any,
    topicManager as any,
    sessionManager as any,
    ptyManager as any,
    configLoader as any,
    helmControl as any,
  );
  return { relay, bot, topicManager, sessionManager, ptyManager };
}

describe('TelegramRelayService', () => {
  it('sendToUser() creates topic if none exists and sends message', async () => {
    const { relay, bot, topicManager } = makeRelay();

    const result = await relay.sendToUser({ sessionId: 's1', text: 'Hello from CLI' });

    expect(topicManager.ensureTopic).toHaveBeenCalled();
    expect(bot.sendToTopic).toHaveBeenCalledWith(
      42,
      expect.stringContaining('Hello from CLI'),
      { parse_mode: 'HTML' },
    );
    expect(result.sent).toBe(true);
  });

  it('sendToUser() returns { sent: false, reason } when bot offline', async () => {
    const { relay, bot } = makeRelay();
    bot.isRunning.mockReturnValue(false);

    const result = await relay.sendToUser({ sessionId: 's1', text: 'Hello' });

    expect(result.sent).toBe(false);
    expect(result.reason).toBe('Telegram bot is not running');
  });

  it('handleIncomingTelegramMessage() wraps text in HELM_TELEGRAM envelope and delivers via sequence', async () => {
    const { relay, ptyManager } = makeRelay();

    const consumed = await relay.handleIncomingTelegramMessage({
      message_id: 77,
      message_thread_id: 42,
      text: 'Yes, ship it',
      chat: { id: 12345 },
      from: { username: 'testuser' },
    } as any);

    expect(consumed).toBe(true);
    // Now routed through deliverPromptSequenceToSession which uses deliverText for text content
    expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', expect.stringContaining('[HELM_TELEGRAM from:@testuser'));
    expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', expect.stringContaining('Respond via telegram_chat MCP tool.'));
  });

  it('handleIncomingTelegramMessage() wraps active-session messages in envelope too', async () => {
    const { relay, ptyManager } = makeRelay();

    const consumed = await relay.handleIncomingTelegramMessage({
      message_id: 78,
      message_thread_id: 999,
      text: 'Unmapped topic message',
      chat: { id: 12345 },
      from: { username: 'someone' },
    } as any);

    expect(consumed).toBe(true);
    expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', expect.stringContaining('[HELM_TELEGRAM from:@someone'));
    expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', expect.stringContaining('Respond via telegram_chat MCP tool.'));
  });

  it('handleIncomingTelegramMessage() omits from tag when username is missing', async () => {
    const { relay, ptyManager } = makeRelay();

    const consumed = await relay.handleIncomingTelegramMessage({
      message_id: 79,
      message_thread_id: 42,
      text: 'No username here',
      chat: { id: 12345 },
      from: {},
    } as any);

    expect(consumed).toBe(true);
    const callArgs = ptyManager.deliverText.mock.calls[0];
    expect(callArgs[1]).toContain('[HELM_TELEGRAM chat:12345]');
    expect(callArgs[1]).not.toContain('from:unknown');
    expect(callArgs[1]).toContain('No username here');
    expect(callArgs[1]).toContain('Respond via telegram_chat MCP tool.');
  });

  it('sends General Chat nudge after successful topic message', async () => {
    const { relay, bot } = makeRelay();
    const innerBot = bot.getBot();

    await relay.sendToUser({ sessionId: 's1', text: 'A message that is longer than 80 characters so it gets truncated in the General Chat nudge preview text' });

    expect(innerBot.sendMessage).toHaveBeenCalledWith(
      -1001234567890,
      expect.stringContaining('...'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({ text: 'Go to topic →' }),
            ]),
          ]),
        }),
      }),
    );
  });

  it('isAvailable() returns true when bot is running', () => {
    const { relay } = makeRelay();
    expect(relay.isAvailable()).toBe(true);
  });

  it('isAvailable() returns false when bot is not running', () => {
    const { relay, bot } = makeRelay();
    bot.isRunning.mockReturnValue(false);
    expect(relay.isAvailable()).toBe(false);
  });

  describe('attachment support', () => {
    const pdfAttachment = { name: 'report.pdf', data: Buffer.from('fake-pdf').toString('base64'), mime: 'application/pdf' };
    const imageAttachment = { name: 'screenshot.png', data: Buffer.from('fake-png').toString('base64'), mime: 'image/png' };
    const videoAttachment = { name: 'clip.mp4', data: Buffer.from('fake-mp4').toString('base64'), mime: 'video/mp4' };

    it('sends PDF attachment via sendDocument', async () => {
      const { relay, bot } = makeRelay();
      const result = await relay.sendToUser({ sessionId: 's1', text: 'See report', attachment: pdfAttachment });
      expect(result.sent).toBe(true);
      expect(bot.sendToTopic).not.toHaveBeenCalled();
      expect(bot.sendDocument).toHaveBeenCalledWith(
        expect.any(Buffer),
        'report.pdf',
        expect.objectContaining({ topicId: 42 }),
      );
    });

    it('sends image attachment via sendPhoto', async () => {
      const { relay, bot } = makeRelay();
      const result = await relay.sendToUser({ sessionId: 's1', text: 'Screenshot', attachment: imageAttachment });
      expect(result.sent).toBe(true);
      expect(bot.sendPhoto).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({ topicId: 42 }),
      );
    });

    it('sends video attachment via sendVideo', async () => {
      const { relay, bot } = makeRelay();
      const result = await relay.sendToUser({ sessionId: 's1', text: 'Video', attachment: videoAttachment });
      expect(result.sent).toBe(true);
      expect(bot.sendVideo).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({ topicId: 42 }),
      );
    });

    it('returns failure when attachment exceeds 50MB', async () => {
      const { relay } = makeRelay();
      // Create a valid base64 string that decodes to > 50MB
      const bigBuffer = Buffer.alloc(51 * 1024 * 1024, 'A'); // 51MB of 'A'
      const hugeData = bigBuffer.toString('base64');
      const result = await relay.sendToUser({
        sessionId: 's1',
        text: 'Big file',
        attachment: { name: 'huge.zip', data: hugeData, mime: 'application/zip' },
      });
      expect(result.sent).toBe(false);
      expect(result.reason).toContain('too large');
    });

    it('returns failure when attachment base64 is invalid', async () => {
      const { relay, bot } = makeRelay();
      const result = await relay.sendToUser({
        sessionId: 's1',
        text: 'OK',
        attachment: { name: 'file.txt', data: 'not valid base64!', mime: 'text/plain' },
      });
      expect(result.sent).toBe(false);
      expect(result.reason).toContain('valid base64');
      expect(bot.sendToTopic).not.toHaveBeenCalled();
      expect(bot.sendDocument).not.toHaveBeenCalled();
    });

    it('returns failure when Telegram API fails to send attachment', async () => {
      const { relay, bot } = makeRelay();
      bot.sendDocument.mockResolvedValue(null);
      const result = await relay.sendToUser({
        sessionId: 's1',
        text: 'Broken',
        attachment: { name: 'file.txt', data: 'aGVsbG8=', mime: 'text/plain' },
      });
      expect(result.sent).toBe(false);
      expect(result.reason).toContain('Failed to send attachment');
    });

    it('sends attachment without topic (no topicId)', async () => {
      const { relay, bot } = makeRelay();
      const session = { id: 's2', name: 'NoTopic', cliType: 'claude-code' };
      const sm = {
        getSession: vi.fn((id: string) => id === 's2' ? session : null),
        getActiveSession: vi.fn(() => session),
      };
      const tm = { ensureTopic: vi.fn(async () => undefined) };
      const relay2 = new TelegramRelayService(bot as any, tm as any, sm as any, {} as any, {} as any, {} as any);
      const result = await relay2.sendToUser({
        sessionId: 's2',
        text: 'No topic',
        attachment: pdfAttachment,
      });
      expect(result.sent).toBe(true);
      expect(bot.sendDocument).toHaveBeenCalledWith(
        expect.any(Buffer),
        'report.pdf',
        expect.objectContaining({ topicId: undefined }),
      );
    });
  });

  describe('incoming attachments', () => {
    it('photo message downloads file and delivers envelope with file_path', async () => {
      const { relay, bot, ptyManager } = makeRelay();
      bot.downloadFile.mockResolvedValue('/tmp/test/photo_77.jpg');

      const consumed = await relay.handleIncomingTelegramMessage({
        message_id: 77,
        message_thread_id: 42,
        chat: { id: 12345 },
        from: { username: 'testuser' },
        photo: [
          { file_id: 'small', file_size: 100 },
          { file_id: 'large', file_size: 5000 },
        ],
      } as any);

      expect(consumed).toBe(true);
      expect(bot.downloadFile).toHaveBeenCalledWith('large', expect.stringContaining('telegram-attachments'));
      expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', expect.stringContaining('[HELM_TELEGRAM_ATTACHMENT from:@testuser'));
      expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', expect.stringContaining('type: photo'));
      expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', expect.stringContaining('file_path: /tmp/test/photo_77.jpg'));
    });

    it('document message downloads file and delivers envelope', async () => {
      const { relay, bot, ptyManager } = makeRelay();
      bot.downloadFile.mockResolvedValue('/tmp/test/report.pdf');

      const consumed = await relay.handleIncomingTelegramMessage({
        message_id: 78,
        message_thread_id: 42,
        chat: { id: 12345 },
        from: { username: 'testuser' },
        document: {
          file_id: 'doc1',
          file_name: 'report.pdf',
          mime_type: 'application/pdf',
          file_size: 123456,
        },
      } as any);

      expect(consumed).toBe(true);
      expect(bot.downloadFile).toHaveBeenCalledWith('doc1', expect.stringContaining('telegram-attachments'));
      expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', expect.stringContaining('type: document'));
      expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', expect.stringContaining('file_name: report.pdf'));
      expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', expect.stringContaining('mime_type: application/pdf'));
    });

    it('video message downloads file and delivers envelope', async () => {
      const { relay, bot, ptyManager } = makeRelay();
      bot.downloadFile.mockResolvedValue('/tmp/test/video_79.mp4');

      const consumed = await relay.handleIncomingTelegramMessage({
        message_id: 79,
        message_thread_id: 42,
        chat: { id: 12345 },
        from: { username: 'testuser' },
        video: {
          file_id: 'vid1',
          file_name: 'clip.mp4',
          mime_type: 'video/mp4',
          file_size: 999999,
        },
      } as any);

      expect(consumed).toBe(true);
      expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', expect.stringContaining('type: video'));
      expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', expect.stringContaining('file_name: clip.mp4'));
    });

    it('voice message downloads file and delivers envelope', async () => {
      const { relay, bot, ptyManager } = makeRelay();
      bot.downloadFile.mockResolvedValue('/tmp/test/voice_80.ogg');

      const consumed = await relay.handleIncomingTelegramMessage({
        message_id: 80,
        message_thread_id: 42,
        chat: { id: 12345 },
        from: { username: 'testuser' },
        voice: {
          file_id: 'voice1',
          mime_type: 'audio/ogg',
          file_size: 55555,
        },
      } as any);

      expect(consumed).toBe(true);
      expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', expect.stringContaining('type: voice'));
      expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', expect.stringContaining('mime_type: audio/ogg'));
    });

    it('attachment with caption includes caption in envelope', async () => {
      const { relay, bot, ptyManager } = makeRelay();
      bot.downloadFile.mockResolvedValue('/tmp/test/photo_81.jpg');

      const consumed = await relay.handleIncomingTelegramMessage({
        message_id: 81,
        message_thread_id: 42,
        chat: { id: 12345 },
        from: { username: 'testuser' },
        caption: 'Here is a screenshot',
        photo: [{ file_id: 'p1', file_size: 1000 }],
      } as any);

      expect(consumed).toBe(true);
      expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', expect.stringContaining('caption: Here is a screenshot'));
    });

    it('returns false when no session found for attachment', async () => {
      const { relay, bot, sessionManager } = makeRelay();
      bot.downloadFile.mockResolvedValue('/tmp/test/photo_82.jpg');
      sessionManager.getActiveSession.mockReturnValue(null);

      const consumed = await relay.handleIncomingTelegramMessage({
        message_id: 82,
        message_thread_id: 999,
        chat: { id: 12345 },
        from: { username: 'testuser' },
        photo: [{ file_id: 'p1', file_size: 1000 }],
      } as any);

      expect(consumed).toBe(false);
    });

    it('returns false when download fails', async () => {
      const { relay, bot } = makeRelay();
      bot.downloadFile.mockResolvedValue(null);

      const consumed = await relay.handleIncomingTelegramMessage({
        message_id: 83,
        message_thread_id: 42,
        chat: { id: 12345 },
        from: { username: 'testuser' },
        photo: [{ file_id: 'p1', file_size: 1000 }],
      } as any);

      expect(consumed).toBe(false);
    });
  });

  describe('incoming reactions', () => {
    it('reaction with new emoji delivers envelope to active session', async () => {
      const { relay, ptyManager } = makeRelay();

      const consumed = await relay.handleReaction({
        chat: { id: 12345 },
        message_id: 77,
        user: { id: 111, username: 'testuser' },
        date: Date.now(),
        old_reaction: [],
        new_reaction: [{ type: 'emoji', emoji: '👍' }],
      });

      expect(consumed).toBe(true);
      expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', expect.stringContaining('[HELM_TELEGRAM_REACTION from:@testuser'));
      expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', expect.stringContaining('emoji: 👍'));
      expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', expect.stringContaining('message_id: 77'));
    });

    it('reaction with old_reaction shows removed emoji in envelope', async () => {
      const { relay, ptyManager } = makeRelay();

      const consumed = await relay.handleReaction({
        chat: { id: 12345 },
        message_id: 88,
        user: { id: 111, username: 'testuser' },
        date: Date.now(),
        old_reaction: [{ type: 'emoji', emoji: '❤️' }],
        new_reaction: [{ type: 'emoji', emoji: '👍' }],
      });

      expect(consumed).toBe(true);
      expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', expect.stringContaining('(removed: ❤️)'));
      expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', expect.stringContaining('emoji: 👍'));
    });

    it('returns false when no active session for reaction', async () => {
      const { relay, sessionManager } = makeRelay();
      sessionManager.getActiveSession.mockReturnValue(null);

      const consumed = await relay.handleReaction({
        chat: { id: 12345 },
        message_id: 99,
        user: { id: 111, username: 'testuser' },
        date: Date.now(),
        old_reaction: [],
        new_reaction: [{ type: 'emoji', emoji: '👍' }],
      });

      expect(consumed).toBe(false);
    });
  });
});
