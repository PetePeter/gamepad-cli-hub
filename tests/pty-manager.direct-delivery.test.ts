/**
 * PtyManager.deliverText — default `pty` delivery, written in the main process.
 *
 * The bytes used to go main -> IPC -> renderer -> IPC -> main and be written by
 * the class they started in. The renderer's only contributions were the DEC 2004
 * bit (BracketedPasteTracker now derives that from the PTY output stream) and the
 * readiness budget (ported here). Removing the trip removes the 3s request
 * timeout, the raw fallback, and the duplicate-write ambiguity with it.
 *
 * Modes other than the default still need the renderer — per-character pacing,
 * robotjs typing, clipboard focus — so they keep routing through the handler.
 *
 * Real PtyManager, fake PTY recording exact writes. The assertions are about
 * bytes and ordering, which is what the head-loss bug was about.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PtyManager, type PtyFactory, type PtyProcess } from '../src/session/pty-manager.js';
import {
  BRACKETED_PASTE_POLL_MS,
  BRACKETED_PASTE_READY_BUDGET_MS,
  SUBMIT_SETTLE_DELAY_MS,
} from '../src/session/delivery-context.js';

const ENABLE = '\x1b[?2004h';
const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';
const MULTILINE = 'first line\nsecond line\nthird line';

function createRecordingPty() {
  const writes: string[] = [];
  let dataCallback: ((data: string) => void) | undefined;
  let exitCallback: ((exit: { exitCode: number; signal?: number }) => void) | undefined;

  const pty: PtyProcess = {
    pid: 7,
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

describe('PtyManager.deliverText — default pty delivery stays in main', () => {
  let mock: ReturnType<typeof createRecordingPty>;
  let manager: PtyManager;
  /** Every call the renderer delivery handler received. Must stay empty for default pty. */
  let handlerCalls: Array<{ sessionId: string; text: string }>;

  beforeEach(() => {
    vi.useFakeTimers();
    mock = createRecordingPty();
    const factory: PtyFactory = { spawn: () => mock.pty };
    manager = new PtyManager(factory);
    manager.spawn({ sessionId: 's1', command: '' });

    handlerCalls = [];
    manager.setTextDeliveryHandler(async (sessionId, text) => {
      handlerCalls.push({ sessionId, text });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Drive a delivery to completion, covering the readiness budget and the settle delay. */
  async function deliver(text: string, options?: Parameters<PtyManager['deliverText']>[2]): Promise<void> {
    const done = manager.deliverText('s1', text, options);
    await vi.advanceTimersByTimeAsync(BRACKETED_PASTE_READY_BUDGET_MS + SUBMIT_SETTLE_DELAY_MS * 2);
    await done;
  }

  it('never asks the renderer when no paste mode is configured', async () => {
    mock.triggerData(ENABLE);

    await deliver(MULTILINE, { withReturn: true });

    expect(handlerCalls).toEqual([]);
    expect(mock.writes).toEqual([`${PASTE_START}${MULTILINE}${PASTE_END}`, '\r']);
  });

  it('never asks the renderer when the configured mode is the default pty', async () => {
    manager.setPasteModeResolver(() => 'pty');
    mock.triggerData(ENABLE);

    await deliver(MULTILINE, { withReturn: true });

    expect(handlerCalls).toEqual([]);
    expect(mock.writes).toEqual([`${PASTE_START}${MULTILINE}${PASTE_END}`, '\r']);
  });

  it('produces the exact child-visible byte order for a multi-line payload', async () => {
    mock.triggerData(ENABLE);

    const done = manager.deliverText('s1', MULTILINE, { withReturn: true });
    await vi.advanceTimersByTimeAsync(0);

    // The payload lands as one framed paste — no per-line writes, so a TUI line
    // editor cannot submit it a fragment at a time.
    expect(mock.writes).toEqual([`${PASTE_START}${MULTILINE}${PASTE_END}`]);

    await vi.advanceTimersByTimeAsync(SUBMIT_SETTLE_DELAY_MS);
    await done;

    // ...and the submit arrives as its own later write, never concatenated.
    expect(mock.writes).toEqual([`${PASTE_START}${MULTILINE}${PASTE_END}`, '\r']);
    expect(mock.writes.join('')).toBe(`${PASTE_START}${MULTILINE}${PASTE_END}\r`);
  });

  it('writes raw when the CLI never announced the mode, even with a handler present', async () => {
    // cmd.exe is a configured CLI type and never announces DEC 2004. Framing
    // would type the markers out literally, and line-by-line execution is the
    // point of pasting a block of shell commands.
    await deliver(MULTILINE, { withReturn: true });

    expect(handlerCalls).toEqual([]);
    expect(mock.writes).toEqual([MULTILINE, '\r']);
  });
});

describe('PtyManager.deliverText — non-default paste modes still need the renderer', () => {
  let mock: ReturnType<typeof createRecordingPty>;
  let manager: PtyManager;
  let handlerCalls: Array<{ sessionId: string; text: string }>;

  beforeEach(() => {
    vi.useFakeTimers();
    mock = createRecordingPty();
    const factory: PtyFactory = { spawn: () => mock.pty };
    manager = new PtyManager(factory);
    manager.spawn({ sessionId: 's1', command: '' });
    handlerCalls = [];
    manager.setTextDeliveryHandler(async (sessionId, text) => {
      handlerCalls.push({ sessionId, text });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['ptyindividual', 'sendkeys', 'sendkeysindividual', 'clippaste'])(
    'routes %s through the renderer handler and writes nothing itself',
    async (mode) => {
      manager.setPasteModeResolver(() => mode);

      await manager.deliverText('s1', MULTILINE, { withReturn: true });

      expect(handlerCalls).toEqual([{ sessionId: 's1', text: MULTILINE }]);
      expect(mock.writes).toEqual([]);
    },
  );

  it('still falls back to a tracked-mode write when the renderer refuses', async () => {
    // Focus-sensitive modes reject background delivery in RendererTextDeliverer.
    // That rejection reaching the fallback is pre-existing behaviour and is left
    // alone here; what matters is that the attempt went to the renderer first.
    manager.setPasteModeResolver(() => 'clippaste');
    manager.setTextDeliveryHandler(async () => {
      throw new Error('Background delivery cannot use focus-sensitive pasteMode=clippaste');
    });
    mock.triggerData(ENABLE);

    const done = manager.deliverText('s1', MULTILINE, { withReturn: true });
    await vi.advanceTimersByTimeAsync(BRACKETED_PASTE_READY_BUDGET_MS + SUBMIT_SETTLE_DELAY_MS * 2);
    await done;

    expect(mock.writes).toEqual([`${PASTE_START}${MULTILINE}${PASTE_END}`, '\r']);
  });
});

describe('PtyManager.deliverText — bracketed-paste readiness budget', () => {
  let mock: ReturnType<typeof createRecordingPty>;
  let manager: PtyManager;

  beforeEach(() => {
    vi.useFakeTimers();
    mock = createRecordingPty();
    const factory: PtyFactory = { spawn: () => mock.pty };
    manager = new PtyManager(factory);
    manager.spawn({ sessionId: 's1', command: '' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for a freshly spawned CLI to announce the mode, then frames', async () => {
    // A CLI turns DEC 2004 on a beat after its first prompt renders. Delivery
    // landing inside that window is the "new session shows only the last line"
    // bug; the renderer spent this same budget before framing.
    const done = manager.deliverText('s1', MULTILINE, { withReturn: true });

    await vi.advanceTimersByTimeAsync(BRACKETED_PASTE_POLL_MS * 3);
    expect(mock.writes).toEqual([]);

    mock.triggerData(`ready${ENABLE}> `);
    await vi.advanceTimersByTimeAsync(BRACKETED_PASTE_POLL_MS * 2 + SUBMIT_SETTLE_DELAY_MS);
    await done;

    expect(mock.writes).toEqual([`${PASTE_START}${MULTILINE}${PASTE_END}`, '\r']);
  });

  it('gives up after the budget and writes raw', async () => {
    const done = manager.deliverText('s1', MULTILINE, { withReturn: true });

    // The deadline is checked after a poll sleep, so the wait can overshoot the
    // budget by up to one poll interval before it gives up.
    await vi.advanceTimersByTimeAsync(
      BRACKETED_PASTE_READY_BUDGET_MS + BRACKETED_PASTE_POLL_MS + SUBMIT_SETTLE_DELAY_MS,
    );
    await done;

    expect(mock.writes).toEqual([MULTILINE, '\r']);
  });

  it('does not spend the budget on single-line text', async () => {
    const done = manager.deliverText('s1', 'hello', { withReturn: true });

    // Only the settle delay elapses — a single line has no embedded newline for
    // a line editor to mis-read, so there is nothing to wait to protect.
    await vi.advanceTimersByTimeAsync(SUBMIT_SETTLE_DELAY_MS);
    await done;

    expect(mock.writes).toEqual(['hello', '\r']);
  });

  it('does not spend the budget when the mode is already on', async () => {
    mock.triggerData(ENABLE);

    const done = manager.deliverText('s1', MULTILINE, { withReturn: true });
    await vi.advanceTimersByTimeAsync(SUBMIT_SETTLE_DELAY_MS);
    await done;

    expect(mock.writes).toEqual([`${PASTE_START}${MULTILINE}${PASTE_END}`, '\r']);
  });

  it('abandons the wait when the PTY exits, rather than polling a dead session', async () => {
    const done = manager.deliverText('s1', MULTILINE, { withReturn: true });

    await vi.advanceTimersByTimeAsync(BRACKETED_PASTE_POLL_MS * 2);
    mock.triggerExit(0);

    // Well short of the full budget: the wait must notice the session is gone.
    await vi.advanceTimersByTimeAsync(BRACKETED_PASTE_POLL_MS * 2 + SUBMIT_SETTLE_DELAY_MS);
    await done;

    // Nothing is written to a dead PTY, and no timer is left running.
    expect(mock.writes).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
