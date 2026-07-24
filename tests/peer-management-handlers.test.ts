/**
 * Peer-management IPC handler tests — the setEnabled → live-transport wiring.
 * Real PeerConfigManager + fake link manager + faked Electron. We assert that
 * toggling a peer Off drops its live link immediately (disposePeer) and toggling
 * it On re-dials (addPeer), so "Off" takes effect in both directions at runtime.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PeerConfig } from '../src/types/peer.js';

const handleCalls = new Map<string, Function>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => { handleCalls.set(channel, handler); }),
    removeHandler: vi.fn((channel: string) => { handleCalls.delete(channel); }),
  },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

vi.mock('../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { PeerConfigManager } = await import('../src/session/peer-config-manager.js');
const { PeerAuditLog } = await import('../src/mcp/peer/peer-audit-log.js');
const { setupPeerManagementHandlers } = await import('../src/electron/ipc/peer-management-handlers.js');

function getHandler(channel: string): Function {
  const handler = handleCalls.get(channel);
  if (!handler) throw new Error(`No handler for "${channel}"`);
  return handler;
}

/** A fake link manager recording disposePeer/addPeer calls + reporting status. */
function fakeLinkManager() {
  const disposed: string[] = [];
  const dialed: PeerConfig[] = [];
  return {
    disposed,
    dialed,
    status: (_id: string) => 'online' as const,
    disposePeer: (peerId: string) => { disposed.push(peerId); },
    addPeer: (peer: PeerConfig) => { dialed.push(peer); },
    on: () => {},
    off: () => {},
  };
}

describe('peer-management handlers — setEnabled live-transport wiring', () => {
  let cfg: InstanceType<typeof PeerConfigManager>;
  let audit: InstanceType<typeof PeerAuditLog>;
  let link: ReturnType<typeof fakeLinkManager>;

  beforeEach(() => {
    handleCalls.clear();
    cfg = new PeerConfigManager();
    audit = new PeerAuditLog(() => {}, () => 0);
    link = fakeLinkManager();
    setupPeerManagementHandlers({
      enabled: true,
      peerConfigManager: cfg,
      pinnedCertStore: { removePin: vi.fn() } as any,
      secretStore: { remove: vi.fn() } as any,
      audit,
      getLinkManager: () => link as any,
    });
  });

  it('setEnabled(false) persists the flag AND disposes the live link', async () => {
    const peer = cfg.add({ alias: 'Mac', address: 'h:1', pskRef: 'r' });
    await getHandler('peer:setEnabled')({}, peer.id, false);

    expect(cfg.get(peer.id)!.enabled).toBe(false);
    expect(link.disposed).toEqual([peer.id]);
    expect(link.dialed).toEqual([]);
  });

  it('setEnabled(true) persists the flag AND re-dials via addPeer', async () => {
    const peer = cfg.add({ alias: 'Mac', address: 'h:1', pskRef: 'r', enabled: false });
    await getHandler('peer:setEnabled')({}, peer.id, true);

    expect(cfg.get(peer.id)!.enabled).toBe(true);
    expect(link.dialed.map(p => p.id)).toEqual([peer.id]);
    expect(link.disposed).toEqual([]);
  });

  it('setEnabled on an unknown peer returns ok:false and touches no transport', async () => {
    const res = await getHandler('peer:setEnabled')({}, 'ghost', false);
    expect(res).toEqual({ ok: false });
    expect(link.disposed).toEqual([]);
    expect(link.dialed).toEqual([]);
  });

  it('peer:list reports the enabled flag (default-true for undefined)', async () => {
    const a = cfg.add({ alias: 'A', address: 'h:1', pskRef: 'r' });            // undefined → enabled
    const b = cfg.add({ alias: 'B', address: 'h:2', pskRef: 'r', enabled: false });
    const list = await getHandler('peer:list')();
    const byId = Object.fromEntries(list.map((p: any) => [p.id, p.enabled]));
    expect(byId[a.id]).toBe(true);
    expect(byId[b.id]).toBe(false);
  });
});
