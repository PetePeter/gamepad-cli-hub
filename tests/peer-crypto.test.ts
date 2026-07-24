/**
 * peer-crypto unit tests — real crypto exercised end to end.
 *
 * Machine identity + self-signed cert are persisted to REAL OS temp files so the
 * stable/reload contract is tested against actual disk round-trips. No mocks of
 * the crypto itself; only the logger is silenced.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, X509Certificate } from 'node:crypto';
import { X509Certificate as PeculiarX509 } from '@peculiar/x509';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import {
  generateNonce,
  generatePsk,
  getOrCreateMachineIdentity,
  getOrCreateSelfSignedCert,
  certFingerprint,
  buildHandshakeTranscript,
  computeHandshakeMac,
  verifyHandshakeMac,
  isTimestampFresh,
} from '../src/mcp/peer/peer-crypto.js';

const tempDirs: string[] = [];
function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'helm-peercrypto-'));
  tempDirs.push(dir);
  return dir;
}
function tmpFile(name: string): string {
  return join(tmp(), name);
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop()!;
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

describe('machine identity', () => {
  it('is stable/persisted/reloaded across two calls on the same path', () => {
    const file = tmpFile('machine-identity.yaml');
    const first = getOrCreateMachineIdentity(file);
    const second = getOrCreateMachineIdentity(file);

    expect(first.machineId).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.machineId).toBe(first.machineId);
    expect(second.publicKeyPem).toBe(first.publicKeyPem);
    expect(second.privateKeyPem).toBe(first.privateKeyPem);
    expect(first.publicKeyPem).toContain('BEGIN PUBLIC KEY');
    expect(first.privateKeyPem).toContain('PRIVATE KEY');
  });

  it('generates a different machineId for a fresh path', () => {
    const a = getOrCreateMachineIdentity(tmpFile('a.yaml'));
    const b = getOrCreateMachineIdentity(tmpFile('b.yaml'));
    expect(a.machineId).not.toBe(b.machineId);
    expect(a.privateKeyPem).not.toBe(b.privateKeyPem);
  });

  it('generated key is RSA-2048', () => {
    const id = getOrCreateMachineIdentity(tmpFile('rsa.yaml'));
    const { createPublicKey } = require('node:crypto');
    const key = createPublicKey(id.publicKeyPem);
    expect(key.asymmetricKeyType).toBe('rsa');
    expect(key.asymmetricKeyDetails?.modulusLength).toBe(2048);
  });
});

describe('self-signed cert', () => {
  it('resolves, parses, is SHA-256 (NOT SHA-1), RSA-2048, and stable across calls', async () => {
    const file = tmpFile('cert.yaml');
    const first = await getOrCreateSelfSignedCert(file);
    const second = await getOrCreateSelfSignedCert(file);

    // Stable across calls (persisted + reloaded).
    expect(second.certPem).toBe(first.certPem);
    expect(second.privateKeyPem).toBe(first.privateKeyPem);
    expect(second.fingerprint).toBe(first.fingerprint);

    // Parses as a real X.509 leaf.
    const cert = new X509Certificate(first.certPem);
    expect(cert.publicKey.asymmetricKeyType).toBe('rsa');
    expect(cert.publicKey.asymmetricKeyDetails?.modulusLength).toBe(2048);

    // Signature algorithm MUST be SHA-256, never SHA-1. Read the actual signed
    // algorithm off the parsed cert (not the key-generation params).
    const parsed = new PeculiarX509(first.certPem);
    const sigAlg = parsed.signatureAlgorithm as { name: string; hash?: { name: string } };
    const hashName = (sigAlg.hash?.name ?? '').toUpperCase();
    expect(sigAlg.name).toBe('RSASSA-PKCS1-v1_5');
    expect(hashName).toBe('SHA-256');
    expect(hashName).not.toBe('SHA-1');
  });

  it('fingerprint is deterministic and two different certs differ', async () => {
    const a = await getOrCreateSelfSignedCert(tmpFile('ca.yaml'));
    const b = await getOrCreateSelfSignedCert(tmpFile('cb.yaml'));
    expect(a.fingerprint).not.toBe(b.fingerprint);
    // certFingerprint recomputes the same value from the PEM.
    expect(certFingerprint(a.certPem)).toBe(a.fingerprint);
  });
});

describe('certFingerprint', () => {
  it('is deterministic for the same PEM and differs for different PEMs', async () => {
    const a = await getOrCreateSelfSignedCert(tmpFile('fa.yaml'));
    const b = await getOrCreateSelfSignedCert(tmpFile('fb.yaml'));
    expect(certFingerprint(a.certPem)).toBe(certFingerprint(a.certPem));
    expect(certFingerprint(a.certPem)).not.toBe(certFingerprint(b.certPem));
  });
});

describe('nonce / psk', () => {
  it('generateNonce returns 32 distinct bytes', () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).toHaveLength(32);
    expect(b).toHaveLength(32);
    expect(a.equals(b)).toBe(false);
  });

  it('generatePsk returns 32 distinct bytes', () => {
    const a = generatePsk();
    const b = generatePsk();
    expect(a).toHaveLength(32);
    expect(a.equals(b)).toBe(false);
  });
});

describe('handshake transcript canonical encoding', () => {
  const base = () => ({
    version: 1,
    initiatorId: 'ab',
    responderId: 'c',
    nonceInitiator: Buffer.alloc(32, 1),
    nonceResponder: Buffer.alloc(32, 2),
    initiatorCertFp: 'FP-A',
    responderCertFp: 'FP-B',
    channelBinding: Buffer.alloc(16, 3),
  });

  it('prevents concatenation collision on adjacent string fields', () => {
    const t1 = buildHandshakeTranscript({ ...base(), initiatorId: 'ab', responderId: 'c' });
    const t2 = buildHandshakeTranscript({ ...base(), initiatorId: 'a', responderId: 'bc' });
    expect(t1.equals(t2)).toBe(false);
  });

  it('changing any single field changes the transcript bytes', () => {
    const ref = buildHandshakeTranscript(base());
    const variants = [
      { ...base(), version: 2 },
      { ...base(), initiatorId: 'ab2' },
      { ...base(), responderId: 'c2' },
      { ...base(), nonceInitiator: Buffer.alloc(32, 9) },
      { ...base(), nonceResponder: Buffer.alloc(32, 9) },
      { ...base(), initiatorCertFp: 'FP-A2' },
      { ...base(), responderCertFp: 'FP-B2' },
      { ...base(), channelBinding: Buffer.alloc(16, 9) },
    ];
    for (const v of variants) {
      expect(buildHandshakeTranscript(v).equals(ref)).toBe(false);
    }
  });

  it('encodes version as a fixed-width field: version 1 vs 10 yield different transcripts', () => {
    const t1 = buildHandshakeTranscript({ ...base(), version: 1 });
    const t10 = buildHandshakeTranscript({ ...base(), version: 10 });
    expect(t1.equals(t10)).toBe(false);
    // Fixed-width 4-byte version keeps overall transcript length identical.
    expect(t1.length).toBe(t10.length);
  });
});

describe('handshake MAC', () => {
  const psk = Buffer.alloc(32, 7);
  const transcript = buildHandshakeTranscript({
    version: 1,
    initiatorId: 'init',
    responderId: 'resp',
    nonceInitiator: Buffer.alloc(32, 1),
    nonceResponder: Buffer.alloc(32, 2),
    initiatorCertFp: 'FP-A',
    responderCertFp: 'FP-B',
    channelBinding: Buffer.alloc(16, 3),
  });

  it('computeHandshakeMac is deterministic', () => {
    const a = computeHandshakeMac(psk, 'initiator', transcript);
    const b = computeHandshakeMac(psk, 'initiator', transcript);
    expect(a.equals(b)).toBe(true);
    expect(a).toHaveLength(32); // HMAC-SHA256
  });

  it('initiator and responder MACs differ for the same transcript', () => {
    const i = computeHandshakeMac(psk, 'initiator', transcript);
    const r = computeHandshakeMac(psk, 'responder', transcript);
    expect(i.equals(r)).toBe(false);
  });

  it('verifyHandshakeMac accepts a matching MAC', () => {
    const mac = computeHandshakeMac(psk, 'initiator', transcript);
    expect(verifyHandshakeMac(psk, 'initiator', transcript, mac)).toBe(true);
  });

  it('rejects a wrong psk', () => {
    const mac = computeHandshakeMac(psk, 'initiator', transcript);
    const wrong = Buffer.alloc(32, 8);
    expect(verifyHandshakeMac(wrong, 'initiator', transcript, mac)).toBe(false);
  });

  it('rejects a tampered transcript (single byte flip)', () => {
    const mac = computeHandshakeMac(psk, 'initiator', transcript);
    const tampered = Buffer.from(transcript);
    tampered[0] ^= 0xff;
    expect(verifyHandshakeMac(psk, 'initiator', tampered, mac)).toBe(false);
  });

  it('rejects a wrong role', () => {
    const mac = computeHandshakeMac(psk, 'initiator', transcript);
    expect(verifyHandshakeMac(psk, 'responder', transcript, mac)).toBe(false);
  });

  it('rejects an unequal-length provided MAC without throwing', () => {
    expect(() => verifyHandshakeMac(psk, 'initiator', transcript, Buffer.alloc(10))).not.toThrow();
    expect(verifyHandshakeMac(psk, 'initiator', transcript, Buffer.alloc(10))).toBe(false);
    expect(verifyHandshakeMac(psk, 'initiator', transcript, Buffer.alloc(0))).toBe(false);
  });

  it('replay is defeated by a fresh responder nonce', () => {
    const parts = {
      version: 1,
      initiatorId: 'init',
      responderId: 'resp',
      nonceInitiator: Buffer.alloc(32, 1),
      initiatorCertFp: 'FP-A',
      responderCertFp: 'FP-B',
      channelBinding: Buffer.alloc(16, 3),
    };
    const t1 = buildHandshakeTranscript({ ...parts, nonceResponder: Buffer.alloc(32, 0x11) });
    const t2 = buildHandshakeTranscript({ ...parts, nonceResponder: Buffer.alloc(32, 0x22) });

    const mac1 = computeHandshakeMac(psk, 'initiator', t1);
    // Replaying mac1 against a session with a different responder nonce fails.
    expect(verifyHandshakeMac(psk, 'initiator', t2, mac1)).toBe(false);
  });

  it('different channel binding invalidates the MAC', () => {
    const parts = {
      version: 1,
      initiatorId: 'init',
      responderId: 'resp',
      nonceInitiator: Buffer.alloc(32, 1),
      nonceResponder: Buffer.alloc(32, 2),
      initiatorCertFp: 'FP-A',
      responderCertFp: 'FP-B',
    };
    const t1 = buildHandshakeTranscript({ ...parts, channelBinding: Buffer.alloc(16, 3) });
    const t2 = buildHandshakeTranscript({ ...parts, channelBinding: Buffer.alloc(16, 4) });
    const mac1 = computeHandshakeMac(psk, 'initiator', t1);
    expect(verifyHandshakeMac(psk, 'initiator', t2, mac1)).toBe(false);
  });
});

describe('isTimestampFresh', () => {
  const now = 1_000_000;
  it('is true inside the ±window', () => {
    expect(isTimestampFresh(now, now)).toBe(true);
    expect(isTimestampFresh(now - 119_999, now)).toBe(true);
    expect(isTimestampFresh(now + 119_999, now)).toBe(true);
  });

  it('is true exactly at the boundary and false just outside', () => {
    expect(isTimestampFresh(now - 120_000, now)).toBe(true);
    expect(isTimestampFresh(now + 120_000, now)).toBe(true);
    expect(isTimestampFresh(now - 120_001, now)).toBe(false);
    expect(isTimestampFresh(now + 120_001, now)).toBe(false);
  });

  it('honours a custom window', () => {
    expect(isTimestampFresh(now - 5000, now, 1000)).toBe(false);
    expect(isTimestampFresh(now - 500, now, 1000)).toBe(true);
  });
});
