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

function deliver(input: string, mocks: ReturnType<typeof makeMocks>, opts?: { impliedSubmit?: boolean }) {
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
  it('plain text delivers via deliverText and submits via deliverText with submitSuffix', async () => {
    const mocks = makeMocks();

    await deliver('hello', mocks);

    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'hello');
    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', '', { submitSuffix: '\r' });
    expect(mocks.ptyManager.write).not.toHaveBeenCalledWith('s1', '\r');
  });

  it('{NoSend} suppresses implied submit', async () => {
    const mocks = makeMocks();

    // {NoSend} is a recognized token — smart escaping preserves it
    await deliver('hello{NoSend}', mocks);

    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'hello');
    expect(mocks.ptyManager.deliverText).not.toHaveBeenCalledWith('s1', '', { submitSuffix: '\r' });
  });

  it('{Send} submits at token position with no extra final submit', async () => {
    const mocks = makeMocks();

    // {Send} is a recognized token — smart escaping preserves it
    await deliver('part1{Send}part2', mocks);

    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'part1');
    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'part2');
    // Only one submit for the explicit {Send}, no final implied submit
    const submitCalls = mocks.ptyManager.deliverText.mock.calls.filter(
      (c: any[]) => c[0] === 's1' && c[2]?.submitSuffix === '\r',
    );
    expect(submitCalls).toHaveLength(1);
  });

  it('{Wait 500} delays between actions', async () => {
    vi.useFakeTimers();
    const mocks = makeMocks();

    const promise = deliver('before{Wait 500}after', mocks);

    // 'before' is delivered immediately, then the wait starts
    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'before');
    expect(mocks.ptyManager.deliverText).not.toHaveBeenCalledWith('s1', 'after');

    // Advance past the 500ms wait
    await vi.advanceTimersByTimeAsync(500);
    await promise;

    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'after');
    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', '', { submitSuffix: '\r' });

    vi.useRealTimers();
  });

  it('respects recipient CLI submit suffix (bash \\n)', async () => {
    const mocks = makeMocks({ submitSuffix: '\\n' });

    await deliver('hello', mocks);

    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', '', { submitSuffix: '\n' });
  });

  it('JSON braces in text are preserved as literal text', async () => {
    const mocks = makeMocks();

    // {"key":"value"} is NOT a recognized token — smart escaping escapes braces
    // to {{"key":"value"}}, which the parser renders as literal {"key":"value"}
    await deliver('{"key":"value"}', mocks);

    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', '{"key":"value"}');
  });

  it('mixed JSON and {Send} token both work correctly', async () => {
    const mocks = makeMocks();

    // JSON gets escaped, {Send} is preserved as a recognized token
    await deliver('analyze {"a":1} then {Enter}', mocks);

    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'analyze {"a":1} then ');
    expect(mocks.ptyManager.deliverText).not.toHaveBeenCalledWith('s1', 'analyze {"a":1} then \n');
  });

  it('throws when session not found', async () => {
    const mocks = makeMocks();
    mocks.sessionManager.getSession.mockReturnValue(null);

    await expect(deliver('hello', mocks)).rejects.toThrow('Session not found');
  });

  it('multiple {Send} tokens submit at each position', async () => {
    const mocks = makeMocks();

    await deliver('a{Send}b{Send}c', mocks);

    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'a');
    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'b');
    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'c');

    // Two explicit {Send} submissions, no final implied submit
    const submitCalls = mocks.ptyManager.deliverText.mock.calls.filter(
      (c: any[]) => c[0] === 's1' && c[2]?.submitSuffix === '\r',
    );
    expect(submitCalls).toHaveLength(2);
  });

  it('{Enter} behaves same as {Send}', async () => {
    const mocks = makeMocks();

    await deliver('hello{Enter}world', mocks);

    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'hello');
    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'world');

    // One submit for {Enter}, no final implied submit
    const submitCalls = mocks.ptyManager.deliverText.mock.calls.filter(
      (c: any[]) => c[0] === 's1' && c[2]?.submitSuffix === '\r',
    );
    expect(submitCalls).toHaveLength(1);
  });

  it('combo tokens like {Ctrl+C} are preserved and executed', async () => {
    const mocks = makeMocks();

    await deliver('{Ctrl+C}', mocks);

    // Ctrl+C maps to \x03 via comboToPtySequence
    expect(mocks.ptyManager.write).toHaveBeenCalledWith('s1', '\x03');
  });

  it('modifier tokens like {Ctrl Down} are preserved', async () => {
    const mocks = makeMocks();

    await deliver('{Ctrl Down}text{Ctrl Up}', mocks);

    // modifier actions produce no PTY data (actionToPtyData returns null)
    // but text 'text' should be delivered
    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'text');
  });

  it('F-key tokens are preserved', async () => {
    const mocks = makeMocks();

    await deliver('{F5}', mocks);

    // F5 maps to \x1b[15~
    expect(mocks.ptyManager.write).toHaveBeenCalledWith('s1', '\x1b[15~');
  });

  it('{NoEnter} suppresses implied submit (alias for NoSend)', async () => {
    const mocks = makeMocks();

    await deliver('hello{NoEnter}', mocks);

    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'hello');
    expect(mocks.ptyManager.deliverText).not.toHaveBeenCalledWith('s1', '', { submitSuffix: '\r' });
  });

  it('unrecognized brace groups like {variable} are escaped to literal text', async () => {
    const mocks = makeMocks();

    await deliver('value: {variable} end', mocks);

    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'value: {variable} end');
  });

  it('text with no braces passes through unchanged', async () => {
    const mocks = makeMocks();

    await deliver('plain text no braces', mocks);

    expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'plain text no braces');
  });

  describe('nested literal braces', () => {
    it('preserves nested JSON like {"a":{"b":1}}', async () => {
      const mocks = makeMocks();
      await deliver('{"a":{"b":1}}', mocks);
      expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', '{"a":{"b":1}}');
    });

    it('preserves code with nested object literals', async () => {
      const mocks = makeMocks();
      await deliver('function x() { return { a: 1 }; }', mocks);
      expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'function x() { return { a: 1 }; }');
    });

    it('preserves HELM_MSG-like nested JSON envelope', async () => {
      const mocks = makeMocks();
      const envelope = '[HELM_MSG] {"type":"reply","sessionId":"s1","data":{"key":"val"}} [/HELM_MSG]';
      await deliver(envelope, mocks);
      expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', envelope);
    });

    it('preserves nested JSON and still honors trailing {NoSend}', async () => {
      const mocks = makeMocks();
      await deliver('{"a":{"b":1}}{NoSend}', mocks);
      expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', '{"a":{"b":1}}');
      expect(mocks.ptyManager.deliverText).not.toHaveBeenCalledWith('s1', '', { submitSuffix: '\r' });
    });

    it('preserves nested JSON and still honors trailing {Send}', async () => {
      const mocks = makeMocks();
      await deliver('{"a":{"b":1}}{Send}more text', mocks);
      expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', '{"a":{"b":1}}');
      expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'more text');
      const submitCalls = mocks.ptyManager.deliverText.mock.calls.filter(
        (c: any[]) => c[0] === 's1' && c[2]?.submitSuffix === '\r',
      );
      expect(submitCalls).toHaveLength(1);
    });

    it('preserves deeply nested JSON (3 levels)', async () => {
      const mocks = makeMocks();
      await deliver('{"a":{"b":{"c":1}}}', mocks);
      expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', '{"a":{"b":{"c":1}}}');
    });

    it('handles mixed text, nested JSON, and recognized tokens', async () => {
      const mocks = makeMocks();
      await deliver('check {"config":{"debug":true}} and {Enter}continue', mocks);
      expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'check {"config":{"debug":true}} and ');
      expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'continue');
    });
  });

  describe('submit routing', () => {
    it('implied submit routes through deliverText with submitSuffix option, not write', async () => {
      const mocks = makeMocks();
      await deliver('hello', mocks);

      expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', '', { submitSuffix: '\r' });
      expect(mocks.ptyManager.write).not.toHaveBeenCalledWith('s1', '\r');
    });

    it('no submit when impliedSubmit is false and no explicit {Send}', async () => {
      const mocks = makeMocks();
      await deliver('hello', mocks, { impliedSubmit: false });

      expect(mocks.ptyManager.deliverText).toHaveBeenCalledWith('s1', 'hello');
      expect(mocks.ptyManager.deliverText).not.toHaveBeenCalledWith('s1', '', { submitSuffix: '\r' });
      expect(mocks.ptyManager.write).not.toHaveBeenCalledWith('s1', '\r');
    });

    it('explicit {Send} submit passes correct submitSuffix per CLI config', async () => {
      const mocks = makeMocks({ submitSuffix: '\\r\\n' });
      await deliver('go{Send}', mocks);

      const submitCalls = mocks.ptyManager.deliverText.mock.calls.filter(
        (c: any[]) => c[0] === 's1' && c[2]?.submitSuffix === '\r\n',
      );
      expect(submitCalls).toHaveLength(1);
    });
  });
});
