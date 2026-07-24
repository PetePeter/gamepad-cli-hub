/**
 * proxy-identity — pure synthesized PROXY AuthContext for remote peers.
 * Real function, no mocks. Asserts stability, distinctness, and that a proxy id
 * can never collide with a real UUID session id.
 */

import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  proxyAuthContext,
  isProxySessionId,
  PROXY_SESSION_PREFIX,
} from '../src/mcp/peer/proxy-identity.js';

describe('proxyAuthContext', () => {
  it('synthesizes a peer-scoped AuthContext', () => {
    const ctx = proxyAuthContext('mac');
    expect(ctx).toEqual({ sessionId: 'peer:mac', sessionName: 'peer:mac' });
  });

  it('is stable across two calls for the same peer', () => {
    expect(proxyAuthContext('mac')).toEqual(proxyAuthContext('mac'));
  });

  it('is distinct per peer', () => {
    expect(proxyAuthContext('mac').sessionId).not.toBe(proxyAuthContext('linux').sessionId);
  });

  it('never equals a real UUID session id', () => {
    const realId = randomUUID();
    const ctx = proxyAuthContext(realId); // even if peerId LOOKS like a uuid
    expect(ctx.sessionId).not.toBe(realId);
    expect(ctx.sessionId!.startsWith(PROXY_SESSION_PREFIX)).toBe(true);
    expect(isProxySessionId(realId)).toBe(false);
    expect(isProxySessionId(ctx.sessionId!)).toBe(true);
  });

  it('isProxySessionId is false for undefined/empty', () => {
    expect(isProxySessionId(undefined)).toBe(false);
    expect(isProxySessionId('')).toBe(false);
  });
});
