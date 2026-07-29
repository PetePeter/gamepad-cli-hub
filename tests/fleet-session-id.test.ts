/**
 * fleet-session-id — the `fleet:<peerId>:<realSessionId>` wrapper that makes a
 * remote session id addressable from another machine. Pure functions, no fakes.
 */

import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  FLEET_SESSION_PREFIX,
  wrapFleetSessionId,
  isFleetSessionId,
  parseFleetSessionId,
} from '../src/mcp/peer/fleet-session-id.js';
import { PROXY_SESSION_PREFIX } from '../src/mcp/peer/proxy-identity.js';

describe('wrapFleetSessionId', () => {
  it('wraps a session id under its originating peer', () => {
    expect(wrapFleetSessionId('mac-peer', 'uuid-1')).toBe('fleet:mac-peer:uuid-1');
  });

  it('uses the exported prefix', () => {
    expect(wrapFleetSessionId('p', 's').startsWith(FLEET_SESSION_PREFIX)).toBe(true);
  });
});

describe('isFleetSessionId', () => {
  it('recognises a wrapped id', () => {
    expect(isFleetSessionId(wrapFleetSessionId('mac', randomUUID()))).toBe(true);
  });

  it('rejects a real session UUID', () => {
    expect(isFleetSessionId(randomUUID())).toBe(false);
  });

  it('does not collide with the peer-proxy identity prefix', () => {
    expect(isFleetSessionId(`${PROXY_SESSION_PREFIX}mac`)).toBe(false);
  });

  it('rejects undefined and non-strings', () => {
    expect(isFleetSessionId(undefined)).toBe(false);
    expect(isFleetSessionId('')).toBe(false);
  });
});

describe('parseFleetSessionId', () => {
  it('round-trips what wrapFleetSessionId produced', () => {
    const realSessionId = randomUUID();
    const parsed = parseFleetSessionId(wrapFleetSessionId('mac-peer', realSessionId));
    expect(parsed).toEqual({ peerId: 'mac-peer', realSessionId });
  });

  it('splits on the first two colons only — a colon in the session id survives', () => {
    expect(parseFleetSessionId('fleet:mac:weird:id')).toEqual({
      peerId: 'mac',
      realSessionId: 'weird:id',
    });
  });

  it('returns undefined for a non-fleet id', () => {
    expect(parseFleetSessionId(randomUUID())).toBeUndefined();
    expect(parseFleetSessionId(`${PROXY_SESSION_PREFIX}mac`)).toBeUndefined();
  });

  it('returns undefined for a malformed fleet id (missing peer or session part)', () => {
    expect(parseFleetSessionId('fleet:')).toBeUndefined();
    expect(parseFleetSessionId('fleet:mac')).toBeUndefined();
    expect(parseFleetSessionId('fleet:mac:')).toBeUndefined();
    expect(parseFleetSessionId('fleet::uuid')).toBeUndefined();
  });
});
