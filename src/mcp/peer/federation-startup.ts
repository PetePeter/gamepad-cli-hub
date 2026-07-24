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

import { existsSync, readFileSync } from 'node:fs';
import * as YAML from 'yaml';
import { logger } from '../../utils/logger.js';
import { atomicWriteFileSync, isRecord } from '../../session/persistence-utils.js';
import { PEER_PINS_FILE, PEER_SECRETS_FILE } from '../../session/persistence-paths.js';
import { loadPeers } from '../../session/peer-config-persistence.js';
import { getOrCreateMachineIdentity, getOrCreateSelfSignedCert } from './peer-crypto.js';
import { PinnedCertStore, type PinnedCert } from './pinned-cert-store.js';
import { SecretStore } from './secret-store.js';
import { PeerLinkManager } from './peer-link-manager.js';
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

  const pinnedCertStore = new PinnedCertStore((pins) => savePins(pins));
  pinnedCertStore.importAll(loadPins());

  const secretStore = new SecretStore((secrets) => saveSecrets(secrets));
  secretStore.importAll(loadSecrets());

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

// ---- pinned-cert persistence (YAML { pins: [...] }) -------------------------

function savePins(pins: PinnedCert[]): void {
  try {
    atomicWriteFileSync(PEER_PINS_FILE, YAML.stringify({ pins }), { mode: 0o600 });
  } catch (err) {
    logger.error(`[federation] Failed to save peer pins: ${(err as Error).message}`);
  }
}

function loadPins(): PinnedCert[] {
  try {
    if (!existsSync(PEER_PINS_FILE)) return [];
    const parsed = YAML.parse(readFileSync(PEER_PINS_FILE, 'utf8')) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.pins)) return [];
    return parsed.pins as PinnedCert[];
  } catch (err) {
    logger.error(`[federation] Failed to load peer pins: ${(err as Error).message}`);
    return [];
  }
}

// ---- secret persistence ({ pskRef: base64 }) --------------------------------
// Secret VALUES are stored base64 here and NOWHERE else. Never logged.

function saveSecrets(secrets: Record<string, string>): void {
  try {
    atomicWriteFileSync(PEER_SECRETS_FILE, YAML.stringify(secrets), { mode: 0o600 });
  } catch (err) {
    logger.error(`[federation] Failed to save peer secrets: ${(err as Error).message}`);
  }
}

function loadSecrets(): Record<string, string> {
  try {
    if (!existsSync(PEER_SECRETS_FILE)) return {};
    const parsed = YAML.parse(readFileSync(PEER_SECRETS_FILE, 'utf8')) as unknown;
    return isRecord(parsed) ? (parsed as Record<string, string>) : {};
  } catch (err) {
    logger.error(`[federation] Failed to load peer secrets: ${(err as Error).message}`);
    return {};
  }
}
