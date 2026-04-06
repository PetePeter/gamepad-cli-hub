/**
 * ReplyKeyboard unit tests
 *
 * Tests: keyboard layout, remove keyboard, sendWithReplyKeyboard routing,
 * and reply keyboard press detection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildReplyKeyboard,
  buildRemoveKeyboard,
  sendWithReplyKeyboard,
  isReplyKeyboardPress,
} from '../src/telegram/reply-keyboard.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function makeMockBot() {
  return {
    sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
    sendToTopic: vi.fn().mockResolvedValue({ message_id: 2 }),
  } as any;
}

// ---------------------------------------------------------------------------
// buildReplyKeyboard
// ---------------------------------------------------------------------------

describe('buildReplyKeyboard', () => {
  it('returns 2×2 layout with correct labels', () => {
    const kb = buildReplyKeyboard();
    expect(kb.keyboard).toHaveLength(2);
    expect(kb.keyboard[0]).toHaveLength(2);
    expect(kb.keyboard[1]).toHaveLength(2);

    const labels = kb.keyboard.flat().map((b) => b.text);
    expect(labels).toEqual(['📂 Sessions', '📊 Status', '➕ Spawn', '❓ Help']);
  });

  it('has resize_keyboard true', () => {
    expect(buildReplyKeyboard().resize_keyboard).toBe(true);
  });

  it('has is_persistent true', () => {
    expect(buildReplyKeyboard().is_persistent).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildRemoveKeyboard
// ---------------------------------------------------------------------------

describe('buildRemoveKeyboard', () => {
  it('returns remove_keyboard true', () => {
    expect(buildRemoveKeyboard().remove_keyboard).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sendWithReplyKeyboard
// ---------------------------------------------------------------------------

describe('sendWithReplyKeyboard', () => {
  let bot: ReturnType<typeof makeMockBot>;

  beforeEach(() => {
    bot = makeMockBot();
  });

  it('sends to topic when topicId provided', async () => {
    await sendWithReplyKeyboard(bot, 'hello', { topicId: 42 });

    expect(bot.sendToTopic).toHaveBeenCalledOnce();
    expect(bot.sendToTopic).toHaveBeenCalledWith(42, 'hello', expect.any(Object));
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it('sends via sendMessage when no topicId', async () => {
    await sendWithReplyKeyboard(bot, 'hello');

    expect(bot.sendMessage).toHaveBeenCalledOnce();
    expect(bot.sendMessage).toHaveBeenCalledWith('hello', expect.any(Object));
    expect(bot.sendToTopic).not.toHaveBeenCalled();
  });

  it('attaches the keyboard markup', async () => {
    await sendWithReplyKeyboard(bot, 'hello');

    const opts = bot.sendMessage.mock.calls[0][1];
    expect(opts.reply_markup).toBeDefined();
    expect(opts.reply_markup.keyboard).toHaveLength(2);
    expect(opts.reply_markup.resize_keyboard).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isReplyKeyboardPress
// ---------------------------------------------------------------------------

describe('isReplyKeyboardPress', () => {
  it.each([
    ['📂 Sessions', 'sessions'],
    ['📊 Status', 'status'],
    ['➕ Spawn', 'spawn'],
    ['❓ Help', 'help'],
  ])('returns %j for %j', (input, expected) => {
    expect(isReplyKeyboardPress(input)).toBe(expected);
  });

  it('returns null for unknown text', () => {
    expect(isReplyKeyboardPress('random')).toBeNull();
    expect(isReplyKeyboardPress('')).toBeNull();
    expect(isReplyKeyboardPress('Sessions')).toBeNull();
  });
});
