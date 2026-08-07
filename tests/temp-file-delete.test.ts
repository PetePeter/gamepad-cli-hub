/**
 * `forceDeleteTempFile` — the shared reaper for temp copies Helm wrote 0o444.
 *
 * Real files on a real temp dir with real permission bits. The one thing that
 * cannot be reproduced in-process is an external app holding the file open, so
 * that single case uses a passthrough `node:fs` mock that delegates everything
 * to the real module and only makes `unlinkSync` throw while a flag is set.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

vi.mock('../src/utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/** Set by the locked-file test to simulate an app holding the copy open. */
let unlinkFailure: NodeJS.ErrnoException | null = null;

vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  return {
    ...real,
    default: real,
    unlinkSync: (p: fs.PathLike) => {
      if (unlinkFailure) throw unlinkFailure;
      return real.unlinkSync(p);
    },
  };
});

const { forceDeleteTempFile } = await import('../src/utils/temp-file-delete.js');
const realFs = await vi.importActual<typeof import('node:fs')>('node:fs');

let tmpRoot: string;

function writeReadOnly(name: string): string {
  const filePath = path.join(tmpRoot, name);
  realFs.writeFileSync(filePath, 'body', 'utf-8');
  realFs.chmodSync(filePath, 0o444);
  return filePath;
}

/** True when the file carries the read-only bit (the only bit Windows tracks). */
function isReadOnly(filePath: string): boolean {
  return (realFs.statSync(filePath).mode & 0o200) === 0;
}

beforeEach(() => {
  unlinkFailure = null;
  tmpRoot = realFs.mkdtempSync(path.join(os.tmpdir(), 'helm-tempdel-'));
});

afterEach(() => {
  unlinkFailure = null;
  for (const entry of realFs.readdirSync(tmpRoot)) {
    try { realFs.chmodSync(path.join(tmpRoot, entry), 0o666); } catch { /* best effort */ }
  }
  realFs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('forceDeleteTempFile', () => {
  it('deletes a 0o444 file that a bare unlink cannot remove on Windows', () => {
    const filePath = writeReadOnly('helm-artifact-s1--R-1.md');

    expect(forceDeleteTempFile(filePath)).toBe(true);
    expect(realFs.existsSync(filePath)).toBe(false);
  });

  it('reports success when the file is already gone', () => {
    expect(forceDeleteTempFile(path.join(tmpRoot, 'never-existed.md'))).toBe(true);
  });

  it('restores the read-only bit when the file survives the delete', () => {
    const filePath = writeReadOnly('helm-artifact-s1--Locked-1.md');
    unlinkFailure = Object.assign(new Error('EBUSY'), { code: 'EBUSY' });

    expect(forceDeleteTempFile(filePath)).toBe(false);
    expect(realFs.existsSync(filePath)).toBe(true);
    // Without this the surviving copy would stay editable until the next
    // startup sweep, and an edit there could masquerade as the source of truth.
    expect(isReadOnly(filePath)).toBe(true);
  });
});
