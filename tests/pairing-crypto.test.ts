/**
 * pairing-crypto unit tests — real X25519 + real SHA/HMAC/HKDF exercised end to
 * end. These are the pure SAS-pairing primitives: ephemeral keygen, commitment,
 * canonical length-prefixed transcript, SAS derive, confirm-MAC, and PSK derive.
 *
 * No mocks of crypto; only the logger is silenced (imported modules may log).
 */

import { describe, it, expect, vi } from 'vitest';
import { createPublicKey } from 'node:crypto';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import {
  generateEphemeralKeyPair,
  computeCommitment,
  verifyCommitment,
  buildPairingTranscript,
  deriveSas,
  computeConfirmMac,
  verifyConfirmMac,
  derivePsk,
  computeSharedSecret,
  type PairingTranscriptParts,
} from '../src/mcp/peer/pairing-crypto.js';

function transcriptParts(overrides: Partial<PairingTranscriptParts> = {}): PairingTranscriptParts {
  return {
    version: 1,
    sessionId: 'sess-1',
    initiatorMachineId: 'machine-I',
    responderMachineId: 'machine-R',
    initiatorCertFp: 'FP-I',
    responderCertFp: 'FP-R',
    initiatorPubDER: Buffer.alloc(44, 1),
    responderPubDER: Buffer.alloc(44, 2),
    initiatorNonce: Buffer.alloc(32, 3),
    responderNonce: Buffer.alloc(32, 4),
    ...overrides,
  };
}

describe('generateEphemeralKeyPair', () => {
  it('produces a fresh X25519 keypair each call with SPKI-DER public bytes', () => {
    const a = generateEphemeralKeyPair();
    const b = generateEphemeralKeyPair();

    expect(Buffer.isBuffer(a.publicKeyDER)).toBe(true);
    expect(a.publicKeyDER.length).toBeGreaterThan(0);
    // SPKI-DER importable as an x25519 public key.
    const key = createPublicKey({ key: a.publicKeyDER, format: 'der', type: 'spki' });
    expect(key.asymmetricKeyType).toBe('x25519');
    // Fresh keys differ.
    expect(a.publicKeyDER.equals(b.publicKeyDER)).toBe(false);
  });

  it('derives an identical shared secret on both sides (ECDH agreement)', () => {
    const i = generateEphemeralKeyPair();
    const r = generateEphemeralKeyPair();
    const sharedI = computeSharedSecret(i.privateKey, r.publicKeyDER);
    const sharedR = computeSharedSecret(r.privateKey, i.publicKeyDER);
    expect(sharedI.equals(sharedR)).toBe(true);
    expect(sharedI.length).toBe(32);
  });

  it('computeSharedSecret rejects a non-x25519 peer key', () => {
    const i = generateEphemeralKeyPair();
    // An RSA SPKI-DER masquerading as the peer key must be rejected.
    const { generateKeyPairSync } = require('node:crypto');
    const { publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    });
    expect(() => computeSharedSecret(i.privateKey, publicKey)).toThrow();
  });
});

describe('commitment', () => {
  it('is a 32-byte SHA-256 digest and verifies for the matching reveal', () => {
    const pub = Buffer.alloc(44, 9);
    const nonce = Buffer.alloc(32, 8);
    const c = computeCommitment(pub, nonce);
    expect(c).toHaveLength(32);
    expect(verifyCommitment(c, pub, nonce)).toBe(true);
  });

  it('rejects a tampered pubkey or nonce (timing-safe)', () => {
    const pub = Buffer.alloc(44, 9);
    const nonce = Buffer.alloc(32, 8);
    const c = computeCommitment(pub, nonce);
    expect(verifyCommitment(c, Buffer.alloc(44, 1), nonce)).toBe(false);
    expect(verifyCommitment(c, pub, Buffer.alloc(32, 1))).toBe(false);
  });

  it('is length-prefixed injective (pub/nonce boundary shift changes commitment)', () => {
    const c1 = computeCommitment(Buffer.from('ab'), Buffer.from('c'));
    const c2 = computeCommitment(Buffer.from('a'), Buffer.from('bc'));
    expect(c1.equals(c2)).toBe(false);
  });

  it('does not throw on a malformed provided commitment', () => {
    const pub = Buffer.alloc(44, 9);
    const nonce = Buffer.alloc(32, 8);
    expect(() => verifyCommitment(Buffer.alloc(10), pub, nonce)).not.toThrow();
    expect(verifyCommitment(Buffer.alloc(10), pub, nonce)).toBe(false);
  });
});

describe('pairing transcript canonical encoding', () => {
  it('changing any single field changes the transcript bytes', () => {
    const ref = buildPairingTranscript(transcriptParts());
    const variants: PairingTranscriptParts[] = [
      transcriptParts({ version: 2 }),
      transcriptParts({ sessionId: 'sess-2' }),
      transcriptParts({ initiatorMachineId: 'machine-I2' }),
      transcriptParts({ responderMachineId: 'machine-R2' }),
      transcriptParts({ initiatorCertFp: 'FP-I2' }),
      transcriptParts({ responderCertFp: 'FP-R2' }),
      transcriptParts({ initiatorPubDER: Buffer.alloc(44, 9) }),
      transcriptParts({ responderPubDER: Buffer.alloc(44, 9) }),
      transcriptParts({ initiatorNonce: Buffer.alloc(32, 9) }),
      transcriptParts({ responderNonce: Buffer.alloc(32, 9) }),
    ];
    for (const v of variants) {
      expect(buildPairingTranscript(v).equals(ref)).toBe(false);
    }
  });

  it('swapping initiator/responder roles changes the transcript (role-ordered, not send-ordered)', () => {
    const a = buildPairingTranscript(transcriptParts());
    const b = buildPairingTranscript(transcriptParts({
      initiatorMachineId: 'machine-R',
      responderMachineId: 'machine-I',
      initiatorCertFp: 'FP-R',
      responderCertFp: 'FP-I',
      initiatorPubDER: Buffer.alloc(44, 2),
      responderPubDER: Buffer.alloc(44, 1),
      initiatorNonce: Buffer.alloc(32, 4),
      responderNonce: Buffer.alloc(32, 3),
    }));
    expect(a.equals(b)).toBe(false);
  });

  it('prevents concatenation collision on adjacent string fields', () => {
    const t1 = buildPairingTranscript(transcriptParts({ initiatorMachineId: 'ab', responderMachineId: 'c' }));
    const t2 = buildPairingTranscript(transcriptParts({ initiatorMachineId: 'a', responderMachineId: 'bc' }));
    expect(t1.equals(t2)).toBe(false);
  });
});

describe('SAS derive', () => {
  const shared = Buffer.alloc(32, 5);

  it('is a deterministic 6-digit numeric string for the same shared+transcript', () => {
    const t = buildPairingTranscript(transcriptParts());
    const s1 = deriveSas(shared, t);
    const s2 = deriveSas(shared, t);
    expect(s1).toBe(s2);
    expect(s1).toMatch(/^\d{6}$/);
  });

  it('differs when any transcript field differs', () => {
    const base = deriveSas(shared, buildPairingTranscript(transcriptParts()));
    const other = deriveSas(shared, buildPairingTranscript(transcriptParts({ sessionId: 'other' })));
    expect(base).not.toBe(other);
  });

  it('differs when the shared secret differs', () => {
    const t = buildPairingTranscript(transcriptParts());
    expect(deriveSas(shared, t)).not.toBe(deriveSas(Buffer.alloc(32, 6), t));
  });

  it('is zero-padded to 6 digits', () => {
    // Sweep several transcripts; every SAS must be exactly 6 chars.
    for (let i = 0; i < 50; i++) {
      const s = deriveSas(shared, buildPairingTranscript(transcriptParts({ sessionId: `s-${i}` })));
      expect(s).toHaveLength(6);
    }
  });
});

describe('confirm-MAC', () => {
  const shared = Buffer.alloc(32, 5);
  const transcript = buildPairingTranscript(transcriptParts());

  it('is deterministic, 32 bytes, and verifies', () => {
    const m1 = computeConfirmMac(shared, transcript);
    const m2 = computeConfirmMac(shared, transcript);
    expect(m1.equals(m2)).toBe(true);
    expect(m1).toHaveLength(32);
    expect(verifyConfirmMac(shared, transcript, m1)).toBe(true);
  });

  it('rejects wrong shared, tampered transcript, and malformed mac (timing-safe, no throw)', () => {
    const mac = computeConfirmMac(shared, transcript);
    expect(verifyConfirmMac(Buffer.alloc(32, 6), transcript, mac)).toBe(false);
    const tampered = Buffer.from(transcript); tampered[0] ^= 0xff;
    expect(verifyConfirmMac(shared, tampered, mac)).toBe(false);
    expect(() => verifyConfirmMac(shared, transcript, Buffer.alloc(10))).not.toThrow();
    expect(verifyConfirmMac(shared, transcript, Buffer.alloc(10))).toBe(false);
  });
});

describe('PSK derive', () => {
  it('is 32 bytes and deterministic for the same shared+transcript', () => {
    const shared = Buffer.alloc(32, 5);
    const t = buildPairingTranscript(transcriptParts());
    const p1 = derivePsk(shared, t);
    const p2 = derivePsk(shared, t);
    expect(p1).toHaveLength(32);
    expect(p1.equals(p2)).toBe(true);
  });
});

describe('distinct HKDF labels', () => {
  it('SAS, confirm-key, and PSK are three different outputs for the same shared+transcript', () => {
    const shared = Buffer.alloc(32, 5);
    const transcript = buildPairingTranscript(transcriptParts());

    const psk = derivePsk(shared, transcript);
    const confirmMac = computeConfirmMac(shared, transcript);
    // SAS is derived from a 4-byte HKDF read; compare the raw label domains by
    // asserting the three derivations don't collide. The confirm key is internal,
    // so we assert PSK != first-32-of-confirmMac-domain via the MAC output and
    // that PSK != a psk computed under the confirm relationship.
    // Concretely: PSK bytes must not equal the confirm MAC bytes (distinct labels
    // + distinct constructions), and the SAS must not be a slice of the PSK.
    expect(psk.equals(confirmMac)).toBe(false);
    const sas = deriveSas(shared, transcript);
    // The 6-digit SAS should not trivially match the decimal of the PSK's head.
    const pskHead = (psk.readUInt32BE(0) % 1_000_000).toString().padStart(6, '0');
    expect(sas).not.toBe(pskHead);
  });
});
