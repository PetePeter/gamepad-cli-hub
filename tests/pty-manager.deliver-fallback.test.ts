/**
 * PtyManager.deliverText fallback — the path taken by a session that has never
 * been rendered, so RendererTextDeliverer throws and there is no xterm to ask
 * about DEC 2004. The main process must make the same framing decision itself,
 * from the PTY output stream.
 *
 * Real PtyManager and a fake PTY that records the exact write calls; the
 * assertions are about bytes and ordering, which is what the bug was about.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PtyManager } from '../src/session/pty-manager.js';
import type { PtyProcess, PtyFactory } from '../src/session/pty-manager.js';
import { SUBMIT_SETTLE_DELAY_MS } from '../src/session/delivery-context.js';

const ENABLE = '\x1b[?2004h';
const DISABLE = '\x1b[?2004l';
const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';

const MULTILINE = 'first line\nsecond line\nthird line';

function createRecordingPty(): {
  pty: PtyProcess;
  writes: string[];
  triggerData: (data: string) => void;
  triggerExit: (exitCode: number) => void;
} {
  const writes: string[] = [];
  let dataCallback: ((data: string) => void) | undefined;
  let exitCallback: ((exit: { exitCode: number; signal?: number }) => void) | undefined;

  const pty: PtyProcess = {
    pid: 4242,
    write: (data: string) => { writes.push(data); },
    resize: () => {},
    kill: () => {},
    onData: (cb) => { dataCallback = cb; },
    onExit: (cb) => { exitCallback = cb; },
  };

  return {
    pty,
    writes,
    triggerData: (data: string) => dataCallback?.(data),
    triggerExit: (exitCode: number) => exitCallback?.({ exitCode }),
  };
}

describe('PtyManager.deliverText — no-renderer fallback', () => {
  let mock: ReturnType<typeof createRecordingPty>;
  let manager: PtyManager;
  /** PTYs handed out by later spawns; empty means "the default mock". */
  let respawnQueue: PtyProcess[];

  beforeEach(() => {
    vi.useFakeTimers();
    mock = createRecordingPty();
    respawnQueue = [];
    const factory: PtyFactory = { spawn: () => respawnQueue.shift() ?? mock.pty };
    manager = new PtyManager(factory);
    // Empty command so the spawn itself writes nothing and `writes` holds
    // only what delivery produced.
    manager.spawn({ sessionId: 's1', command: '' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Run a delivery to completion, driving the settle delay off the fake clock. */
  async function deliver(text: string, options?: Parameters<PtyManager['deliverText']>[2]): Promise<void> {
    const done = manager.deliverText('s1', text, options);
    await vi.advanceTimersByTimeAsync(SUBMIT_SETTLE_DELAY_MS * 2);
    await done;
  }

  it('frames multi-line text once the CLI has announced bracketed paste', async () => {
    mock.triggerData(`claude ready${ENABLE}> `);

    await deliver(MULTILINE, { withReturn: true });

    expect(mock.writes).toEqual([`${PASTE_START}${MULTILINE}${PASTE_END}`, '\r']);
  });

  it('detects the announcement even when node-pty splits the sequence', async () => {
    mock.triggerData('claude ready \x1b[?20');
    mock.triggerData('04h> ');

    await deliver(MULTILINE, { withReturn: true });

    expect(mock.writes[0]).toBe(`${PASTE_START}${MULTILINE}${PASTE_END}`);
  });

  it('writes raw when the CLI never announced the mode (the cmd.exe case)', async () => {
    // A line-oriented shell wants each line to execute — framing would make the
    // markers land as literal text and defeat the point of pasting commands.
    await deliver(MULTILINE, { withReturn: true });

    expect(mock.writes).toEqual([MULTILINE, '\r']);
  });

  it('writes raw again after the CLI turns the mode off', async () => {
    mock.triggerData(ENABLE);
    mock.triggerData(DISABLE);

    await deliver(MULTILINE, { withReturn: true });

    expect(mock.writes).toEqual([MULTILINE, '\r']);
  });

  it('sends the submit suffix as a separate write after the settle delay', async () => {
    mock.triggerData(ENABLE);

    const done = manager.deliverText('s1', MULTILINE, { withReturn: true });
    await vi.advanceTimersByTimeAsync(0);

    // Coalescing the suffix onto the payload is the bug 5a981b3 fixed: a CR on
    // the tail of a paste block does not submit, so the text sits on the prompt.
    expect(mock.writes).toEqual([`${PASTE_START}${MULTILINE}${PASTE_END}`]);

    await vi.advanceTimersByTimeAsync(SUBMIT_SETTLE_DELAY_MS);
    await done;

    expect(mock.writes).toEqual([`${PASTE_START}${MULTILINE}${PASTE_END}`, '\r']);
  });

  it('keeps the suffix separate for the unframed case too', async () => {
    const done = manager.deliverText('s1', MULTILINE, { submitSuffix: '\r' });
    await vi.advanceTimersByTimeAsync(0);

    expect(mock.writes).toEqual([MULTILINE]);

    await vi.advanceTimersByTimeAsync(SUBMIT_SETTLE_DELAY_MS);
    await done;

    expect(mock.writes).toEqual([MULTILINE, '\r']);
  });

  it('honours a configured submit suffix over the default CR', async () => {
    mock.triggerData(ENABLE);

    await deliver(MULTILINE, { submitSuffix: '\x1b\r' });

    expect(mock.writes).toEqual([`${PASTE_START}${MULTILINE}${PASTE_END}`, '\x1b\r']);
  });

  it('delivers text with no suffix when neither withReturn nor submitSuffix is set', async () => {
    mock.triggerData(ENABLE);

    await deliver(MULTILINE);

    expect(mock.writes).toEqual([`${PASTE_START}${MULTILINE}${PASTE_END}`]);
  });

  it('sends a submit-only delivery immediately, with no framing and no settle', async () => {
    mock.triggerData(ENABLE);

    const done = manager.deliverText('s1', '', { submitSuffix: '\r' });
    await vi.advanceTimersByTimeAsync(0);
    await done;

    expect(mock.writes).toEqual(['\r']);
  });

  it('frames single-line text too when the mode is on', async () => {
    // The framing decision is about the CLI's announced mode, not the payload
    // shape — a bracketing CLI treats a wrapped single line as a paste, which is
    // what the renderer path does as well.
    mock.triggerData(ENABLE);

    await deliver('hello', { withReturn: true });

    expect(mock.writes).toEqual([`${PASTE_START}hello${PASTE_END}`, '\r']);
  });

  it('falls back after the preferred handler fails, using the tracked mode', async () => {
    mock.triggerData(ENABLE);
    manager.setTextDeliveryHandler(async () => {
      throw new Error('Renderer delivery unavailable');
    });

    await deliver(MULTILINE, { withReturn: true });

    expect(mock.writes).toEqual([`${PASTE_START}${MULTILINE}${PASTE_END}`, '\r']);
  });

  it('does not leak the mode into a new session reusing the id after exit', async () => {
    mock.triggerData(ENABLE);
    mock.triggerExit(0);

    const respawn = createRecordingPty();
    respawnQueue.push(respawn.pty);
    manager.spawn({ sessionId: 's1', command: '' });

    const done = manager.deliverText('s1', MULTILINE, { withReturn: true });
    await vi.advanceTimersByTimeAsync(SUBMIT_SETTLE_DELAY_MS * 2);
    await done;

    expect(respawn.writes).toEqual([MULTILINE, '\r']);
  });

  it('does not leak the mode into a new session reusing the id after kill', async () => {
    mock.triggerData(ENABLE);
    manager.kill('s1');

    const respawn = createRecordingPty();
    respawnQueue.push(respawn.pty);
    manager.spawn({ sessionId: 's1', command: '' });

    const done = manager.deliverText('s1', MULTILINE, { withReturn: true });
    await vi.advanceTimersByTimeAsync(SUBMIT_SETTLE_DELAY_MS * 2);
    await done;

    expect(respawn.writes).toEqual([MULTILINE, '\r']);
  });

  it('killAll clears tracked modes', async () => {
    mock.triggerData(ENABLE);
    manager.killAll();

    const respawn = createRecordingPty();
    respawnQueue.push(respawn.pty);
    manager.spawn({ sessionId: 's1', command: '' });

    const done = manager.deliverText('s1', MULTILINE, { withReturn: true });
    await vi.advanceTimersByTimeAsync(SUBMIT_SETTLE_DELAY_MS * 2);
    await done;

    expect(respawn.writes).toEqual([MULTILINE, '\r']);
  });
});
