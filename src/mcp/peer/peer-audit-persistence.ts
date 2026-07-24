/**
 * Persistence for the peer audit log.
 *
 * Mirrors scheduled-task-history-persistence: YAML shape { entries: [...] }
 * written via atomicWriteFileSync (mode 0o600 — an audit trail should not be
 * world-readable). On load, stale entries (ranAt older than the 7-day window)
 * are defensively dropped so the file cannot grow unbounded.
 *
 * SECURITY: entries carry NO payload values and NO secrets by construction (the
 * gate only records argument KEY NAMES). This module never adds anything back.
 * The file path is a parameter (defaulting to PEER_AUDIT_FILE) purely so tests
 * can round-trip against a temp file.
 */

import { existsSync, readFileSync } from 'node:fs';
import * as YAML from 'yaml';
import { logger } from '../../utils/logger.js';
import { PEER_AUDIT_FILE } from '../../session/persistence-paths.js';
import { atomicWriteFileSync, isRecord } from '../../session/persistence-utils.js';
import type { PeerAuditEntry } from './peer-audit-log.js';

/** Retention window: entries older than this (by ranAt) are discarded. */
export const AUDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function savePeerAudit(entries: PeerAuditEntry[], file: string = PEER_AUDIT_FILE): void {
  try {
    atomicWriteFileSync(file, YAML.stringify({ entries }), { mode: 0o600 });
  } catch (err) {
    logger.error(`Failed to save peer audit log: ${err}`);
  }
}

export function loadPeerAudit(file: string = PEER_AUDIT_FILE, now: number = Date.now()): PeerAuditEntry[] {
  try {
    if (!existsSync(file)) return [];
    const parsed = YAML.parse(readFileSync(file, 'utf8')) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.entries)) return [];

    const cutoff = now - AUDIT_WINDOW_MS;
    return parsed.entries.filter(
      (e): e is PeerAuditEntry =>
        isRecord(e) && typeof e.ranAt === 'number' && e.ranAt >= cutoff,
    );
  } catch (err) {
    logger.error(`Failed to load peer audit log: ${err}`);
    return [];
  }
}
