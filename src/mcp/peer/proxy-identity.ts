/**
 * proxy-identity — synthesize the PROXY AuthContext a remote peer's MCP calls
 * run under.
 *
 * WHY a synthetic identity: a remote peer must NEVER impersonate a real local
 * session. Real session ids are UUID v4. By deriving the proxy id as
 * `peer:<peerId>` we guarantee it can never collide with a real UUID (the
 * `peer:` prefix is not part of any UUID), so session-scoped tools (e.g.
 * artifacts, which key ownership on authContext.sessionId) only ever see the
 * proxy's OWN data — never a real session's.
 *
 * The mapping is pure and deterministic: stable per peer, distinct per peer.
 */

import type { AuthContext } from '../tools/types.js';

/** Prefix that marks a session id as a synthetic remote-peer proxy identity. */
export const PROXY_SESSION_PREFIX = 'peer:';

/** Deterministic proxy AuthContext for a remote peer. Never a real session. */
export function proxyAuthContext(peerId: string): AuthContext {
  const id = `${PROXY_SESSION_PREFIX}${peerId}`;
  return { sessionId: id, sessionName: id };
}

/** Whether a session id is a synthetic peer-proxy identity (vs a real UUID). */
export function isProxySessionId(id: string | undefined): boolean {
  return typeof id === 'string' && id.startsWith(PROXY_SESSION_PREFIX);
}
