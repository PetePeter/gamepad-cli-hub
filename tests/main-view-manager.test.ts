import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerView, showView, currentView, onViewChange, __resetMainViewManager,
} from '../renderer/main-view/main-view-manager.js';

describe('MainViewManager', () => {
  beforeEach(() => {
    __resetMainViewManager();
  });

  it('defaults to terminal view', () => {
    expect(currentView()).toBe('terminal');
  });

  it('transitions unmount -> mount in order', async () => {
    const calls: string[] = [];
    registerView('terminal', { mount: () => { calls.push('terminal:mount'); }, unmount: () => { calls.push('terminal:unmount'); } });
    registerView('overview', { mount: () => { calls.push('overview:mount'); }, unmount: () => { calls.push('overview:unmount'); } });

    await showView('overview');
    // First switch: prior was 'terminal' (default), but no prior mount ran, so unmount still runs
    expect(calls).toEqual(['terminal:unmount', 'overview:mount']);
    expect(currentView()).toBe('overview');
  });

  it('passes params to mount', async () => {
    const mount = vi.fn();
    registerView('plan', { mount, unmount: () => {} });
    await showView('plan', { dir: '/home' });
    expect(mount).toHaveBeenCalledWith(
      { dir: '/home' },
      expect.objectContaining({
        transitionId: expect.any(Number),
        isActive: expect.any(Function),
      }),
    );
  });

  it('fires onChange listeners on transition', async () => {
    registerView('overview', { mount: () => {}, unmount: () => {} });
    const cb = vi.fn();
    onViewChange(cb);
    await showView('overview');
    expect(cb).toHaveBeenCalledWith('overview');
  });

  it('does not fire onChange when view is unchanged', async () => {
    registerView('terminal', { mount: () => {}, unmount: () => {} });
    const cb = vi.fn();
    onViewChange(cb);
    await showView('terminal');
    expect(cb).not.toHaveBeenCalled();
  });

  it('unsubscribe removes listener', async () => {
    registerView('overview', { mount: () => {}, unmount: () => {} });
    const cb = vi.fn();
    const unsub = onViewChange(cb);
    unsub();
    await showView('overview');
    expect(cb).not.toHaveBeenCalled();
  });

  it('isolates errors in mount from caller', async () => {
    registerView('plan', { mount: () => { throw new Error('boom'); }, unmount: () => {} });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(showView('plan')).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('isolates errors in unmount from caller', async () => {
    registerView('overview', { mount: () => {}, unmount: () => { throw new Error('boom'); } });
    registerView('terminal', { mount: () => {}, unmount: () => {} });
    await showView('overview');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(showView('terminal')).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('sequential switches between views track current correctly', async () => {
    const order: string[] = [];
    registerView('terminal', { mount: () => { order.push('T:m'); }, unmount: () => { order.push('T:u'); } });
    registerView('overview', { mount: () => { order.push('O:m'); }, unmount: () => { order.push('O:u'); } });
    registerView('plan', { mount: () => { order.push('P:m'); }, unmount: () => { order.push('P:u'); } });

    await showView('overview');
    await showView('plan');
    await showView('terminal');

    expect(currentView()).toBe('terminal');
    expect(order).toEqual(['T:u', 'O:m', 'O:u', 'P:m', 'P:u', 'T:m']);
  });

  it('ignores stale async mounts after a newer transition wins', async () => {
    let releasePlanMount: (() => void) | null = null;
    const calls: string[] = [];

    registerView('terminal', {
      mount: () => { calls.push('terminal:mount'); },
      unmount: () => { calls.push('terminal:unmount'); },
    });
    registerView('plan', {
      mount: async (_params, ctx) => {
        calls.push('plan:mount:start');
        await new Promise<void>((resolve) => {
          releasePlanMount = resolve;
        });
        if (ctx?.isActive()) calls.push('plan:mount:commit');
      },
      unmount: () => { calls.push('plan:unmount'); },
    });
    registerView('overview', {
      mount: () => { calls.push('overview:mount'); },
      unmount: () => { calls.push('overview:unmount'); },
    });

    const pendingPlan = showView('plan');
    await Promise.resolve();
    await showView('overview');
    releasePlanMount?.();
    await pendingPlan;

    expect(currentView()).toBe('overview');
    expect(calls).toEqual([
      'terminal:unmount',
      'plan:mount:start',
      'plan:unmount',
      'overview:mount',
    ]);
  });
});
