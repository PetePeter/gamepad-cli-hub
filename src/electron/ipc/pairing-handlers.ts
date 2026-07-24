/**
 * Pairing IPC handlers — the THIN bridge between the renderer pairing UI (P-0650)
 * and the SAS pairing machinery (PeerDiscovery + PairingCoordinator + PeerPairing).
 *
 * Deliberately NOT unit-tested (per P-0649 scope): pure glue, exercised in the
 * deferred manual app-run. Only registered when federation is ENABLED — when
 * disabled this binds nothing and starts no mDNS advertising/browsing.
 *
 * Channels:
 *   peer:listDiscovered  → LAN peers seen via mDNS (presence only, no access)
 *   peer:startPairing    → begin a SAS session with a discovered peer
 *   peer:confirmPairing  → the user's ONE accept/reject decision (codes match?)
 *   peer:cancelPairing   → abort the active session
 * Events forwarded to renderers: peer:discovered / peer:lost / peer:sas /
 *   peer:paired / peer:failed.
 *
 * SECURITY: the 6-digit SAS is surfaced for the USER to compare; it is never a
 * KDF/MAC input. Persistence (pin + secret + PeerConfig) happens ONLY inside
 * PeerPairing after both-accept + peer-confirm, atomic with rollback.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { logger } from '../../utils/logger.js';
import type { PeerConfigManager } from '../../session/peer-config-manager.js';
import { getOrCreateMachineIdentity, getOrCreateSelfSignedCert } from '../../mcp/peer/peer-crypto.js';
import { PinnedCertStore } from '../../mcp/peer/pinned-cert-store.js';
import { SecretStore } from '../../mcp/peer/secret-store.js';
import { PeerDiscovery, type DiscoveredPeer } from '../../mcp/peer/peer-discovery.js';
import { PairingCoordinator } from '../../mcp/peer/pairing-coordinator.js';
import { PeerPairing, type PairingPeerInfo, type PairingChannel } from '../../mcp/peer/peer-pairing.js';
import { loadPeerPins, savePeerPins, loadPeerSecrets, savePeerSecrets } from '../../mcp/peer/peer-secret-persistence.js';

export interface PairingHandlerDeps {
  enabled: boolean;
  host: string;
  port: number;
  alias: string;
  peerConfigManager: PeerConfigManager;
  /** How a pairing session's control frames reach the peer (real socket: P-0651). */
  createChannel?: (peer: PairingPeerInfo, sessionId: string) => PairingChannel;
  /**
   * Shared trust stores. Injected so the peer-management handlers (unpair) and the
   * federation transport operate on the SAME in-memory store instances that
   * pairing writes pins/secrets into. When omitted, internal stores are built.
   */
  pinnedCertStore?: PinnedCertStore;
  secretStore?: SecretStore;
}

/**
 * Register the pairing handlers. Returns a disposer that stops discovery. When
 * `enabled` is false this is a no-op (nothing advertised, nothing browsed).
 */
export function setupPairingHandlers(deps: PairingHandlerDeps): () => void {
  if (!deps.enabled) {
    logger.info('[pairing] Federation disabled — pairing handlers not registered');
    return () => { /* nothing to tear down */ };
  }

  const identity = getOrCreateMachineIdentity();
  const discovered = new Map<string, DiscoveredPeer>();

  const discovery = new PeerDiscovery({ machineId: identity.machineId });
  discovery.on('peer-discovered', (peer: DiscoveredPeer) => {
    discovered.set(peer.machineId, peer);
    broadcastToAll((win) => win.webContents.send('peer:discovered', peer));
  });
  discovery.on('peer-lost', ({ machineId }: { machineId: string }) => {
    discovered.delete(machineId);
    broadcastToAll((win) => win.webContents.send('peer:lost', { machineId }));
  });
  discovery.start();
  discovery.advertise({ machineId: identity.machineId, alias: deps.alias, port: deps.port });

  // Stores hydrated once; PeerPairing writes through them on finalize. Prefer the
  // injected shared instances so unpair + transport see the same pins/secrets.
  let pinnedCertStore = deps.pinnedCertStore;
  if (!pinnedCertStore) {
    pinnedCertStore = new PinnedCertStore((pins) => savePeerPins(pins));
    pinnedCertStore.importAll(loadPeerPins());
  }
  let secretStore = deps.secretStore;
  if (!secretStore) {
    secretStore = new SecretStore((secrets) => savePeerSecrets(secrets));
    secretStore.importAll(loadPeerSecrets());
  }

  const coordinator = new PairingCoordinator({
    createPairing: (sessionId, peer) => {
      const channel = deps.createChannel
        ? deps.createChannel(peer, sessionId)
        : nullChannel();
      const pairing = new PeerPairing({
        role: 'initiator',
        sessionId,
        channel,
        pinnedCertStore,
        secretStore,
        peerConfigManager: deps.peerConfigManager,
        self: { machineId: identity.machineId, certFp: currentCertFp },
        peer,
      });
      pairing.on('sas', (sas: string) =>
        broadcastToAll((win) => win.webContents.send('peer:sas', { sessionId, sas })));
      pairing.on('paired', (info) =>
        broadcastToAll((win) => win.webContents.send('peer:paired', { sessionId, ...info })));
      pairing.on('failed', (info) =>
        broadcastToAll((win) => win.webContents.send('peer:failed', { sessionId, ...info })));
      return pairing;
    },
  });

  // Resolve our cert fingerprint up-front (async) so PeerPairing can use it sync.
  let currentCertFp = '';
  void getOrCreateSelfSignedCert().then((c) => { currentCertFp = c.fingerprint; });

  ipcMain.handle('peer:listDiscovered', () => [...discovered.values()]);

  ipcMain.handle('peer:startPairing', (_e, machineId: string) => {
    const peer = discovered.get(machineId);
    if (!peer) return { ok: false, reason: 'peer not currently discovered' };
    const info: PairingPeerInfo = {
      machineId: peer.machineId, alias: peer.alias, address: peer.address, certFp: '',
    };
    return coordinator.start(info);
  });

  ipcMain.handle('peer:confirmPairing', (_e, sessionId: string, accepted: boolean) => {
    coordinator.confirm(sessionId, accepted === true);
    return { ok: true };
  });

  ipcMain.handle('peer:cancelPairing', () => {
    coordinator.cancel();
    return { ok: true };
  });

  logger.info('[pairing] Registered pairing IPC handlers + started discovery');
  return () => { try { discovery.stop(); } catch { /* ignore */ } };

  function broadcastToAll(send: (win: BrowserWindow) => void): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) send(win);
    }
  }
}

/** A channel that drops frames — used until the real pairing socket (P-0651). */
function nullChannel(): PairingChannel {
  return { send: () => { /* transport wired by a later plan */ } };
}
