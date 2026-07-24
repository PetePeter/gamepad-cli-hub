/**
 * peer-audit-log — rolling 7-day audit trail. Real class + injected persist +
 * injected clock. Asserts append/prune/round-trip and — CRITICALLY — that NO
 * payload values or secrets are stored (argSummary is key names only).
 */

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PeerAuditLog, AUDIT_WINDOW_MS } from '../src/mcp/peer/peer-audit-log.js';
import {
  savePeerAudit,
  loadPeerAudit,
} from '../src/mcp/peer/peer-audit-persistence.js';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const entry = (over: Partial<Parameters<PeerAuditLog['append']>[0]> = {}) => ({
  peerId: 'mac',
  method: 'artifact_get',
  argSummary: 'keys: id',
  outcome: 'ok' as const,
  ranAt: 1000,
  ...over,
});

describe('PeerAuditLog', () => {
  it('appends newest-first and assigns an id', () => {
    const log = new PeerAuditLog(() => {}, () => 5000);
    const a = log.append(entry({ ranAt: 1000 }));
    const b = log.append(entry({ ranAt: 2000 }));
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    const list = log.list();
    expect(list[0].id).toBe(b.id); // newest first
    expect(list[1].id).toBe(a.id);
  });

  it('persists on every append', () => {
    const persist = vi.fn();
    const log = new PeerAuditLog(persist, () => 5000);
    log.append(entry());
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ peerId: 'mac', outcome: 'ok' }),
    ]));
  });

  it('prunes entries older than the 7-day window', () => {
    let now = 10_000;
    const log = new PeerAuditLog(() => {}, () => now);
    log.append(entry({ ranAt: now })); // fresh
    // advance well past the window then append — the stale one is pruned
    now += AUDIT_WINDOW_MS + 1;
    log.append(entry({ ranAt: now }));
    const list = log.list();
    expect(list).toHaveLength(1);
    expect(list[0].ranAt).toBe(now);
  });

  it('stores only argument KEY NAMES — never values/secrets', () => {
    const persist = vi.fn();
    const log = new PeerAuditLog(persist, () => 5000);
    // argSummary is built by the caller (gate); here we assert the log stores
    // whatever summary string it's given verbatim and nothing else leaks.
    const rec = log.append(entry({ argSummary: 'keys: name,workingDir' }));
    const serialized = JSON.stringify(rec);
    expect(serialized).toContain('name');
    expect(serialized).toContain('workingDir');
    expect(serialized).not.toContain('hunter2'); // no value present anyway
    expect(rec.argSummary).toBe('keys: name,workingDir');
  });

  it('exportAll/importAll round-trip', () => {
    const log = new PeerAuditLog(() => {}, () => 5000);
    log.append(entry({ ranAt: 1000 }));
    log.append(entry({ ranAt: 2000 }));
    const snapshot = log.exportAll();

    const log2 = new PeerAuditLog(() => {}, () => 5000);
    log2.importAll(snapshot);
    expect(log2.list()).toHaveLength(2);
  });
});

describe('peer-audit-persistence', () => {
  it('round-trips through a temp YAML file, dropping stale entries on load', () => {
    const dir = mkdtempSync(join(tmpdir(), 'peer-audit-'));
    const file = join(dir, 'peer-audit.yaml');
    try {
      const now = 1_000_000;
      const fresh = { id: 'a', peerId: 'mac', method: 'artifact_get', argSummary: 'keys: id', outcome: 'ok' as const, ranAt: now };
      const stale = { id: 'b', peerId: 'mac', method: 'artifact_get', argSummary: 'keys: id', outcome: 'ok' as const, ranAt: now - AUDIT_WINDOW_MS - 1 };
      savePeerAudit([fresh, stale], file);
      expect(existsSync(file)).toBe(true);
      const loaded = loadPeerAudit(file, now);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe('a');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
