/**
 * remote-link-handshake — the PSK mutual-authentication runners layered over an
 * already-TLS-secure ws socket. Socket-agnostic enough to test against a plain
 * loopback ws pair (the TLS channelBinding + peer cert fingerprint are injected).
 *
 * WIRE PROTOCOL (JSON control frames, each tagged `t:'hs'` to stay distinct from
 * JSON-RPC frames which carry `jsonrpc:'2.0'`):
 *
 *   initiator ──▶ { t:'hs', step:'hello', role:'initiator', machineId, nonce }
 *   responder ──▶ { t:'hs', step:'hello', role:'responder', machineId, nonce, mac }
 *   initiator ──▶ { t:'hs', step:'proof', mac }
 *
 * SECURITY — CERT BINDING (FIX 1): the cert fingerprints folded into the
 * transcript are NEVER taken from the wire (they would be attacker-controlled and
 * the binding meaningless). Each side uses ONLY its own authoritative values: its
 * own cert fp (`ctx.selfCertFp`) and the peer cert fp it OBSERVED on its TLS leg
 * (`ctx.peerCertFp`). `certFp` therefore does not travel on the wire at all. A
 * relay / cert-substitution makes the two TLS legs observe different peer certs →
 * different transcripts → MAC mismatch. This is defence-in-depth alongside the
 * channelBinding, which is likewise never on the wire.
 *
 * Both ends build the SAME transcript (fixed initiator/responder ordering) and
 * verify the other side's role-labelled MAC. Wrong PSK, a tampered field, a
 * mismatched channelBinding, or a mismatched observed peer cert all break the
 * MAC → handshake throws → caller destroys the socket and starts NO RPC.
 *
 * TIMEOUT BUDGET (FIX 2): the WHOLE handshake shares a single deadline computed
 * once up front, so a slow peer cannot spend `timeoutMs` per await (2× budget /
 * slow-loris). Each awaitFrame gets `max(1, deadline - now())`.
 *
 * PRE-AUTH STRICTNESS (FIX 3): a parseable frame that is not a valid `{t:'hs'}`
 * handshake frame arriving during the handshake window FAILS the handshake
 * immediately (a JSON-RPC frame before auth is a protocol violation and a
 * timeout-exhaustion vector). Unparseable/garbage bytes are still ignored.
 *
 * The nonces are base64 on the wire and validated to be exactly 32 bytes.
 */

import type { WebSocket } from 'ws';
import {
  buildHandshakeTranscript,
  computeHandshakeMac,
  verifyHandshakeMac,
  generateNonce,
} from './peer-crypto.js';

export interface HandshakeContext {
  machineId: string;
  selfCertFp: string;
  /** Peer leaf-cert fingerprint OBSERVED on this side's TLS leg (authoritative). */
  peerCertFp: string;
  channelBinding: Buffer;
  psk: Buffer;
  timeoutMs?: number;
  /** Injectable clock for deterministic deadline tests. */
  now?: () => number;
}

export interface HandshakeResult {
  ok: true;
  peerMachineId: string;
  /** The peer cert fp this side observed (echoed back for the caller to pin). */
  peerCertFp: string;
}

const DEFAULT_TIMEOUT_MS = 5000;
const NONCE_LEN = 32;

interface HelloFrame {
  t: 'hs';
  step: 'hello';
  role: 'initiator' | 'responder';
  machineId: string;
  nonce: string; // base64
  mac?: string;  // base64, responder only
}

interface ProofFrame {
  t: 'hs';
  step: 'proof';
  mac: string; // base64
}

/** Send a JSON frame; wraps ws.send in a promise-friendly throw. */
function send(ws: WebSocket, frame: unknown): void {
  ws.send(JSON.stringify(frame));
}

/**
 * Await exactly ONE handshake control frame matching `predicate`, bounded by the
 * shared `deadline`. A parseable frame that is NOT a valid `{t:'hs'}` handshake
 * frame rejects the handshake immediately (FIX 3). Unparseable bytes are ignored.
 * Rejects on deadline / close / error.
 */
function awaitFrame<T>(
  ws: WebSocket,
  isValidHandshakeFrame: (msg: any) => boolean,
  predicate: (msg: any) => boolean,
  deadline: number,
  now: () => number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('close', onClose);
      ws.off('error', onError);
    };
    const remaining = Math.max(1, deadline - now());
    const timer = setTimeout(() => { cleanup(); reject(new Error('handshake timeout')); }, remaining);
    const onMessage = (data: unknown) => {
      let msg: any;
      try {
        msg = JSON.parse(typeof data === 'string' ? data : (data as Buffer).toString('utf8'));
      } catch {
        // Unparseable garbage — ignore, do not spend the handshake on it.
        return;
      }
      // A well-formed but non-handshake frame pre-auth is a protocol violation.
      if (!msg || typeof msg !== 'object' || msg.t !== 'hs' || !isValidHandshakeFrame(msg)) {
        cleanup();
        reject(new Error('handshake: unexpected non-handshake frame before authentication'));
        return;
      }
      if (predicate(msg)) { cleanup(); resolve(msg as T); }
    };
    const onClose = () => { cleanup(); reject(new Error('handshake socket closed')); };
    const onError = (err: Error) => { cleanup(); reject(err); };
    ws.on('message', onMessage);
    ws.once('close', onClose);
    ws.once('error', onError);
  });
}

function decodeNonce(b64: unknown): Buffer {
  if (typeof b64 !== 'string') throw new Error('handshake: missing nonce');
  const buf = Buffer.from(b64, 'base64');
  if (buf.length !== NONCE_LEN) throw new Error('handshake: bad nonce length');
  return buf;
}

/** True for ANY structurally-valid `{t:'hs'}` frame (hello OR proof). */
function isHandshakeFrame(msg: any): boolean {
  return isHello(msg) || isProof(msg);
}

function isHello(msg: any): msg is HelloFrame {
  return msg.step === 'hello' && (msg.role === 'initiator' || msg.role === 'responder')
    && typeof msg.machineId === 'string' && typeof msg.nonce === 'string';
}

function isProof(msg: any): msg is ProofFrame {
  return msg.step === 'proof' && typeof msg.mac === 'string';
}

/**
 * Drive the initiator side: send hello, receive the responder hello + MAC,
 * verify it, send our proof MAC. Resolves with the peer's identity on success.
 */
export async function runInitiatorHandshake(ws: WebSocket, ctx: HandshakeContext): Promise<HandshakeResult> {
  const now = ctx.now ?? Date.now;
  const deadline = now() + (ctx.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const nonceInitiator = generateNonce();

  const helloWait = awaitFrame<HelloFrame>(
    ws, isHandshakeFrame, (m) => isHello(m) && m.role === 'responder', deadline, now,
  );
  send(ws, {
    t: 'hs', step: 'hello', role: 'initiator',
    machineId: ctx.machineId,
    nonce: nonceInitiator.toString('base64'),
  } satisfies HelloFrame);

  const responderHello = await helloWait;
  const nonceResponder = decodeNonce(responderHello.nonce);

  // Cert fps come ONLY from our own authoritative values (never the wire).
  const transcript = buildHandshakeTranscript({
    version: 1,
    initiatorId: ctx.machineId,
    responderId: responderHello.machineId,
    nonceInitiator,
    nonceResponder,
    initiatorCertFp: ctx.selfCertFp,
    responderCertFp: ctx.peerCertFp,
    channelBinding: ctx.channelBinding,
  });

  const responderMac = Buffer.from(String(responderHello.mac ?? ''), 'base64');
  if (!verifyHandshakeMac(ctx.psk, 'responder', transcript, responderMac)) {
    throw new Error('handshake: responder MAC verification failed');
  }

  const initiatorMac = computeHandshakeMac(ctx.psk, 'initiator', transcript);
  send(ws, { t: 'hs', step: 'proof', mac: initiatorMac.toString('base64') } satisfies ProofFrame);

  return { ok: true, peerMachineId: responderHello.machineId, peerCertFp: ctx.peerCertFp };
}

/**
 * Drive the responder side: receive the initiator hello, send our hello + MAC,
 * receive + verify the initiator's proof MAC. Resolves with peer identity.
 */
export async function runResponderHandshake(ws: WebSocket, ctx: HandshakeContext): Promise<HandshakeResult> {
  const now = ctx.now ?? Date.now;
  const deadline = now() + (ctx.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const nonceResponder = generateNonce();

  const initiatorHello = await awaitFrame<HelloFrame>(
    ws, isHandshakeFrame, (m) => isHello(m) && m.role === 'initiator', deadline, now,
  );
  const nonceInitiator = decodeNonce(initiatorHello.nonce);

  // Cert fps come ONLY from our own authoritative values (never the wire).
  const transcript = buildHandshakeTranscript({
    version: 1,
    initiatorId: initiatorHello.machineId,
    responderId: ctx.machineId,
    nonceInitiator,
    nonceResponder,
    initiatorCertFp: ctx.peerCertFp,
    responderCertFp: ctx.selfCertFp,
    channelBinding: ctx.channelBinding,
  });

  const responderMac = computeHandshakeMac(ctx.psk, 'responder', transcript);
  // Share the same deadline as the hello wait (FIX 2) — no fresh full budget.
  const proofWait = awaitFrame<ProofFrame>(ws, isHandshakeFrame, (m) => isProof(m), deadline, now);
  send(ws, {
    t: 'hs', step: 'hello', role: 'responder',
    machineId: ctx.machineId,
    nonce: nonceResponder.toString('base64'),
    mac: responderMac.toString('base64'),
  } satisfies HelloFrame);

  const proof = await proofWait;
  const initiatorMac = Buffer.from(String(proof.mac), 'base64');
  if (!verifyHandshakeMac(ctx.psk, 'initiator', transcript, initiatorMac)) {
    throw new Error('handshake: initiator MAC verification failed');
  }

  return { ok: true, peerMachineId: initiatorHello.machineId, peerCertFp: ctx.peerCertFp };
}
