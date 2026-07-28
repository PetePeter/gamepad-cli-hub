/**
 * Persistence for the peer registry.
 *
 * Mirrors runtime-group-persistence: YAML shape { peers: [...] } written via
 * atomicWriteFileSync. On load, entries that are not structurally valid
 * PeerConfigs are defensively dropped so a hand-edited or corrupt file can never
 * crash startup. No secret material is ever stored — only pskRef references.
 */

import { existsSync, readFileSync } from 'node:fs';
import * as YAML from 'yaml';
import { logger } from '../utils/logger.js';
import type { PeerConfig } from '../types/peer.js';
import { PEERS_FILE } from './persistence-paths.js';
import { atomicWriteFileSync, isRecord } from './persistence-utils.js';
import { sanitizePeers } from './peer-sanitize.js';

export function savePeers(peers: PeerConfig[]): void {
  try {
    atomicWriteFileSync(PEERS_FILE, YAML.stringify({ peers }));
  } catch (err) {
    logger.error(`Failed to save peers: ${err}`);
  }
}

export function loadPeers(): PeerConfig[] {
  try {
    if (!existsSync(PEERS_FILE)) return [];
    const parsed = YAML.parse(readFileSync(PEERS_FILE, 'utf8')) as unknown;
    if (!isRecord(parsed)) return [];
    return sanitizePeers(parsed.peers);
  } catch (err) {
    logger.error(`Failed to load peers: ${err}`);
    return [];
  }
}
