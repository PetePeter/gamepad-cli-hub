/**
 * FederationController — owns the LIVE cross-machine federation runtime (the peer
 * TRANSPORT + the mDNS DISCOVERY/PAIRING coordinator) and turns it on/off from an
 * in-app config toggle WITHOUT an app restart (P-0658). This mirrors exactly how
 * LocalhostMcpServer.applyConfig hot-applies the localhost MCP server.
 *
 * WHY a controller rather than re-running the IPC setup: `ipcMain.handle` throws
 * if a channel is registered twice, so the pairing / peer-management IPC handlers
 * must be registered EXACTLY ONCE for the app lifetime. Those handlers read live
 * state through closures (isEnabled(), getLinkManager(), getPairingRuntime()); the
 * controller only ever starts/stops the transport + discovery, never IPC.
 *
 * The shared trust stores (pins/secrets/peer registry) are INJECTED and created
 * once by the caller, so they persist across every toggle — enable → disable →
 * enable never loses a pairing.
 */

import { logger } from '../../utils/logger.js';
import { getOrCreateMachineIdentity, getOrCreateSelfSignedCert } from './peer-crypto.js';
import { PeerDiscovery, type DiscoveredPeer } from './peer-discovery.js';
import { PairingCoordinator } from './pairing-coordinator.js';
import { PeerPairing, type PairingPeerInfo, type PairingChannel } from './peer-pairing.js';
import { startFederationIfEnabled } from './federation-startup.js';
import type { PinnedCertStore } from './pinned-cert-store.js';
import type { SecretStore } from './secret-store.js';
import type { PeerConfigManager } from '../../session/peer-config-manager.js';
import type { PeerLinkManager } from './peer-link-manager.js';
import type { OnCall } from './peer-link.js';

export interface FederationConfig {
  enabled: boolean;
  host: string;
  port: number;
}

/**
 * The live pairing runtime the pairing IPC handlers reach into when federation is
 * running: the map of currently-discovered peers + the coordinator that drives a
 * SAS session. Null when federation is off.
 */
export interface PairingRuntime {
  discovered: Map<string, DiscoveredPeer>;
  coordinator: PairingCoordinator;
}

/**
 * A discovery unit the controller can start/stop. Wraps a PeerDiscovery + a
 * PairingCoordinator and exposes the runtime the pairing handlers consume.
 */
export interface FederationDiscovery {
  start(): void;
  stop(): void;
  runtime(): PairingRuntime;
}

type StartTransport = (
  cfg: FederationConfig,
  onCall: OnCall,
  stores: { pinnedCertStore: PinnedCertStore; secretStore: SecretStore },
) => Promise<PeerLinkManager | null>;

export interface FederationControllerDeps {
  getConfig: () => FederationConfig;
  onCall: OnCall;
  pinnedCertStore: PinnedCertStore;
  secretStore: SecretStore;
  peerConfigManager: PeerConfigManager;
  /** Wire (or clear, with null) the live transport into the peer_* MCP tools. */
  setLinkManager: (mgr: PeerLinkManager | null) => void;
  /** Injectable for tests. Defaults to the real startFederationIfEnabled. */
  startTransport?: StartTransport;
  /** Injectable for tests. Defaults to the real PeerDiscovery + coordinator wiring. */
  makeDiscovery?: (cfg: FederationConfig) => FederationDiscovery | null;
  /** How a pairing session's control frames reach a peer (real socket lands later). */
  createChannel?: (peer: PairingPeerInfo, sessionId: string) => PairingChannel;
  /** mDNS advertise alias. */
  alias?: string;
  /** Broadcast a pairing/discovery event to every renderer. */
  broadcast?: (channel: string, payload: unknown) => void;
}

export class FederationController {
  private currentManager: PeerLinkManager | null = null;
  private currentDiscovery: FederationDiscovery | null = null;
  private readonly startTransport: StartTransport;
  private readonly makeDiscovery: (cfg: FederationConfig) => FederationDiscovery | null;
  /** Serializes applyConfig so two quick toggles can't interleave teardown/startup. */
  private applyChain: Promise<void> = Promise.resolve();

  constructor(private readonly deps: FederationControllerDeps) {
    this.startTransport = deps.startTransport ?? startFederationIfEnabled;
    this.makeDiscovery = deps.makeDiscovery ?? ((cfg) => this.buildRealDiscovery(cfg));
  }

  /**
   * Reconcile the live runtime with the current config. FIRST tears the current
   * runtime down, THEN (if enabled) starts a fresh transport + discovery. Idempotent
   * and safe to call repeatedly; concurrent calls are serialized.
   */
  applyConfig(): Promise<void> {
    const run = this.applyChain.then(() => this.doApply());
    // Keep the chain alive even if this apply rejects, so the next call still runs.
    this.applyChain = run.catch(() => { /* swallow — surfaced to the caller of run */ });
    return run;
  }

  private async doApply(): Promise<void> {
    // Tear down whatever is live now (transport + discovery + link wiring).
    await this.teardown();

    const cfg = this.deps.getConfig();
    if (!cfg.enabled) {
      logger.info('[federation] Disabled — no transport, no discovery');
      return;
    }

    this.currentManager = await this.startTransport(cfg, this.deps.onCall, {
      pinnedCertStore: this.deps.pinnedCertStore,
      secretStore: this.deps.secretStore,
    });
    this.deps.setLinkManager(this.currentManager);

    this.currentDiscovery = this.makeDiscovery(cfg);
    this.currentDiscovery?.start();
    logger.info(`[federation] Started transport + discovery on ${cfg.host}:${cfg.port}`);
  }

  /** Stop the live transport + discovery and clear the link wiring. */
  private async teardown(): Promise<void> {
    if (this.currentDiscovery) {
      try { this.currentDiscovery.stop(); } catch (err) { logger.warn(`[federation] discovery stop failed: ${err}`); }
      this.currentDiscovery = null;
    }
    // Clear the peer_* tool wiring BEFORE awaiting stop(): during the (async) close
    // the transport is half-shut, so any peer_list/peer_call in that window must
    // immediately report "Federation is not enabled" rather than hit a closing
    // socket. Null currentManager first so currentLinkManager() also returns null.
    const closing = this.currentManager;
    this.currentManager = null;
    this.deps.setLinkManager(null);
    if (closing) {
      try { await closing.stop(); } catch (err) { logger.warn(`[federation] transport stop failed: ${err}`); }
    }
  }

  /** The live transport, or null when federation is off (for getLinkManager closures). */
  currentLinkManager(): PeerLinkManager | null {
    return this.currentManager;
  }

  /** The live pairing runtime (discovered peers + coordinator), or null when off. */
  currentPairingRuntime(): PairingRuntime | null {
    return this.currentDiscovery ? this.currentDiscovery.runtime() : null;
  }

  isRunning(): boolean {
    return this.currentManager !== null || this.currentDiscovery !== null;
  }

  /** Apply the current persisted config (start if enabled). */
  start(): Promise<void> {
    return this.applyConfig();
  }

  /** Tear everything down (app cleanup). Serialized like applyConfig. */
  stop(): Promise<void> {
    const run = this.applyChain.then(() => this.teardown());
    this.applyChain = run.catch(() => { /* swallow */ });
    return run;
  }

  /**
   * Build the real discovery unit: a PeerDiscovery advertising this instance +
   * browsing the LAN, and a PairingCoordinator that spins up a PeerPairing per SAS
   * session. Discovery events + SAS/paired/failed events are broadcast to renderers.
   * This is the code that previously lived inline in setupPairingHandlers; moving it
   * here lets the controller own the discovery lifecycle while the pairing IPC
   * handlers stay registered once and delegate through currentPairingRuntime().
   */
  private buildRealDiscovery(cfg: FederationConfig): FederationDiscovery {
    const identity = getOrCreateMachineIdentity();
    const discovered = new Map<string, DiscoveredPeer>();
    const broadcast = this.deps.broadcast ?? (() => { /* no renderers in tests */ });
    const alias = this.deps.alias ?? 'Helm';

    const discovery = new PeerDiscovery({ machineId: identity.machineId });
    discovery.on('peer-discovered', (peer: DiscoveredPeer) => {
      discovered.set(peer.machineId, peer);
      broadcast('peer:discovered', peer);
    });
    discovery.on('peer-lost', ({ machineId }: { machineId: string }) => {
      discovered.delete(machineId);
      broadcast('peer:lost', { machineId });
    });

    // Resolve our cert fingerprint up-front (async) so PeerPairing can use it sync.
    let currentCertFp = '';
    void getOrCreateSelfSignedCert().then((c) => { currentCertFp = c.fingerprint; });

    const coordinator = new PairingCoordinator({
      createPairing: (sessionId, peer) => {
        const channel = this.deps.createChannel
          ? this.deps.createChannel(peer, sessionId)
          : nullChannel();
        const pairing = new PeerPairing({
          role: 'initiator',
          sessionId,
          channel,
          pinnedCertStore: this.deps.pinnedCertStore,
          secretStore: this.deps.secretStore,
          peerConfigManager: this.deps.peerConfigManager,
          self: { machineId: identity.machineId, certFp: currentCertFp },
          peer,
        });
        pairing.on('sas', (sas: string) => broadcast('peer:sas', { sessionId, sas }));
        pairing.on('paired', (info) => broadcast('peer:paired', { sessionId, ...info }));
        pairing.on('failed', (info) => broadcast('peer:failed', { sessionId, ...info }));
        return pairing;
      },
    });

    return {
      start: () => {
        discovery.start();
        discovery.advertise({ machineId: identity.machineId, alias, port: cfg.port });
        logger.info('[federation] Discovery started + advertising');
      },
      stop: () => {
        try { discovery.stop(); } catch { /* ignore */ }
      },
      runtime: () => ({ discovered, coordinator }),
    };
  }
}

/** A channel that drops frames — used until the real pairing socket lands. */
function nullChannel(): PairingChannel {
  return { send: () => { /* transport wired by a later plan */ } };
}
