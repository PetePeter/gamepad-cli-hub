/**
 * RemoteLinkClient — dials a configured peer over mTLS WebSocket and, on success,
 * owns a reconnecting generation state machine.
 *
 * SECURITY FLOW per dial:
 *   1. Open wss:// with our machine cert/key, rejectUnauthorized:false.
 *   2. `finishRequest` intercepts the underlying request BEFORE the upgrade is
 *      sent: on the socket's secureConnect we read the SERVER leaf cert → fp →
 *      pin verify (record-if-absent on first pair, HARD reject established
 *      mismatch). Only then request.end() completes the upgrade; a mismatch
 *      destroys the socket and sends nothing.
 *   3. After 'open', derive channelBinding from that captured TLS socket (never
 *      ws._socket) and run the INITIATOR PSK handshake (5s).
 *   4. On success construct a PeerLink; on any failure destroy + schedule a
 *      reconnect.
 *
 * RECONNECT: 10s connect/TLS/upgrade timeout, 5s auth timeout, backoff
 * 1s×2^n capped 60s with ±20% jitter (injectable rng). Backoff resets only after
 * 60s of authenticated stability. Reconnect scheduled ONLY if the generation is
 * current, no attempt/timer is already pending, and the manager is not stopped.
 */

import { EventEmitter } from 'node:events';
import type { TLSSocket } from 'node:tls';
import { WebSocket } from 'ws';
import type { ClientRequest } from 'node:http';
import { logger } from '../../utils/logger.js';
import { certFingerprint, peerCertFpFromSocket } from './peer-crypto.js';
import type { PinnedCertStore } from './pinned-cert-store.js';
import { runInitiatorHandshake } from './remote-link-handshake.js';
import { PeerLink, type OnCall } from './peer-link.js';

const EXPORTER_LABEL = 'EXPORTER-Helm-Peer-v1';
const CHANNEL_BINDING_LEN = 32;

export interface RemoteLinkClientOptions {
  peerId: string;
  host: string;
  port: number;
  machineId: string;
  getCertKey: () => Promise<{ certPem: string; keyPem: string }>;
  resolvePsk: (peerId: string) => Buffer | undefined;
  pinnedCertStore: PinnedCertStore;
  /**
   * Called once the outbound link is authenticated. `peerMachineId` is the
   * identity the server PROVED in the handshake (used for dedup).
   */
  onLink: (link: PeerLink, peerId: string, peerMachineId: string) => void;
  onCall: OnCall;
  /** Whether an active link already exists (dedup) — suppresses reconnect. */
  hasActiveLink?: () => boolean;

  connectTimeoutMs?: number;
  authTimeoutMs?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  stabilityResetMs?: number;
  rng?: () => number;
  peerLinkOptions?: { requestTimeoutMs?: number; heartbeatIntervalMs?: number; pongTimeoutMs?: number };
}

export class RemoteLinkClient extends EventEmitter {
  private generation = 0;
  private stopped = true;
  private attempting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffExponent = 0;
  private currentWs: WebSocket | null = null;
  private currentLink: PeerLink | null = null;
  private stabilityTimer: ReturnType<typeof setTimeout> | null = null;
  private epochCounter = 0;

  private readonly connectTimeoutMs: number;
  private readonly authTimeoutMs: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly stabilityResetMs: number;
  private readonly rng: () => number;

  constructor(private readonly opts: RemoteLinkClientOptions) {
    super();
    this.connectTimeoutMs = opts.connectTimeoutMs ?? 10_000;
    this.authTimeoutMs = opts.authTimeoutMs ?? 5_000;
    this.baseBackoffMs = opts.baseBackoffMs ?? 1_000;
    this.maxBackoffMs = opts.maxBackoffMs ?? 60_000;
    this.stabilityResetMs = opts.stabilityResetMs ?? 60_000;
    this.rng = opts.rng ?? Math.random;
  }

  /** Begin dialing (and auto-reconnecting) the peer. */
  connect(): void {
    this.stopped = false;
    this.generation++;
    this.attempt(this.generation);
  }

  /** Stop dialing, cancel timers, and dispose any live link. Idempotent. */
  dispose(reason = 'client-dispose'): void {
    this.stopped = true;
    this.generation++;
    this.attempting = false;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.stabilityTimer) { clearTimeout(this.stabilityTimer); this.stabilityTimer = null; }
    if (this.currentLink) { this.currentLink.dispose(reason); this.currentLink = null; }
    if (this.currentWs) { try { this.currentWs.terminate(); } catch { /* */ } this.currentWs = null; }
  }

  /** True while a PeerLink is established. */
  isConnected(): boolean {
    return this.currentLink !== null && this.currentLink.isOnline();
  }

  // ---------------------------------------------------------------- internals

  private attempt(generation: number): void {
    if (this.stopped || generation !== this.generation) return;
    this.attempting = true;

    void this.dial(generation).catch(err => {
      logger.warn(`[RemoteLinkClient] Dial to ${this.opts.peerId} failed: ${(err as Error).message}`);
      this.attempting = false;
      this.scheduleReconnect(generation);
    });
  }

  private async dial(generation: number): Promise<void> {
    const cert = await this.opts.getCertKey();
    if (this.stale(generation)) return;

    let capturedTls: TLSSocket | null = null;
    let pinRejected = false;

    const ws = new WebSocket(`wss://${this.opts.host}:${this.opts.port}`, {
      cert: cert.certPem,
      key: cert.keyPem,
      rejectUnauthorized: false,
      // Intercept the raw request so we can pin-verify the server cert BEFORE the
      // WebSocket upgrade is sent.
      finishRequest: (request: ClientRequest, wsInstance: WebSocket) => {
        request.on('socket', (socket) => {
          const tls = socket as TLSSocket;
          const complete = () => {
            capturedTls = tls;
            const verdict = this.verifyServerPin(tls);
            if (verdict.ok) {
              request.end();
            } else {
              pinRejected = true;
              try { tls.destroy(); } catch { /* */ }
            }
          };
          // Read the peer cert only AFTER the TLS handshake completes.
          if ((tls as unknown as { _secureEstablished?: boolean })._secureEstablished) complete();
          else tls.once('secureConnect', complete);
        });
        void wsInstance;
      },
    });
    this.currentWs = ws;

    const connectTimer = setTimeout(() => {
      logger.warn(`[RemoteLinkClient] Connect timeout to ${this.opts.peerId}`);
      try { ws.terminate(); } catch { /* */ }
    }, this.connectTimeoutMs);

    ws.once('error', () => { /* handled via close / open path */ });

    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('close', () => reject(new Error(pinRejected ? 'server cert pin rejected' : 'closed before open')));
      ws.once('error', (e) => reject(e));
    }).finally(() => clearTimeout(connectTimer));

    if (this.stale(generation)) { ws.terminate(); return; }
    if (!capturedTls) { ws.terminate(); throw new Error('no TLS socket captured'); }

    const channelBinding = deriveChannelBinding(capturedTls);
    const peerCertFp = peerCertFpFromSocket(capturedTls);
    const psk = this.opts.resolvePsk(this.opts.peerId);
    if (!psk) { ws.terminate(); throw new Error(`no PSK for peer ${this.opts.peerId}`); }

    const result = await runInitiatorHandshake(ws, {
      machineId: this.opts.machineId,
      selfCertFp: certFingerprint(cert.certPem),
      peerCertFp,
      channelBinding,
      psk,
      timeoutMs: this.authTimeoutMs,
    });

    if (this.stale(generation)) { ws.terminate(); return; }

    // Auth succeeded — safe to record the pin if this was the first pairing.
    // (verifyServerPin already hard-rejected an established mismatch.)
    if (this.opts.pinnedCertStore.get(this.opts.peerId) === undefined) {
      this.opts.pinnedCertStore.recordIfAbsent(this.opts.peerId, peerCertFp);
    }

    const link = new PeerLink(ws, {
      peerId: this.opts.peerId,
      connectionEpoch: ++this.epochCounter,
      onCall: this.opts.onCall,
      ...this.opts.peerLinkOptions,
    });
    this.currentLink = link;
    this.attempting = false;
    this.armStabilityReset();

    link.once('offline', () => {
      if (this.currentLink === link) this.currentLink = null;
      if (this.stabilityTimer) { clearTimeout(this.stabilityTimer); this.stabilityTimer = null; }
      this.scheduleReconnect(generation);
    });

    this.opts.onLink(link, this.opts.peerId, result.peerMachineId);
    this.emit('online', { peerId: this.opts.peerId });
  }

  /** Backoff resets to 0 after a link stays authenticated for stabilityResetMs. */
  private armStabilityReset(): void {
    if (this.stabilityTimer) clearTimeout(this.stabilityTimer);
    this.stabilityTimer = setTimeout(() => { this.backoffExponent = 0; }, this.stabilityResetMs);
  }

  private verifyServerPin(tls: TLSSocket): { ok: boolean } {
    try {
      const fp = peerCertFpFromSocket(tls);
      if (this.opts.pinnedCertStore.get(this.opts.peerId) !== undefined) {
        // Established peer — hard reject a mismatch, never auto-rotate.
        return { ok: this.opts.pinnedCertStore.verify(this.opts.peerId, fp) };
      }
      // First pairing — defer the record() until the PSK handshake proves the
      // peer. Accept the TLS socket for now.
      return { ok: true };
    } catch (err) {
      logger.warn(`[RemoteLinkClient] Pin check failed for ${this.opts.peerId}: ${(err as Error).message}`);
      return { ok: false };
    }
  }

  private scheduleReconnect(generation: number): void {
    if (this.stopped) return;
    if (generation !== this.generation) return;
    if (this.attempting) return;
    if (this.reconnectTimer) return;
    if (this.opts.hasActiveLink?.()) {
      // A dedup peer link already carries this peer — do not dial a duplicate.
      return;
    }
    const delay = this.nextBackoffDelay();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.attempt(generation);
    }, delay);
  }

  private nextBackoffDelay(): number {
    const raw = Math.min(this.maxBackoffMs, this.baseBackoffMs * 2 ** this.backoffExponent);
    this.backoffExponent++;
    // ±20% jitter using the injectable rng.
    const jitter = (this.rng() * 0.4 - 0.2) * raw;
    return Math.max(0, Math.round(raw + jitter));
  }

  private stale(generation: number): boolean {
    return this.stopped || generation !== this.generation;
  }
}

function deriveChannelBinding(tls: TLSSocket): Buffer {
  const fn = (tls as unknown as { exportKeyingMaterial?: (len: number, label: string) => Buffer }).exportKeyingMaterial;
  if (typeof fn !== 'function') {
    throw new Error('exportKeyingMaterial unavailable — refusing insecure channel binding');
  }
  const cb = fn.call(tls, CHANNEL_BINDING_LEN, EXPORTER_LABEL);
  if (!Buffer.isBuffer(cb) || cb.length !== CHANNEL_BINDING_LEN) {
    throw new Error('exportKeyingMaterial returned an invalid channel binding');
  }
  return cb;
}

