/**
 * PinnedCertStore unit tests — real class, fake injected persist callback.
 * Cert-pin mismatch is a HARD MITM reject: the stored pin never auto-rotates.
 */

import { describe, it, expect, vi } from 'vitest';
import { PinnedCertStore } from '../src/mcp/peer/pinned-cert-store.js';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const FP_A = 'AA:BB:CC';
const FP_B = 'DD:EE:FF';

describe('PinnedCertStore', () => {
  it('recordIfAbsent first time → recorded, verifies, emits changed', () => {
    const persist = vi.fn();
    const store = new PinnedCertStore(persist);
    const events: number[] = [];
    store.on('peer-pins:changed', () => events.push(1));

    expect(store.recordIfAbsent('peer-1', FP_A)).toBe('recorded');
    expect(store.verify('peer-1', FP_A)).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
  });

  it('recordIfAbsent with the same fp → exists-match, pin unchanged, no extra persist', () => {
    const persist = vi.fn();
    const store = new PinnedCertStore(persist);
    store.recordIfAbsent('peer-1', FP_A);
    persist.mockClear();

    expect(store.recordIfAbsent('peer-1', FP_A)).toBe('exists-match');
    expect(store.verify('peer-1', FP_A)).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('recordIfAbsent with a DIFFERENT fp → exists-mismatch, stored pin UNCHANGED (MITM reject)', () => {
    const persist = vi.fn();
    const store = new PinnedCertStore(persist);
    store.recordIfAbsent('peer-1', FP_A);
    persist.mockClear();

    expect(store.recordIfAbsent('peer-1', FP_B)).toBe('exists-mismatch');
    // Old pin still authoritative; the new (attacker) fp is rejected.
    expect(store.verify('peer-1', FP_A)).toBe(true);
    expect(store.verify('peer-1', FP_B)).toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });

  it('verify on an unknown peer → false', () => {
    const store = new PinnedCertStore();
    expect(store.verify('nobody', FP_A)).toBe(false);
  });

  it('removePin is the only way a pin changes — a new pin can be recorded afterward', () => {
    const store = new PinnedCertStore();
    store.recordIfAbsent('peer-1', FP_A);

    expect(store.removePin('peer-1')).toBe(true);
    expect(store.verify('peer-1', FP_A)).toBe(false);
    // After explicit unpair a fresh pin is accepted.
    expect(store.recordIfAbsent('peer-1', FP_B)).toBe('recorded');
    expect(store.verify('peer-1', FP_B)).toBe(true);

    expect(store.removePin('nope')).toBe(false);
  });

  it('list / get expose pins defensively', () => {
    const store = new PinnedCertStore();
    store.recordIfAbsent('peer-1', FP_A);
    store.recordIfAbsent('peer-2', FP_B);

    expect(store.get('peer-1')).toBe(FP_A);
    expect(store.get('nope')).toBeUndefined();
    const list = store.list();
    expect(list).toHaveLength(2);
    expect(list.find(p => p.peerId === 'peer-1')!.fingerprint).toBe(FP_A);
  });

  it('exportAll / importAll round-trips and verify still matches', () => {
    const store = new PinnedCertStore();
    store.recordIfAbsent('peer-1', FP_A);
    const snapshot = store.exportAll();

    const store2 = new PinnedCertStore();
    store2.importAll(snapshot);
    expect(store2.verify('peer-1', FP_A)).toBe(true);
  });

  it('importAll drops structurally invalid entries', () => {
    const store = new PinnedCertStore();
    store.importAll([
      { peerId: 'good', fingerprint: FP_A },
      { garbage: true } as unknown as { peerId: string; fingerprint: string },
      { peerId: '', fingerprint: FP_B } as { peerId: string; fingerprint: string },
      { peerId: 'x', fingerprint: '' } as { peerId: string; fingerprint: string },
    ]);
    expect(store.list()).toHaveLength(1);
    expect(store.verify('good', FP_A)).toBe(true);
  });

  it('normalizes case: a lowercase pin verifies against uppercase and get() returns normalized form', () => {
    const store = new PinnedCertStore();
    expect(store.recordIfAbsent('peer-1', 'aa:bb:cc')).toBe('recorded');

    // Case-insensitive verification via the normalized (uppercase) form.
    expect(store.verify('peer-1', 'AA:BB:CC')).toBe(true);
    expect(store.verify('peer-1', 'aa:bb:cc')).toBe(true);

    // The stored/exposed pin is the normalized uppercase form.
    expect(store.get('peer-1')).toBe('AA:BB:CC');

    // A genuinely different fingerprint is still a mismatch, not auto-rotated.
    expect(store.recordIfAbsent('peer-1', 'DD:EE:FF')).toBe('exists-mismatch');
    expect(store.get('peer-1')).toBe('AA:BB:CC');
  });
});
