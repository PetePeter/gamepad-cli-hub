import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A temp directory with symlinks already resolved.
 *
 * Helm's attachment storage refuses a temp path containing a symlink or reparse
 * point, and it compares real paths to enforce that. macOS hands out
 * `/var/folders/...` where `/var` is a symlink to `/private/var`, so a bare
 * `mkdtempSync` root fails that guard on macOS while passing on Windows —
 * a platform difference in the fixture, not in the code under test.
 *
 * Resolving here keeps such tests asserting on behaviour rather than on the
 * host's temp-directory layout.
 */
export function makeTempRoot(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}
