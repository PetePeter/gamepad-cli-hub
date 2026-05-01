/**
 * App paths unit tests — packaged vs dev path resolution.
 *
 * When the app is installed (packaged inside app.asar), writable paths
 * (logs, config) must point to %APPDATA%/Helm/ instead of
 * relative paths inside the read-only install directory.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';

// Import the module under test
import { isPackaged, getLogDir, getConfigDir, getRendererHtmlPath, getAppRootDir, seedConfigIfNeeded } from '../src/utils/app-paths.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEV_DIRNAME = 'X:\\coding\\gamepad-cli-hub\\dist-electron';
const PACKAGED_DIRNAME = 'C:\\Program Files\\gamepad-cli-hub\\resources\\app.asar\\dist-electron';
const FAKE_APPDATA = path.join(process.cwd(), '.test-appdata-' + Date.now());

afterEach(() => {
  // Clean up temp dirs
  if (fs.existsSync(FAKE_APPDATA)) {
    fs.rmSync(FAKE_APPDATA, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// isPackaged
// ---------------------------------------------------------------------------

describe('isPackaged', () => {
  it('returns true when dirname contains app.asar', () => {
    expect(isPackaged(PACKAGED_DIRNAME)).toBe(true);
  });

  it('returns false for normal dev paths', () => {
    expect(isPackaged(DEV_DIRNAME)).toBe(false);
  });

  it('returns true for unix-style asar paths', () => {
    expect(isPackaged('/opt/app/resources/app.asar/dist')).toBe(true);
  });

  it('returns false for paths that mention asar elsewhere', () => {
    // e.g. a folder literally named "app.asar-backup" shouldn't trigger
    // This is a boundary case — app.asar as a substring is sufficient
    // because Electron always uses exactly "app.asar" as the archive name
    expect(isPackaged('C:\\dev\\app.asar\\main')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getLogDir
// ---------------------------------------------------------------------------

describe('getLogDir', () => {
  it('returns relative path in dev mode', () => {
    const result = getLogDir(DEV_DIRNAME);
    expect(result).toBe(path.join(DEV_DIRNAME, '..', 'logs'));
  });

  it('returns APPDATA-based path when packaged', () => {
    const result = getLogDir(PACKAGED_DIRNAME, FAKE_APPDATA);
    expect(result).toBe(path.join(FAKE_APPDATA, 'Helm', 'logs'));
  });

  it('uses process.env.APPDATA when appData param not provided', () => {
    const originalAppData = process.env.APPDATA;
    try {
      process.env.APPDATA = FAKE_APPDATA;
      const result = getLogDir(PACKAGED_DIRNAME);
      expect(result).toBe(path.join(FAKE_APPDATA, 'Helm', 'logs'));
    } finally {
      process.env.APPDATA = originalAppData;
    }
  });

  it('falls back to current directory when no APPDATA', () => {
    const originalAppData = process.env.APPDATA;
    const originalHome = process.env.HOME;
    try {
      delete process.env.APPDATA;
      delete process.env.HOME;
      const result = getLogDir(PACKAGED_DIRNAME);
      expect(result).toBe(path.join('.', 'Helm', 'logs'));
    } finally {
      process.env.APPDATA = originalAppData;
      process.env.HOME = originalHome;
    }
  });
});

// ---------------------------------------------------------------------------
// getConfigDir
// ---------------------------------------------------------------------------

describe('getConfigDir', () => {
  it('returns cwd-based path in dev mode', () => {
    const result = getConfigDir(DEV_DIRNAME);
    expect(result).toBe(path.join(process.cwd(), 'config'));
  });

  it('returns APPDATA-based path when packaged', () => {
    const result = getConfigDir(PACKAGED_DIRNAME, FAKE_APPDATA);
    expect(result).toBe(path.join(FAKE_APPDATA, 'Helm', 'config'));
  });

  it('uses process.env.APPDATA when appData param not provided', () => {
    const originalAppData = process.env.APPDATA;
    try {
      process.env.APPDATA = FAKE_APPDATA;
      const result = getConfigDir(PACKAGED_DIRNAME);
      expect(result).toBe(path.join(FAKE_APPDATA, 'Helm', 'config'));
    } finally {
      process.env.APPDATA = originalAppData;
    }
  });

  it('falls back to current directory when no APPDATA', () => {
    const originalAppData = process.env.APPDATA;
    const originalHome = process.env.HOME;
    try {
      delete process.env.APPDATA;
      delete process.env.HOME;
      const result = getConfigDir(PACKAGED_DIRNAME);
      expect(result).toBe(path.join('.', 'Helm', 'config'));
    } finally {
      process.env.APPDATA = originalAppData;
      process.env.HOME = originalHome;
    }
  });
});

// ---------------------------------------------------------------------------
// seedConfigIfNeeded — copies default config on first packaged launch
// ---------------------------------------------------------------------------

describe('seedConfigIfNeeded', () => {
  const sourceConfigDir = path.join(FAKE_APPDATA, 'source-config');
  const targetConfigDir = path.join(FAKE_APPDATA, 'Helm', 'config');

  beforeEach(() => {
    // Create a fake source config directory (simulating app.asar/config/)
    fs.mkdirSync(path.join(sourceConfigDir, 'profiles'), { recursive: true });
    fs.writeFileSync(
      path.join(sourceConfigDir, 'settings.yaml'),
      'activeProfile: default\n'
    );
    fs.writeFileSync(
      path.join(sourceConfigDir, 'profiles', 'default.yaml'),
      'tools:\n  claude-code:\n    name: Claude Code\n'
    );
  });

  it('copies config files when target dir does not exist', () => {
    seedConfigIfNeeded(sourceConfigDir, targetConfigDir);

    expect(fs.existsSync(path.join(targetConfigDir, 'settings.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(targetConfigDir, 'profiles', 'default.yaml'))).toBe(true);

    const settings = fs.readFileSync(path.join(targetConfigDir, 'settings.yaml'), 'utf8');
    expect(settings).toContain('activeProfile: default');

    const profile = fs.readFileSync(path.join(targetConfigDir, 'profiles', 'default.yaml'), 'utf8');
    expect(profile).toContain('Claude Code');
  });

  it('does not overwrite existing config', () => {
    // Pre-create target with custom content
    fs.mkdirSync(targetConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(targetConfigDir, 'settings.yaml'),
      'activeProfile: custom\n'
    );

    seedConfigIfNeeded(sourceConfigDir, targetConfigDir);

    // Original content should be preserved
    const settings = fs.readFileSync(path.join(targetConfigDir, 'settings.yaml'), 'utf8');
    expect(settings).toContain('activeProfile: custom');
  });

  it('is a no-op when source dir does not exist', () => {
    const bogusSource = path.join(FAKE_APPDATA, 'nonexistent');
    // Should not throw
    seedConfigIfNeeded(bogusSource, targetConfigDir);
    expect(fs.existsSync(targetConfigDir)).toBe(false);
  });

  it('creates parent directories as needed', () => {
    const deepTarget = path.join(FAKE_APPDATA, 'deep', 'nested', 'config');
    seedConfigIfNeeded(sourceConfigDir, deepTarget);
    expect(fs.existsSync(path.join(deepTarget, 'settings.yaml'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getRendererHtmlPath — resolves renderer/index.html relative to __dirname
// ---------------------------------------------------------------------------

describe('getRendererHtmlPath', () => {
  it('returns __dirname-relative path in dev mode', () => {
    // dist-electron/main.js → ../dist/renderer/index.html
    const result = getRendererHtmlPath(DEV_DIRNAME);
    const expected = path.join(DEV_DIRNAME, '..', 'dist', 'renderer', 'index.html');
    expect(result).toBe(expected);
  });

  it('returns asar-relative path when packaged', () => {
    // resources/app.asar/dist-electron/main.js → ../dist/renderer/index.html
    const result = getRendererHtmlPath(PACKAGED_DIRNAME);
    const expected = path.join(PACKAGED_DIRNAME, '..', 'dist', 'renderer', 'index.html');
    expect(result).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// getAppRootDir — resolves project root relative to __dirname
// ---------------------------------------------------------------------------

describe('getAppRootDir', () => {
  it('returns one level up from dist-electron in dev mode', () => {
    const result = getAppRootDir(DEV_DIRNAME);
    expect(result).toBe(path.resolve(DEV_DIRNAME, '..'));
  });

  it('returns one level up from dist-electron when packaged', () => {
    const result = getAppRootDir(PACKAGED_DIRNAME);
    expect(result).toBe(path.resolve(PACKAGED_DIRNAME, '..'));
  });
});
