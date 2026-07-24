/**
 * PeerAuditLog — rolling 7-day trail of every inbound remote-peer call decision.
 *
 * Mirrors ScheduledTaskHistoryManager: EventEmitter, append → unshift
 * newest-first → prune by cutoff → persist → emit; injectable clock. The persist
 * sink is injected (defaulting to the YAML persistence module) so the log is
 * unit-testable with a fake.
 *
 * SECURITY — this is the whole point of the module: entries store NO payload
 * values and NO secrets. `argSummary` is a short string of top-level argument
 * KEY NAMES only (built by the gate), and `error` is a message string only. A
 * reviewer must be able to read this log without leaking anything sensitive.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { savePeerAudit, loadPeerAudit, AUDIT_WINDOW_MS } from './peer-audit-persistence.js';

export { AUDIT_WINDOW_MS };

export type PeerAuditOutcome = 'ok' | 'denied' | 'rate-limited' | 'error';

export interface PeerAuditEntry {
  id: string;
  peerId: string;
  method: string;
  /** Top-level argument KEY NAMES only — NEVER values. e.g. "keys: name,dir". */
  argSummary: string;
  outcome: PeerAuditOutcome;
  ranAt: number;
  /** Error message string only (no payloads); present when outcome === 'error'. */
  error?: string;
}

export type PeerAuditPersist = (entries: PeerAuditEntry[]) => void;

export class PeerAuditLog extends EventEmitter {
  private entries: PeerAuditEntry[];

  constructor(
    private readonly persist: PeerAuditPersist = (e) => savePeerAudit(e),
    private readonly now: () => number = Date.now,
  ) {
    super();
    this.entries = loadPeerAudit(undefined, now());
  }

  /**
   * Record a decision. Assigns an id, inserts newest-first, prunes the retention
   * window, persists, and emits 'peer-audit:changed'.
   */
  append(entry: Omit<PeerAuditEntry, 'id'>): PeerAuditEntry {
    const created: PeerAuditEntry = { id: randomUUID(), ...entry };
    this.entries.unshift(created);
    this.prune();
    this.persist(this.entries);
    this.emit('peer-audit:changed');
    return created;
  }

  /** All entries, newest first. */
  list(): PeerAuditEntry[] {
    return [...this.entries].sort((a, b) => b.ranAt - a.ranAt);
  }

  /** Snapshot for persistence (independent copies). */
  exportAll(): PeerAuditEntry[] {
    return this.entries.map(e => ({ ...e }));
  }

  /** Replace internal state (used on hydrate); re-prunes defensively. */
  importAll(entries: PeerAuditEntry[]): void {
    this.entries = Array.isArray(entries) ? entries.map(e => ({ ...e })) : [];
    this.prune();
  }

  /** Drop entries whose ranAt falls outside the retention window. */
  private prune(): void {
    const cutoff = this.now() - AUDIT_WINDOW_MS;
    this.entries = this.entries.filter(e => e.ranAt >= cutoff);
  }
}
