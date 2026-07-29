/**
 * fleet-session-id — the `fleet:<peerId>:<realSessionId>` wrapper that makes a
 * session on ANOTHER machine addressable from this one.
 *
 * WHY: the reply protocol is LLM-driven. When a remote peer sends text with
 * `expectsResponse=true`, the HELM_MSG preamble tells the recipient LLM which
 * sessionId to reply to. A raw remote session id is meaningless here (it is not
 * a local session), and passing it through raw would let a peer impersonate a
 * local session. Wrapping it keeps BOTH properties:
 *
 *   • the id is unambiguously REMOTE — the `fleet:` prefix can never collide
 *     with a real UUID v4 session id, nor with the `peer:` proxy identity
 *     ([[proxy-identity]]), so nothing local is ever addressed by accident;
 *   • it stays ROUTABLE — it carries the peer it came from, so a reply sent to
 *     it can be forwarded straight back over the fleet to the originating
 *     session.
 *
 * The full session id stays visible (never hashed or opaque) so a human reading
 * a terminal can see exactly who is being answered.
 */

/** Prefix marking a session id as living on a remote fleet peer. */
export const FLEET_SESSION_PREFIX = 'fleet:';

/** Address `sessionId` (which lives on `peerId`) from this machine. */
export function wrapFleetSessionId(peerId: string, sessionId: string): string {
  return `${FLEET_SESSION_PREFIX}${peerId}:${sessionId}`;
}

/** Whether `id` addresses a session on a remote peer rather than a local one. */
export function isFleetSessionId(id: string | undefined): boolean {
  return typeof id === 'string' && id.startsWith(FLEET_SESSION_PREFIX);
}

/**
 * Split a fleet-addressed id into the peer to forward to and the session id as
 * that peer knows it. Returns undefined for anything not a well-formed fleet id
 * — callers must treat that as "not addressable", never as a local id.
 *
 * Only the FIRST two colons are separators: the remainder is the session id
 * verbatim, so an id containing a colon survives the round trip intact.
 */
export function parseFleetSessionId(
  id: string,
): { peerId: string; realSessionId: string } | undefined {
  if (!isFleetSessionId(id)) return undefined;
  const rest = id.slice(FLEET_SESSION_PREFIX.length);
  const split = rest.indexOf(':');
  if (split <= 0) return undefined;
  const peerId = rest.slice(0, split);
  const realSessionId = rest.slice(split + 1);
  return realSessionId ? { peerId, realSessionId } : undefined;
}
