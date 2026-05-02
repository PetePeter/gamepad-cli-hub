import { describe, expect, it, vi } from 'vitest';
import { executeSequenceString } from '../src/input/sequence-executor.js';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('executeSequenceString', () => {
  async function runSequence(
    input: string,
    writeToPty = vi.fn(),
    deliverText = vi.fn().mockResolvedValue(undefined),
    isCancelled?: () => boolean,
  ) {
    await executeSequenceString({
      sessionId: 's1',
      input,
      write: writeToPty,
      deliverText,
      isCancelled,
    });
    return { writeToPty, deliverText };
  }

  it('delivers plain text via deliverText', async () => {
    const writeToPty = vi.fn();
    const deliverText = vi.fn().mockResolvedValue(undefined);

    await runSequence('hello world', writeToPty, deliverText);

    expect(deliverText).toHaveBeenCalledWith('s1', 'hello world');
    expect(writeToPty).toHaveBeenCalledWith('s1', '\r');
  });

  it('parses {esc} and sends escape byte via writeToPty', async () => {
    const writeToPty = vi.fn();
    const deliverText = vi.fn().mockResolvedValue(undefined);

    await runSequence('{esc}', writeToPty, deliverText);

    expect(writeToPty).toHaveBeenCalledWith('s1', '\x1b');
    expect(writeToPty).toHaveBeenCalledWith('s1', '\r');
    expect(deliverText).not.toHaveBeenCalled();
  });

  it('buffers text then flushes before a key action', async () => {
    const writeToPty = vi.fn();
    const deliverText = vi.fn().mockResolvedValue(undefined);

    await runSequence('hello{Tab}world', writeToPty, deliverText);

    expect(deliverText).toHaveBeenCalledWith('s1', 'hello');
    expect(writeToPty).toHaveBeenCalledWith('s1', '\t');
    // 'world' gets flushed at the end
    expect(deliverText).toHaveBeenCalledWith('s1', 'world');
    expect(writeToPty).toHaveBeenCalledWith('s1', '\r');
  });

  it('keeps raw newlines as text', async () => {
    const deliverText = vi.fn().mockResolvedValue(undefined);
    const writeToPty = vi.fn();

    await runSequence('submit this\n', writeToPty, deliverText);

    expect(deliverText).toHaveBeenCalledWith('s1', 'submit this\n');
    expect(writeToPty).toHaveBeenCalledWith('s1', '\r');
  });

  it('handles {Wait N} with a delay', async () => {
    const writeToPty = vi.fn();
    const deliverText = vi.fn().mockResolvedValue(undefined);

    const start = Date.now();
    await runSequence('a{Wait 100}b', writeToPty, deliverText);
    const elapsed = Date.now() - start;

    expect(deliverText).toHaveBeenCalledWith('s1', 'a');
    expect(deliverText).toHaveBeenCalledWith('s1', 'b');
    expect(writeToPty).toHaveBeenCalledWith('s1', '\r');
    expect(elapsed).toBeGreaterThanOrEqual(80);
  });

  it('handles {Ctrl+C} combo', async () => {
    const writeToPty = vi.fn();
    const deliverText = vi.fn().mockResolvedValue(undefined);

    await runSequence('{Ctrl+C}', writeToPty, deliverText);

    expect(writeToPty).toHaveBeenCalledWith('s1', '\x03');
    expect(writeToPty).toHaveBeenCalledWith('s1', '\r');
  });

  it('stops early when isCancelled returns true', async () => {
    let cancelled = false;
    const writeToPty = vi.fn();
    const deliverText = vi.fn().mockImplementation(async () => {
      cancelled = true;
    });

    await runSequence('first{esc}{Wait 10}second', writeToPty, deliverText, () => cancelled);

    // 'first' flushed (sets cancelled), {esc} still executes in same iteration,
    // but {Wait} checks isCancelled at top of next iteration and breaks
    expect(deliverText).toHaveBeenCalledWith('s1', 'first');
    expect(writeToPty).toHaveBeenCalledWith('s1', '\x1b');
    // 'second' should NOT be delivered (cancelled before it)
    expect(deliverText).not.toHaveBeenCalledWith('s1', 'second');
  });

  it('handles {Send} which flushes then writes \\r directly', async () => {
    const writeToPty = vi.fn();
    const deliverText = vi.fn().mockResolvedValue(undefined);

    await runSequence('prompt{Send}', writeToPty, deliverText);

    expect(deliverText).toHaveBeenCalledWith('s1', 'prompt');
    expect(writeToPty).toHaveBeenCalledWith('s1', '\r');
  });

  it('handles mixed sequence: text + {esc} + text + {Enter}', async () => {
    const writeToPty = vi.fn();
    const deliverText = vi.fn().mockResolvedValue(undefined);

    await runSequence('clear{esc}npm test{Enter}', writeToPty, deliverText);

    expect(deliverText).toHaveBeenCalledWith('s1', 'clear');
    expect(writeToPty).toHaveBeenCalledWith('s1', '\x1b');
    expect(deliverText).toHaveBeenCalledWith('s1', 'npm test');
    expect(writeToPty).toHaveBeenCalledWith('s1', '\r');
  });

  it('does nothing for empty string', async () => {
    const writeToPty = vi.fn();
    const deliverText = vi.fn().mockResolvedValue(undefined);

    await runSequence('', writeToPty, deliverText);

    expect(deliverText).not.toHaveBeenCalled();
    expect(writeToPty).not.toHaveBeenCalled();
  });
});
