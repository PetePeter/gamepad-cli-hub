import { describe, expect, it, vi } from 'vitest';
import { deliverPromptSequenceToSession } from '../src/session/sequence-delivery.js';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeMocks(overrides?: { submitSuffix?: string; cliType?: string }) {
  const submitSuffix = overrides?.submitSuffix ?? '\\r';
  const cliType = overrides?.cliType ?? 'claude-code';
  const ptyManager = {
    write: vi.fn(),
    deliverText: vi.fn(() => Promise.resolve()),
    has: vi.fn(() => true),
  };
  const sessionManager = {
    getSession: vi.fn(() => ({ id: 's1', name: 'Test', cliType })),
  };
  const configLoader = {
    getCliTypeEntry: vi.fn(() => ({ submitSuffix })),
  };
  return { ptyManager, sessionManager, configLoader };
}

function deliver(input: string, mocks: ReturnType<typeof makeMocks>, opts?: { rawInput?: boolean; impliedSubmit?: boolean }) {
  return deliverPromptSequenceToSession({
    sessionId: 's1',
    text: input,
    ptyManager: mocks.ptyManager as any,
    sessionManager: mocks.sessionManager as any,
    configLoader: mocks.configLoader as any,
    ...opts,
  });
}

describe('deliverPromptSequenceToSession', () => {
  it('plain text delivers via deliverText and submits via write with \\r', async () => {
    const mocks = makeMocks();

    await deliver('hello', mocks);

    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'hello');
    expect(mocks.ptyManager.write).toHaveBeenCalledWith('s1', '\r');
  });

  it('{NoSend} suppresses implied submit', async () => {
    const mocks = makeMocks();

    // rawInput=true so {NoSend} is parsed as a token, not escaped to literal text
    await deliver('hello{NoSend}', mocks, { rawInput: true });

    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'hello');
    expect(mocks.ptyManager.write).not.toHaveBeenCalledWith('s1', '\r');
  });

  it('{Send} submits at token position with no extra final submit', async () => {
    const mocks = makeMocks();

    await deliver('part1{Send}part2', mocks, { rawInput: true });

    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'part1');
    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'part2');
    // Only one submit for the explicit {Send}, no final implied submit
    const submitCalls = mocks.ptyManager.write.mock.calls.filter(
      (c: any[]) => c[0] === 's1' && c[1] === '\r',
    );
    expect(submitCalls).toHaveLength(1);
  });

  it('{Wait 500} delays between actions', async () => {
    vi.useFakeTimers();
    const mocks = makeMocks();

    const promise = deliver('before{Wait 500}after', mocks, { rawInput: true });

    // 'before' is delivered immediately, then the wait starts
    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'before');
    expect(mocks.ptyManager.deliverText).not.toHaveBeenCalledWith('s1', 'after');

    // Advance past the 500ms wait
    await vi.advanceTimersByTimeAsync(500);
    await promise;

    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'after');
    expect(mocks.ptyManager.write).toHaveBeenCalledWith('s1', '\r');

    vi.useRealTimers();
  });

  it('respects recipient CLI submit suffix (bash \\n)', async () => {
    const mocks = makeMocks({ submitSuffix: '\\n' });

    await deliver('hello', mocks);

    expect(mocks.ptyManager.write).toHaveBeenCalledWith('s1', '\n');
  });

  it('rawInput=true passes braces through to the sequence parser unescaped', async () => {
    const mocks = makeMocks();

    // With rawInput=true, the sequence parser receives raw braces.
    // For {"type":"test"}, the entire content between { and } is consumed
    // as a single token by the parser. Since it's not a recognized token,
    // it becomes a key action that produces no PTY data. The result is
    // no text delivered (only the implied submit fires).
    await deliver('{"type":"test"}', mocks, { rawInput: true });

    // The entire JSON was consumed as one unrecognized token -- no text delivered
    expect(mocks.ptyManager.deliverText).not.toHaveBeenCalled();
    // Only the implied submit fires (sawAction=true, submitted=false)
    expect(mocks.ptyManager.write).toHaveBeenCalledWith('s1', '\r');
  });

  it('rawInput=false (default) escapes braces so JSON is preserved as text', async () => {
    const mocks = makeMocks();

    // Braces get escaped to {{ and }} before parsing.
    // Parser treats {{ and }} as literal braces, so deliverText
    // receives the original text with braces preserved.
    await deliver('{"key":"value"}', mocks);

    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', '{"key":"value"}');
  });

  it('throws when session not found', async () => {
    const mocks = makeMocks();
    mocks.sessionManager.getSession.mockReturnValue(null);

    await expect(deliver('hello', mocks)).rejects.toThrow('Session not found');
  });

  it('multiple {Send} tokens submit at each position', async () => {
    const mocks = makeMocks();

    await deliver('a{Send}b{Send}c', mocks, { rawInput: true });

    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'a');
    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'b');
    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'c');

    // Two explicit {Send} submissions, no final implied submit
    const submitCalls = mocks.ptyManager.write.mock.calls.filter(
      (c: any[]) => c[0] === 's1' && c[1] === '\r',
    );
    expect(submitCalls).toHaveLength(2);
  });

  it('{Enter} behaves same as {Send}', async () => {
    const mocks = makeMocks();

    await deliver('hello{Enter}world', mocks, { rawInput: true });

    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'hello');
    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'world');

    // One submit for {Enter}, no final implied submit
    const submitCalls = mocks.ptyManager.write.mock.calls.filter(
      (c: any[]) => c[0] === 's1' && c[1] === '\r',
    );
    expect(submitCalls).toHaveLength(1);
  });
});
