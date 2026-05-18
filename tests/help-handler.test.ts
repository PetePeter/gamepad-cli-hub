// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

const { mockLoadFile, mockClose, mockExistsSync } = vi.hoisted(() => ({
  mockLoadFile: vi.fn().mockResolvedValue(null),
  mockClose: vi.fn(),
  mockExistsSync: vi.fn().mockReturnValue(true),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  shell: { openPath: vi.fn() },
  app: {
    isPackaged: false,
    getVersion: vi.fn().mockReturnValue('0.0.0'),
    getAppPath: vi.fn().mockReturnValue('/app'),
  },
  BrowserWindow: vi.fn().mockImplementation(function (this: any) {
    this.loadFile = mockLoadFile;
    this.close = mockClose;
  }),
}));

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

import { ipcMain, app, BrowserWindow } from 'electron';
import { setupSystemHandlers } from '../src/electron/ipc/system-handlers.js';

describe('help:open handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (app.getAppPath as ReturnType<typeof vi.fn>).mockReturnValue('/app');
    (app.isPackaged as boolean) = false;
    mockLoadFile.mockResolvedValue(null);
    mockExistsSync.mockReturnValue(true);
  });

  it('registers the help:open IPC channel', () => {
    setupSystemHandlers('/ignored');
    const channels = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.map((c: any[]) => c[0]);
    expect(channels).toContain('help:open');
  });

  it('opens user guide in a BrowserWindow using app.getAppPath() in dev mode', async () => {
    setupSystemHandlers('/ignored');
    const handler = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0] === 'help:open',
    )![1];

    const result = await handler();

    expect(BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Helm User Guide' }),
    );
    expect(mockLoadFile).toHaveBeenCalledWith(path.join('/app', 'build', 'user-guide.html'));
    expect(result).toEqual({ success: true });
  });

  it('uses resourcesPath when packaged', async () => {
    (app.isPackaged as boolean) = true;
    const originalResourcesPath = process.resourcesPath;
    process.resourcesPath = '/opt/resources';
    setupSystemHandlers('/ignored');
    const handler = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0] === 'help:open',
    )![1];

    await handler();

    expect(mockLoadFile).toHaveBeenCalledWith(path.join('/opt/resources', 'build', 'user-guide.html'));
    process.resourcesPath = originalResourcesPath;
  });

  it('returns error when guide file does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    setupSystemHandlers('/ignored');
    const handler = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0] === 'help:open',
    )![1];

    const result = await handler();

    expect(result).toEqual({ success: false, error: expect.stringContaining('User guide not found') });
    expect(BrowserWindow).not.toHaveBeenCalled();
  });

  it('returns error when BrowserWindow fails', async () => {
    mockLoadFile.mockRejectedValue(new Error('load failed'));
    setupSystemHandlers('/ignored');
    const handler = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0] === 'help:open',
    )![1];

    const result = await handler();

    expect(result).toEqual({ success: false, error: expect.stringContaining('load failed') });
  });
});
