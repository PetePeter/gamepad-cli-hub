/**
 * config:setFederationConfig / getFederationConfig IPC handler tests (P-0658).
 * Mirrors the MCP hot-apply pattern: persist via a fake ConfigLoader, then invoke
 * an injected applyFederationConfig closure with the freshly-read config. A
 * throwing apply still returns {success:true} because the config WAS persisted.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const handleCalls = new Map<string, Function>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => { handleCalls.set(channel, handler); }),
    removeHandler: vi.fn((channel: string) => { handleCalls.delete(channel); }),
  },
  dialog: {},
  BrowserWindow: { getFocusedWindow: vi.fn(() => null), getAllWindows: vi.fn(() => []) },
}));

vi.mock('../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { setupConfigHandlers } = await import('../src/electron/ipc/config-handlers.js');

function getHandler(channel: string): Function {
  const handler = handleCalls.get(channel);
  if (!handler) throw new Error(`No handler for "${channel}"`);
  return handler;
}

/** Minimal fake ConfigLoader that records federation config get/set. */
function fakeConfigLoader() {
  let fed = { enabled: false, host: '0.0.0.0', port: 47474 };
  return {
    load: vi.fn(),
    getCliTypes: () => [],
    getFederationConfig: vi.fn(() => ({ ...fed })),
    setFederationConfig: vi.fn((updates: Partial<typeof fed>) => { fed = { ...fed, ...updates }; }),
  } as any;
}

describe('config:setFederationConfig / getFederationConfig', () => {
  let loader: ReturnType<typeof fakeConfigLoader>;
  let applied: Array<{ enabled: boolean; host: string; port: number }>;
  let applyFederationConfig: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    handleCalls.clear();
    loader = fakeConfigLoader();
    applied = [];
    applyFederationConfig = vi.fn(async (cfg: any) => { applied.push(cfg); });
    setupConfigHandlers(loader, undefined, undefined, applyFederationConfig as never);
  });

  it('persists the update then hot-applies the freshly-read config and returns success', async () => {
    const res = await getHandler('config:setFederationConfig')({}, { enabled: true, port: 50000 });

    expect(loader.setFederationConfig).toHaveBeenCalledWith({ enabled: true, port: 50000 });
    expect(applyFederationConfig).toHaveBeenCalledTimes(1);
    // The applied config is the loader's POST-merge config, not the raw updates.
    expect(applied[0]).toEqual({ enabled: true, host: '0.0.0.0', port: 50000 });
    expect(res).toEqual({ success: true });
  });

  it('still returns success when hot-apply throws (config was persisted)', async () => {
    applyFederationConfig.mockRejectedValueOnce(new Error('bind failed'));
    const res = await getHandler('config:setFederationConfig')({}, { enabled: true });

    expect(loader.setFederationConfig).toHaveBeenCalled();
    expect(res).toEqual({ success: true });
  });

  it('config:getFederationConfig round-trips the loader value', async () => {
    await getHandler('config:setFederationConfig')({}, { enabled: true, host: '127.0.0.1', port: 40000 });
    const got = await getHandler('config:getFederationConfig')();
    expect(got).toEqual({ enabled: true, host: '127.0.0.1', port: 40000 });
  });

  it('works without an applyFederationConfig closure (optional dep)', async () => {
    handleCalls.clear();
    setupConfigHandlers(loader, undefined, undefined);
    const res = await getHandler('config:setFederationConfig')({}, { enabled: true });
    expect(loader.setFederationConfig).toHaveBeenCalled();
    expect(res).toEqual({ success: true });
  });
});
