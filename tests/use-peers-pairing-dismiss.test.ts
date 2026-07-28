/**
 * A successful pairing must clear itself. The SAS dialog is driven entirely by
 * `pairing.active`, and nothing used to reset it once the peer confirmed — so the
 * six digits stayed on screen indefinitely after the pairing had already finished.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** The sessionId the next startPairing() call resolves with. */
let pendingSessionId = 'session-1';

/** Captured event handlers, so a test can fire a real main-process event. */
const handlers: Record<string, (payload: any) => void> = {};
const on = (name: string) => (cb: (payload: any) => void) => { handlers[name] = cb; };

vi.mock('../renderer/ipc/clients.js', () => ({
  peersClient: {
    peerList: async () => [],
    peerListDiscovered: async () => [],
    peerGetAudit: async () => [],
    peerStartPairing: async (...args: any[]) => ({ ok: true, sessionId: pendingSessionId }),
  },
  configClient: {
    configGetFleetConfig: async () => ({ enabled: true, host: '0.0.0.0', port: 47474 }),
    configGetFleetStatus: async () => ({
      enabled: true, running: true, error: null, addresses: [], allInterfaces: true,
    }),
  },
  eventsClient: {
    onPeerIncoming: on('incoming'),
    onPeerSas: on('sas'),
    onPeerPaired: on('paired'),
    onPeerFailed: on('failed'),
    onPeerDiscovered: on('discovered'),
    onPeerLost: on('lost'),
    onPeerConfigChanged: on('config'),
    onPeerLinkStatus: on('link'),
    onPeerAuditChanged: on('audit'),
  },
}));

const { usePeers, resetPeersStateForTesting, PAIRED_DISMISS_MS } =
  await import('../renderer/composables/usePeers.js');

beforeEach(() => {
  vi.useFakeTimers();
  resetPeersStateForTesting();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('pairing dialog dismissal', () => {
  it('holds the success state briefly, then closes itself', async () => {
    const { pairing, ensureSubscribed, startPairing } = usePeers();
    ensureSubscribed();
    await vi.advanceTimersByTimeAsync(0);

    pendingSessionId = 'session-1';
    await startPairing({ machineId: 'machine-b', alias: 'Laptop', address: '10.0.0.2:47474' });
    handlers.sas({ sessionId: 'session-1', sas: '123456' });
    expect(pairing.value.active).toBe(true);
    expect(pairing.value.sas).toBe('123456');

    handlers.paired({ sessionId: 'session-1' });
    // Still visible, but reporting success rather than asking for a decision.
    expect(pairing.value.active).toBe(true);
    expect(pairing.value.status).toBe('paired');

    await vi.advanceTimersByTimeAsync(PAIRED_DISMISS_MS);
    expect(pairing.value.active).toBe(false);
    expect(pairing.value.sas).toBeNull();
  });

  it('does not let a stale dismissal close a pairing started right after', async () => {
    const { pairing, ensureSubscribed, startPairing } = usePeers();
    ensureSubscribed();
    await vi.advanceTimersByTimeAsync(0);

    handlers.paired({ sessionId: 'session-1' });
    // The user immediately pairs with a second machine.
    pendingSessionId = 'session-2';
    await startPairing({ machineId: 'machine-c', alias: 'Desk', address: '10.0.0.9:47474' });
    await vi.advanceTimersByTimeAsync(PAIRED_DISMISS_MS * 2);

    expect(pairing.value.active).toBe(true);
    expect(pairing.value.sessionId).toBe('session-2');
  });
});
