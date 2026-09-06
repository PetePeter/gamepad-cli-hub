/**
 * Regression: app shutdown must not look like deliberate session closure.
 *
 * cleanup() kills every PTY, and node-pty delivers its exit callback
 * asynchronously — so the 'exit' listeners were still firing during quit and
 * force-removing sessions, which persisted the removal and pushed live work
 * into the recycle bin. Shutdown latches a flag that suppresses the 'exit'
 * event for every listener (sessions, recycle bin, scheduled tasks), while
 * ordinary exits outside shutdown still notify.
 */

import { describe, it, expect, vi } from 'vitest';
import { PtyManager } from '../src/session/pty-manager.js';
import type { PtyProcess, PtyFactory } from '../src/session/pty-manager.js';

function createMockPty(): { pty: PtyProcess; triggerExit: (code: number) => void } {
  let exitCallback: ((exit: { exitCode: number }) => void) | undefined;
  const pty: PtyProcess = {
    pid: 1,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: () => {},
    onExit: (cb) => { exitCallback = cb as (exit: { exitCode: number }) => void; },
  };
  return { pty, triggerExit: (code) => exitCallback?.({ exitCode: code }) };
}

function managerWith(mockPty: PtyProcess): PtyManager {
  const factory: PtyFactory = { spawn: vi.fn().mockReturnValue(mockPty) };
  return new PtyManager(factory);
}

describe('PtyManager shutdown lifecycle', () => {
  it('emits exit for an ordinary PTY exit', () => {
    const mock = createMockPty();
    const manager = managerWith(mock.pty);
    const onExit = vi.fn();
    manager.on('exit', onExit);

    manager.spawn({ sessionId: 's1', command: 'echo' });
    mock.triggerExit(0);

    expect(onExit).toHaveBeenCalledWith('s1', 0);
  });

  it('suppresses exit events once shutdown has begun', () => {
    const mock = createMockPty();
    const manager = managerWith(mock.pty);
    const onExit = vi.fn();
    manager.on('exit', onExit);

    manager.spawn({ sessionId: 's1', command: 'echo' });
    manager.beginShutdown();
    manager.killAll();
    // node-pty delivers onExit asynchronously, after killAll has returned.
    mock.triggerExit(0);

    expect(onExit).not.toHaveBeenCalled();
    expect(manager.isShuttingDown()).toBe(true);
  });

  it('still releases PTY bookkeeping for an exit during shutdown', () => {
    const mock = createMockPty();
    const manager = managerWith(mock.pty);

    manager.spawn({ sessionId: 's1', command: 'echo' });
    manager.beginShutdown();
    mock.triggerExit(0);

    expect(manager.has('s1')).toBe(false);
  });
});
