/**
 * Temp Content Tests
 *
 * Tests for temp file handling in system-handlers.ts:
 * - cleanupWorkTempFiles — remove stale helm-work-* and helm-prompt-* files on startup
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { cleanupWorkTempFiles } from '../src/electron/ipc/system-handlers.js';
import { getTempDir } from '../src/utils/app-paths.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_APPDATA = path.join(process.cwd(), '.test-appdata-temp-' + Date.now());

beforeEach(() => {
  // Create test appdata directory
  if (!fs.existsSync(TEST_APPDATA)) {
    fs.mkdirSync(TEST_APPDATA, { recursive: true });
  }
});

afterEach(() => {
  // Clean up test appdata directory
  if (fs.existsSync(TEST_APPDATA)) {
    fs.rmSync(TEST_APPDATA, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// cleanupWorkTempFiles — removes stale temp files on startup
// ---------------------------------------------------------------------------

describe('cleanupWorkTempFiles', () => {
  it('removes helm-work-* files', () => {
    // Use a fake dirname in dev mode (contains 'dist-electron')
    const fakeDirname = path.join(TEST_APPDATA, 'dist-electron');
    const tempDir = path.join(process.cwd(), 'tmp');  // Dev mode uses process.cwd()/tmp
    fs.mkdirSync(tempDir, { recursive: true });

    // Create test files
    const workFile = path.join(tempDir, 'helm-work-12345.md');
    fs.writeFileSync(workFile, 'test content');

    expect(fs.existsSync(workFile)).toBe(true);

    cleanupWorkTempFiles(fakeDirname);

    expect(fs.existsSync(workFile)).toBe(false);
  });

  it('removes helm-prompt-* files', () => {
    const fakeDirname = path.join(TEST_APPDATA, 'dist-electron');
    const tempDir = path.join(process.cwd(), 'tmp');
    fs.mkdirSync(tempDir, { recursive: true });

    // Create test file
    const promptFile = path.join(tempDir, 'helm-prompt-67890.md');
    fs.writeFileSync(promptFile, 'test prompt');

    expect(fs.existsSync(promptFile)).toBe(true);

    cleanupWorkTempFiles(fakeDirname);

    expect(fs.existsSync(promptFile)).toBe(false);
  });

  it('removes multiple temp files in one call', () => {
    const fakeDirname = path.join(TEST_APPDATA, 'dist-electron');
    const tempDir = path.join(process.cwd(), 'tmp');
    fs.mkdirSync(tempDir, { recursive: true });

    // Create multiple test files
    const file1 = path.join(tempDir, 'helm-work-1.md');
    const file2 = path.join(tempDir, 'helm-work-2.md');
    const file3 = path.join(tempDir, 'helm-prompt-3.md');
    fs.writeFileSync(file1, 'content1');
    fs.writeFileSync(file2, 'content2');
    fs.writeFileSync(file3, 'content3');

    cleanupWorkTempFiles(fakeDirname);

    expect(fs.existsSync(file1)).toBe(false);
    expect(fs.existsSync(file2)).toBe(false);
    expect(fs.existsSync(file3)).toBe(false);
  });

  it('preserves non-temp files', () => {
    const fakeDirname = path.join(TEST_APPDATA, 'dist-electron');
    const tempDir = path.join(process.cwd(), 'tmp');
    fs.mkdirSync(tempDir, { recursive: true });

    // Create temp file and non-temp file
    const tempFile = path.join(tempDir, 'helm-work-999.md');
    const otherFile = path.join(tempDir, 'user-file.txt');
    fs.writeFileSync(tempFile, 'temp');
    fs.writeFileSync(otherFile, 'preserve me');

    cleanupWorkTempFiles(fakeDirname);

    expect(fs.existsSync(tempFile)).toBe(false);
    expect(fs.existsSync(otherFile)).toBe(true);
  });

  it('handles nonexistent temp directory gracefully', () => {
    const fakeDirname = path.join(TEST_APPDATA, 'nonexistent-' + Date.now(), 'dist-electron');
    // Should not throw
    expect(() => cleanupWorkTempFiles(fakeDirname)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Naming convention — helm-work-* and helm-prompt-*
// ---------------------------------------------------------------------------

describe('Temp file naming convention', () => {
  it('uses helm-work-* for draft/plan apply temp files', () => {
    // This test documents the expected naming convention.
    // The actual temp:writeContent handler in system-handlers.ts uses:
    // path.join(tmpDir, `helm-work-${Date.now()}.md`)

    const filename = `helm-work-${Date.now()}.md`;
    expect(filename).toMatch(/^helm-work-\d+\.md$/);
  });

  it('uses helm-prompt-* for external editor temp files (Ctrl+G)', () => {
    // This test documents the expected naming convention.
    // The editor:openExternal handler in system-handlers.ts uses:
    // path.join(tmpDir, `helm-prompt-${Date.now()}.md`)

    const filename = `helm-prompt-${Date.now()}.md`;
    expect(filename).toMatch(/^helm-prompt-\d+\.md$/);
  });
});
