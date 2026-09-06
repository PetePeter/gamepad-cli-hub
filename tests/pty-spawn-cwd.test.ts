/**
 * Regression: an explicitly requested working directory that is unavailable
 * must fail the spawn.
 *
 * PtyManager silently fell back to USERPROFILE/HOME, so a session spawned for
 * a missing project came up in the user's home directory — recorded against the
 * project it never opened, with the CLI running somewhere else entirely.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PtyManager } from '../src/session/pty-manager.js';
import type { PtyProcess, PtyFactory } from '../src/session/pty-manager.js';

function createManager(): { manager: PtyManager; spawn: ReturnType<typeof vi.fn> } {
  const pty: PtyProcess = {
    pid: 7,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: () => {},
    onExit: () => {},
  };
  const spawn = vi.fn().mockReturnValue(pty);
  const factory: PtyFactory = { spawn };
  return { manager: new PtyManager(factory), spawn };
}

describe('PtyManager spawn cwd handling', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-spawn-cwd-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('spawns in an explicit directory that exists', () => {
    const { manager, spawn } = createManager();
    manager.spawn({ sessionId: 's1', command: 'echo', cwd: tmpDir });

    expect(spawn.mock.calls[0][2].cwd).toBe(tmpDir);
  });

  it('throws and registers nothing when the explicit directory is missing', () => {
    const { manager, spawn } = createManager();
    const missing = path.join(tmpDir, 'no-such-project');

    expect(() => manager.spawn({ sessionId: 's1', command: 'echo', cwd: missing }))
      .toThrow(/no-such-project/);
    expect(spawn).not.toHaveBeenCalled();
    expect(manager.has('s1')).toBe(false);
  });

  it('throws when the explicit path is a file rather than a directory', () => {
    const { manager } = createManager();
    const file = path.join(tmpDir, 'notes.txt');
    fs.writeFileSync(file, 'x', 'utf8');

    expect(() => manager.spawn({ sessionId: 's1', command: 'echo', cwd: file })).toThrow();
    expect(manager.has('s1')).toBe(false);
  });

  it('falls back to the home directory when no cwd is requested', () => {
    const { manager, spawn } = createManager();
    manager.spawn({ sessionId: 's1', command: 'echo' });

    const expected = process.env.USERPROFILE || process.env.HOME || process.cwd();
    expect(spawn.mock.calls[0][2].cwd).toBe(expected);
  });
});
