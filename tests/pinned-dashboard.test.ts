/**
 * PinnedDashboard unit tests
 *
 * Tests: lifecycle (start/stop/dispose), dashboard text rendering,
 * periodic updates, edit error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SessionInfo } from '../src/types/session.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    id: 'sess-1',
    name: 'my-session',
    cliType: 'claude-code',
    processId: 1234,
    workingDir: '/projects/app',
    state: 'idle',
    ...overrides,
  };
}

function makeMockBot() {
  return {
    sendMessage: vi.fn().mockResolvedValue({ message_id: 100 }),
    getChatId: vi.fn().mockReturnValue(123),
    getBot: vi.fn().mockReturnValue({
      editMessageText: vi.fn().mockResolvedValue(true),
      pinChatMessage: vi.fn().mockResolvedValue(true),
    }),
  } as any;
}

function makeMockSessionManager(sessions: SessionInfo[] = []) {
  return {
    getAllSessions: vi.fn().mockReturnValue(sessions),
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let PinnedDashboard: typeof import('../src/telegram/pinned-dashboard.js').PinnedDashboard;

beforeEach(async () => {
  vi.useFakeTimers();
  // Dynamic import so the logger mock is active
  const mod = await import('../src/telegram/pinned-dashboard.js');
  PinnedDashboard = mod.PinnedDashboard;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

describe('PinnedDashboard lifecycle', () => {
  it('start() sends a message and pins it', async () => {
    const bot = makeMockBot();
    const sm = makeMockSessionManager();
    const dash = new PinnedDashboard(bot, sm, 'TestPC');

    await dash.start();

    expect(bot.sendMessage).toHaveBeenCalledOnce();
    expect(bot.getBot().pinChatMessage).toHaveBeenCalledWith(
      123, 100, expect.objectContaining({ disable_notification: true }),
    );
  });

  it('start() starts periodic updates', async () => {
    const bot = makeMockBot();
    const sm = makeMockSessionManager();
    const dash = new PinnedDashboard(bot, sm, 'TestPC');

    await dash.start();
    // First call from start → createOrUpdate
    expect(bot.sendMessage).toHaveBeenCalledTimes(1);

    // Advance 30 seconds — should trigger an update (editMessageText)
    await vi.advanceTimersByTimeAsync(30_000);
    expect(bot.getBot().editMessageText).toHaveBeenCalled();
  });

  it('stop() clears the interval', async () => {
    const bot = makeMockBot();
    const sm = makeMockSessionManager();
    const dash = new PinnedDashboard(bot, sm, 'TestPC');

    await dash.start();
    dash.stop();

    bot.getBot().editMessageText.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(bot.getBot().editMessageText).not.toHaveBeenCalled();
  });

  it('dispose() stops and clears messageId', async () => {
    const bot = makeMockBot();
    const sm = makeMockSessionManager();
    const dash = new PinnedDashboard(bot, sm, 'TestPC');

    await dash.start();
    dash.dispose();

    // After dispose, update() should call createOrUpdate (sendMessage) since messageId is null
    bot.sendMessage.mockClear();
    await dash.update();
    expect(bot.sendMessage).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// update()
// ---------------------------------------------------------------------------

describe('PinnedDashboard update()', () => {
  it('edits existing message when messageId is set', async () => {
    const bot = makeMockBot();
    const sm = makeMockSessionManager();
    const dash = new PinnedDashboard(bot, sm, 'TestPC');

    await dash.start(); // sets messageId to 100
    await dash.update();

    expect(bot.getBot().editMessageText).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ chat_id: 123, message_id: 100 }),
    );
  });

  it('creates new message when no messageId', async () => {
    const bot = makeMockBot();
    const sm = makeMockSessionManager();
    const dash = new PinnedDashboard(bot, sm, 'TestPC');

    // update() without start() → no messageId → falls back to createOrUpdate
    await dash.update();
    expect(bot.sendMessage).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Dashboard text rendering
// ---------------------------------------------------------------------------

describe('PinnedDashboard text rendering', () => {
  it('includes instance name in header', async () => {
    const bot = makeMockBot();
    const sm = makeMockSessionManager();
    const dash = new PinnedDashboard(bot, sm, 'Home PC');

    await dash.start();

    const text: string = bot.sendMessage.mock.calls[0][0];
    expect(text).toContain('Helm');
    expect(text).toContain('Helm - steer your fleet of agents');
    expect(text).toContain('Home PC');
  });

  it('shows "No active sessions" when empty', async () => {
    const bot = makeMockBot();
    const sm = makeMockSessionManager([]);
    const dash = new PinnedDashboard(bot, sm, 'TestPC');

    await dash.start();

    const text: string = bot.sendMessage.mock.calls[0][0];
    expect(text).toContain('No active sessions');
  });

  it('groups sessions by directory', async () => {
    const sessions = [
      makeSession({ id: 's1', name: 'alpha', workingDir: '/projects/app', state: 'idle' }),
      makeSession({ id: 's2', name: 'beta', workingDir: '/projects/app', state: 'implementing' }),
      makeSession({ id: 's3', name: 'gamma', workingDir: '/work/other', state: 'completed' }),
    ];
    const bot = makeMockBot();
    const sm = makeMockSessionManager(sessions);
    const dash = new PinnedDashboard(bot, sm, 'TestPC');

    await dash.start();

    const text: string = bot.sendMessage.mock.calls[0][0];
    // Directory basenames
    expect(text).toContain('app');
    expect(text).toContain('other');
    // Session names
    expect(text).toContain('alpha');
    expect(text).toContain('beta');
    expect(text).toContain('gamma');
  });

  it('shows correct state emoji', async () => {
    const sessions = [
      makeSession({ id: 's1', name: 'a', state: 'implementing', workingDir: '/x' }),
      makeSession({ id: 's2', name: 'b', state: 'planning', workingDir: '/x' }),
      makeSession({ id: 's3', name: 'c', state: 'completed', workingDir: '/x' }),
      makeSession({ id: 's4', name: 'd', state: 'waiting', workingDir: '/x' }),
      makeSession({ id: 's5', name: 'e', state: 'idle', workingDir: '/x' }),
    ];
    const bot = makeMockBot();
    const sm = makeMockSessionManager(sessions);
    const dash = new PinnedDashboard(bot, sm, 'TestPC');

    await dash.start();

    const text: string = bot.sendMessage.mock.calls[0][0];
    expect(text).toContain('🔨');
    expect(text).toContain('📐');
    expect(text).toContain('🎉');
    expect(text).toContain('⏳');
    expect(text).toContain('💤');
  });

  it('setInstanceName changes the header', async () => {
    const bot = makeMockBot();
    const sm = makeMockSessionManager();
    const dash = new PinnedDashboard(bot, sm, 'Old Name');

    dash.setInstanceName('New Name');
    await dash.start();

    const text: string = bot.sendMessage.mock.calls[0][0];
    expect(text).toContain('New Name');
    expect(text).not.toContain('Old Name');
  });
});

// ---------------------------------------------------------------------------
// Dashboard keyboard
// ---------------------------------------------------------------------------

describe('PinnedDashboard keyboard', () => {
  it('includes Talk button per session (sorted by state: implementing first)', async () => {
    const sessions = [
      makeSession({ id: 's1', name: 'alpha', workingDir: '/projects/app', state: 'idle' }),
      makeSession({ id: 's2', name: 'beta', workingDir: '/projects/app', state: 'implementing' }),
    ];
    const bot = makeMockBot();
    const sm = makeMockSessionManager(sessions);
    const dash = new PinnedDashboard(bot, sm, 'TestPC');

    await dash.start();

    const replyMarkup = bot.sendMessage.mock.calls[0][1] as any;
    const keyboard = replyMarkup.reply_markup.inline_keyboard as any[][];
    // Flatten all buttons and check for Talk buttons with correct session IDs
    const allButtons = keyboard.flat();
    const talkButtons = allButtons.filter((b: any) => b.text === '💬 Talk');
    expect(talkButtons).toHaveLength(2);
    // s2 (implementing) should come first due to state-based sorting
    expect(talkButtons[0].callback_data).toBe('talk:s2');
    expect(talkButtons[1].callback_data).toBe('talk:s1');
  });

  it('includes static action buttons (Sessions, Spawn, Status, Close All)', async () => {
    const bot = makeMockBot();
    const sm = makeMockSessionManager();
    const dash = new PinnedDashboard(bot, sm, 'TestPC');

    await dash.start();

    const replyMarkup = bot.sendMessage.mock.calls[0][1] as any;
    const keyboard = replyMarkup.reply_markup.inline_keyboard as any[][];
    const allButtons = keyboard.flat();
    const buttonTexts = allButtons.map((b: any) => b.text);
    expect(buttonTexts).toContain('📂 Sessions');
    expect(buttonTexts).toContain('➕ Spawn');
    expect(buttonTexts).toContain('📊 Status');
    expect(buttonTexts).toContain('🗑️ Close All');
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('PinnedDashboard error handling', () => {
  it('ignores "message is not modified" error', async () => {
    const bot = makeMockBot();
    bot.getBot().editMessageText.mockRejectedValue(new Error('message is not modified'));
    const sm = makeMockSessionManager();
    const dash = new PinnedDashboard(bot, sm, 'TestPC');

    await dash.start();
    // Should not throw
    await expect(dash.update()).resolves.toBeUndefined();
  });

  it('resets messageId on "message to edit not found"', async () => {
    const bot = makeMockBot();
    bot.getBot().editMessageText.mockRejectedValue(new Error('message to edit not found'));
    const sm = makeMockSessionManager();
    const dash = new PinnedDashboard(bot, sm, 'TestPC');

    await dash.start();

    // First update hits the error and resets messageId
    await dash.update();

    // Next update should call sendMessage (createOrUpdate) since messageId was reset
    bot.sendMessage.mockClear();
    await dash.update();
    expect(bot.sendMessage).toHaveBeenCalled();
  });
});
