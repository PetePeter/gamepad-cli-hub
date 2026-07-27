import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { getUserDataDir, getConfigDir, migrateLegacyUserDataIfNeeded, APP_NAME } from './app-paths.js';

describe('getUserDataDir', () => {
  it('honors an explicit appData base', () => {
    expect(getUserDataDir('/some/base')).toBe(path.join('/some/base', APP_NAME));
  });

  it('falls back to a platform-appropriate base, not bare $HOME/Helm', () => {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const resolved = getUserDataDir();
    // The legacy bug resolved to exactly $HOME/Helm on non-Windows platforms.
    if (process.platform !== 'win32' && home) {
      expect(resolved).not.toBe(path.join(home, APP_NAME));
    }
    if (process.platform === 'darwin' && home) {
      expect(resolved).toBe(path.join(home, 'Library', 'Application Support', APP_NAME));
    }
  });
});

describe('migrateLegacyUserDataIfNeeded', () => {
  let tmp: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'helm-migrate-'));
    originalHome = process.env.HOME;
    process.env.HOME = path.join(tmp, 'home');
    mkdirSync(process.env.HOME, { recursive: true });
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    rmSync(tmp, { recursive: true, force: true });
  });

  it('relocates config from legacy $HOME/Helm into the target userData dir', () => {
    const legacyConfig = path.join(process.env.HOME!, APP_NAME, 'config');
    mkdirSync(legacyConfig, { recursive: true });
    writeFileSync(path.join(legacyConfig, 'sessions.yaml'), 'sessions: []\n');

    const targetBase = path.join(tmp, 'appdata');
    const migrated = migrateLegacyUserDataIfNeeded(targetBase);

    expect(migrated).toContain('config');
    const moved = path.join(getConfigDir('', targetBase), 'sessions.yaml');
    expect(existsSync(moved)).toBe(true);
    expect(readFileSync(moved, 'utf8')).toContain('sessions: []');
    // Legacy copy is moved, not left behind.
    expect(existsSync(legacyConfig)).toBe(false);
  });

  it('never overwrites an existing destination subdir', () => {
    const legacyConfig = path.join(process.env.HOME!, APP_NAME, 'config');
    mkdirSync(legacyConfig, { recursive: true });
    writeFileSync(path.join(legacyConfig, 'sessions.yaml'), 'legacy\n');

    const targetBase = path.join(tmp, 'appdata');
    const existingConfig = getConfigDir('', targetBase);
    mkdirSync(existingConfig, { recursive: true });
    writeFileSync(path.join(existingConfig, 'sessions.yaml'), 'current\n');

    const migrated = migrateLegacyUserDataIfNeeded(targetBase);

    expect(migrated).not.toContain('config');
    expect(readFileSync(path.join(existingConfig, 'sessions.yaml'), 'utf8')).toBe('current\n');
  });

  it('is a no-op when legacy dir and target resolve to the same place', () => {
    // appData === $HOME means <appData>/Helm === $HOME/Helm (legacy == target).
    mkdirSync(path.join(process.env.HOME!, APP_NAME, 'config'), { recursive: true });
    expect(migrateLegacyUserDataIfNeeded(process.env.HOME!)).toEqual([]);
  });

  it('is a no-op when no legacy dir exists', () => {
    expect(migrateLegacyUserDataIfNeeded(path.join(tmp, 'appdata'))).toEqual([]);
  });
});
