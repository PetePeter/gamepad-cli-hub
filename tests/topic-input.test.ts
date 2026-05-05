import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDeliverPromptSequenceToSession = vi.fn();

vi.mock('../src/session/sequence-delivery.js', () => ({
  deliverPromptSequenceToSession: (...args: any[]) => mockDeliverPromptSequenceToSession(...args),
}));

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { setupTopicInput } from '../src/telegram/topic-input.js';

function makeBot() {
  return {
    on: vi.fn(),
    removeListener: vi.fn(),
    sendMessage: vi.fn(),
    sendToTopic: vi.fn(),
  } as any;
}

describe('setupTopicInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes fallback topic messages through prompt-sequence delivery', async () => {
    const bot = makeBot();
    const topicManager = {
      findSessionByTopicId: vi.fn(() => ({ id: 's1' })),
    } as any;
    const ptyManager = {} as any;
    const configLoader = {
      getCliTypeEntry: vi.fn(() => ({ submitSuffix: '\\n' })),
    } as any;
    const sessionManager = {
      getSession: vi.fn(() => ({ id: 's1', cliType: 'claude-code' })),
      getActiveSession: vi.fn(() => null),
    } as any;

    setupTopicInput(bot, topicManager, ptyManager, configLoader, sessionManager, undefined);
    const handler = bot.on.mock.calls[0][1];

    await handler({
      text: 'hello{Send}',
      chat: { id: 12345 },
      message_thread_id: 77,
      from: { username: 'testuser' },
    });

    expect(mockDeliverPromptSequenceToSession).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 's1',
      text: '[HELM_TELEGRAM from:@testuser chat:12345]\nhello{Send}\n[/HELM_TELEGRAM]',
      ptyManager,
      sessionManager,
      configLoader,
    }));
    expect(bot.sendToTopic).toHaveBeenCalledWith(77, expect.stringContaining('hello{Send}'), { parse_mode: 'HTML' });
  });
});
