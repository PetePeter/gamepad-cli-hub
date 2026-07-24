/**
 * PinnedCertStore — trust-on-first-use pin store for peer certificate
 * fingerprints.
 *
 * SECURITY CONTRACT: a pin is written exactly once (record-if-absent) and NEVER
 * auto-rotates. A subsequent fingerprint that DIFFERS from the pin is a hard
 * MITM reject ('exists-mismatch') and leaves the stored pin untouched. The only
 * way a pin changes after being set is an explicit `removePin` (user unpair) —
 * PSK/handshake failures must never call it.
 *
 * Mirrors the injected-persist manager idiom (RuntimeGroupManager): no disk
 * access in the constructor; the orchestrator hydrates via importAll and supplies
 * the persist callback.
 */

import { EventEmitter } from 'node:events';
import { timingSafeEqual } from 'node:crypto';
import { logger } from '../../utils/logger.js';

export interface PinnedCert {
  peerId: string;
  fingerprint: string;
}

export type RecordOutcome = 'recorded' | 'exists-match' | 'exists-mismatch';

export class PinnedCertStore extends EventEmitter {
  private pins = new Map<string, string>();

  constructor(private readonly persist?: (pins: PinnedCert[]) => void) {
    super();
  }

  /**
   * Atomic record-if-absent. Returns 'recorded' when a new pin is stored,
   * 'exists-match' when the existing pin already equals `fingerprint` (no-op),
   * and 'exists-mismatch' when a DIFFERENT pin exists (stored pin unchanged).
   */
  recordIfAbsent(peerId: string, fingerprint: string): RecordOutcome {
    const fp = normalize(fingerprint);
    const existing = this.pins.get(peerId);
    if (existing === undefined) {
      this.pins.set(peerId, fp);
      this.markChanged();
      logger.info(`[PinnedCertStore] Pinned cert for peer ${peerId}`);
      return 'recorded';
    }
    if (existing === fp) return 'exists-match';
    logger.warn(`[PinnedCertStore] Cert fingerprint mismatch for peer ${peerId} — rejected (pin unchanged)`);
    return 'exists-mismatch';
  }

  /** True iff a pin exists for `peerId` and equals `fingerprint` (constant-time). */
  verify(peerId: string, fingerprint: string): boolean {
    const existing = this.pins.get(peerId);
    if (existing === undefined) return false;
    const a = Buffer.from(existing, 'utf8');
    const b = Buffer.from(normalize(fingerprint), 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  /** Explicit unpair — the ONLY way a set pin is removed. */
  removePin(peerId: string): boolean {
    if (!this.pins.has(peerId)) return false;
    this.pins.delete(peerId);
    this.markChanged();
    logger.info(`[PinnedCertStore] Removed pin for peer ${peerId}`);
    return true;
  }

  /** The pinned fingerprint for `peerId`, or undefined. */
  get(peerId: string): string | undefined {
    return this.pins.get(peerId);
  }

  /** All pins as independent copies. */
  list(): PinnedCert[] {
    return [...this.pins.entries()].map(([peerId, fingerprint]) => ({ peerId, fingerprint }));
  }

  /** Snapshot for persistence. */
  exportAll(): PinnedCert[] {
    return this.list();
  }

  /** Replace state from persisted data, dropping structurally invalid entries. */
  importAll(pins: PinnedCert[]): void {
    this.pins = new Map();
    for (const p of Array.isArray(pins) ? pins : []) {
      if (p && typeof p.peerId === 'string' && p.peerId.length > 0 &&
          typeof p.fingerprint === 'string' && p.fingerprint.length > 0) {
        this.pins.set(p.peerId, normalize(p.fingerprint));
      }
    }
    logger.info(`[PinnedCertStore] Imported ${this.pins.size} pin(s)`);
  }

  private markChanged(): void {
    this.persist?.(this.exportAll());
    this.emit('peer-pins:changed');
  }
}

/** Normalize a fingerprint to a canonical comparable form (uppercase). */
function normalize(fingerprint: string): string {
  return fingerprint.toUpperCase();
}
