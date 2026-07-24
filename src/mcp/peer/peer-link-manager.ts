/**
 * PeerLinkManager — orchestrates the federation transport for every configured
 * peer. It owns ONE RemoteLinkServer (accepts inbound from all peers) plus ONE
 * RemoteLinkClient per outbound/bidirectional peer (dials that peer), and keeps
 * exactly ONE authenticated full-duplex link per peer.
 *
 * DEDUP (the hard part): two Helms that both dial each other can momentarily hold
 * TWO links for the same unordered machine pair. We keep the link whose
 * authenticated initiatorId === min(machineIdLocal, machineIdPeer) and drop the
 * other. Because an OUTBOUND link is one WE initiated (initiatorId = local) and
 * an INBOUND link is one the PEER initiated (initiatorId = peer), the rule
 * reduces to: local is the min ⇒ prefer OUTBOUND; else prefer INBOUND. The
 * preferred arrival always replaces a non-preferred incumbent; a non-preferred
 * arrival loses immediately. A duplicate close must NOT trigger a reconnect while
 * another active link for that peer still exists (the client's hasActiveLink
 * hook enforces this).
 *
 * The server/client constructors are INJECTABLE so the dedup + routing logic is
 * unit-testable with fakes; production wires the real Remote* classes.
 */

import { EventEmitter } from 'node:events';
import { logger } from '../../utils/logger.js';
import type { PeerConfig } from '../../types/peer.js';
import type { PinnedCertStore } from './pinned-cert-store.js';
import type { OnCall, PeerLink } from './peer-link.js';
import { RemoteLinkServer, type RemoteLinkServerOptions } from './remote-link-server.js';
import { RemoteLinkClient, type RemoteLinkClientOptions } from './remote-link-client.js';

/** The minimal PeerLink surface the manager depends on (real PeerLink satisfies). */
export interface ManagedLink {
  request(method: string, params: unknown, timeoutMs?: number): Promise<unknown>;
  isOnline(): boolean;
  dispose(reason: string): void;
  on(event: 'offline', listener: (...args: any[]) => void): unknown;
  once(event: 'offline', listener: (...args: any[]) => void): unknown;
}

export interface ManagedServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface ManagedClient {
  connect(): void;
  dispose(reason?: string): void;
  isConnected(): boolean;
}

export interface PeerLinkManagerOptions {
  machineId: string;
  listPeers: () => PeerConfig[];
  resolvePsk: (peerId?: string) => Buffer | undefined;
  getCertKey: () => Promise<{ certPem: string; keyPem: string }>;
  pinnedCertStore: PinnedCertStore;
  onCall: OnCall;
  host?: string;
  port?: number;
  /** Factories (injected in tests; default to the real Remote* classes). */
  createServer?: (opts: RemoteLinkServerOptions) => ManagedServer;
  createClient?: (opts: RemoteLinkClientOptions) => ManagedClient;
}

type Origin = 'inbound' | 'outbound';

interface LinkEntry {
  link: ManagedLink;
  origin: Origin;
}

export class PeerLinkManager extends EventEmitter {
  private server: ManagedServer | null = null;
  private readonly clients = new Map<string, ManagedClient>();
  /** The single authenticated link per peerId (post-dedup). */
  private readonly links = new Map<string, LinkEntry>();
  private onCall: OnCall;
  private stopped = true;

  constructor(private readonly opts: PeerLinkManagerOptions) {
    super();
    this.onCall = opts.onCall;
  }

  /** Bind the inbound server and dial every outbound/bidirectional peer. */
  async start(): Promise<void> {
    this.stopped = false;
    const createServer = this.opts.createServer ?? ((o) => new RemoteLinkServer(o));
    const createClient = this.opts.createClient ?? ((o) => new RemoteLinkClient(o));

    this.server = createServer({
      host: this.opts.host,
      port: this.opts.port,
      machineId: this.opts.machineId,
      getCertKey: this.opts.getCertKey,
      resolvePsk: this.opts.resolvePsk,
      pinnedCertStore: this.opts.pinnedCertStore,
      onCall: (peerId, method, params) => this.onCall(peerId, method, params),
      onLink: (link, peerId, peerMachineId) =>
        this.acceptLink(link as unknown as ManagedLink, peerId, 'inbound', peerMachineId),
    });
    await this.server.start();

    for (const peer of this.opts.listPeers()) {
      if (peer.direction === 'inbound') continue; // no outbound dial
      const [host, portStr] = splitAddress(peer.address);
      const client = createClient({
        peerId: peer.id,
        host,
        port: Number(portStr) || (this.opts.port ?? 47474),
        machineId: this.opts.machineId,
        getCertKey: this.opts.getCertKey,
        resolvePsk: (id) => this.opts.resolvePsk(id),
        pinnedCertStore: this.opts.pinnedCertStore,
        onCall: (pid, method, params) => this.onCall(pid, method, params),
        onLink: (link, peerId, peerMachineId) =>
          this.acceptLink(link as unknown as ManagedLink, peerId, 'outbound', peerMachineId),
        hasActiveLink: () => this.links.has(peer.id) && this.links.get(peer.id)!.link.isOnline(),
      });
      this.clients.set(peer.id, client);
      client.connect();
    }
  }

  /**
   * Dial a peer that was JUST paired at runtime (via PeerPairing), without a full
   * restart. Mirrors the outbound-dial branch of start(): inbound-only peers are
   * not dialled; a peer already being dialled is left alone (idempotent). The full
   * TLS dial itself is exercised by the P-0646 remote-link tests, not here.
   *
   * Alternatively the orchestrator may simply re-run start() on 'peer-config:changed';
   * this method exists so a single new pin does not force a global reconnect.
   */
  addPeer(peer: PeerConfig): void {
    if (this.stopped || !this.server) return;             // not running yet
    if (peer.direction === 'inbound') return;             // no outbound dial
    if (this.clients.has(peer.id)) return;                // already dialling
    const createClient = this.opts.createClient ?? ((o) => new RemoteLinkClient(o));
    const [host, portStr] = splitAddress(peer.address);
    const client = createClient({
      peerId: peer.id,
      host,
      port: Number(portStr) || (this.opts.port ?? 47474),
      machineId: this.opts.machineId,
      getCertKey: this.opts.getCertKey,
      resolvePsk: (id) => this.opts.resolvePsk(id),
      pinnedCertStore: this.opts.pinnedCertStore,
      onCall: (pid, method, params) => this.onCall(pid, method, params),
      onLink: (link, peerId, peerMachineId) =>
        this.acceptLink(link as unknown as ManagedLink, peerId, 'outbound', peerMachineId),
      hasActiveLink: () => this.links.has(peer.id) && this.links.get(peer.id)!.link.isOnline(),
    });
    this.clients.set(peer.id, client);
    client.connect();
    logger.info(`[PeerLinkManager] Dialing newly-paired peer ${peer.id}`);
  }

  /** Tear everything down. */
  async stop(): Promise<void> {
    this.stopped = true;
    for (const client of this.clients.values()) client.dispose('manager-stop');
    this.clients.clear();
    for (const entry of this.links.values()) entry.link.dispose('manager-stop');
    this.links.clear();
    if (this.server) { await this.server.stop(); this.server = null; }
  }

  /** Replace the inbound-call sink (used by links created AFTER this call). */
  setOnCall(sink: OnCall): void {
    this.onCall = sink;
  }

  /** 'online' iff an authenticated link for `peerId` is currently up. */
  status(peerId: string): 'online' | 'offline' {
    const entry = this.links.get(peerId);
    return entry && entry.link.isOnline() ? 'online' : 'offline';
  }

  /**
   * A snapshot of every configured peer with its current link status. Combines
   * the injected config source (identity/direction) with the live per-peer
   * `status()`. Latency is intentionally omitted — no link tracks pong RTT yet.
   */
  list(): Array<{ id: string; alias: string; direction: PeerConfig['direction']; online: boolean }> {
    return this.opts.listPeers().map((peer) => ({
      id: peer.id,
      alias: peer.alias,
      direction: peer.direction,
      online: this.status(peer.id) === 'online',
    }));
  }

  /** Invoke `method` on `peerId` over its live link. Rejects if none. */
  call(peerId: string, method: string, params: unknown): Promise<unknown> {
    const entry = this.links.get(peerId);
    if (!entry || !entry.link.isOnline()) {
      return Promise.reject(new Error(`No live link to peer ${peerId}`));
    }
    return entry.link.request(method, params);
  }

  // ---------------------------------------------------------------- internals

  /**
   * Register a newly-authenticated link, resolving the dedup contest against any
   * incumbent for the same peer. Returns nothing; the loser is disposed.
   */
  private acceptLink(link: ManagedLink, peerId: string, origin: Origin, peerMachineId?: string): void {
    const incumbent = this.links.get(peerId);
    if (incumbent && incumbent.link.isOnline()) {
      const preferNew = this.isPreferred(peerId, origin, peerMachineId);
      if (!preferNew) {
        // The arriving link loses — drop it, keep the incumbent.
        link.dispose('dedup-lost');
        logger.info(`[PeerLinkManager] Dropped non-preferred ${origin} link to ${peerId}`);
        return;
      }
      // The arriving link wins — replace the incumbent.
      logger.info(`[PeerLinkManager] Preferred ${origin} link to ${peerId} replaces incumbent`);
      this.detach(peerId, incumbent);
      incumbent.link.dispose('dedup-replaced');
    }

    this.links.set(peerId, { link, origin });
    link.once('offline', () => this.onLinkOffline(peerId, link));
    this.emit('peer-link:online', { peerId });
  }

  /**
   * Whether an arriving link of `origin` is preferred over the incumbent. The
   * preferred initiator is min(localMachineId, peerMachineId): local-min ⇒ the
   * OUTBOUND link (we initiated) wins, peer-min ⇒ the INBOUND link (peer
   * initiated) wins.
   *
   * `peerMachineId` is the identity the peer PROVED in the handshake. It is the
   * authoritative comparison key; we only fall back to the config/registry
   * `peerId` string if the wire machineId is unavailable (older callers / tests).
   */
  private isPreferred(peerId: string, origin: Origin, peerMachineId?: string): boolean {
    const peerKey = peerMachineId && peerMachineId.length > 0 ? peerMachineId : peerId;
    const localIsMin = this.opts.machineId < peerKey;
    const preferredOrigin: Origin = localIsMin ? 'outbound' : 'inbound';
    return origin === preferredOrigin;
  }

  private onLinkOffline(peerId: string, link: ManagedLink): void {
    const entry = this.links.get(peerId);
    // Only clear if THIS link is still the registered one (a replaced link's
    // late offline must not evict its successor).
    if (entry && entry.link === link) {
      this.links.delete(peerId);
      this.emit('peer-link:offline', { peerId });
    }
  }

  private detach(peerId: string, entry: LinkEntry): void {
    if (this.links.get(peerId) === entry) this.links.delete(peerId);
  }
}

/** Split "host:port" (IPv4/hostname). Falls back to the whole string as host. */
function splitAddress(address: string): [string, string] {
  const idx = address.lastIndexOf(':');
  if (idx <= 0) return [address, ''];
  return [address.slice(0, idx), address.slice(idx + 1)];
}
