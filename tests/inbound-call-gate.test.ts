/**
 * InboundCallGate — the remote-peer security boundary. Real gate wired to a real
 * PeerRateLimiter and real PeerAuditLog; the dispatcher is an injected fake so
 * we can assert exactly what identity/args it receives without running the whole
 * MCP stack. This mirrors the fakes>mocks preference.
 */

import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  InboundCallGate,
  HARD_DENY_TOOLS,
  GateError,
  stripCallerIdentityOverrides,
} from '../src/mcp/peer/inbound-call-gate.js';
import { PeerRateLimiter } from '../src/mcp/peer/rate-limiter.js';
import { PeerAuditLog } from '../src/mcp/peer/peer-audit-log.js';
import { isProxySessionId } from '../src/mcp/peer/proxy-identity.js';
import type { AuthContext } from '../src/mcp/tools/types.js';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

/** A peerConfig fake exposing only isToolAllowed (the surface the gate needs). */
function fakePeerConfig(rules: Record<string, string[]>) {
  return {
    isToolAllowed(peerId: string, tool: string): boolean {
      const allow = rules[peerId] ?? [];
      return allow.some(p => p === '*' || p === tool);
    },
  };
}

interface Built {
  gate: InboundCallGate;
  audit: PeerAuditLog;
  calls: Array<{ method: string; params: unknown; ctx: AuthContext }>;
}

function build(
  rules: Record<string, string[]>,
  opts: {
    now?: () => number;
    dispatchImpl?: (method: string, params: unknown, ctx: AuthContext) => Promise<unknown>;
    capacity?: number;
  } = {},
): Built {
  const now = opts.now ?? (() => 0);
  const calls: Built['calls'] = [];
  const dispatch = async (method: string, params: unknown, ctx: AuthContext) => {
    calls.push({ method, params, ctx });
    if (opts.dispatchImpl) return opts.dispatchImpl(method, params, ctx);
    return { ok: true };
  };
  const audit = new PeerAuditLog(() => {}, now);
  const rateLimiter = new PeerRateLimiter({
    capacity: opts.capacity ?? 100,
    refillPerMs: 100 / 60000,
    now,
  });
  const gate = new InboundCallGate({
    peerConfig: fakePeerConfig(rules),
    dispatch,
    rateLimiter,
    audit,
    now,
  });
  return { gate, audit, calls };
}

describe('InboundCallGate', () => {
  it('dispatches an allowed tool once with a PROXY identity and returns the result', async () => {
    const { gate, audit, calls } = build({ mac: ['artifact_get'] });
    const result = await gate.handle('mac', 'artifact_get', { id: 'x' });

    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('artifact_get');
    expect(calls[0].ctx.sessionId).toBe('peer:mac');
    expect(isProxySessionId(calls[0].ctx.sessionId)).toBe(true);

    const log = audit.list();
    expect(log).toHaveLength(1);
    expect(log[0].outcome).toBe('ok');
    expect(log[0].method).toBe('artifact_get');
  });

  it('denies a disallowed tool: uniform error, no dispatch, audit denied', async () => {
    const { gate, audit, calls } = build({ mac: ['artifact_get'] });
    await expect(gate.handle('mac', 'session_close', {})).rejects.toMatchObject({
      code: -32000,
      message: 'Tool not permitted',
    });
    expect(calls).toHaveLength(0);
    expect(audit.list()[0].outcome).toBe('denied');
  });

  it('hard-denies restart_helm even with a wildcard allow-list', async () => {
    const { gate, audit, calls } = build({ mac: ['*'] });
    await expect(gate.handle('mac', 'restart_helm', {})).rejects.toMatchObject({
      code: -32000,
      message: 'Tool not permitted',
    });
    expect(calls).toHaveLength(0);
    expect(audit.list()[0].outcome).toBe('denied');
    expect(HARD_DENY_TOOLS.has('restart_helm')).toBe(true);
  });

  it('hard-deny and allow-list-deny are indistinguishable (no existence leak)', async () => {
    const { gate } = build({ mac: ['*'] });
    let hardMsg = '';
    let allowMsg = '';
    await gate.handle('mac', 'restart_helm', {}).catch(e => { hardMsg = e.message; });
    // deny a tool the wildcard would allow by using a peer with an empty list
    const { gate: gate2 } = build({ mac: [] });
    await gate2.handle('mac', 'artifact_get', {}).catch(e => { allowMsg = e.message; });
    expect(hardMsg).toBe(allowMsg);
    expect(hardMsg).toBe('Tool not permitted');
  });

  it('rate-limits past capacity: burst passes, next rejected, refill re-allows', async () => {
    let t = 0;
    const { gate, audit } = build(
      { mac: ['*'] },
      { now: () => t, capacity: 2 },
    );
    expect(await gate.handle('mac', 'artifact_get', {})).toEqual({ ok: true });
    expect(await gate.handle('mac', 'artifact_get', {})).toEqual({ ok: true });
    await expect(gate.handle('mac', 'artifact_get', {})).rejects.toMatchObject({
      code: -32000,
      message: 'Rate limit exceeded',
    });
    expect(audit.list()[0].outcome).toBe('rate-limited');

    // refillPerMs = 2/60000 → need 30000ms for one token
    t += 60000;
    expect(await gate.handle('mac', 'artifact_get', {})).toEqual({ ok: true });
  });

  it('records only arg KEY NAMES in the audit — never values/secrets', async () => {
    const { gate, audit } = build({ mac: ['*'] });
    await gate.handle('mac', 'session_create', {
      workingDir: 'C:/x',
      psk: 'hunter2-super-secret',
    });
    const rec = audit.list()[0];
    const serialized = JSON.stringify(rec);
    expect(serialized).not.toContain('hunter2-super-secret');
    expect(serialized).not.toContain('C:/x');
    expect(rec.argSummary).toContain('workingDir');
    expect(rec.argSummary).toContain('psk'); // the KEY name is fine; the value is not
  });

  it('rethrows a dispatch error as -32000 with the full message on the wire', async () => {
    const { gate } = build(
      { mac: ['*'] },
      { dispatchImpl: async () => { throw new Error('boom internal detail'); } },
    );
    await expect(gate.handle('mac', 'artifact_get', {})).rejects.toMatchObject({
      code: -32000,
      message: 'boom internal detail',
    });
  });

  it('C-2: the persisted audit error stores the error TYPE only, never the message/values', async () => {
    class SessionNotFoundError extends Error {}
    const secret = 'Session not found: 11111111-1111-1111-1111-111111111111';
    const { gate, audit } = build(
      { mac: ['*'] },
      { dispatchImpl: async () => { throw new SessionNotFoundError(secret); } },
    );
    await expect(gate.handle('mac', 'session_send_text', { sessionId: 'dest', text: 'hi' }))
      .rejects.toMatchObject({ code: -32000, message: secret }); // wire still carries it

    const rec = audit.list()[0];
    expect(rec.outcome).toBe('error');
    expect(rec.error).toBe('SessionNotFoundError'); // TYPE only
    // The value-bearing message must be ENTIRELY absent from the stored entry.
    expect(JSON.stringify(rec)).not.toContain('11111111-1111-1111-1111-111111111111');
    expect(JSON.stringify(rec)).not.toContain('Session not found');
  });

  it('proxy identity is stable per peer, distinct across peers, never a real uuid', async () => {
    const seen: string[] = [];
    const { gate } = build(
      { a: ['*'], b: ['*'] },
      { dispatchImpl: async (_m, _p, ctx) => { seen.push(ctx.sessionId!); return 1; } },
    );
    await gate.handle('a', 'artifact_get', {});
    await gate.handle('a', 'artifact_get', {});
    await gate.handle('b', 'artifact_get', {});
    expect(seen[0]).toBe(seen[1]);       // stable per peer
    expect(seen[0]).not.toBe(seen[2]);   // distinct per peer
    const realId = randomUUID();
    expect(seen).not.toContain(realId);
    expect(seen.every(isProxySessionId)).toBe(true);
  });

  it('GateError carries a JSON-RPC code/message shape', () => {
    const err = new GateError(-32000, 'Tool not permitted');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe(-32000);
    expect(err.message).toBe('Tool not permitted');
  });

  it('C-1: strips senderSessionId so a peer cannot impersonate a real session', async () => {
    let received: Record<string, unknown> | undefined;
    let ctxSeen: AuthContext | undefined;
    const { gate } = build(
      { peer1: ['session_send_text'] },
      {
        dispatchImpl: async (_m, params, ctx) => {
          received = params as Record<string, unknown>;
          ctxSeen = ctx;
          return { ok: true };
        },
      },
    );
    await gate.handle('peer1', 'session_send_text', {
      sessionId: 'dest',
      text: 'hi',
      senderSessionId: '11111111-1111-1111-1111-111111111111',
    });
    expect(received).toBeDefined();
    expect('senderSessionId' in received!).toBe(false); // stripped
    expect(received!.sessionId).toBe('dest');            // destination preserved
    expect(received!.text).toBe('hi');                   // non-identity arg preserved
    expect(ctxSeen!.sessionId).toBe('peer:peer1');       // proxy is the only identity
  });

  it('I-1: hard-denies session_close even with a wildcard allow-list', async () => {
    const { gate, calls } = build({ mac: ['*'] });
    await expect(gate.handle('mac', 'session_close', { sessionId: 'x' }))
      .rejects.toMatchObject({ code: -32000, message: 'Tool not permitted' });
    expect(calls).toHaveLength(0);
    expect(HARD_DENY_TOOLS.has('session_close')).toBe(true);
  });

  it('I-1: hard-denies session_group_close even with a wildcard allow-list', async () => {
    const { gate, calls } = build({ mac: ['*'] });
    await expect(gate.handle('mac', 'session_group_close', { groupId: 'g' }))
      .rejects.toMatchObject({ code: -32000, message: 'Tool not permitted' });
    expect(calls).toHaveLength(0);
    expect(HARD_DENY_TOOLS.has('session_group_close')).toBe(true);
  });
});

describe('stripCallerIdentityOverrides', () => {
  it('removes senderSessionId, preserves everything else', () => {
    const out = stripCallerIdentityOverrides({
      sessionId: 'dest',
      text: 'hi',
      senderSessionId: 'real-uuid',
    }) as Record<string, unknown>;
    expect(out).toEqual({ sessionId: 'dest', text: 'hi' });
  });

  it('is a shallow COPY — does not mutate the input', () => {
    const input = { senderSessionId: 'x', a: 1 };
    const out = stripCallerIdentityOverrides(input);
    expect(input.senderSessionId).toBe('x'); // original untouched
    expect(out).not.toBe(input);
  });

  it('passes non-object params through unchanged', () => {
    expect(stripCallerIdentityOverrides(undefined)).toBeUndefined();
    expect(stripCallerIdentityOverrides('str')).toBe('str');
    expect(stripCallerIdentityOverrides([1, 2])).toEqual([1, 2]);
  });
});
