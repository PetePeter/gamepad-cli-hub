/**
 * TelegramConfig section in ConfigLoader — unit tests
 *
 * Tests: getTelegramConfig defaults, setTelegramConfig partial merge,
 * persistence, nested field handling.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { ConfigLoader } from '../src/config/loader.js';
import type { TelegramConfig } from '../src/config/loader.js';
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';

// ---------------------------------------------------------------------------
// File-system helpers (same pattern as tests/config.test.ts)
// ---------------------------------------------------------------------------

const TEST_DIR = path.join(process.cwd(), '.test-tg-config-' + Date.now());

function writeYaml(relativePath: string, data: unknown): void {
  const fullPath = path.join(TEST_DIR, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, YAML.stringify(data), 'utf8');
}

function readYaml<T>(relativePath: string): T {
  const fullPath = path.join(TEST_DIR, relativePath);
  return YAML.parse(fs.readFileSync(fullPath, 'utf8')) as T;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MINIMAL_SETTINGS = { activeProfile: 'default' };

const MINIMAL_PROFILE = {
  name: 'Default',
  tools: {
    'claude-code': {
      name: 'Claude Code',
      command: 'cc',
    },
  },
  workingDirectories: [],
  bindings: {},
};

function setupTestFiles(settingsOverrides: Record<string, unknown> = {}): void {
  writeYaml('settings.yaml', { ...MINIMAL_SETTINGS, ...settingsOverrides });
  writeYaml('profiles/default.yaml', MINIMAL_PROFILE);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConfigLoader — TelegramConfig', () => {
  let loader: ConfigLoader;

  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // Defaults
  // =========================================================================

  describe('getTelegramConfig defaults', () => {
    it('returns default config when telegram section is not set', () => {
      setupTestFiles();
      loader = new ConfigLoader(TEST_DIR);
      loader.load();

      const tg = loader.getTelegramConfig();

      expect(tg.enabled).toBe(false);
      expect(tg.autoStart).toBe(false);
      expect(tg.botToken).toBe('');
      expect(tg.instanceName).toBe('Home');
      expect(tg.chatId).toBeNull();
      expect(tg.allowedUserIds).toEqual([]);
      expect(tg.safeModeDefault).toBe(true);
      expect(tg.notifyOnComplete).toBe(true);
      expect(tg.notifyOnIdle).toBe(true);
      expect(tg.notifyOnError).toBe(true);
      expect(tg.notifyOnCrash).toBe(true);
    });

    it('default config has enabled=false and empty token', () => {
      setupTestFiles();
      loader = new ConfigLoader(TEST_DIR);
      loader.load();

      const tg = loader.getTelegramConfig();
      expect(tg.enabled).toBe(false);
      expect(tg.botToken).toBe('');
    });
  });

  // =========================================================================
  // Saved config
  // =========================================================================

  describe('getTelegramConfig with saved config', () => {
    it('returns saved config when telegram section exists', () => {
      const telegramSection: TelegramConfig = {
        enabled: true,
        autoStart: true,
        botToken: 'my-token',
        instanceName: 'Work',
        chatId: -100999,
        allowedUserIds: [42, 99],
        safeModeDefault: false,
        notifyOnComplete: true,
        notifyOnIdle: false,
        notifyOnError: true,
        notifyOnCrash: false,
      };
      setupTestFiles({ telegram: telegramSection });
      loader = new ConfigLoader(TEST_DIR);
      loader.load();

      const tg = loader.getTelegramConfig();

      expect(tg.enabled).toBe(true);
      expect(tg.autoStart).toBe(true);
      expect(tg.botToken).toBe('my-token');
      expect(tg.instanceName).toBe('Work');
      expect(tg.chatId).toBe(-100999);
      expect(tg.allowedUserIds).toEqual([42, 99]);
      expect(tg.safeModeDefault).toBe(false);
      expect(tg.notifyOnIdle).toBe(false);
      expect(tg.notifyOnCrash).toBe(false);
    });

    it('migrates legacy enabled telegram config to autoStart', () => {
      setupTestFiles({
        telegram: {
          enabled: true,
          botToken: 'legacy-token',
          instanceName: 'Legacy',
          chatId: -100999,
          allowedUserIds: [42],
          safeModeDefault: true,
          notifyOnComplete: true,
          notifyOnIdle: true,
          notifyOnError: true,
          notifyOnCrash: true,
        },
      });
      loader = new ConfigLoader(TEST_DIR);
      loader.load();

      const tg = loader.getTelegramConfig();
      expect(tg.enabled).toBe(true);
      expect(tg.autoStart).toBe(true);
    });
  });

  // =========================================================================
  // setTelegramConfig — partial merge
  // =========================================================================

  describe('setTelegramConfig', () => {
    it('merges partial updates into defaults', () => {
      setupTestFiles();
      loader = new ConfigLoader(TEST_DIR);
      loader.load();

      loader.setTelegramConfig({ enabled: true, botToken: 'new-token' });

      const tg = loader.getTelegramConfig();
      expect(tg.enabled).toBe(true);
      expect(tg.autoStart).toBe(false);
      expect(tg.botToken).toBe('new-token');
      // Unchanged defaults preserved
      expect(tg.instanceName).toBe('Home');
      expect(tg.notifyOnComplete).toBe(true);
    });

    it('merges partial updates into existing saved config', () => {
      const existing: TelegramConfig = {
        enabled: true,
        autoStart: false,
        botToken: 'old-token',
        instanceName: 'Work',
        chatId: -100,
        allowedUserIds: [1],
        safeModeDefault: true,
        notifyOnComplete: true,
        notifyOnIdle: true,
        notifyOnError: true,
        notifyOnCrash: true,
      };
      setupTestFiles({ telegram: existing });
      loader = new ConfigLoader(TEST_DIR);
      loader.load();

      loader.setTelegramConfig({ botToken: 'new-token', notifyOnIdle: false });

      const tg = loader.getTelegramConfig();
      expect(tg.botToken).toBe('new-token');
      expect(tg.notifyOnIdle).toBe(false);
      // Preserved from existing
      expect(tg.enabled).toBe(true);
      expect(tg.autoStart).toBe(false);
      expect(tg.instanceName).toBe('Work');
      expect(tg.chatId).toBe(-100);
    });

    it('persists changes to disk', () => {
      setupTestFiles();
      loader = new ConfigLoader(TEST_DIR);
      loader.load();

      loader.setTelegramConfig({ enabled: true, botToken: 'persist-test' });

      // Read settings.yaml directly from disk
      const saved = readYaml<any>('settings.yaml');
      expect(saved.telegram).toBeDefined();
      expect(saved.telegram.enabled).toBe(true);
      expect(saved.telegram.botToken).toBe('persist-test');
    });

    it('persists autoStart separately from notifications', () => {
      setupTestFiles();
      loader = new ConfigLoader(TEST_DIR);
      loader.load();

      loader.setTelegramConfig({ autoStart: true, enabled: false });

      const saved = readYaml<any>('settings.yaml');
      expect(saved.telegram.autoStart).toBe(true);
      expect(saved.telegram.enabled).toBe(false);
    });

    it('persisted config survives reload', () => {
      setupTestFiles();
      loader = new ConfigLoader(TEST_DIR);
      loader.load();

      loader.setTelegramConfig({ instanceName: 'Laptop', chatId: -200 });

      // Create a fresh loader pointing at the same dir
      const loader2 = new ConfigLoader(TEST_DIR);
      loader2.load();

      const tg = loader2.getTelegramConfig();
      expect(tg.instanceName).toBe('Laptop');
      expect(tg.chatId).toBe(-200);
    });
  });

  // =========================================================================
  // Nested notifications merge
  // =========================================================================

  describe('nested notifications merge', () => {
    it('updating one notify flag preserves others', () => {
      setupTestFiles();
      loader = new ConfigLoader(TEST_DIR);
      loader.load();

      loader.setTelegramConfig({ notifyOnComplete: false });

      const tg = loader.getTelegramConfig();
      expect(tg.notifyOnComplete).toBe(false);
      expect(tg.notifyOnIdle).toBe(true);
      expect(tg.notifyOnError).toBe(true);
      expect(tg.notifyOnCrash).toBe(true);
    });

    it('multiple sequential updates accumulate correctly', () => {
      setupTestFiles();
      loader = new ConfigLoader(TEST_DIR);
      loader.load();

      loader.setTelegramConfig({ notifyOnComplete: false });
      loader.setTelegramConfig({ notifyOnIdle: false });
      loader.setTelegramConfig({ notifyOnCrash: false });

      const tg = loader.getTelegramConfig();
      expect(tg.notifyOnComplete).toBe(false);
      expect(tg.notifyOnIdle).toBe(false);
      expect(tg.notifyOnError).toBe(true);
      expect(tg.notifyOnCrash).toBe(false);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('edge cases', () => {
    it('setTelegramConfig with empty object is a no-op merge', () => {
      setupTestFiles();
      loader = new ConfigLoader(TEST_DIR);
      loader.load();

      const before = loader.getTelegramConfig();
      loader.setTelegramConfig({});
      const after = loader.getTelegramConfig();

      expect(after).toEqual(before);
    });

    it('allowedUserIds can be updated to a new list', () => {
      setupTestFiles();
      loader = new ConfigLoader(TEST_DIR);
      loader.load();

      loader.setTelegramConfig({ allowedUserIds: [10, 20, 30] });

      const tg = loader.getTelegramConfig();
      expect(tg.allowedUserIds).toEqual([10, 20, 30]);
    });
  });
});
