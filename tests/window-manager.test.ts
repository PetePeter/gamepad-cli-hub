import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({}));
vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { WindowManager } from '../src/electron/window-manager.js';

function makeWindow(id: number, webContentsId: number) {
  return {
    id,
    webContents: { id: webContentsId },
    isDestroyed: vi.fn(() => false),
  } as any;
}

describe('WindowManager terminal renderer ownership', () => {
  let manager: WindowManager;
  let main: any;
  let child: any;

  beforeEach(() => {
    manager = new WindowManager();
    main = makeWindow(1, 11);
    child = makeWindow(2, 22);
    manager.setMainWindow(main);
    manager.registerWindow(child.id, child);
    manager.assignSessionToWindow('session-1', child.id);
  });

  it('recognizes only the mapped renderer as owner', () => {
    expect(manager.isSessionOwnedByWebContents('session-1', 22)).toBe(true);
    expect(manager.isSessionOwnedByWebContents('session-1', 11)).toBe(false);
  });

  it('routes output to main while the child is detached, then restores child ownership', () => {
    expect(manager.markSessionRendererDetached('session-1', 22)).toBe(true);
    expect(manager.getWindowForSession('session-1')).toBe(main);
    expect(manager.isSessionOwnedByWebContents('session-1', 22)).toBe(false);

    manager.markSessionRendererAttached('session-1');
    expect(manager.getWindowForSession('session-1')).toBe(child);
    expect(manager.isSessionOwnedByWebContents('session-1', 22)).toBe(true);
  });
});
