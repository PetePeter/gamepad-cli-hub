/**
 * peer-crypto — pure cryptographic primitives for the P2P peer handshake.
 *
 * NO sockets, NO network. This module owns key/cert material generation, the
 * canonical handshake transcript encoding, and the PSK-keyed handshake MAC.
 *
 * WHY length-prefixed transcript: a naive concatenation of handshake fields is
 * vulnerable to a boundary-shift collision (ids 'ab'+'c' encodes identically to
 * 'a'+'bc'). Every field is therefore written as a 4-byte big-endian length
 * followed by its raw bytes, in a FIXED order, so the encoding is injective.
 *
 * WHY per-role MAC labels: initiator and responder derive DISTINCT MACs from the
 * SAME transcript so a peer cannot replay the other side's proof back at it.
 *
 * WHY replay needs no nonce cache: the responder contributes a fresh 32-byte
 * nonce to every handshake, which is folded into the transcript. A replayed
 * initiator MAC is bound to an old responder nonce and fails verification. The
 * timestamp freshness check is defence-in-depth only.
 */

import {
  randomBytes,
  randomUUID,
  generateKeyPairSync,
  createHmac,
  timingSafeEqual,
  X509Certificate,
} from 'node:crypto';
import type { TLSSocket } from 'node:tls';
import { existsSync, readFileSync } from 'node:fs';
import * as YAML from 'yaml';
import { generate as generateSelfSigned } from 'selfsigned';
import { logger } from '../../utils/logger.js';
import { isRecord, isString, atomicWriteFileSync } from '../../session/persistence-utils.js';
import { MACHINE_IDENTITY_FILE, SELF_SIGNED_CERT_FILE } from '../../session/persistence-paths.js';

export interface MachineIdentity {
  machineId: string;
  publicKeyPem: string;
  privateKeyPem: string;
}

export interface SelfSignedCert {
  certPem: string;
  privateKeyPem: string;
  fingerprint: string;
}

const HANDSHAKE_LABEL_PREFIX = 'helm-peer-handshake-v1:';

/** 32 cryptographically-random bytes for a per-handshake nonce. */
export function generateNonce(): Buffer {
  return randomBytes(32);
}

/** 32 cryptographically-random bytes of pre-shared-key material. */
export function generatePsk(): Buffer {
  return randomBytes(32);
}

/**
 * Return this machine's stable identity, generating + persisting it on first
 * call and reloading the identical values thereafter (idempotent). Persists
 * atomically. `configPath` overrides the default file for testability.
 */
export function getOrCreateMachineIdentity(configPath: string = MACHINE_IDENTITY_FILE): MachineIdentity {
  const existing = loadMachineIdentity(configPath);
  if (existing) return existing;

  const machineId = randomUUID();
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const identity: MachineIdentity = {
    machineId,
    publicKeyPem: publicKey.toString(),
    privateKeyPem: privateKey.toString(),
  };
  atomicWriteFileSync(configPath, YAML.stringify(identity), { mode: 0o600 });
  logger.info(`[peer-crypto] Generated machine identity ${machineId}`);
  return identity;
}

function loadMachineIdentity(configPath: string): MachineIdentity | null {
  try {
    if (!existsSync(configPath)) return null;
    const parsed = YAML.parse(readFileSync(configPath, 'utf8')) as unknown;
    if (
      isRecord(parsed) &&
      isString(parsed.machineId) &&
      isString(parsed.publicKeyPem) &&
      isString(parsed.privateKeyPem)
    ) {
      return {
        machineId: parsed.machineId,
        publicKeyPem: parsed.publicKeyPem,
        privateKeyPem: parsed.privateKeyPem,
      };
    }
  } catch (err) {
    // Never interpolate the raw error — it may echo key PEM material.
    logger.error(`[peer-crypto] Failed to load machine identity: ${(err as Error)?.message?.slice(0, 120)}`);
  }
  return null;
}

/**
 * Return this machine's stable self-signed TLS cert, generating + persisting it
 * on first call and reloading the identical PEM thereafter. Forces RSA-2048 +
 * SHA-256 (selfsigned defaults to SHA-1 — we explicitly override it).
 */
export async function getOrCreateSelfSignedCert(configPath: string = SELF_SIGNED_CERT_FILE): Promise<SelfSignedCert> {
  const existing = loadSelfSignedCert(configPath);
  if (existing) return existing;

  const days = 3650;
  const notBefore = new Date();
  const notAfter = new Date(notBefore.getTime() + days * 24 * 60 * 60 * 1000);
  const pems = await generateSelfSigned(
    [{ name: 'commonName', value: 'helm-peer' }],
    { keySize: 2048, algorithm: 'sha256', notBeforeDate: notBefore, notAfterDate: notAfter },
  );

  const certPem: string = pems.cert;
  const privateKeyPem: string = pems.private;
  const cert: SelfSignedCert = {
    certPem,
    privateKeyPem,
    fingerprint: certFingerprint(certPem),
  };
  atomicWriteFileSync(
    configPath,
    YAML.stringify({ certPem, privateKeyPem, fingerprint: cert.fingerprint }),
    { mode: 0o600 },
  );
  logger.info('[peer-crypto] Generated self-signed cert (RSA-2048/SHA-256)');
  return cert;
}

function loadSelfSignedCert(configPath: string): SelfSignedCert | null {
  try {
    if (!existsSync(configPath)) return null;
    const parsed = YAML.parse(readFileSync(configPath, 'utf8')) as unknown;
    if (isRecord(parsed) && isString(parsed.certPem) && isString(parsed.privateKeyPem)) {
      return {
        certPem: parsed.certPem,
        privateKeyPem: parsed.privateKeyPem,
        // Recompute rather than trusting the stored value.
        fingerprint: certFingerprint(parsed.certPem),
      };
    }
  } catch (err) {
    // Never interpolate the raw error — it may echo private-key PEM material.
    logger.error(`[peer-crypto] Failed to load self-signed cert: ${(err as Error)?.message?.slice(0, 120)}`);
  }
  return null;
}

/**
 * SHA-256 fingerprint of the leaf certificate's DER bytes, formatted as
 * uppercase colon-separated hex (e.g. "AB:CD:..."). Deterministic per cert.
 */
export function certFingerprint(certPem: string): string {
  return new X509Certificate(certPem).fingerprint256;
}

/**
 * Fingerprint of the leaf certificate the OTHER end presented on a live TLS socket.
 * Shared by the link server, the link client and the pairing socket so all three
 * derive the identity they pin/compare from the exact same bytes.
 */
export function peerCertFpFromSocket(tls: TLSSocket): string {
  const peerCert = tls.getPeerCertificate(true);
  if (!peerCert || !peerCert.raw || peerCert.raw.length === 0) {
    throw new Error('peer presented no certificate');
  }
  return certFingerprint(derToPem(peerCert.raw));
}

/** Wrap raw DER cert bytes as PEM so X509Certificate can parse them. */
function derToPem(der: Buffer): string {
  const b64 = der.toString('base64').replace(/(.{64})/g, '$1\n');
  return `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----\n`;
}

/**
 * Canonical length-prefixed encoding of the handshake transcript. Each field is
 * emitted as a 4-byte big-endian length followed by its bytes, in a FIXED order,
 * so the mapping from fields to bytes is injective (no boundary-shift collision).
 */
export function buildHandshakeTranscript(parts: {
  version: number;
  initiatorId: string;
  responderId: string;
  nonceInitiator: Buffer;
  nonceResponder: Buffer;
  initiatorCertFp: string;
  responderCertFp: string;
  channelBinding: Buffer;
}): Buffer {
  // Fixed-width 4-byte big-endian version — avoids any decimal-string ambiguity.
  const versionBuf = Buffer.allocUnsafe(4);
  versionBuf.writeUInt32BE(parts.version >>> 0, 0);

  const fields: Buffer[] = [
    versionBuf,
    Buffer.from(parts.initiatorId, 'utf8'),
    Buffer.from(parts.responderId, 'utf8'),
    parts.nonceInitiator,
    parts.nonceResponder,
    Buffer.from(parts.initiatorCertFp, 'utf8'),
    Buffer.from(parts.responderCertFp, 'utf8'),
    parts.channelBinding,
  ];

  const chunks: Buffer[] = [];
  for (const field of fields) {
    const len = Buffer.allocUnsafe(4);
    len.writeUInt32BE(field.length, 0);
    chunks.push(len, field);
  }
  return Buffer.concat(chunks);
}

/**
 * HMAC-SHA256(psk, roleLabel || transcript). The role label is a distinct
 * constant per role so initiator and responder MACs never coincide.
 */
export function computeHandshakeMac(
  psk: Buffer,
  role: 'initiator' | 'responder',
  transcript: Buffer,
): Buffer {
  const label = Buffer.from(HANDSHAKE_LABEL_PREFIX + role, 'utf8');
  return createHmac('sha256', psk).update(label).update(transcript).digest();
}

/**
 * Recompute the expected MAC and compare in constant time. Unequal-length input
 * is rejected BEFORE timingSafeEqual (which throws on length mismatch) and never
 * throws on malformed input.
 */
export function verifyHandshakeMac(
  psk: Buffer,
  role: 'initiator' | 'responder',
  transcript: Buffer,
  providedMac: Buffer,
): boolean {
  const expected = computeHandshakeMac(psk, role, transcript);
  if (!Buffer.isBuffer(providedMac) || providedMac.length !== expected.length) return false;
  try {
    return timingSafeEqual(providedMac, expected);
  } catch {
    return false;
  }
}

/** True when `ts` is within ±windowMs of `now`. Defence-in-depth only. */
export function isTimestampFresh(ts: number, now: number, windowMs = 120_000): boolean {
  return Math.abs(now - ts) <= windowMs;
}
