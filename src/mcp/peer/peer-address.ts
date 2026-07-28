/**
 * peer-address — pure address rules for the fleet transport.
 *
 * WHY normalization exists: a responder learns the pairing peer's address from
 * `tls.remoteAddress`. On a dual-stack listener that is the IPv4-MAPPED form
 * `::ffff:10.0.0.2`, so the stored address becomes `::ffff:10.0.0.2:47474`. The
 * outbound dial splits at the last colon and then tries to connect to the host
 * `::ffff:10.0.0.2` — the peer that just paired is unreachable. We unwrap the
 * mapping at the boundary so only a dialable address is ever persisted.
 *
 * WHY the refresh planner is pure: mDNS re-announces continuously, so "has this
 * peer actually moved?" is asked constantly. It must be cheap, deterministic, and
 * decided WITHOUT tearing down a healthy link on every announcement.
 */

import type { PeerConfig } from '../../types/peer.js';

/** An mDNS sighting: the minimum this module needs from a DiscoveredPeer. */
export interface DiscoveredAddress {
  machineId: string;
  address: string;
}

/** A peer whose registry address is stale and should be rewritten + re-dialled. */
export interface AddressRefresh {
  peerId: string;
  address: string;
}

const IPV4_MAPPED_PREFIX = '::ffff:';

/**
 * Canonical `host:port` for storage and dialling. Unwraps an IPv4-mapped IPv6
 * host; a real IPv6 address (bracketed, per RFC 3986) is returned untouched.
 */
export function normalizePeerAddress(address: string): string {
  const [host, port] = splitHostPort(address);
  const normalizedHost = normalizeHost(host);
  return port ? `${normalizedHost}:${port}` : normalizedHost;
}

/** Unwrap an IPv4-mapped IPv6 host (`::ffff:10.0.0.2` → `10.0.0.2`). */
export function normalizeHost(host: string): string {
  const lower = host.toLowerCase();
  if (!lower.startsWith(IPV4_MAPPED_PREFIX)) return host;
  const mapped = host.slice(IPV4_MAPPED_PREFIX.length);
  // Only unwrap a genuine dotted-quad tail; anything else is a real IPv6 address
  // that merely shares the prefix, and rewriting it would break the connection.
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(mapped) ? mapped : host;
}

/**
 * Decide whether an mDNS sighting means a KNOWN peer has moved. Returns null when
 * nothing changed (the common case — do not churn the link) or when the machine is
 * not in the registry: discovery must never invent or auto-trust a peer.
 */
export function planAddressRefresh(
  peers: PeerConfig[],
  discovered: DiscoveredAddress,
): AddressRefresh | null {
  if (!discovered.machineId || !discovered.address) return null;
  const peer = peers.find(p => p.machineId && p.machineId === discovered.machineId);
  if (!peer) return null;
  const address = normalizePeerAddress(discovered.address);
  if (normalizePeerAddress(peer.address) === address) return null;
  return { peerId: peer.id, address };
}

/**
 * Split `host:port`, keeping a bracketed IPv6 host intact. Falls back to the whole
 * string as the host when there is no port.
 */
export function splitHostPort(address: string): [string, string] {
  if (address.startsWith('[')) {
    const end = address.indexOf(']');
    if (end > 0) {
      const host = address.slice(0, end + 1);
      const rest = address.slice(end + 1);
      return rest.startsWith(':') ? [host, rest.slice(1)] : [host, ''];
    }
  }
  const idx = address.lastIndexOf(':');
  if (idx <= 0) return [address, ''];
  return [address.slice(0, idx), address.slice(idx + 1)];
}
