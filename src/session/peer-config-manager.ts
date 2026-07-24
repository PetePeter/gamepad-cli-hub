/**
 * PeerConfigManager — in-memory owner of the peer registry.
 *
 * A peer records who this hub may exchange control traffic with and, crucially,
 * WHICH tools that peer may invoke (the `allow` glob list — deny-by-default).
 * This manager is pure model + authorisation: no networking, no crypto, and it
 * never holds secret material (only `pskRef` references).
 *
 * Like RuntimeGroupManager it does NOT read from disk in its constructor: the
 * orchestrator hydrates it via `importAll(loadPeers())` and supplies the
 * `persist` callback. The clock is injectable so `createdAt` is deterministic
 * in tests.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';
import type { PeerConfig } from '../types/peer.js';
import { toolGlobMatch } from '../utils/glob-matcher.js';

const DIRECTIONS = new Set(['inbound', 'outbound', 'bidirectional']);

interface AddPeerInput {
  alias: string;
  address: string;
  pskRef: string;
  allow?: string[];
  direction?: PeerConfig['direction'];
  machineId?: string;
}

interface UpsertByMachineIdInput extends AddPeerInput {
  machineId: string;
}

export class PeerConfigManager extends EventEmitter {
  private peers: PeerConfig[] = [];

  constructor(
    private readonly persist?: (peers: PeerConfig[]) => void,
    private readonly now: () => number = Date.now,
  ) {
    super();
  }

  /** Register a new peer and return a COPY of it. */
  add(input: AddPeerInput): PeerConfig {
    const peer: PeerConfig = {
      id: randomUUID(),
      alias: input.alias,
      address: input.address,
      pskRef: input.pskRef,
      allow: [...(input.allow ?? [])],
      direction: input.direction ?? 'bidirectional',
      createdAt: this.now(),
      ...(input.machineId !== undefined ? { machineId: input.machineId } : {}),
    };
    this.peers.push(peer);
    this.markChanged();
    logger.info(`[PeerConfigManager] Added peer "${peer.alias}" (${peer.id})`);
    return this.copy(peer);
  }

  /** Get a peer by its stable machineId (copy), or undefined. */
  getByMachineId(machineId: string): PeerConfig | undefined {
    const peer = this.peers.find(p => p.machineId === machineId);
    return peer ? this.copy(peer) : undefined;
  }

  /**
   * Upsert keyed by machineId: if a peer with this machineId already exists it is
   * updated IN PLACE (same id + createdAt preserved) so re-pairing a known peer
   * never creates a duplicate; otherwise a fresh peer is added. Returns a copy.
   */
  upsertByMachineId(input: UpsertByMachineIdInput): PeerConfig {
    const existing = this.peers.find(p => p.machineId === input.machineId);
    if (existing) {
      existing.alias = input.alias;
      existing.address = input.address;
      existing.pskRef = input.pskRef;
      if (input.allow !== undefined) existing.allow = [...input.allow];
      if (input.direction !== undefined && DIRECTIONS.has(input.direction)) existing.direction = input.direction;
      this.markChanged();
      logger.info(`[PeerConfigManager] Updated peer by machineId "${existing.alias}" (${existing.id})`);
      return this.copy(existing);
    }
    return this.add(input);
  }

  /** All peers as independent copies. */
  list(): PeerConfig[] {
    return this.peers.map(p => this.copy(p));
  }

  /** Get a peer by id (copy), or undefined. */
  get(id: string): PeerConfig | undefined {
    const peer = this.peers.find(p => p.id === id);
    return peer ? this.copy(peer) : undefined;
  }

  /** Get a peer by alias (copy), or undefined. */
  getByAlias(alias: string): PeerConfig | undefined {
    const peer = this.peers.find(p => p.alias === alias);
    return peer ? this.copy(peer) : undefined;
  }

  /**
   * Merge `patch` into the peer with `id` (id/createdAt are immutable).
   * Returns a copy of the updated peer, or undefined if not found.
   */
  update(id: string, patch: Partial<Omit<PeerConfig, 'id' | 'createdAt'>>): PeerConfig | undefined {
    const peer = this.peers.find(p => p.id === id);
    if (!peer) return undefined;
    if (patch.alias !== undefined) peer.alias = patch.alias;
    if (patch.address !== undefined) peer.address = patch.address;
    if (patch.pskRef !== undefined) peer.pskRef = patch.pskRef;
    if (patch.allow !== undefined) peer.allow = [...patch.allow];
    if (patch.direction !== undefined && DIRECTIONS.has(patch.direction)) peer.direction = patch.direction;
    this.markChanged();
    return this.copy(peer);
  }

  /** Delete a peer. Returns whether one was removed. */
  remove(id: string): boolean {
    const before = this.peers.length;
    this.peers = this.peers.filter(p => p.id !== id);
    const removed = this.peers.length !== before;
    if (removed) this.markChanged();
    return removed;
  }

  /**
   * Whether `peerId` is authorised to invoke `toolName`. Deny-by-default: an
   * empty or absent allow-list denies everything; an unknown peer is denied.
   * Otherwise allowed iff ANY pattern in the allow-list glob-matches.
   */
  isToolAllowed(peerId: string, toolName: string): boolean {
    const peer = this.peers.find(p => p.id === peerId);
    if (!peer || peer.allow.length === 0) return false;
    return peer.allow.some(pattern => toolGlobMatch(pattern, toolName));
  }

  /** Snapshot of all peers for persistence (independent copies). */
  exportAll(): PeerConfig[] {
    return this.peers.map(p => this.copy(p));
  }

  /**
   * Replace internal state from persisted data, sanitising each entry: only
   * objects with a string id/alias/address and a valid direction are accepted;
   * `allow` coerces to a string array (defaulting to []).
   */
  importAll(peers: PeerConfig[]): void {
    this.peers = (Array.isArray(peers) ? peers : [])
      .filter((p): p is PeerConfig =>
        !!p &&
        typeof p.id === 'string' && p.id.length > 0 &&
        typeof p.alias === 'string' &&
        typeof p.address === 'string' &&
        typeof p.direction === 'string' && DIRECTIONS.has(p.direction))
      .map(p => ({
        id: p.id,
        alias: p.alias,
        address: p.address,
        pskRef: typeof p.pskRef === 'string' ? p.pskRef : '',
        allow: Array.isArray(p.allow) ? p.allow.filter(a => typeof a === 'string') : [],
        direction: p.direction,
        createdAt: typeof p.createdAt === 'number' ? p.createdAt : this.now(),
        ...(typeof p.machineId === 'string' && p.machineId.length > 0 ? { machineId: p.machineId } : {}),
      }));
    logger.info(`[PeerConfigManager] Imported ${this.peers.length} peer(s)`);
  }

  private copy(peer: PeerConfig): PeerConfig {
    return { ...peer, allow: [...peer.allow] };
  }

  private markChanged(): void {
    this.persist?.(this.exportAll());
    this.emit('peer-config:changed');
  }
}
