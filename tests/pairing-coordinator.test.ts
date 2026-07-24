/**
 * PairingCoordinator tests — single-active-session, 180s expiry, one decision per
 * session, and the failure rate caps. Injected clock; a fake PeerPairing factory
 * so we exercise the coordinator's session/rate logic in isolation.
 */

import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { PairingCoordinator, PAIRING_SESSION_TTL_MS } from '../src/mcp/peer/pairing-coordinator.js';

/** A fake pairing that lets tests drive begin/accept/reject/cancel + events. */
class FakePairing extends EventEmitter {
  began = false;
  accepted = 0;
  rejected = 0;
  cancelled: string[] = [];
  begin(): void { this.began = true; }
  accept(): void { this.accepted++; }
  reject(): void { this.rejected++; }
  cancel(reason = 'cancelled'): void { this.cancelled.push(reason); this.emit('failed', { reason }); }
  getSas(): string | null { return '123456'; }
}

const peerInfo = (machineId = 'peer-1') => ({
  machineId, certFp: 'FP', alias: 'a', address: '10.0.0.1:47474',
});

function makeCoordinator(clock: () => number) {
  const created: FakePairing[] = [];
  const coord = new PairingCoordinator({
    now: clock,
    createPairing: () => {
      const p = new FakePairing();
      created.push(p);
      return p as any;
    },
  });
  return { coord, created };
}

describe('single active session', () => {
  it('starts one session; a second start while active is rejected', () => {
    let t = 0;
    const { coord } = makeCoordinator(() => t);
    const s1 = coord.start(peerInfo('a'));
    expect(s1.ok).toBe(true);
    const s2 = coord.start(peerInfo('b'));
    expect(s2.ok).toBe(false);
  });

  it('after the active session is cancelled a new one may start', () => {
    let t = 0;
    const { coord } = makeCoordinator(() => t);
    const s1 = coord.start(peerInfo('a'));
    expect(s1.ok).toBe(true);
    coord.cancel();
    const s2 = coord.start(peerInfo('b'));
    expect(s2.ok).toBe(true);
  });

  it('success consumes the session so a new one may start', () => {
    let t = 0;
    const { coord, created } = makeCoordinator(() => t);
    coord.start(peerInfo('a'));
    created[0].emit('paired', { peerId: 'x', machineId: 'a' });
    const s2 = coord.start(peerInfo('b'));
    expect(s2.ok).toBe(true);
  });
});

describe('180s expiry', () => {
  it('the active session expires after the TTL, freeing a new start', () => {
    let t = 0;
    const { coord, created } = makeCoordinator(() => t);
    coord.start(peerInfo('a'));
    expect(coord.listActive()).toHaveLength(1);

    t += PAIRING_SESSION_TTL_MS + 1;
    // A start attempt (or any tick) past the TTL reaps the expired session.
    const s2 = coord.start(peerInfo('b'));
    expect(s2.ok).toBe(true);
    // The expired one was cancelled.
    expect(created[0].cancelled.length).toBeGreaterThan(0);
  });

  it('TTL constant is 180 seconds', () => {
    expect(PAIRING_SESSION_TTL_MS).toBe(180_000);
  });
});

describe('one decision per session', () => {
  it('confirm(accept) then a second decision is ignored', () => {
    let t = 0;
    const { coord, created } = makeCoordinator(() => t);
    const started = coord.start(peerInfo('a'));
    coord.confirm(started.sessionId!, true);
    coord.confirm(started.sessionId!, false);
    expect(created[0].accepted).toBe(1);
    expect(created[0].rejected).toBe(0);
  });

  it('confirm on an unknown sessionId is a no-op', () => {
    let t = 0;
    const { coord } = makeCoordinator(() => t);
    coord.start(peerInfo('a'));
    expect(() => coord.confirm('nope', true)).not.toThrow();
  });
});

describe('rate caps', () => {
  it('3 failed sessions for a source within 10min → 4th blocked (cooldown)', () => {
    let t = 0;
    const { coord, created } = makeCoordinator(() => t);
    for (let i = 0; i < 3; i++) {
      const s = coord.start(peerInfo('same-source'));
      expect(s.ok).toBe(true);
      created[i].emit('failed', { reason: 'user-rejected' });
      t += 1000;
    }
    // Fourth start for the SAME source within the window is blocked.
    const blocked = coord.start(peerInfo('same-source'));
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toMatch(/cooldown|rate/i);
  });

  it('a different source is not affected by another source cooldown', () => {
    let t = 0;
    const { coord, created } = makeCoordinator(() => t);
    for (let i = 0; i < 3; i++) {
      coord.start(peerInfo('src-a'));
      created[i].emit('failed', { reason: 'expired' });
      t += 1000;
    }
    coord.start(peerInfo('src-a')); // blocked, but consumes nothing
    const other = coord.start(peerInfo('src-b'));
    expect(other.ok).toBe(true);
  });

  it('cooldown lifts after 15 minutes', () => {
    let t = 0;
    const { coord, created } = makeCoordinator(() => t);
    for (let i = 0; i < 3; i++) {
      coord.start(peerInfo('src'));
      created[i].emit('failed', { reason: 'user-rejected' });
      t += 1000;
    }
    expect(coord.start(peerInfo('src')).ok).toBe(false);
    t += 15 * 60_000 + 1;
    expect(coord.start(peerInfo('src')).ok).toBe(true);
  });

  it('global cap: 10 starts within 10min → 11th blocked even for fresh sources', () => {
    let t = 0;
    const { coord, created } = makeCoordinator(() => t);
    for (let i = 0; i < 10; i++) {
      const s = coord.start(peerInfo(`src-${i}`));
      expect(s.ok).toBe(true);
      created[i].emit('failed', { reason: 'expired' });
      t += 1000;
    }
    const blocked = coord.start(peerInfo('src-fresh'));
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toMatch(/global|rate/i);
  });
});
