/**
 * pairing-crypto — pure cryptographic primitives for the SAS (Short
 * Authentication String) numeric-comparison pairing protocol.
 *
 * NO sockets, NO network, NO persistence. This module owns ephemeral X25519 key
 * generation, the commit-then-reveal commitment, the canonical length-prefixed
 * pairing transcript, and three HKDF derivations from the ECDH shared secret:
 * the 6-digit SAS the USER compares, the confirm-MAC key, and the final PSK.
 *
 * SECURITY INVARIANTS (codex-reviewed — do not weaken):
 *  - The 6-digit code is an OUTPUT of a KDF over the ECDH shared secret. It is
 *    NEVER an input to any MAC or KDF. It exists only for the user to compare on
 *    both screens; a MITM with its own keys yields a DIFFERENT SAS on each end.
 *  - The confirm-MAC key and the PSK are derived from the SAME shared secret and
 *    transcript but under DISTINCT HKDF `info` labels, so the three outputs
 *    (SAS / confirm / PSK) are cryptographically independent.
 *  - Every field of the transcript is length-prefixed in a FIXED role-ordered
 *    sequence, so the encoding is injective (no boundary-shift collision) and
 *    identical on both peers regardless of who sent first.
 */

import {
  createHash,
  createHmac,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  timingSafeEqual,
  type KeyObject,
} from 'node:crypto';

/** HKDF `info` labels — DISTINCT per derivation so outputs never coincide. */
const SAS_LABEL = 'helm-pair-sas-v1';
const CONFIRM_LABEL = 'helm-pair-confirm-v1';
const PSK_LABEL = 'helm-peer-psk-v1';

export interface EphemeralKeyPair {
  /** Live private KeyObject (never serialised — stays in-process). */
  privateKey: KeyObject;
  /** SPKI-DER encoding of the public key, exchanged on the wire. */
  publicKeyDER: Buffer;
}

/**
 * The canonical transcript fields in FIXED role order (initiator then
 * responder), NOT send order. Both peers build byte-identical transcripts.
 */
export interface PairingTranscriptParts {
  version: number;
  sessionId: string;
  initiatorMachineId: string;
  responderMachineId: string;
  initiatorCertFp: string;
  responderCertFp: string;
  initiatorPubDER: Buffer;
  responderPubDER: Buffer;
  initiatorNonce: Buffer;
  responderNonce: Buffer;
}

/** Generate a fresh ephemeral X25519 keypair; export the public key as SPKI-DER. */
export function generateEphemeralKeyPair(): EphemeralKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('x25519');
  const publicKeyDER = publicKey.export({ type: 'spki', format: 'der' });
  return { privateKey, publicKeyDER };
}

/**
 * Import the peer's SPKI-DER public key and compute the raw X25519 shared secret.
 * REQUIRES the imported key to be x25519 — anything else (e.g. an RSA key smuggled
 * in) throws, so a type-confusion downgrade can never reach the KDFs.
 */
export function computeSharedSecret(ownPrivate: KeyObject, peerPublicDER: Buffer): Buffer {
  const publicKey = createPublicKey({ key: peerPublicDER, format: 'der', type: 'spki' });
  if (publicKey.asymmetricKeyType !== 'x25519') {
    throw new Error(`Peer key is not x25519 (got ${publicKey.asymmetricKeyType})`);
  }
  return diffieHellman({ privateKey: ownPrivate, publicKey });
}

/** Length-prefixed SHA-256 commitment over (pubkeyDER, nonce). */
export function computeCommitment(pubkeyDER: Buffer, nonce: Buffer): Buffer {
  return createHash('sha256').update(lengthPrefixed([pubkeyDER, nonce])).digest();
}

/** Constant-time check that `commitment` matches SHA256(lp(pubkey, nonce)). */
export function verifyCommitment(commitment: Buffer, pubkeyDER: Buffer, nonce: Buffer): boolean {
  const expected = computeCommitment(pubkeyDER, nonce);
  return safeEqual(commitment, expected);
}

/**
 * Canonical length-prefixed pairing transcript. Version is a fixed-width 4-byte
 * big-endian field (no decimal-string ambiguity); every other field is emitted
 * as a 4-byte length prefix + raw bytes, in fixed role order.
 */
export function buildPairingTranscript(parts: PairingTranscriptParts): Buffer {
  const versionBuf = Buffer.allocUnsafe(4);
  versionBuf.writeUInt32BE(parts.version >>> 0, 0);

  return lengthPrefixed([
    versionBuf,
    Buffer.from(parts.sessionId, 'utf8'),
    Buffer.from(parts.initiatorMachineId, 'utf8'),
    Buffer.from(parts.responderMachineId, 'utf8'),
    Buffer.from(parts.initiatorCertFp, 'utf8'),
    Buffer.from(parts.responderCertFp, 'utf8'),
    parts.initiatorPubDER,
    parts.responderPubDER,
    parts.initiatorNonce,
    parts.responderNonce,
  ]);
}

/**
 * Derive the 6-digit SAS the USER compares: HKDF(shared, salt=transcript,
 * info=SAS_LABEL, 4 bytes) → uint32 → mod 1e6 → zero-padded. Deterministic and
 * identical on both peers iff no MITM (which would inject its own shared secret).
 */
export function deriveSas(shared: Buffer, transcript: Buffer): string {
  const out = Buffer.from(hkdfSync('sha256', shared, transcript, SAS_LABEL, 4));
  return (out.readUInt32BE(0) % 1_000_000).toString().padStart(6, '0');
}

/**
 * Confirm-MAC = HMAC(confirmKey, transcript) where the confirmKey is
 * HKDF(shared, salt=transcript, info=CONFIRM_LABEL, 32). The key comes from the
 * ECDH secret — NEVER from the SAS.
 */
export function computeConfirmMac(shared: Buffer, transcript: Buffer): Buffer {
  const confirmKey = Buffer.from(hkdfSync('sha256', shared, transcript, CONFIRM_LABEL, 32));
  return createHmac('sha256', confirmKey).update(transcript).digest();
}

/** Constant-time verify of a peer's confirm-MAC; never throws on bad input. */
export function verifyConfirmMac(shared: Buffer, transcript: Buffer, providedMac: Buffer): boolean {
  return safeEqual(providedMac, computeConfirmMac(shared, transcript));
}

/** Final pre-shared key: HKDF(shared, salt=transcript, info=PSK_LABEL, 32). */
export function derivePsk(shared: Buffer, transcript: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', shared, transcript, PSK_LABEL, 32));
}

// ------------------------------------------------------------------ internals

/** 4-byte big-endian length prefix per field, concatenated — injective. */
function lengthPrefixed(fields: Buffer[]): Buffer {
  const chunks: Buffer[] = [];
  for (const field of fields) {
    const len = Buffer.allocUnsafe(4);
    len.writeUInt32BE(field.length, 0);
    chunks.push(len, field);
  }
  return Buffer.concat(chunks);
}

/** Length-checked constant-time compare; false (never throws) on mismatch. */
function safeEqual(a: Buffer, b: Buffer): boolean {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b) || a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
