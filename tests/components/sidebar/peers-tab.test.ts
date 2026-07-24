/**
 * PeersTab component tests — real component + real usePeers composable, with the
 * IPC clients mocked at the module boundary (fakes, not mocks-with-verify where
 * avoidable). Covers rendering paired peers (dot colour + direction + enable
 * toggle), the discover section (excluding already-paired), the allow-list editor
 * (add / preset / remove → peerSetAllowList), enable toggle, and unpair.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

// --- Fake IPC surface --------------------------------------------------------
const state = {
  federationEnabled: true,
  peers: [] as any[],
  discovered: [] as any[],
  audit: [] as any[],
  fed: { enabled: true, host: '0.0.0.0', port: 47474 },
};

const peerFederationEnabled = vi.fn(async () => state.federationEnabled);
const peerList = vi.fn(async () => state.peers);
const peerListDiscovered = vi.fn(async () => state.discovered);
const peerGetAudit = vi.fn(async () => state.audit);
const peerSetAllowList = vi.fn(async () => ({ ok: true }));
const peerSetEnabled = vi.fn(async () => ({ ok: true }));
const peerUnpair = vi.fn(async () => ({ ok: true }));
const peerStartPairing = vi.fn(async () => ({ ok: true, sessionId: 's-1' }));
const peerConfirmPairing = vi.fn(async () => ({ ok: true }));
const peerCancelPairing = vi.fn(async () => ({ ok: true }));
const configSetFederationConfig = vi.fn(async (updates: any) => { state.fed = { ...state.fed, ...updates }; return { success: true }; });
const configGetFederationConfig = vi.fn(async () => ({ ...state.fed }));

// Captured event callbacks so tests can drive events (composable subscribes once).
const handlers: Record<string, ((data?: any) => void) | undefined> = {};
function capture(name: string) {
  return (cb: (data?: any) => void) => { handlers[name] = cb; return () => { handlers[name] = undefined; }; };
}

vi.mock('../../../renderer/ipc/clients.js', () => ({
  peersClient: {
    peerFederationEnabled: (...a: any[]) => peerFederationEnabled(...a),
    peerList: (...a: any[]) => peerList(...a),
    peerListDiscovered: (...a: any[]) => peerListDiscovered(...a),
    peerGetAudit: (...a: any[]) => peerGetAudit(...a),
    peerSetAllowList: (...a: any[]) => peerSetAllowList(...a),
    peerSetEnabled: (...a: any[]) => peerSetEnabled(...a),
    peerUnpair: (...a: any[]) => peerUnpair(...a),
    peerStartPairing: (...a: any[]) => peerStartPairing(...a),
    peerConfirmPairing: (...a: any[]) => peerConfirmPairing(...a),
    peerCancelPairing: (...a: any[]) => peerCancelPairing(...a),
  },
  configClient: {
    configSetFederationConfig: (...a: any[]) => configSetFederationConfig(...a),
    configGetFederationConfig: (...a: any[]) => configGetFederationConfig(...a),
  },
  eventsClient: {
    onPeerConfigChanged: capture('config'),
    onPeerLinkStatus: capture('link'),
    onPeerAuditChanged: capture('audit'),
    onPeerDiscovered: capture('discovered'),
    onPeerLost: capture('lost'),
    onPeerSas: capture('sas'),
    onPeerPaired: capture('paired'),
    onPeerFailed: capture('failed'),
  },
}));

import PeersTab from '../../../renderer/components/sidebar/PeersTab.vue';
import { getPeerStatusColor } from '../../../renderer/state-colors.js';
import { resetPeersStateForTesting } from '../../../renderer/composables/usePeers.js';

/** jsdom normalises inline hex colours to rgb(); convert so assertions match. */
function hexToRgb(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

function onlinePeer(over: Partial<any> = {}) {
  return {
    id: 'p1', machineId: 'mac-1', alias: 'the Mac', address: '10.0.0.5:47474',
    direction: 'bidirectional', allow: ['session_*'], enabled: true, online: true, ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetPeersStateForTesting();
  state.federationEnabled = true;
  state.peers = [];
  state.discovered = [];
  state.audit = [];
  state.fed = { enabled: true, host: '0.0.0.0', port: 47474 };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PeersTab', () => {
  it('renders a paired peer with the online dot colour and direction', async () => {
    state.peers = [onlinePeer()];
    const w = mount(PeersTab);
    await flushPromises();

    const row = w.find('.peer-row');
    expect(row.exists()).toBe(true);
    expect(row.text()).toContain('the Mac');
    expect(row.text()).toContain('bidirectional');

    const dot = row.find('.peer-dot');
    // Explicit colour (dark-mode legibility): online green, not a default.
    expect(dot.attributes('style')).toContain(hexToRgb(getPeerStatusColor('online')));
    expect(getPeerStatusColor('online')).toBe('#44cc44');
  });

  it('shows a disabled peer with the enable toggle off', async () => {
    state.peers = [onlinePeer({ enabled: false, online: false })];
    const w = mount(PeersTab);
    await flushPromises();

    const toggle = w.find('.peer-enable-input');
    expect((toggle.element as HTMLInputElement).checked).toBe(false);
    // Offline dot is grey, explicitly.
    expect(w.find('.peer-dot').attributes('style')).toContain(hexToRgb(getPeerStatusColor('offline')));
    expect(getPeerStatusColor('offline')).toBe('#555555');
  });

  it('lists discovered peers excluding already-paired, and Pair starts pairing', async () => {
    state.peers = [onlinePeer({ machineId: 'mac-1' })];
    state.discovered = [
      { machineId: 'mac-1', alias: 'the Mac', address: '10.0.0.5:47474' }, // already paired
      { machineId: 'mac-2', alias: 'the PC', address: '10.0.0.6:47474' },  // pairable
    ];
    const w = mount(PeersTab);
    await flushPromises();

    const rows = w.findAll('.peer-discovered-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].text()).toContain('the PC');

    await rows[0].find('.peer-pair-btn').trigger('click');
    await flushPromises();
    expect(peerStartPairing).toHaveBeenCalledWith('mac-2');
  });

  it('allow-list editor: adding a pattern saves the new array (debounced)', async () => {
    vi.useFakeTimers();
    state.peers = [onlinePeer({ allow: ['session_*'] })];
    const w = mount(PeersTab);
    await flushPromises();

    await w.find('.peer-allow-toggle').trigger('click');
    const input = w.find('.peer-add-input');
    await input.setValue('artifact_get');
    await w.find('.peer-add-btn').trigger('click');

    vi.runAllTimers();
    await flushPromises();
    expect(peerSetAllowList).toHaveBeenCalledWith('p1', ['session_*', 'artifact_get']);
  });

  it('allow-list editor: a preset button sets the expected globs', async () => {
    vi.useFakeTimers();
    state.peers = [onlinePeer({ allow: [] })];
    const w = mount(PeersTab);
    await flushPromises();

    await w.find('.peer-allow-toggle').trigger('click');
    const presetBtn = w.findAll('.peer-preset-btn').find(b => b.text() === 'Read-only')!;
    await presetBtn.trigger('click');

    vi.runAllTimers();
    await flushPromises();
    expect(peerSetAllowList).toHaveBeenCalledWith('p1', ['session_list', 'plan_*', 'directory_list', 'project_list']);
  });

  it('allow-list editor: removing a pattern persists the smaller array', async () => {
    vi.useFakeTimers();
    state.peers = [onlinePeer({ allow: ['session_*', 'artifact_get'] })];
    const w = mount(PeersTab);
    await flushPromises();

    await w.find('.peer-allow-toggle').trigger('click');
    const removeBtn = w.findAll('.peer-glob-remove')[0];
    await removeBtn.trigger('click');

    vi.runAllTimers();
    await flushPromises();
    expect(peerSetAllowList).toHaveBeenCalledWith('p1', ['artifact_get']);
  });

  it('enable toggle calls peerSetEnabled with the new value', async () => {
    state.peers = [onlinePeer({ enabled: true })];
    const w = mount(PeersTab);
    await flushPromises();

    await w.find('.peer-enable-input').setValue(false);
    await flushPromises();
    expect(peerSetEnabled).toHaveBeenCalledWith('p1', false);
  });

  it('unpair calls peerUnpair with the peer id', async () => {
    state.peers = [onlinePeer()];
    const w = mount(PeersTab);
    await flushPromises();

    await w.find('.peer-unpair').trigger('click');
    await flushPromises();
    expect(peerUnpair).toHaveBeenCalledWith('p1');
  });

  it('renders the FederationConfigPanel at the top of the tab', async () => {
    const w = mount(PeersTab);
    await flushPromises();
    expect(w.find('.federation-config-panel').exists()).toBe(true);
  });

  it('toggling the panel enabled checkbox calls setFederationConfig({ enabled })', async () => {
    state.fed = { enabled: false, host: '0.0.0.0', port: 47474 };
    state.federationEnabled = false;
    const w = mount(PeersTab);
    await flushPromises();

    const box = w.find('.federation-config-panel input[type="checkbox"]');
    await box.setValue(true);
    await flushPromises();
    expect(configSetFederationConfig).toHaveBeenCalledWith({ enabled: true });
  });
});
