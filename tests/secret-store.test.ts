/**
 * SecretStore unit tests — real class, fake injected persist callback.
 *
 * CRITICAL security property: the secret bytes must NEVER reach the logger and
 * NEVER appear in a thrown error message. Those two invariants are asserted
 * directly by spying on the mocked logger and by inspecting thrown messages.
 */

import { describe, it, expect, vi } from 'vitest';
import * as YAML from 'yaml';
import { SecretStore } from '../src/mcp/peer/secret-store.js';
import { logger } from '../src/utils/logger.js';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const secret = () => Buffer.from('super-secret-psk-material-0123456789', 'utf8');

function allLoggerArgs(): string[] {
  const out: string[] = [];
  const fns = [logger.info, logger.warn, logger.error, logger.debug] as unknown as Array<{ mock: { calls: unknown[][] } }>;
  for (const fn of fns) {
    for (const call of fn.mock.calls) {
      for (const arg of call) out.push(String(arg));
    }
  }
  return out;
}

describe('SecretStore', () => {
  it('set to get round-trips equal bytes', () => {
    const store = new SecretStore();
    const s = secret();
    store.set('peer/mac', s);
    const got = store.get('peer/mac');
    expect(got).toBeDefined();
    expect(got!.equals(s)).toBe(true);
  });

  it('get(unknown) is undefined and has() reflects membership', () => {
    const store = new SecretStore();
    expect(store.get('nope')).toBeUndefined();
    expect(store.has('nope')).toBe(false);
    store.set('k', secret());
    expect(store.has('k')).toBe(true);
  });

  it('remove deletes the secret', () => {
    const store = new SecretStore();
    store.set('k', secret());
    expect(store.remove('k')).toBe(true);
    expect(store.get('k')).toBeUndefined();
    expect(store.remove('k')).toBe(false);
  });

  it('set persists and emits peer-secrets:changed', () => {
    const persist = vi.fn();
    const store = new SecretStore(persist);
    const events: number[] = [];
    store.on('peer-secrets:changed', () => events.push(1));
    store.set('k', secret());
    expect(persist).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
  });

  it('exportAll to importAll round-trips via a YAML-shaped snapshot (base64)', () => {
    const persist = vi.fn();
    const store = new SecretStore(persist);
    const s = secret();
    store.set('peer/mac', s);

    const snapshot = store.exportAll();
    const wire = YAML.stringify({ secrets: snapshot });
    const parsed = YAML.parse(wire) as { secrets: Record<string, string> };

    const store2 = new SecretStore();
    store2.importAll(parsed.secrets);
    expect(store2.get('peer/mac')!.equals(s)).toBe(true);
  });

  it('SECRET NEVER LOGGED across set / get / error paths', () => {
    vi.clearAllMocks();
    const store = new SecretStore();
    const s = secret();
    const b64 = s.toString('base64');
    const hex = s.toString('hex');

    store.set('peer/mac', s);
    store.get('peer/mac');
    store.has('peer/mac');
    store.importAll({ 'peer/bad': '@@not-canonical-base64@@' });
    try { store.get('peer/bad'); } catch { /* swallow */ }

    for (const arg of allLoggerArgs()) {
      expect(arg).not.toContain(b64);
      expect(arg).not.toContain(hex);
    }
  });

  it('importAll SKIPS non-canonical entries (fail-fast), never storing them', () => {
    const store = new SecretStore();
    const good = secret();
    store.importAll({
      'peer/ok': good.toString('base64'),
      'peer/bad': '@@not-canonical-base64@@',
    });
    expect(store.has('peer/ok')).toBe(true);
    expect(store.get('peer/ok')!.equals(good)).toBe(true);
    // Non-canonical entry was dropped at import — not stored, get() returns undefined.
    expect(store.has('peer/bad')).toBe(false);
    expect(store.get('peer/bad')).toBeUndefined();
  });

  it('get() defence-in-depth: a non-canonical value injected past importAll throws a ref-only error', () => {
    const store = new SecretStore();
    // Bypass importAll's guard to reach get()'s own guard directly.
    const badValue = '@@not-canonical-base64@@';
    (store as unknown as { secrets: Map<string, string> }).secrets.set('peer/corrupt', badValue);

    let threw = false;
    let message = '';
    try {
      store.get('peer/corrupt');
    } catch (err) {
      threw = true;
      message = (err as Error).message;
    }
    expect(threw).toBe(true);
    expect(message).toContain('peer/corrupt');
    expect(message).not.toContain(badValue);
  });
});
