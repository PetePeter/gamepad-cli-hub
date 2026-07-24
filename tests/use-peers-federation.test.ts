/**
 * usePeers federation-config tests (P-0658) — the in-app enable/host/port surface.
 * setFederationConfig persists via configClient.configSetFederationConfig, then
 * refetches configGetFederationConfig + refresh(); federationEnabled derives from
 * the fetched config. IPC clients are faked at the module boundary.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = {
  fed: { enabled: false, host: '0.0.0.0', port: 47474 },
  peers: [] as any[],
  discovered: [] as any[],
};

const configSetFederationConfig = vi.fn(async (updates: any) => {
  state.fed = { ...state.fed, ...updates };
  return { success: true };
});
const configGetFederationConfig = vi.fn(async () => ({ ...state.fed }));
const peerFederationEnabled = vi.fn(async () => state.fed.enabled);
const peerList = vi.fn(async () => state.peers);
const peerListDiscovered = vi.fn(async () => state.discovered);
const peerGetAudit = vi.fn(async () => []);

vi.mock('../renderer/ipc/clients.js', () => ({
  peersClient: {
    peerFederationEnabled: (...a: any[]) => peerFederationEnabled(...a),
    peerList: (...a: any[]) => peerList(...a),
    peerListDiscovered: (...a: any[]) => peerListDiscovered(...a),
    peerGetAudit: (...a: any[]) => peerGetAudit(...a),
  },
  configClient: {
    configSetFederationConfig: (...a: any[]) => configSetFederationConfig(...a),
    configGetFederationConfig: (...a: any[]) => configGetFederationConfig(...a),
  },
  eventsClient: {},
}));

const { usePeers, resetPeersStateForTesting } = await import('../renderer/composables/usePeers.js');

beforeEach(() => {
  vi.clearAllMocks();
  resetPeersStateForTesting();
  state.fed = { enabled: false, host: '0.0.0.0', port: 47474 };
});

describe('usePeers — federation config', () => {
  it('setFederationConfig persists via configClient then refetches the config', async () => {
    const { setFederationConfig, federationConfig } = usePeers();
    await setFederationConfig({ enabled: true, port: 50000 });

    expect(configSetFederationConfig).toHaveBeenCalledWith({ enabled: true, port: 50000 });
    expect(configGetFederationConfig).toHaveBeenCalled();
    expect(federationConfig.value).toEqual({ enabled: true, host: '0.0.0.0', port: 50000 });
  });

  it('federationEnabled derives from the fetched federation config', async () => {
    const { setFederationConfig, federationEnabled } = usePeers();
    expect(federationEnabled.value).toBe(false);
    await setFederationConfig({ enabled: true });
    expect(federationEnabled.value).toBe(true);
  });

  it('refetches peers/discovered after a config change so the UI stays consistent', async () => {
    const { setFederationConfig } = usePeers();
    await setFederationConfig({ enabled: true });
    expect(peerList).toHaveBeenCalled();
    expect(peerListDiscovered).toHaveBeenCalled();
  });
});
