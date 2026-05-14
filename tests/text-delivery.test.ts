import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlerRegistry = new Map<string, Function>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      handlerRegistry.set(channel, handler);
    }),
    removeHandler: vi.fn((channel: string) => {
      handlerRegistry.delete(channel);
    }),
  },
}));

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { RendererTextDeliverer } from '../src/electron/ipc/text-delivery.js';

describe('RendererTextDeliverer', () => {
  beforeEach(() => {
    handlerRegistry.clear();
  });

  it('forwards submit-only requests to the renderer instead of dropping them', async () => {
    const send = vi.fn();
    const deliverer = new RendererTextDeliverer(
      {
        getWindowForSession: vi.fn(() => ({
          isDestroyed: vi.fn(() => false),
          webContents: { send },
        })),
      } as any,
      {
        getSession: vi.fn(() => ({ id: 's1', cliType: 'copilot' })),
      } as any,
      {
        getCliTypeEntry: vi.fn(() => ({ pasteMode: 'sendkeys' })),
      } as any,
    );

    await handlerRegistry.get('text:deliver-ready')?.({});

    const delivery = deliverer.deliver('s1', '', { submitSuffix: '\r' });

    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0][1];
    expect(payload).toMatchObject({
      sessionId: 's1',
      text: '',
      submitSuffix: '\r',
    });

    await handlerRegistry.get('text:deliver-response')?.({}, payload.requestId, true);
    await expect(delivery).resolves.toBeUndefined();

    deliverer.dispose();
  });

  it('throws for sendkeys sessions when renderer delivery is unavailable, even for submit-only requests', async () => {
    const deliverer = new RendererTextDeliverer(
      {
        getWindowForSession: vi.fn(() => null),
      } as any,
      {
        getSession: vi.fn(() => ({ id: 's1', cliType: 'copilot' })),
      } as any,
      {
        getCliTypeEntry: vi.fn(() => ({ pasteMode: 'sendkeys' })),
      } as any,
    );

    await expect(deliverer.deliver('s1', '', { submitSuffix: '\r' })).rejects.toThrow(
      'Renderer delivery unavailable for pasteMode=sendkeys',
    );

    deliverer.dispose();
  });

  it('rejects focus-sensitive paste modes for background delivery before renderer handoff', async () => {
    const send = vi.fn();
    const deliverer = new RendererTextDeliverer(
      {
        getWindowForSession: vi.fn(() => ({
          isDestroyed: vi.fn(() => false),
          webContents: { send },
        })),
      } as any,
      {
        getSession: vi.fn(() => ({ id: 's1', cliType: 'copilot' })),
      } as any,
      {
        getCliTypeEntry: vi.fn(() => ({ pasteMode: 'clippaste' })),
      } as any,
    );

    await handlerRegistry.get('text:deliver-ready')?.({});

    await expect(deliverer.deliver('s1', 'hello', { deliveryContext: 'background' })).rejects.toThrow(
      'Background delivery cannot use focus-sensitive pasteMode=clippaste',
    );
    expect(send).not.toHaveBeenCalled();

    deliverer.dispose();
  });
});
