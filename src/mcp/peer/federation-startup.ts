/**
 * federation-startup — the THIN wiring that stands up the cross-machine peer
 * transport (P-0646) when, and only when, federation is enabled in settings.
 *
 * This is deliberately covered by the deferred manual app-run plan rather than
 * unit tests: it is pure glue. It constructs the machine identity + self-signed
 * cert (P-0645 primitives), hydrates the pinned-cert + secret stores from disk,
 * and hands a PeerLinkManager the callbacks it needs. When federation is
 * disabled (the default) this function returns null and binds NO port — the
 * localhost 127.0.0.1 MCP server is entirely untouched either way.
 */

import { logger } from '../../utils/logger.js';
import { loadPeers } from '../../session/peer-config-persistence.js';
import { getOrCreateMachineIdentity, getOrCreateSelfSignedCert } from './peer-crypto.js';
import { PinnedCertStore } from './pinned-cert-store.js';
import { SecretStore } from './secret-store.js';
import { PeerLinkManager } from './peer-link-manager.js';
import { loadPeerPins, savePeerPins, loadPeerSecrets, savePeerSecrets } from './peer-secret-persistence.js';
import type { OnCall } from './peer-link.js';

export interface FederationConfigInput {
  enabled: boolean;
  host: string;
  port: number;
}

/**
 * Build + start a PeerLinkManager if `config.enabled`. Returns the manager (for
 * later stop()) or null when disabled. `onCall` is the inbound-call sink (the
 * abstract dispatcher; the concrete tool-invocation wiring lands in P-0647/8).
 */
export async function startFederationIfEnabled(
  config: FederationConfigInput,
  onCall: OnCall,
): Promise<PeerLinkManager | null> {
  if (!config.enabled) {
    logger.info('[federation] Disabled — binding no peer listener');
    return null;
  }

  const identity = getOrCreateMachineIdentity();
  const cert = await getOrCreateSelfSignedCert();

  const pinnedCertStore = new PinnedCertStore((pins) => savePeerPins(pins));
  pinnedCertStore.importAll(loadPeerPins());

  const secretStore = new SecretStore((secrets) => savePeerSecrets(secrets));
  secretStore.importAll(loadPeerSecrets());

  const manager = new PeerLinkManager({
    machineId: identity.machineId,
    host: config.host,
    port: config.port,
    listPeers: () => loadPeers(),
    // PSK is resolved from the peer's pskRef via the secret store. peerId here is
    // the peer's config id; the pskRef indirection lives in the peer config.
    resolvePsk: (peerId) => resolvePskForPeer(peerId, secretStore),
    getCertKey: async () => ({ certPem: cert.certPem, keyPem: cert.privateKeyPem }),
    pinnedCertStore,
    onCall,
  });
  await manager.start();
  logger.info(`[federation] Peer transport listening on ${config.host}:${config.port}`);
  return manager;
}

/** Map a peer config id → its PSK bytes via the peer's pskRef in the registry. */
function resolvePskForPeer(peerId: string | undefined, secretStore: SecretStore): Buffer | undefined {
  if (!peerId) return undefined;
  const peer = loadPeers().find((p) => p.id === peerId);
  if (!peer || !peer.pskRef) return undefined;
  return secretStore.get(peer.pskRef);
}
