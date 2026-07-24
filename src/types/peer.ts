/**
 * Peer — a remote Helm instance this hub may exchange control traffic with.
 *
 * This is a PURE data model: it carries no networking or crypto. In particular
 * it NEVER holds secret material — `pskRef` is an opaque reference into a future
 * secret store, not the pre-shared key itself. Transport, handshake, and key
 * resolution are introduced by later plans.
 *
 * A peer's authority is scoped by `allow`: an allow-list of tool-name glob
 * patterns. An empty list denies everything (deny-by-default).
 */
export interface PeerConfig {
  /** Unique peer identifier (UUID v4). */
  id: string;
  /** Human-facing label, e.g. "the Mac". */
  alias: string;
  /** Network address as host:port. Not validated here (no networking yet). */
  address: string;
  /**
   * Opaque reference into a future secret store for this peer's pre-shared key.
   * NEVER the secret itself — only a lookup key.
   */
  pskRef: string;
  /**
   * Tool-name glob patterns this peer is permitted to invoke, e.g.
   * ["session_*", "artifact_get"]. `*` is the only wildcard. Empty = deny all.
   */
  allow: string[];
  /** Which way control traffic is allowed to flow for this peer. */
  direction: 'inbound' | 'outbound' | 'bidirectional';
  /** Epoch ms the peer was registered. */
  createdAt: number;
  /**
   * The peer's stable machine identity (set by the pairing flow). Optional for
   * legacy/manually-added peers. Used to find-and-update an existing peer so a
   * re-pair updates rather than duplicates.
   */
  machineId?: string;
}
