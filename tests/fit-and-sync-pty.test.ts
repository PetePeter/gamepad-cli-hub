import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fitAndSyncPty } from '../renderer/terminal/fit-and-sync-pty.js';

describe('fitAndSyncPty', () => {
  const originalRaf = globalThis.requestAnimationFrame;

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    }) as typeof requestAnimationFrame;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.requestAnimationFrame = originalRaf;
  });

  it('forces a PTY resize when fitting leaves dimensions unchanged', () => {
    const view = {
      getDimensions: vi.fn(() => ({ cols: 120, rows: 30 })),
      fit: vi.fn(),
    };
    const resize = vi.fn();

    fitAndSyncPty('session-1', view as any, resize);

    expect(view.fit).toHaveBeenCalledTimes(1);
    expect(resize).toHaveBeenCalledWith('session-1', 120, 30);
  });

  it('retries after a zero-sized host becomes measurable', () => {
    const view = {
      getDimensions: vi.fn()
        .mockReturnValueOnce({ cols: 100, rows: 25 })
        .mockReturnValueOnce({ cols: 0, rows: 0 })
        .mockReturnValue({ cols: 100, rows: 25 }),
      fit: vi.fn(),
    };
    const resize = vi.fn();

    fitAndSyncPty('session-2', view as any, resize, { retryDelayMs: 10 });
    vi.runAllTimers();

    expect(view.fit).toHaveBeenCalledTimes(2);
    expect(resize).toHaveBeenCalledWith('session-2', 100, 25);
  });

  it('cancels delayed work when a newer lifecycle supersedes the fit', () => {
    const view = {
      getDimensions: vi.fn(() => ({ cols: 0, rows: 0 })),
      fit: vi.fn(),
    };
    const resize = vi.fn();
    const cancel = fitAndSyncPty('session-3', view as any, resize, { retryDelayMs: 10 });

    cancel();
    vi.advanceTimersByTime(1000);

    expect(view.fit).toHaveBeenCalledTimes(1);
    expect(resize).not.toHaveBeenCalled();
  });
});
