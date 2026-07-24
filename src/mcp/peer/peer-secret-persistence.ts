/**
 * peer-secret-persistence — the ONE place that reads/writes the peer PINNED-CERT
 * store (peer-pins.yaml) and the peer SECRET store (peer-secrets.yaml).
 *
 * Extracted so both federation-startup and the pairing handlers share a single
 * persistence path (DRY) instead of duplicating YAML shapes. Secret VALUES live
 * base64 in peer-secrets.yaml and NOWHERE else — never logged, never echoed.
 */

import { existsSync, readFileSync } from 'node:fs';
import * as YAML from 'yaml';
import { logger } from '../../utils/logger.js';
import { atomicWriteFileSync, isRecord } from '../../session/persistence-utils.js';
import { PEER_PINS_FILE, PEER_SECRETS_FILE } from '../../session/persistence-paths.js';
import type { PinnedCert } from './pinned-cert-store.js';

// ---- pinned-cert persistence (YAML { pins: [...] }) -------------------------

export function savePeerPins(pins: PinnedCert[]): void {
  try {
    atomicWriteFileSync(PEER_PINS_FILE, YAML.stringify({ pins }), { mode: 0o600 });
  } catch (err) {
    logger.error(`[peer-persist] Failed to save peer pins: ${(err as Error).message}`);
  }
}

export function loadPeerPins(): PinnedCert[] {
  try {
    if (!existsSync(PEER_PINS_FILE)) return [];
    const parsed = YAML.parse(readFileSync(PEER_PINS_FILE, 'utf8')) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.pins)) return [];
    return parsed.pins as PinnedCert[];
  } catch (err) {
    logger.error(`[peer-persist] Failed to load peer pins: ${(err as Error).message}`);
    return [];
  }
}

// ---- secret persistence ({ pskRef: base64 }) --------------------------------
// Secret VALUES are stored base64 here and NOWHERE else. Never logged.

export function savePeerSecrets(secrets: Record<string, string>): void {
  try {
    atomicWriteFileSync(PEER_SECRETS_FILE, YAML.stringify(secrets), { mode: 0o600 });
  } catch (err) {
    logger.error(`[peer-persist] Failed to save peer secrets: ${(err as Error).message}`);
  }
}

export function loadPeerSecrets(): Record<string, string> {
  try {
    if (!existsSync(PEER_SECRETS_FILE)) return {};
    const parsed = YAML.parse(readFileSync(PEER_SECRETS_FILE, 'utf8')) as unknown;
    return isRecord(parsed) ? (parsed as Record<string, string>) : {};
  } catch (err) {
    logger.error(`[peer-persist] Failed to load peer secrets: ${(err as Error).message}`);
    return {};
  }
}
