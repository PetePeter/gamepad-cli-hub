/**
 * remote-link-handshake tests — real loopback WebSocket pair (no TLS needed; the
 * channelBinding is injected identically to both ends, exactly as the real TLS
 * exporter would). We drive initiator + responder concurrently and assert the
 * mutual MAC proof, plus every failure mode (wrong PSK, mismatched channel
 * binding, timeout).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';
import type { AddressInfo } from 'node:net';
import { runInitiatorHandshake, runResponderHandshake } from '../src/mcp/peer/remote-link-handshake.js';
import { certFingerprint, getOrCreateSelfSignedCert } from '../src/mcp/peer/peer-crypto.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

interface Harness {
  server: WebSocketServer;
  clientWs: WebSocket;
  serverWs: WebSocket;
  close: () => Promise<void>;
}

async function loopback(): Promise<Harness> {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise<void>(res => server.once('listening', () => res()));
  const { port } = server.address() as AddressInfo;

  const serverWsP = new Promise<WebSocket>(res => server.once('connection', ws => res(ws)));
  const clientWs = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise<void>(res => clientWs.once('open', () => res()));
  const serverWs = await serverWsP;

  return {
    server, clientWs, serverWs,
    close: () => new Promise<void>(resolve => {
      try { clientWs.terminate(); } catch { /* */ }
      try { serverWs.terminate(); } catch { /* */ }
      server.close(() => resolve());
    }),
  };
}

let dir: string;
const certFor = async (name: string) => {
  const cert = await getOrCreateSelfSignedCert(join(dir, `${name}.yaml`));
  return { pem: cert.certPem, fp: certFingerprint(cert.certPem) };
};

describe('remote-link handshake', () => {
  let harnesses: Harness[] = [];
  const track = async () => { const h = await loopback(); harnesses.push(h); return h; };

  afterEach(async () => {
    for (const h of harnesses) await h.close();
    harnesses = [];
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = '';
  });

  const setup = () => { dir = mkdtempSync(join(tmpdir(), 'helm-hs-')); };

  it('mutual success establishes matching peer identities', async () => {
    setup();
    const h = await track();
    const initiatorCert = await certFor('init');
    const responderCert = await certFor('resp');
    const psk = Buffer.alloc(32, 7);
    const channelBinding = Buffer.alloc(32, 9);

    const [initRes, respRes] = await Promise.all([
      runInitiatorHandshake(h.clientWs, {
        machineId: 'machine-A', selfCertFp: initiatorCert.fp,
        peerCertFp: responderCert.fp, channelBinding, psk, timeoutMs: 2000,
      }),
      runResponderHandshake(h.serverWs, {
        machineId: 'machine-B', selfCertFp: responderCert.fp,
        peerCertFp: initiatorCert.fp, channelBinding, psk, timeoutMs: 2000,
      }),
    ]);

    expect(initRes.ok).toBe(true);
    expect(respRes.ok).toBe(true);
    expect(initRes.peerMachineId).toBe('machine-B');
    expect(respRes.peerMachineId).toBe('machine-A');
    expect(initRes.peerCertFp).toBe(responderCert.fp);
    expect(respRes.peerCertFp).toBe(initiatorCert.fp);
  });

  it('wrong PSK fails both directions', async () => {
    setup();
    const h = await track();
    const initiatorCert = await certFor('init');
    const responderCert = await certFor('resp');
    const channelBinding = Buffer.alloc(32, 1);

    const initP = runInitiatorHandshake(h.clientWs, {
      machineId: 'A', selfCertFp: initiatorCert.fp, peerCertFp: responderCert.fp,
      channelBinding, psk: Buffer.alloc(32, 1), timeoutMs: 1500,
    });
    const respP = runResponderHandshake(h.serverWs, {
      machineId: 'B', selfCertFp: responderCert.fp, peerCertFp: initiatorCert.fp,
      channelBinding, psk: Buffer.alloc(32, 2), timeoutMs: 1500,
    });

    await expect(Promise.all([initP, respP])).rejects.toThrow();
  });

  it('mismatched channel binding fails', async () => {
    setup();
    const h = await track();
    const initiatorCert = await certFor('init');
    const responderCert = await certFor('resp');
    const psk = Buffer.alloc(32, 3);

    const initP = runInitiatorHandshake(h.clientWs, {
      machineId: 'A', selfCertFp: initiatorCert.fp, peerCertFp: responderCert.fp,
      channelBinding: Buffer.alloc(32, 4), psk, timeoutMs: 1500,
    });
    const respP = runResponderHandshake(h.serverWs, {
      machineId: 'B', selfCertFp: responderCert.fp, peerCertFp: initiatorCert.fp,
      channelBinding: Buffer.alloc(32, 5), psk, timeoutMs: 1500,
    });

    await expect(Promise.all([initP, respP])).rejects.toThrow();
  });

  it('times out when the responder never speaks', async () => {
    setup();
    const h = await track();
    const initiatorCert = await certFor('init');
    // No responder handshake started → initiator must time out.
    await expect(runInitiatorHandshake(h.clientWs, {
      machineId: 'A', selfCertFp: initiatorCert.fp, peerCertFp: 'zz',
      channelBinding: Buffer.alloc(32, 6), psk: Buffer.alloc(32, 6), timeoutMs: 150,
    })).rejects.toThrow(/timeout/i);
  });

  // FIX 1 — the cert binding is authoritative (TLS-observed), NOT wire-supplied.
  it('FIX1: matching TLS-observed peer cert fps succeed (positive control)', async () => {
    setup();
    const h = await track();
    const initiatorCert = await certFor('init');
    const responderCert = await certFor('resp');
    const psk = Buffer.alloc(32, 7);
    const cb = Buffer.alloc(32, 9);

    const [initRes, respRes] = await Promise.all([
      runInitiatorHandshake(h.clientWs, {
        machineId: 'A', selfCertFp: initiatorCert.fp, peerCertFp: responderCert.fp,
        channelBinding: cb, psk, timeoutMs: 2000,
      }),
      runResponderHandshake(h.serverWs, {
        machineId: 'B', selfCertFp: responderCert.fp, peerCertFp: initiatorCert.fp,
        channelBinding: cb, psk, timeoutMs: 2000,
      }),
    ]);
    expect(initRes.ok).toBe(true);
    expect(respRes.ok).toBe(true);
  });

  it('FIX1: differing TLS-observed peer cert fps (relay/substitution) fail via MAC mismatch', async () => {
    setup();
    const h = await track();
    const initiatorCert = await certFor('init');
    const responderCert = await certFor('resp');
    const attackerCert = await certFor('attacker');
    const psk = Buffer.alloc(32, 7);
    const cb = Buffer.alloc(32, 9);

    // The initiator's TLS leg observes the REAL responder cert, but the
    // responder's TLS leg observes an ATTACKER cert in place of the initiator
    // (a relay substituted certs on each leg). PSK + channelBinding match, yet
    // the transcripts differ → MAC mismatch → handshake fails.
    const initP = runInitiatorHandshake(h.clientWs, {
      machineId: 'A', selfCertFp: initiatorCert.fp, peerCertFp: responderCert.fp,
      channelBinding: cb, psk, timeoutMs: 1500,
    });
    const respP = runResponderHandshake(h.serverWs, {
      machineId: 'B', selfCertFp: responderCert.fp, peerCertFp: attackerCert.fp,
      channelBinding: cb, psk, timeoutMs: 1500,
    });

    await expect(Promise.all([initP, respP])).rejects.toThrow(/MAC verification failed/);
  });

  // FIX 2 — the WHOLE handshake shares one deadline (no 2× budget slow-loris).
  it('FIX2: responder rejects within ~timeoutMs (not 2×) when the peer stalls after hello', async () => {
    setup();
    const h = await track();
    const responderCert = await certFor('resp');
    const initiatorCert = await certFor('init');
    const psk = Buffer.alloc(32, 3);
    const cb = Buffer.alloc(32, 4);
    const timeoutMs = 200;

    const start = Date.now();
    const respP = runResponderHandshake(h.serverWs, {
      machineId: 'B', selfCertFp: responderCert.fp, peerCertFp: initiatorCert.fp,
      channelBinding: cb, psk, timeoutMs,
    });
    // A "peer" that sends a valid initiator hello then goes silent (never sends
    // the proof) — maximising the responder's exposure to a per-await budget bug.
    // Sent AFTER starting the responder so its message listener is attached.
    h.clientWs.send(JSON.stringify({
      t: 'hs', step: 'hello', role: 'initiator',
      machineId: 'A', nonce: Buffer.alloc(32, 1).toString('base64'),
    }));

    await expect(respP).rejects.toThrow(/timeout/i);
    const elapsed = Date.now() - start;

    // Shared deadline → total budget ≈ timeoutMs. Allow generous slack for CI
    // but assert it is well under the buggy 2× (which would be ≥400ms).
    expect(elapsed).toBeLessThan(timeoutMs * 1.8);
  });

  // FIX 3 — a parseable non-handshake frame pre-auth fails the handshake fast.
  it('FIX3: a JSON-RPC-shaped frame during the handshake window rejects promptly', async () => {
    setup();
    const h = await track();
    const responderCert = await certFor('resp');
    const initiatorCert = await certFor('init');
    const timeoutMs = 5000;

    const start = Date.now();
    const respP = runResponderHandshake(h.serverWs, {
      machineId: 'B', selfCertFp: responderCert.fp, peerCertFp: initiatorCert.fp,
      channelBinding: Buffer.alloc(32, 4), psk: Buffer.alloc(32, 3), timeoutMs,
    });
    // Peer sends a well-formed but NON-handshake frame (a JSON-RPC request) before
    // authenticating. The responder must reject immediately, not wait out the 5s.
    // Sent AFTER starting the responder so its message listener is attached.
    h.clientWs.send(JSON.stringify({ jsonrpc: '2.0', id: '1:1', method: 'evil', params: {} }));

    await expect(respP).rejects.toThrow(/non-handshake frame/i);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('FIX3: unparseable garbage bytes are ignored (do not fail the handshake)', async () => {
    setup();
    const h = await track();
    const initiatorCert = await certFor('init');
    const responderCert = await certFor('resp');
    const psk = Buffer.alloc(32, 7);
    const cb = Buffer.alloc(32, 9);

    // Send garbage bytes first; a well-behaved handshake should still complete.
    h.clientWs.send('{not-json garbage');

    const [initRes, respRes] = await Promise.all([
      runInitiatorHandshake(h.clientWs, {
        machineId: 'A', selfCertFp: initiatorCert.fp, peerCertFp: responderCert.fp,
        channelBinding: cb, psk, timeoutMs: 2000,
      }),
      runResponderHandshake(h.serverWs, {
        machineId: 'B', selfCertFp: responderCert.fp, peerCertFp: initiatorCert.fp,
        channelBinding: cb, psk, timeoutMs: 2000,
      }),
    ]);
    expect(initRes.ok).toBe(true);
    expect(respRes.ok).toBe(true);
  });
});
