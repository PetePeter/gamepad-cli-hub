/**
 * Pure filename helpers for materialising an artifact version to a temp file.
 * No mocks — these functions touch nothing but strings.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeFilename, artifactTempFileName } from '../src/session/artifact-temp-file.js';

describe('artifactTempFileName', () => {
  it('picks the extension from the kind and prefixes for temp reaping', () => {
    const md = artifactTempFileName('sess-1', 'Auth Flow Audit', 'markdown', 1700000000000);
    const html = artifactTempFileName('sess-1', 'Auth Flow Audit', 'html', 1700000000000);

    expect(md).toBe('helm-artifact-sess-1--Auth Flow Audit-1700000000000.md');
    expect(html).toBe('helm-artifact-sess-1--Auth Flow Audit-1700000000000.html');
    // The prefix is what lets cleanupWorkTempFiles reap these on startup.
    expect(md.startsWith('helm-artifact-')).toBe(true);
  });
});

describe('sanitizeFilename', () => {
  it('replaces path separators and reserved characters', () => {
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
  });

  it('falls back to a usable stem for an empty or whitespace-only title', () => {
    expect(sanitizeFilename('')).toBe('artifact');
    expect(sanitizeFilename('   ')).toBe('artifact');
  });
});
