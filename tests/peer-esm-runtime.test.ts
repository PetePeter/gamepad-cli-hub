/**
 * REGRESSION: the peer stack is bundled as ESM (`esbuild --format=esm`), where a
 * bare `require()` is replaced by a shim that THROWS ("Dynamic require of X is not
 * supported"). Two modules used it, so discovery died at startup and pairing would
 * have died on its first nonce. These tests exercise the real code paths — no fakes
 * injected — so they fail if `require()` ever comes back.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PeerDiscovery } from '../src/mcp/peer/peer-discovery.js';
import { PeerPairing } from '../src/mcp/peer/peer-pairing.js';
import { PinnedCertStore } from '../src/mcp/peer/pinned-cert-store.js';
import { SecretStore } from '../src/mcp/peer/secret-store.js';
import { PeerConfigManager } from '../src/session/peer-config-manager.js';

const SRC_ROOT = fileURLToPath(new URL('../src', import.meta.url));

/** Every .ts file under src/, recursively. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('main-process sources are ESM-safe', () => {
  /**
   * The bundle-only failure vitest CANNOT reproduce (its transform supplies a
   * working `require`), so we guard the source instead: no CommonJS require in
   * anything esbuild bundles as ESM. `createRequire` is the sanctioned escape
   * hatch and stays allowed.
   */
  it('contains no bare require() call', () => {
    const offenders = sourceFiles(SRC_ROOT).filter((file) => {
      const text = readFileSync(file, 'utf8');
      // `createRequire(` does not match: the capitalised R breaks the word boundary.
      return /\brequire\s*\(/.test(text);
    });
    expect(offenders).toEqual([]);
  });
});

describe('peer stack under ESM', () => {
  let discovery: PeerDiscovery | null = null;
  afterEach(() => { discovery?.stop(); discovery = null; });

  it('starts real mDNS discovery without a dynamic-require failure', () => {
    discovery = new PeerDiscovery({ machineId: 'machine-under-test' });
    expect(() => discovery!.start()).not.toThrow();
  });

  it('generates a pairing nonce without a dynamic-require failure', () => {
    const sent: unknown[] = [];
    const pairing = new PeerPairing({
      role: 'initiator',
      sessionId: 'session-1',
      channel: { send: (msg) => sent.push(msg) },
      pinnedCertStore: new PinnedCertStore(() => {}),
      secretStore: new SecretStore(() => {}),
      peerConfigManager: new PeerConfigManager(() => {}),
      self: { machineId: 'a', certFp: 'fp-a' },
      peer: { machineId: 'b', certFp: 'fp-b', alias: 'B', address: '10.0.0.2:47474' },
    });

    // begin() → generateAndCommit() → randomNonce(), the require() site.
    expect(() => pairing.begin()).not.toThrow();
    expect(sent).toHaveLength(1);
  });
});
