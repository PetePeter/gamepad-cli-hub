// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  shell: { openPath: vi.fn() },
  app: {
    isPackaged: false,
    getVersion: vi.fn().mockReturnValue('0.0.0'),
    getAppPath: vi.fn().mockReturnValue('/app'),
  },
}));

import { ipcMain, shell, app } from 'electron';
import path from 'path';
import { setupSystemHandlers } from '../src/electron/ipc/system-handlers.js';

describe('help:open handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (app.getAppPath as ReturnType<typeof vi.fn>).mockReturnValue('/app');
  });

  it('registers the help:open IPC channel', () => {
    setupSystemHandlers('/ignored');
    const calls = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls;
    const channels = calls.map((c: any[]) => c[0]);
    expect(channels).toContain('help:open');
  });

  it('resolves user-guide.html via app.getAppPath()', async () => {
    (app.getAppPath as ReturnType<typeof vi.fn>).mockReturnValue('/app');
    setupSystemHandlers('/ignored');
    const helpCall = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0] === 'help:open',
    );
    const handler = helpCall![1];
    (shell.openPath as ReturnType<typeof vi.fn>).mockResolvedValue('');

    const result = await handler();

    expect(shell.openPath).toHaveBeenCalledWith(path.join('/app', 'build', 'user-guide.html'));
    expect(result).toEqual({ success: true });
  });

  it('uses resourcesPath when packaged (getAppPath returns resourcesPath)', async () => {
    (app.getAppPath as ReturnType<typeof vi.fn>).mockReturnValue('/opt/resources');
    setupSystemHandlers('/ignored');
    const helpCall = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0] === 'help:open',
    );
    const handler = helpCall![1];
    (shell.openPath as ReturnType<typeof vi.fn>).mockResolvedValue('');

    await handler();

    expect(shell.openPath).toHaveBeenCalledWith(path.join('/opt/resources', 'build', 'user-guide.html'));
  });

  it('returns error when shell.openPath fails', async () => {
    setupSystemHandlers('/ignored');
    const helpCall = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0] === 'help:open',
    );
    const handler = helpCall![1];
    (shell.openPath as ReturnType<typeof vi.fn>).mockResolvedValue('no app');

    const result = await handler();

    expect(result).toEqual({ success: false, error: 'no app' });
  });
});
