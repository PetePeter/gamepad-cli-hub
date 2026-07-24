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
import { atomicWriteFileSync, isRecord, isAnyString } from './persistence-utils.js';

const DIRECTIONS = new Set(['inbound', 'outbound', 'bidirectional']);

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
    if (!isRecord(parsed) || !Array.isArray(parsed.peers)) return [];

    return parsed.peers
      .filter((p): p is Record<string, unknown> =>
        isRecord(p) &&
        isAnyString(p.id) && (p.id as string).length > 0 &&
        isAnyString(p.alias) &&
        isAnyString(p.address) &&
        typeof p.direction === 'string' && DIRECTIONS.has(p.direction))
      .map((p): PeerConfig => ({
        id: p.id as string,
        alias: p.alias as string,
        address: p.address as string,
        pskRef: isAnyString(p.pskRef) ? p.pskRef : '',
        allow: Array.isArray(p.allow) ? p.allow.filter(isAnyString) : [],
        direction: p.direction as PeerConfig['direction'],
        createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
      }));
  } catch (err) {
    logger.error(`Failed to load peers: ${err}`);
    return [];
  }
}
