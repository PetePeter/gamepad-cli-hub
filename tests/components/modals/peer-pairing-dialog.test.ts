/**
 * PeerPairingDialog component tests — real component + real usePeers composable,
 * IPC mocked at the module boundary. Verifies the SAS is shown from an onPeerSas
 * event and that Confirm/Reject call peerConfirmPairing with true/false.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const peerStartPairing = vi.fn(async () => ({ ok: true, sessionId: 's-42' }));
const peerConfirmPairing = vi.fn(async () => ({ ok: true }));
const peerCancelPairing = vi.fn(async () => ({ ok: true }));

const handlers: Record<string, ((data?: any) => void) | undefined> = {};
function capture(name: string) {
  return (cb: (data?: any) => void) => { handlers[name] = cb; return () => { handlers[name] = undefined; }; };
}

vi.mock('../../../renderer/ipc/clients.js', () => ({
  peersClient: {
    peerFleetEnabled: vi.fn(async () => true),
    peerList: vi.fn(async () => []),
    peerListDiscovered: vi.fn(async () => []),
    peerGetAudit: vi.fn(async () => []),
    peerStartPairing: (...a: any[]) => peerStartPairing(...a),
    peerConfirmPairing: (...a: any[]) => peerConfirmPairing(...a),
    peerCancelPairing: (...a: any[]) => peerCancelPairing(...a),
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

import PeerPairingDialog from '../../../renderer/components/modals/PeerPairingDialog.vue';
import { usePeers, resetPeersStateForTesting } from '../../../renderer/composables/usePeers.js';

beforeEach(() => {
  vi.clearAllMocks();
  // Reset the singleton so each test re-subscribes cleanly (re-captures event
  // handlers) and starts from empty pairing state.
  resetPeersStateForTesting();
});

async function startAndShowSas(w: ReturnType<typeof mount>, sas: string) {
  const peers = usePeers();
  peers.ensureSubscribed();
  await peers.startPairing({ machineId: 'mac-2', alias: 'the PC', address: '10.0.0.6:47474' });
  await flushPromises();
  // Peer handshake surfaces the SAS.
  handlers['sas']?.({ sessionId: 's-42', sas });
  await flushPromises();
}

describe('PeerPairingDialog', () => {
  it('shows the SAS from an onPeerSas event and Confirm calls peerConfirmPairing(true)', async () => {
    const w = mount(PeerPairingDialog);
    await startAndShowSas(w, '482913');

    const cells = document.querySelectorAll('.pp-sas-cell');
    expect(cells).toHaveLength(6);
    const shown = Array.from(cells).map(c => c.textContent).join('');
    expect(shown).toBe('482913');

    const confirm = document.querySelector('.pp-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    confirm.click();
    await flushPromises();
    expect(peerConfirmPairing).toHaveBeenCalledWith('s-42', true);

    w.unmount();
  });

  it('Reject calls peerConfirmPairing(false)', async () => {
    const w = mount(PeerPairingDialog);
    await startAndShowSas(w, '112233');

    const reject = document.querySelector('.pp-reject') as HTMLButtonElement;
    reject.click();
    await flushPromises();
    expect(peerConfirmPairing).toHaveBeenCalledWith('s-42', false);

    w.unmount();
  });

  it('is hidden until pairing becomes active', async () => {
    const w = mount(PeerPairingDialog);
    await flushPromises();
    expect(document.querySelector('.peer-pairing-modal')).toBeNull();
    w.unmount();
  });
});
