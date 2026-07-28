/**
 * PairingCoordinator — the global UX/safety gatekeeper around PeerPairing.
 *
 * INVARIANTS (all with an INJECTABLE clock so tests are deterministic):
 *  - EXACTLY ONE active pairing session globally. Starting another while one is
 *    live is rejected (unless the prior expired/was cancelled/succeeded).
 *  - 180-second session expiry. An expired session is reaped (cancelled) lazily
 *    on the next start/confirm/list.
 *  - EXACTLY ONE accept/reject decision per session (idempotent; the coordinator
 *    consumes the session on the first decision path).
 *  - Every attempt is a FRESH PeerPairing (fresh keys/nonce/sessionId/SAS) — this
 *    coordinator never reuses one.
 *  - RATE CAPS (guarding spoofed ids): max 3 failed/rejected/expired sessions per
 *    source-key per 10 min → then a 15-min cooldown for that source; PLUS a global
 *    cap of 10 starts per 10 min. source-key = peer machineId (MVP).
 *
 * The PeerPairing factory is injected so this logic is unit-testable with a fake.
 * A successful pairing consumes the active session immediately.
 */

import { randomUUID } from 'node:crypto';
import { logger } from '../../utils/logger.js';
import type { PairingPeerInfo } from './peer-pairing.js';

/** 180-second pairing-session time-to-live. */
export const PAIRING_SESSION_TTL_MS = 180_000;

/** Per-source failure window + cap + cooldown. */
const FAILURE_WINDOW_MS = 10 * 60_000;
const MAX_FAILURES_PER_SOURCE = 3;
const SOURCE_COOLDOWN_MS = 15 * 60_000;

/** Global start cap (guards a flood of spoofed source ids). */
const GLOBAL_WINDOW_MS = 10 * 60_000;
const MAX_GLOBAL_STARTS = 10;

/** The minimal PeerPairing surface the coordinator drives. */
export interface CoordinatedPairing {
  begin(): void;
  accept(): void;
  reject(): void;
  cancel(reason?: string): void;
  getSas(): string | null;
  on(event: 'sas' | 'paired' | 'failed', listener: (arg: any) => void): unknown;
}

export interface PairingCoordinatorOptions {
  now?: () => number;
  /** Injected factory — one FRESH pairing per start (real one wired in prod). */
  createPairing: (sessionId: string, peer: PairingPeerInfo) => CoordinatedPairing;
}

export interface StartResult {
  ok: boolean;
  sessionId?: string;
  reason?: string;
}

export interface ActiveSessionInfo {
  sessionId: string;
  peerMachineId: string;
  startedAt: number;
  sas: string | null;
}

interface ActiveSession {
  sessionId: string;
  peer: PairingPeerInfo;
  pairing: CoordinatedPairing;
  startedAt: number;
  decided: boolean;
  settled: boolean;
}

export class PairingCoordinator {
  private readonly now: () => number;
  private readonly createPairing: PairingCoordinatorOptions['createPairing'];

  private active: ActiveSession | null = null;
  /** Per-source failure timestamps (pruned to the window). */
  private readonly failures = new Map<string, number[]>();
  /** Global start timestamps (pruned to the window). */
  private globalStarts: number[] = [];

  constructor(opts: PairingCoordinatorOptions) {
    this.now = opts.now ?? Date.now;
    this.createPairing = opts.createPairing;
  }

  /** Attempt to start a pairing session with `peer`. */
  start(peer: PairingPeerInfo): StartResult {
    this.reapExpired();

    if (this.active) {
      return { ok: false, reason: 'a pairing session is already active' };
    }

    const source = peer.machineId;
    if (this.inCooldown(source)) {
      return { ok: false, reason: 'source in cooldown after repeated failures (rate)' };
    }
    if (this.globalCapReached()) {
      return { ok: false, reason: 'global pairing rate cap reached (rate)' };
    }

    const sessionId = randomUUID();
    const pairing = this.createPairing(sessionId, peer);
    const session: ActiveSession = {
      sessionId, peer, pairing, startedAt: this.now(), decided: false, settled: false,
    };
    this.active = session;
    this.globalStarts.push(session.startedAt);

    pairing.on('paired', () => this.onSettled(session, 'paired'));
    pairing.on('failed', () => this.onSettled(session, 'failed'));

    pairing.begin();
    logger.info(`[PairingCoordinator] Started pairing ${sessionId} with ${source}`);
    return { ok: true, sessionId };
  }

  /**
   * Adopt an INBOUND pairing a peer initiated. Identical guards to start() — one
   * session at a time, per-source cooldown, global cap — so a hostile peer cannot
   * use the inbound path to bypass the rate limits the outbound path enforces.
   *
   * The sessionId comes FROM THE WIRE (PeerPairing filters frames on it, so both
   * ends must agree). It is untrusted: it is only ever used as a correlation key,
   * never as key material — the SAS transcript binds it, so a forged one changes
   * the code the users compare.
   */
  startInbound(peer: PairingPeerInfo, sessionId: string, pairing: CoordinatedPairing): StartResult {
    this.reapExpired();

    if (this.active) return { ok: false, reason: 'a pairing session is already active' };
    if (this.inCooldown(peer.machineId)) return { ok: false, reason: 'source in cooldown after repeated failures (rate)' };
    if (this.globalCapReached()) return { ok: false, reason: 'global pairing rate cap reached (rate)' };

    const session: ActiveSession = {
      sessionId, peer, pairing, startedAt: this.now(), decided: false, settled: false,
    };
    this.active = session;
    this.globalStarts.push(session.startedAt);

    pairing.on('paired', () => this.onSettled(session, 'paired'));
    pairing.on('failed', () => this.onSettled(session, 'failed'));

    // No begin() — the responder answers the initiator's commit, it never leads.
    logger.info(`[PairingCoordinator] Adopted inbound pairing ${sessionId} from ${peer.machineId}`);
    return { ok: true, sessionId };
  }

  /**
   * Apply the user's ONE accept/reject decision for `sessionId`. A second decision
   * (or an unknown session) is ignored.
   */
  confirm(sessionId: string, accepted: boolean): void {
    this.reapExpired();
    const session = this.active;
    if (!session || session.sessionId !== sessionId || session.decided) return;
    session.decided = true;
    if (accepted) session.pairing.accept();
    else session.pairing.reject();
  }

  /** Cancel the active session (user abort / shutdown). */
  cancel(): void {
    if (!this.active) return;
    const session = this.active;
    session.pairing.cancel('cancelled');
    // onSettled('failed') from cancel() clears active; guard if the fake doesn't emit.
    if (this.active === session) this.clear(session);
  }

  /** Snapshot of the active session (empty when idle / after reaping). */
  listActive(): ActiveSessionInfo[] {
    this.reapExpired();
    if (!this.active) return [];
    return [{
      sessionId: this.active.sessionId,
      peerMachineId: this.active.peer.machineId,
      startedAt: this.active.startedAt,
      sas: this.active.pairing.getSas(),
    }];
  }

  // ---------------------------------------------------------------- internals

  private onSettled(session: ActiveSession, kind: 'paired' | 'failed'): void {
    if (session.settled) return;
    session.settled = true;
    if (kind === 'failed') this.recordFailure(session.peer.machineId);
    if (this.active === session) this.active = null;
  }

  private clear(session: ActiveSession): void {
    if (!session.settled) {
      session.settled = true;
      this.recordFailure(session.peer.machineId);
    }
    if (this.active === session) this.active = null;
  }

  /** Reap the active session if it has outlived the TTL. */
  private reapExpired(): void {
    if (!this.active) return;
    if (this.now() - this.active.startedAt >= PAIRING_SESSION_TTL_MS) {
      const expired = this.active;
      logger.info(`[PairingCoordinator] Session ${expired.sessionId} expired`);
      // cancel() emits 'failed' → onSettled records the failure + clears active.
      expired.pairing.cancel('expired');
      if (this.active === expired) this.clear(expired);
    }
  }

  private recordFailure(source: string): void {
    const now = this.now();
    const list = (this.failures.get(source) ?? []).filter(t => now - t < FAILURE_WINDOW_MS);
    list.push(now);
    this.failures.set(source, list);
  }

  private inCooldown(source: string): boolean {
    const now = this.now();
    const list = (this.failures.get(source) ?? []).filter(t => now - t < SOURCE_COOLDOWN_MS);
    this.failures.set(source, list);
    // Cooldown applies once the source hit the cap within the failure window and
    // the most recent failure is still inside the 15-min cooldown.
    const recentInWindow = list.filter(t => now - t < FAILURE_WINDOW_MS);
    if (recentInWindow.length >= MAX_FAILURES_PER_SOURCE) return true;
    return false;
  }

  private globalCapReached(): boolean {
    const now = this.now();
    this.globalStarts = this.globalStarts.filter(t => now - t < GLOBAL_WINDOW_MS);
    return this.globalStarts.length >= MAX_GLOBAL_STARTS;
  }
}
