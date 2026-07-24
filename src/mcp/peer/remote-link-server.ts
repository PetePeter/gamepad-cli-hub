/**
 * RemoteLinkServer — accepts inbound peer connections over an mTLS WebSocket.
 *
 * SECURITY FLOW per connection:
 *   1. TLS with requestCert:true, rejectUnauthorized:false — we accept the
 *      handshake ourselves (self-signed peer certs) then pin/verify by hand.
 *   2. Derive channelBinding via exportKeyingMaterial on the TLS socket (RFC5705).
 *      If unavailable → HARD error, socket destroyed (no silent fallback).
 *   3. Read the peer LEAF cert raw DER → SHA-256 fingerprint.
 *   4. Run the RESPONDER PSK handshake (5s). PSK resolved via resolvePsk(peerId?).
 *   5. Pin the cert: first pairing → recordIfAbsent AFTER a successful handshake;
 *      established peer → verify BEFORE constructing the link (mismatch → destroy,
 *      send nothing, emit 'error').
 *   6. Construct a PeerLink and hand it to onLink.
 *
 * This is a SEPARATE listener from the 127.0.0.1 localhost MCP server and must
 * never touch it. Default bind 0.0.0.0:47474; port 0 for ephemeral test ports.
 */

import { EventEmitter } from 'node:events';
import { createServer, type Server as HttpsServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import type { TLSSocket } from 'node:tls';
import { WebSocketServer, type WebSocket } from 'ws';
import { logger } from '../../utils/logger.js';
import { certFingerprint } from './peer-crypto.js';
import type { PinnedCertStore } from './pinned-cert-store.js';
import { runResponderHandshake } from './remote-link-handshake.js';
import { PeerLink, type OnCall } from './peer-link.js';

const EXPORTER_LABEL = 'EXPORTER-Helm-Peer-v1';
const CHANNEL_BINDING_LEN = 32;
const DEFAULT_PORT = 47474;
const DEFAULT_HOST = '0.0.0.0';
/** Bounded retry when rebinding a port the OS hasn't released yet (~2s budget). */
const BIND_RETRY_ATTEMPTS = 40;
const BIND_RETRY_DELAY_MS = 50;

export interface RemoteLinkServerOptions {
  host?: string;
  port?: number;
  machineId: string;
  getCertKey: () => Promise<{ certPem: string; keyPem: string }>;
  resolvePsk: (peerId?: string) => Buffer | undefined;
  /** Map an observed peer cert fingerprint to an expected peerId (optional). */
  resolveExpectedPeer?: (certFp: string) => string | undefined;
  pinnedCertStore: PinnedCertStore;
  /**
   * Called once an inbound link is authenticated. `peerMachineId` is the identity
   * the peer PROVED in the handshake (used for dedup); `peerId` is the resolved
   * config/registry id under which the link is tracked.
   */
  onLink: (link: PeerLink, peerId: string, peerMachineId: string) => void;
  onCall: OnCall;
  authTimeoutMs?: number;
  peerLinkOptions?: { requestTimeoutMs?: number; heartbeatIntervalMs?: number; pongTimeoutMs?: number };
}

export class RemoteLinkServer extends EventEmitter {
  private https: HttpsServer | null = null;
  private wss: WebSocketServer | null = null;
  private readonly links = new Set<PeerLink>();
  private epochCounter = 0;
  private stopped = false;
  /**
   * Cert material resolved ONCE at start() and reused per connection (FIX 5).
   * Calling getCertKey() again per accept risks serving cert A on the wire while
   * computing the fp from a later cert B — the wire cert and the transcript fp
   * must be the same material.
   */
  private certMaterial: { certPem: string; keyPem: string; selfCertFp: string } | null = null;

  constructor(private readonly opts: RemoteLinkServerOptions) {
    super();
  }

  /** Bind the mTLS server and begin accepting peer connections. */
  async start(): Promise<void> {
    this.stopped = false;
    const { certPem, keyPem } = await this.opts.getCertKey();
    this.certMaterial = { certPem, keyPem, selfCertFp: certFingerprint(certPem) };

    const host = this.opts.host ?? DEFAULT_HOST;
    const port = this.opts.port ?? DEFAULT_PORT;

    // Bounded retry on EADDRINUSE: restarting the listener on the SAME port (a
    // live host/port change or a quick disable→enable toggle, P-0658) can race
    // the OS releasing the previous socket. Each attempt uses a FRESH server —
    // a net.Server that has emitted 'error' cannot be re-listened reliably — and
    // this.https/this.wss are assigned ONLY on success. A genuinely occupied
    // port still throws once the budget is exhausted. Ephemeral port 0 never conflicts.
    for (let i = 0; ; i++) {
      try {
        await this.bindOnce(certPem, keyPem, port, host);
        logger.info(`[RemoteLinkServer] Listening on ${host}:${this.address()?.port}`);
        return;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'EADDRINUSE' && i < BIND_RETRY_ATTEMPTS && !this.stopped) {
          logger.warn(`[RemoteLinkServer] ${host}:${port} in use, retrying bind (${i + 1}/${BIND_RETRY_ATTEMPTS})`);
          await new Promise((r) => setTimeout(r, BIND_RETRY_DELAY_MS));
          continue;
        }
        throw err;
      }
    }
  }

  /** One bind attempt with a fresh server; assigns this.https/this.wss on success only. */
  private bindOnce(certPem: string, keyPem: string, port: number, host: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const https = createServer({ cert: certPem, key: keyPem, requestCert: true, rejectUnauthorized: false });
      const wss = new WebSocketServer({ server: https });
      wss.on('connection', (ws, request) => {
        const tls = request.socket as TLSSocket;
        void this.acceptConnection(ws, tls);
      });
      // Bind-phase error handling ONLY. A failed listen (e.g. EADDRINUSE) bound no
      // socket, so there is nothing to close — do NOT call https.close() here (that
      // would emit a second, unhandled ERR_SERVER_NOT_RUNNING error). Just reject;
      // the throwaway server is GC'd. This handler is `once` and removed on success
      // so it can NOT swallow post-bind runtime errors on the live listener.
      let settled = false;
      const onBindError = (err: Error) => {
        if (settled) return;
        settled = true;
        reject(err);
      };
      https.once('error', onBindError);
      wss.on('error', (err: Error) => { logger.warn(`[RemoteLinkServer] wss error: ${err.message}`); });
      https.listen(port, host, () => {
        if (settled) return;
        settled = true;
        // Success: detach the bind-phase rejecter and attach a PERSISTENT logging
        // handler so live-server runtime errors SURFACE (are logged, not silently
        // swallowed) instead of crashing the process as an unhandled 'error'.
        https.removeListener('error', onBindError);
        https.on('error', (err: Error) => logger.error(`[RemoteLinkServer] server error: ${err.message}`));
        this.https = https;
        this.wss = wss;
        resolve();
      });
    });
  }

  /** The bound address, or null when not listening. */
  address(): AddressInfo | null {
    const addr = this.https?.address();
    return addr && typeof addr === 'object' ? (addr as AddressInfo) : null;
  }

  /** Close the listener and dispose every accepted link. */
  async stop(): Promise<void> {
    this.stopped = true;
    this.certMaterial = null;
    for (const link of this.links) link.dispose('server-stop');
    this.links.clear();
    const wss = this.wss;
    const https = this.https;
    this.wss = null;
    this.https = null;
    // Force every accepted socket closed so wss.close() (which otherwise waits
    // for clients to disconnect) resolves promptly.
    if (wss) for (const client of wss.clients) { try { client.terminate(); } catch { /* */ } }
    // Drop any lingering keep-alive TLS connections (e.g. a peer mid-reconnect)
    // so neither close() below can hang waiting for them to end.
    try { (https as unknown as { closeAllConnections?: () => void })?.closeAllConnections?.(); } catch { /* */ }
    await new Promise<void>(resolve => {
      if (!wss) return resolve();
      wss.close(() => resolve());
    });
    await new Promise<void>(resolve => {
      if (!https) return resolve();
      https.close(() => resolve());
    });
  }

  private async acceptConnection(ws: WebSocket, tls: TLSSocket): Promise<void> {
    try {
      const channelBinding = deriveChannelBinding(tls);
      const peerCertFp = readPeerCertFp(tls);

      const expectedPeerId = this.opts.resolveExpectedPeer?.(peerCertFp);
      const psk = this.opts.resolvePsk(expectedPeerId);
      if (!psk) throw new Error(`no PSK for inbound peer ${expectedPeerId ?? '(unknown)'}`);

      // Reuse the cert material resolved at start() — same bytes on the wire and
      // in the transcript fp (FIX 5).
      const selfCertFp = this.certMaterial?.selfCertFp;
      if (!selfCertFp) throw new Error('server cert material not initialised');

      const result = await runResponderHandshake(ws, {
        machineId: this.opts.machineId,
        selfCertFp,
        peerCertFp,
        channelBinding,
        psk,
        timeoutMs: this.opts.authTimeoutMs ?? 5000,
      });

      const peerId = expectedPeerId ?? result.peerMachineId;

      // Established peer → verify pin BEFORE building the link. First pairing →
      // record it now that the handshake proved possession of the PSK.
      if (this.opts.pinnedCertStore.get(peerId) !== undefined) {
        if (!this.opts.pinnedCertStore.verify(peerId, peerCertFp)) {
          throw new Error(`cert pin mismatch for peer ${peerId}`);
        }
      } else {
        this.opts.pinnedCertStore.recordIfAbsent(peerId, peerCertFp);
      }

      if (this.stopped) { ws.terminate(); return; }

      const link = new PeerLink(ws, {
        peerId,
        connectionEpoch: ++this.epochCounter,
        onCall: this.opts.onCall,
        ...this.opts.peerLinkOptions,
      });
      this.links.add(link);
      link.once('offline', () => this.links.delete(link));
      this.opts.onLink(link, peerId, result.peerMachineId);
      this.emit('online', { peerId });
    } catch (err) {
      // Send nothing — just destroy the socket. Never leak the reason on the wire.
      try { ws.terminate(); } catch { /* */ }
      logger.warn(`[RemoteLinkServer] Rejected inbound connection: ${(err as Error).message}`);
      // Guard: emitting 'error' with no listener would throw (EventEmitter
      // semantics). A rejected inbound connection is routine, not fatal.
      if (this.listenerCount('error') > 0) this.emit('error', err);
    }
  }
}

/** RFC5705 exporter — identical bytes on both TLS ends. Hard-fail if missing. */
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

/** SHA-256 fingerprint of the peer's leaf cert DER, in certFingerprint format. */
function readPeerCertFp(tls: TLSSocket): string {
  const peerCert = tls.getPeerCertificate(true);
  if (!peerCert || !peerCert.raw || peerCert.raw.length === 0) {
    throw new Error('peer presented no certificate');
  }
  const pem = derToPem(peerCert.raw);
  return certFingerprint(pem);
}

/** Wrap raw DER cert bytes as a PEM so certFingerprint (X509Certificate) parses it. */
function derToPem(der: Buffer): string {
  const b64 = der.toString('base64').replace(/(.{64})/g, '$1\n');
  return `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----\n`;
}
