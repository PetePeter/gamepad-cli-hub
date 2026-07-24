/**
 * PeerLinkManager tests — dedup + call routing + status, driven with FAKE
 * PeerLinks and injected server/client factories. No real sockets here (the
 * end-to-end TLS path is covered by remote-link-integration). We assert the
 * unordered-pair dedup rule: the link whose authenticated initiatorId ===
 * min(machineIdA, machineIdB) survives; the other is dropped.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PeerLinkManager } from '../src/mcp/peer/peer-link-manager.js';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

/** A fake PeerLink good enough for the manager: request + dispose + events. */
class FakeLink extends EventEmitter {
  disposed = false;
  disposeReason = '';
  constructor(public readonly response: unknown = 'ok') { super(); }
  request(method: string, _params?: unknown): Promise<unknown> {
    if (this.disposed) return Promise.reject(new Error('closed'));
    return Promise.resolve(`${method}:${this.response}`);
  }
  isOnline(): boolean { return !this.disposed; }
  dispose(reason: string): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeReason = reason;
    this.emit('offline', reason);
  }
}

/** A fake config source listing the peers the manager should dial. */
const peerList = [
  { id: 'peerA', alias: 'A', address: '10.0.0.2:47474', pskRef: 'r', allow: ['*'], direction: 'bidirectional' as const, createdAt: 0 },
];

function makeManager(overrides: Partial<ConstructorParameters<typeof PeerLinkManager>[0]> = {}) {
  const created = { servers: [] as any[], clients: [] as any[] };
  const mgr = new PeerLinkManager({
    machineId: 'MID-LOCAL',
    listPeers: () => peerList,
    resolvePsk: () => Buffer.alloc(32, 1),
    getCertKey: async () => ({ certPem: 'c', keyPem: 'k' }),
    pinnedCertStore: {} as any,
    onCall: async (_p, m) => `called:${m}`,
    createServer: (opts) => { const s = new FakeServer(opts); created.servers.push(s); return s as any; },
    createClient: (opts) => { const c = new FakeClient(opts); created.clients.push(c); return c as any; },
    ...overrides,
  });
  return { mgr, created };
}

class FakeServer extends EventEmitter {
  started = false; stopped = false;
  constructor(public opts: any) { super(); }
  async start() { this.started = true; }
  async stop() { this.stopped = true; }
  /** Simulate an inbound authenticated link arriving (peerMachineId proved in HS). */
  emitLink(link: FakeLink, peerId: string, peerMachineId?: string) {
    this.opts.onLink(link, peerId, peerMachineId ?? peerId);
  }
}

class FakeClient extends EventEmitter {
  connected = false; disposed = false;
  constructor(public opts: any) { super(); }
  connect() { this.connected = true; }
  dispose() { this.disposed = true; }
  isConnected() { return this.connected && !this.disposed; }
  emitLink(link: FakeLink, peerId: string, peerMachineId?: string) {
    this.opts.onLink(link, peerId, peerMachineId ?? peerId);
  }
}

describe('PeerLinkManager', () => {
  it('start() creates + starts a server and connects a client per outbound peer', async () => {
    const { mgr, created } = makeManager();
    await mgr.start();
    expect(created.servers).toHaveLength(1);
    expect(created.servers[0].started).toBe(true);
    expect(created.clients).toHaveLength(1);
    expect(created.clients[0].connected).toBe(true);
    await mgr.stop();
    expect(created.servers[0].stopped).toBe(true);
    expect(created.clients[0].disposed).toBe(true);
  });

  it('call routes to the active link and returns its result', async () => {
    const { mgr, created } = makeManager();
    await mgr.start();
    const link = new FakeLink('R');
    created.clients[0].emitLink(link, 'peerA');
    await expect(mgr.call('peerA', 'ping', {})).resolves.toBe('ping:R');
    await mgr.stop();
  });

  it('status reflects online/offline', async () => {
    const { mgr, created } = makeManager();
    await mgr.start();
    expect(mgr.status('peerA')).toBe('offline');
    const link = new FakeLink();
    created.clients[0].emitLink(link, 'peerA');
    expect(mgr.status('peerA')).toBe('online');
    link.dispose('bye');
    expect(mgr.status('peerA')).toBe('offline');
    await mgr.stop();
  });

  it('emits peer-link:online / offline with the peerId', async () => {
    const { mgr, created } = makeManager();
    const events: Array<[string, string]> = [];
    mgr.on('peer-link:online', (e: any) => events.push(['online', e.peerId]));
    mgr.on('peer-link:offline', (e: any) => events.push(['offline', e.peerId]));
    await mgr.start();
    const link = new FakeLink();
    created.clients[0].emitLink(link, 'peerA');
    link.dispose('x');
    expect(events).toEqual([['online', 'peerA'], ['offline', 'peerA']]);
    await mgr.stop();
  });

  it('setOnCall swaps the inbound sink used by new servers/clients', async () => {
    const sink = vi.fn(async () => 'sunk');
    const { mgr, created } = makeManager();
    mgr.setOnCall(sink as any);
    await mgr.start();
    // The factory received the CURRENT sink.
    await created.servers[0].opts.onCall('peerA', 'm', {});
    expect(sink).toHaveBeenCalled();
    await mgr.stop();
  });

  it('list() combines the configured peers with their live online status', async () => {
    const { mgr, created } = makeManager();
    await mgr.start();
    // No link yet → offline.
    expect(mgr.list()).toEqual([
      { id: 'peerA', alias: 'A', direction: 'bidirectional', online: false },
    ]);
    // Bring a link up → online flips true.
    created.clients[0].emitLink(new FakeLink(), 'peerA');
    expect(mgr.list()).toEqual([
      { id: 'peerA', alias: 'A', direction: 'bidirectional', online: true },
    ]);
    await mgr.stop();
  });

  describe('dedup by min(machineId) initiator', () => {
    it('local is the min → our OUTBOUND (we initiated) link wins over an inbound', async () => {
      // localMachineId 'AAA' < peerMachineId 'ZZZ' → the link where WE are
      // initiator (outbound) wins.
      const { mgr, created } = makeManager({ machineId: 'AAA' });
      await mgr.start();

      // Inbound link (peer initiated) arrives first.
      const inbound = new FakeLink('inbound');
      created.servers[0].emitLink(inbound, 'peerA', 'ZZZ');
      expect(mgr.status('peerA')).toBe('online');

      // Our outbound link (we are initiator, and AAA is the min) arrives → it is
      // preferred; the inbound must be dropped.
      const outbound = new FakeLink('outbound');
      created.clients[0].emitLink(outbound, 'peerA', 'ZZZ');

      expect(inbound.disposed).toBe(true);
      expect(outbound.disposed).toBe(false);
      await expect(mgr.call('peerA', 'x', {})).resolves.toBe('x:outbound');
      await mgr.stop();
    });

    it('local is NOT the min → an inbound (peer-initiated) link wins over our outbound', async () => {
      // localMachineId 'ZZZ' > peerMachineId 'AAA' → the link where the PEER is
      // initiator (inbound) wins.
      const { mgr, created } = makeManager({ machineId: 'ZZZ' });
      await mgr.start();

      const outbound = new FakeLink('outbound');
      created.clients[0].emitLink(outbound, 'peerA', 'AAA');
      expect(mgr.status('peerA')).toBe('online');

      const inbound = new FakeLink('inbound');
      created.servers[0].emitLink(inbound, 'peerA', 'AAA');

      expect(outbound.disposed).toBe(true);
      expect(inbound.disposed).toBe(false);
      await mgr.stop();
    });

    it('dedup uses the AUTHENTICATED wire machineId, not the config peerId string', async () => {
      // Config peerId 'aaa-config-id' would order LATER than local 'MMM' (lower-
      // case > uppercase in ASCII), which — if the buggy code compared peerId —
      // would make local the min and prefer OUTBOUND. But the peer PROVED
      // machineId 'AAA' (< 'MMM'), so the peer is the true min and INBOUND must
      // win. This test fails if dedup regresses to comparing peerId.
      const { mgr, created } = makeManager({ machineId: 'MMM' });
      await mgr.start();

      const outbound = new FakeLink('outbound');
      created.clients[0].emitLink(outbound, 'aaa-config-id', 'AAA');
      expect(mgr.status('aaa-config-id')).toBe('online');

      const inbound = new FakeLink('inbound');
      created.servers[0].emitLink(inbound, 'aaa-config-id', 'AAA');

      expect(outbound.disposed).toBe(true);   // non-preferred → dropped
      expect(inbound.disposed).toBe(false);   // peer-min → inbound wins
      await mgr.stop();
    });

    it('a non-preferred duplicate arriving second loses immediately', async () => {
      const { mgr, created } = makeManager({ machineId: 'AAA' });
      await mgr.start();
      const winner = new FakeLink('win');
      created.clients[0].emitLink(winner, 'peerA', 'ZZZ'); // outbound, we are min → preferred
      const loser = new FakeLink('lose');
      created.servers[0].emitLink(loser, 'peerA', 'ZZZ'); // inbound, non-preferred
      expect(loser.disposed).toBe(true);
      expect(winner.disposed).toBe(false);
      await mgr.stop();
    });
  });
});
