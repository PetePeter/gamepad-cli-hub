/**
 * usePeers — reactive state for the cross-machine federation (Peers) tab.
 *
 * Module-singleton refs shared by the PeersTab, the pairing dialog and the audit
 * modal. Mirrors useRecycleBin/useRuntimeGroups: ensureSubscribed() wires every
 * peer event once and does an initial refresh; actions delegate to peersClient
 * and defensively re-refresh so the UI stays consistent even if an event is
 * missed.
 */
import { ref } from 'vue';
import { peersClient, configClient, eventsClient } from '../ipc/clients.js';

export interface FederationConfig {
  enabled: boolean;
  host: string;
  port: number;
}

export interface ConfiguredPeer {
  id: string;
  machineId?: string;
  alias: string;
  address: string;
  direction: 'inbound' | 'outbound' | 'bidirectional';
  allow: string[];
  enabled: boolean;
  online: boolean;
}

export interface DiscoveredPeer {
  machineId: string;
  alias: string;
  address: string;
}

export interface PeerAuditEntry {
  id: string;
  peerId: string;
  method: string;
  argSummary: string;
  outcome: 'ok' | 'denied' | 'rate-limited' | 'error';
  ranAt: number;
  error?: string;
}

export interface PairingState {
  active: boolean;
  sessionId: string | null;
  sas: string | null;
  status: 'idle' | 'starting' | 'awaiting-sas' | 'confirmed' | 'paired' | 'failed';
  error: string | null;
  peerAlias: string | null;
}

const DEFAULT_FEDERATION_CONFIG: FederationConfig = { enabled: false, host: '0.0.0.0', port: 47474 };

const federationEnabled = ref(false);
const federationConfig = ref<FederationConfig>({ ...DEFAULT_FEDERATION_CONFIG });
const configuredPeers = ref<ConfiguredPeer[]>([]);
const discoveredPeers = ref<DiscoveredPeer[]>([]);
const audit = ref<PeerAuditEntry[]>([]);
const pairing = ref<PairingState>(emptyPairing());

let subscribed = false;

function emptyPairing(): PairingState {
  return { active: false, sessionId: null, sas: null, status: 'idle', error: null, peerAlias: null };
}

async function loadFederationConfig(): Promise<void> {
  try {
    const cfg = await configClient.configGetFederationConfig();
    federationConfig.value = {
      enabled: cfg?.enabled ?? false,
      host: cfg?.host || DEFAULT_FEDERATION_CONFIG.host,
      port: cfg?.port ?? DEFAULT_FEDERATION_CONFIG.port,
    };
    // federationEnabled derives from the persisted config (single source of truth).
    federationEnabled.value = federationConfig.value.enabled;
  } catch {
    federationConfig.value = { ...DEFAULT_FEDERATION_CONFIG };
    federationEnabled.value = false;
  }
}

async function refresh(): Promise<void> {
  await loadFederationConfig();
  try {
    configuredPeers.value = (await peersClient.peerList()) ?? [];
  } catch {
    configuredPeers.value = [];
  }
  try {
    discoveredPeers.value = (await peersClient.peerListDiscovered()) ?? [];
  } catch {
    discoveredPeers.value = [];
  }
}

async function refreshAudit(): Promise<void> {
  try {
    audit.value = (await peersClient.peerGetAudit()) ?? [];
  } catch {
    audit.value = [];
  }
}

/** Subscribe once to all peer events, then (re)refresh. Safe to call repeatedly. */
function ensureSubscribed(): void {
  if (subscribed) {
    // Already wired — just re-pull current state (e.g. tab re-opened / remount).
    void refresh();
    return;
  }
  subscribed = true;

  eventsClient.onPeerConfigChanged?.(() => { void refresh(); });
  eventsClient.onPeerLinkStatus?.(() => { void refresh(); });
  eventsClient.onPeerAuditChanged?.(() => { void refreshAudit(); });

  eventsClient.onPeerDiscovered?.((peer) => {
    if (!discoveredPeers.value.some((p) => p.machineId === peer.machineId)) {
      discoveredPeers.value = [...discoveredPeers.value, peer];
    }
  });
  eventsClient.onPeerLost?.(({ machineId }) => {
    discoveredPeers.value = discoveredPeers.value.filter((p) => p.machineId !== machineId);
  });

  eventsClient.onPeerSas?.(({ sessionId, sas }) => {
    if (pairing.value.sessionId && pairing.value.sessionId !== sessionId) return;
    pairing.value = { ...pairing.value, sessionId, sas, status: 'awaiting-sas' };
  });
  eventsClient.onPeerPaired?.(({ sessionId }) => {
    if (pairing.value.sessionId && pairing.value.sessionId !== sessionId) return;
    pairing.value = { ...pairing.value, status: 'paired' };
    void refresh();
  });
  eventsClient.onPeerFailed?.(({ sessionId, reason }) => {
    if (pairing.value.sessionId && pairing.value.sessionId !== sessionId) return;
    pairing.value = { ...pairing.value, status: 'failed', error: reason || 'Pairing failed' };
  });

  void refresh();
}

async function startPairing(peer: DiscoveredPeer): Promise<void> {
  pairing.value = { active: true, sessionId: null, sas: null, status: 'starting', error: null, peerAlias: peer.alias };
  try {
    const result = await peersClient.peerStartPairing(peer.machineId);
    if (result?.ok && result.sessionId) {
      pairing.value = { ...pairing.value, sessionId: result.sessionId, status: 'awaiting-sas' };
    } else {
      pairing.value = { ...pairing.value, status: 'failed', error: result?.reason || 'Could not start pairing' };
    }
  } catch (error) {
    pairing.value = { ...pairing.value, status: 'failed', error: error instanceof Error ? error.message : 'Could not start pairing' };
  }
}

async function confirmPairing(accepted: boolean): Promise<void> {
  const sessionId = pairing.value.sessionId;
  if (!sessionId) return;
  pairing.value = { ...pairing.value, status: accepted ? 'confirmed' : 'failed' };
  try {
    await peersClient.peerConfirmPairing(sessionId, accepted);
  } catch { /* onPeerFailed will surface the error */ }
  if (!accepted) closePairing();
}

async function cancelPairing(): Promise<void> {
  try {
    await peersClient.peerCancelPairing();
  } catch { /* ignore */ }
  closePairing();
}

function closePairing(): void {
  pairing.value = emptyPairing();
}

/**
 * Persist + hot-apply a federation config change (enabled/host/port), then refetch
 * the config and peer lists so the UI reflects the live state. Mirrors the MCP
 * onMcpUpdate flow: set → get → refresh.
 */
async function setFederationConfig(updates: Partial<FederationConfig>): Promise<void> {
  await configClient.configSetFederationConfig(updates);
  await loadFederationConfig();
  await refresh();
}

async function setAllowList(peerId: string, allow: string[]): Promise<void> {
  await peersClient.peerSetAllowList(peerId, allow);
  await refresh();
}

async function setEnabled(peerId: string, enabled: boolean): Promise<void> {
  await peersClient.peerSetEnabled(peerId, enabled);
  await refresh();
}

async function unpair(peerId: string): Promise<void> {
  await peersClient.peerUnpair(peerId);
  await refresh();
}

/**
 * TEST-ONLY: reset the module-singleton so each test re-subscribes cleanly and
 * starts from empty state. Not used by production code — the singleton is meant
 * to persist for the app's lifetime.
 */
export function resetPeersStateForTesting(): void {
  subscribed = false;
  federationEnabled.value = false;
  federationConfig.value = { ...DEFAULT_FEDERATION_CONFIG };
  configuredPeers.value = [];
  discoveredPeers.value = [];
  audit.value = [];
  pairing.value = emptyPairing();
}

export function usePeers() {
  return {
    federationEnabled,
    federationConfig,
    setFederationConfig,
    configuredPeers,
    discoveredPeers,
    audit,
    pairing,
    ensureSubscribed,
    refresh,
    refreshAudit,
    startPairing,
    confirmPairing,
    cancelPairing,
    closePairing,
    setAllowList,
    setEnabled,
    unpair,
  };
}
