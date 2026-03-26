/**
 * Config loader unit tests — split config system
 *
 * Tests cover: loading from 4 files, existing getters, setBinding,
 * profile CRUD, working directory CRUD, and tools CRUD.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigLoader } from '../src/config/loader.js';
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';

// ---------------------------------------------------------------------------
// File-system helpers: use a real temp dir with real YAML files
// ---------------------------------------------------------------------------

const TEST_DIR = path.join(process.cwd(), '.test-config-' + Date.now());

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

const DIRECTORIES = {
  workingDirectories: [
    { name: 'Projects', path: 'X:\\coding' },
    { name: 'Home', path: 'C:\\Users\\oscar' },
  ],
};

const TOOLS = {
  cliTypes: {
    'claude-code': {
      name: 'Claude Code',
      command: 'cc',
      initialPrompt: '',
    },
    'copilot-cli': {
      name: 'GitHub Copilot CLI',
      command: 'copilot',
      initialPrompt: '',
    },
  },
};

const SETTINGS = { activeProfile: 'default' };

const DEFAULT_PROFILE = {
  name: 'Default',
  cliTypes: {
    'claude-code': {
      A: { action: 'keyboard', sequence: '{Ctrl+L}' },
      B: { action: 'voice', key: 'Space', mode: 'hold' },
    },
    'copilot-cli': {
      A: { action: 'keyboard', sequence: '{Ctrl+L}' },
      Y: { action: 'keyboard', sequence: '{Ctrl+C}' },
    },
  },
  global: {
    Up: { action: 'session-switch', direction: 'previous' },
    Down: { action: 'session-switch', direction: 'next' },
  },
};

function setupTestFiles(): void {
  writeYaml('directories.yaml', DIRECTORIES);
  writeYaml('tools.yaml', TOOLS);
  writeYaml('settings.yaml', SETTINGS);
  writeYaml('profiles/default.yaml', DEFAULT_PROFILE);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConfigLoader', () => {
  let loader: ConfigLoader;

  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    setupTestFiles();
    loader = new ConfigLoader(TEST_DIR);
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  // =========================================================================
  // Loading
  // =========================================================================

  describe('load', () => {
    it('loads all four config files without error', () => {
      expect(() => loader.load()).not.toThrow();
    });

    it('throws when directories.yaml is missing', () => {
      fs.unlinkSync(path.join(TEST_DIR, 'directories.yaml'));
      expect(() => loader.load()).toThrow('Configuration file not found');
    });

    it('throws when tools.yaml is missing', () => {
      fs.unlinkSync(path.join(TEST_DIR, 'tools.yaml'));
      expect(() => loader.load()).toThrow('Configuration file not found');
    });

    it('throws when settings.yaml is missing', () => {
      fs.unlinkSync(path.join(TEST_DIR, 'settings.yaml'));
      expect(() => loader.load()).toThrow('Configuration file not found');
    });

    it('throws when active profile file is missing', () => {
      fs.unlinkSync(path.join(TEST_DIR, 'profiles', 'default.yaml'));
      expect(() => loader.load()).toThrow('Configuration file not found');
    });
  });

  // =========================================================================
  // Existing getters (backward compatibility)
  // =========================================================================

  describe('getBindings', () => {
    it('returns bindings for a valid CLI type from the active profile', () => {
      loader.load();
      const bindings = loader.getBindings('claude-code');
      expect(bindings).toEqual(DEFAULT_PROFILE.cliTypes['claude-code']);
    });

    it('returns null for non-existent CLI type', () => {
      loader.load();
      expect(loader.getBindings('non-existent')).toBeNull();
    });

    it('throws error when called before load', () => {
      expect(() => loader.getBindings('claude-code')).toThrow('Configuration not loaded');
    });
  });

  describe('getGlobalBindings', () => {
    it('returns global bindings from active profile', () => {
      loader.load();
      expect(loader.getGlobalBindings()).toEqual(DEFAULT_PROFILE.global);
    });

    it('throws error when called before load', () => {
      expect(() => loader.getGlobalBindings()).toThrow('Configuration not loaded');
    });
  });

  describe('getSpawnConfig', () => {
    it('returns built spawn config from tools.yaml', () => {
      loader.load();
      expect(loader.getSpawnConfig('claude-code')).toEqual({ command: 'cc', args: [] });
    });

    it('returns null for non-existent CLI type', () => {
      loader.load();
      expect(loader.getSpawnConfig('non-existent')).toBeNull();
    });

    it('throws error when called before load', () => {
      expect(() => loader.getSpawnConfig('claude-code')).toThrow('Configuration not loaded');
    });
  });

  describe('getCliTypeName', () => {
    it('returns name from tools.yaml', () => {
      loader.load();
      expect(loader.getCliTypeName('claude-code')).toBe('Claude Code');
    });

    it('returns null for non-existent CLI type', () => {
      loader.load();
      expect(loader.getCliTypeName('non-existent')).toBeNull();
    });
  });

  describe('getCliTypes', () => {
    it('returns CLI type keys from tools.yaml', () => {
      loader.load();
      expect(loader.getCliTypes()).toEqual(['claude-code', 'copilot-cli']);
    });
  });

  describe('getConfig (legacy)', () => {
    it('assembles a backward-compatible Config object', () => {
      loader.load();
      const config = loader.getConfig();
      expect(config.cliTypes['claude-code'].name).toBe('Claude Code');
      expect(config.cliTypes['claude-code'].spawn).toEqual({ command: 'cc', args: [] });
      expect(config.cliTypes['claude-code'].bindings).toEqual(DEFAULT_PROFILE.cliTypes['claude-code']);
      expect(config.global).toEqual(DEFAULT_PROFILE.global);
      expect(config.workingDirectories).toEqual(DIRECTORIES.workingDirectories);
    });
  });

  describe('getWorkingDirectories', () => {
    it('returns directories from directories.yaml', () => {
      loader.load();
      expect(loader.getWorkingDirectories()).toEqual(DIRECTORIES.workingDirectories);
    });
  });

  // =========================================================================
  // setBinding (backward compatible)
  // =========================================================================

  describe('setBinding', () => {
    it('throws error when called before load', () => {
      expect(() => loader.setBinding('A', null, { action: 'keyboard', keys: ['Enter'] }))
        .toThrow('Configuration not loaded');
    });

    it('sets a global binding and persists to profile file', () => {
      loader.load();
      const newBinding = { action: 'keyboard' as const, keys: ['Enter'] };
      loader.setBinding('A', null, newBinding);

      expect(loader.getGlobalBindings()['A']).toEqual(newBinding);

      // Verify written to disk
      const onDisk = readYaml<any>('profiles/default.yaml');
      expect(onDisk.global['A']).toEqual(newBinding);
    });

    it('sets a CLI-specific binding and persists', () => {
      loader.load();
      const newBinding = { action: 'keyboard' as const, keys: ['Ctrl', 'z'] };
      loader.setBinding('X', 'claude-code', newBinding);

      expect(loader.getBindings('claude-code')!['X']).toEqual(newBinding);

      const onDisk = readYaml<any>('profiles/default.yaml');
      expect(onDisk.cliTypes['claude-code']['X']).toEqual(newBinding);
    });

    it('throws error for unknown CLI type', () => {
      loader.load();
      expect(() => loader.setBinding('A', 'nonexistent', { action: 'keyboard', keys: ['Enter'] }))
        .toThrow('Unknown CLI type: nonexistent');
    });
  });

  // =========================================================================
  // Profile CRUD
  // =========================================================================

  describe('Profile CRUD', () => {
    it('getActiveProfile returns current profile name', () => {
      loader.load();
      expect(loader.getActiveProfile()).toBe('default');
    });

    it('listProfiles returns profile names from disk', () => {
      loader.load();
      expect(loader.listProfiles()).toContain('default');
    });

    it('createProfile creates a new empty profile file', () => {
      loader.load();
      loader.createProfile('gaming');

      const profiles = loader.listProfiles();
      expect(profiles).toContain('gaming');

      const onDisk = readYaml<any>('profiles/gaming.yaml');
      expect(onDisk.name).toBe('gaming');
      expect(onDisk.global).toEqual({});
    });

    it('createProfile with copyFrom clones an existing profile', () => {
      loader.load();
      loader.createProfile('gaming', 'default');

      const onDisk = readYaml<any>('profiles/gaming.yaml');
      expect(onDisk.name).toBe('gaming');
      expect(onDisk.cliTypes['claude-code']).toEqual(DEFAULT_PROFILE.cliTypes['claude-code']);
      expect(onDisk.global).toEqual(DEFAULT_PROFILE.global);
    });

    it('createProfile throws if profile already exists', () => {
      loader.load();
      expect(() => loader.createProfile('default')).toThrow('Profile already exists: default');
    });

    it('switchProfile changes active profile and updates settings', () => {
      loader.load();
      // Create a second profile with different bindings
      const gamingProfile = {
        name: 'Gaming',
        cliTypes: { 'claude-code': { A: { action: 'keyboard', keys: ['Escape'] } } },
        global: { Up: { action: 'session-switch', direction: 'next' } },
      };
      writeYaml('profiles/gaming.yaml', gamingProfile);

      loader.switchProfile('gaming');

      expect(loader.getActiveProfile()).toBe('gaming');
      expect(loader.getBindings('claude-code')).toEqual(gamingProfile.cliTypes['claude-code']);
      expect(loader.getGlobalBindings()).toEqual(gamingProfile.global);

      // settings.yaml on disk should be updated
      const settings = readYaml<any>('settings.yaml');
      expect(settings.activeProfile).toBe('gaming');
    });

    it('switchProfile throws for non-existent profile', () => {
      loader.load();
      expect(() => loader.switchProfile('nonexistent')).toThrow('Profile not found: nonexistent');
    });

    it('deleteProfile removes a profile file', () => {
      loader.load();
      loader.createProfile('temp');
      expect(loader.listProfiles()).toContain('temp');

      loader.deleteProfile('temp');
      expect(loader.listProfiles()).not.toContain('temp');
    });

    it('deleteProfile throws when deleting default', () => {
      loader.load();
      expect(() => loader.deleteProfile('default')).toThrow('Cannot delete the default profile');
    });

    it('deleteProfile falls back to default when deleting active profile', () => {
      loader.load();
      const profile = {
        name: 'Temp',
        cliTypes: { 'claude-code': {} },
        global: { Up: { action: 'session-switch', direction: 'next' } },
      };
      writeYaml('profiles/temp.yaml', profile);
      loader.switchProfile('temp');
      expect(loader.getActiveProfile()).toBe('temp');

      loader.deleteProfile('temp');
      expect(loader.getActiveProfile()).toBe('default');
    });
  });

  // =========================================================================
  // Working Directory CRUD
  // =========================================================================

  describe('Working Directory CRUD', () => {
    it('addWorkingDirectory appends and persists', () => {
      loader.load();
      loader.addWorkingDirectory('New', 'D:\\new');

      const dirs = loader.getWorkingDirectories();
      expect(dirs).toHaveLength(3);
      expect(dirs[2]).toEqual({ name: 'New', path: 'D:\\new' });

      const onDisk = readYaml<any>('directories.yaml');
      expect(onDisk.workingDirectories).toHaveLength(3);
    });

    it('updateWorkingDirectory updates in place', () => {
      loader.load();
      loader.updateWorkingDirectory(0, 'Updated', 'E:\\updated');

      expect(loader.getWorkingDirectories()[0]).toEqual({ name: 'Updated', path: 'E:\\updated' });
    });

    it('updateWorkingDirectory throws for invalid index', () => {
      loader.load();
      expect(() => loader.updateWorkingDirectory(99, 'X', 'X')).toThrow('Invalid working directory index');
    });

    it('removeWorkingDirectory removes and persists', () => {
      loader.load();
      loader.removeWorkingDirectory(0);

      const dirs = loader.getWorkingDirectories();
      expect(dirs).toHaveLength(1);
      expect(dirs[0].name).toBe('Home');
    });

    it('removeWorkingDirectory throws for invalid index', () => {
      loader.load();
      expect(() => loader.removeWorkingDirectory(-1)).toThrow('Invalid working directory index');
    });
  });

  // =========================================================================
  // Tools CRUD
  // =========================================================================

  describe('Tools CRUD', () => {
    it('addCliType adds a new CLI type and persists', () => {
      loader.load();
      loader.addCliType('new-tool', 'New Tool', 'echo');

      expect(loader.getCliTypes()).toContain('new-tool');
      expect(loader.getCliTypeName('new-tool')).toBe('New Tool');
      expect(loader.getSpawnConfig('new-tool')).toEqual({ command: 'echo', args: [] });

      const onDisk = readYaml<any>('tools.yaml');
      expect(onDisk.cliTypes['new-tool']).toBeDefined();
      expect(onDisk.cliTypes['new-tool'].command).toBe('echo');
    });

    it('addCliType throws if key already exists', () => {
      loader.load();
      expect(() => loader.addCliType('claude-code', 'X', ''))
        .toThrow('CLI type already exists: claude-code');
    });

    it('updateCliType updates an existing CLI type', () => {
      loader.load();
      loader.updateCliType('claude-code', 'CC Updated', 'cc');

      expect(loader.getCliTypeName('claude-code')).toBe('CC Updated');
      expect(loader.getSpawnConfig('claude-code')).toEqual({ command: 'cc', args: [] });
    });

    it('updateCliType throws for non-existent key', () => {
      loader.load();
      expect(() => loader.updateCliType('nope', 'X', ''))
        .toThrow('CLI type not found: nope');
    });

    it('removeCliType removes and persists', () => {
      loader.load();
      loader.removeCliType('copilot-cli');

      expect(loader.getCliTypes()).not.toContain('copilot-cli');

      const onDisk = readYaml<any>('tools.yaml');
      expect(onDisk.cliTypes['copilot-cli']).toBeUndefined();
    });

    it('removeCliType throws for non-existent key', () => {
      loader.load();
      expect(() => loader.removeCliType('nope')).toThrow('CLI type not found: nope');
    });

    it('initialPromptDelay is preserved through updateCliType', () => {
      // Write a tool with initialPromptDelay set
      writeYaml('tools.yaml', {
        cliTypes: {
          'claude-code': {
            name: 'Claude Code',
            command: 'cc',
            initialPrompt: 'hello',
            initialPromptDelay: 3000,
          },
          'copilot-cli': {
            name: 'GitHub Copilot CLI',
            command: 'copilot',
            initialPrompt: '',
          },
        },
      });
      loader.load();

      // Update name and command — delay should survive
      loader.updateCliType('claude-code', 'CC Renamed', 'cc2', 'new prompt');

      const entry = loader.getCliTypeEntry('claude-code');
      expect(entry).not.toBeNull();
      expect(entry!.name).toBe('CC Renamed');
      expect(entry!.command).toBe('cc2');
      expect(entry!.initialPrompt).toBe('new prompt');
      expect(entry!.initialPromptDelay).toBe(3000);

      // Verify persisted to disk
      const onDisk = readYaml<any>('tools.yaml');
      expect(onDisk.cliTypes['claude-code'].initialPromptDelay).toBe(3000);
    });

    it('initialPromptDelay is loaded from disk on fresh load', () => {
      writeYaml('tools.yaml', {
        cliTypes: {
          'claude-code': {
            name: 'Claude Code',
            command: 'cc',
            initialPrompt: '',
            initialPromptDelay: 1500,
          },
        },
      });
      loader.load();

      const entry = loader.getCliTypeEntry('claude-code');
      expect(entry!.initialPromptDelay).toBe(1500);
    });

    it('initialPromptDelay is undefined when not set in config', () => {
      loader.load();
      const entry = loader.getCliTypeEntry('claude-code');
      expect(entry!.initialPromptDelay).toBeUndefined();
    });

    it('addCliType with initialPromptDelay saves it', () => {
      loader.load();
      loader.addCliType('my-tool', 'My Tool', 'mytool', 'hello', 5000);

      const entry = loader.getCliTypeEntry('my-tool');
      expect(entry).not.toBeNull();
      expect(entry!.initialPromptDelay).toBe(5000);

      const onDisk = readYaml<any>('tools.yaml');
      expect(onDisk.cliTypes['my-tool'].initialPromptDelay).toBe(5000);
    });

    it('updateCliType with initialPromptDelay saves new value (not preserving old)', () => {
      writeYaml('tools.yaml', {
        cliTypes: {
          'claude-code': {
            name: 'Claude Code',
            command: 'cc',
            initialPrompt: '',
            initialPromptDelay: 3000,
          },
          'copilot-cli': {
            name: 'GitHub Copilot CLI',
            command: 'copilot',
            initialPrompt: '',
          },
        },
      });
      loader.load();

      loader.updateCliType('claude-code', 'CC Updated', 'cc2', 'prompt', 7000);

      const entry = loader.getCliTypeEntry('claude-code');
      expect(entry!.initialPromptDelay).toBe(7000);

      const onDisk = readYaml<any>('tools.yaml');
      expect(onDisk.cliTypes['claude-code'].initialPromptDelay).toBe(7000);
    });
  });

  // =========================================================================
  // Button naming in bindings (renamed buttons: Guide→Xbox, Start→Sandwich)
  // =========================================================================

  describe('button naming in bindings', () => {
    it('loads bindings with Sandwich button name', () => {
      const profileWithSandwich = {
        name: 'Test',
        cliTypes: {
          'claude-code': {
            Sandwich: { action: 'profile-switch', direction: 'next' },
          },
        },
        global: {
          Xbox: { action: 'hub-focus' },
        },
      };
      writeYaml('profiles/default.yaml', profileWithSandwich);
      loader.load();

      const bindings = loader.getBindings('claude-code');
      expect(bindings).toHaveProperty('Sandwich');
      expect(bindings!['Sandwich']).toEqual({ action: 'profile-switch', direction: 'next' });
    });

    it('loads global bindings with Xbox button name', () => {
      const profileWithXbox = {
        name: 'Test',
        cliTypes: {},
        global: {
          Xbox: { action: 'hub-focus' },
          Back: { action: 'profile-switch', direction: 'previous' },
        },
      };
      writeYaml('profiles/default.yaml', profileWithXbox);
      loader.load();

      const global = loader.getGlobalBindings();
      expect(global).toHaveProperty('Xbox');
      expect(global['Xbox']).toEqual({ action: 'hub-focus' });
    });

    it('persists renamed button bindings through setBinding', () => {
      loader.load();
      loader.setBinding('Sandwich', 'claude-code', { action: 'keyboard', keys: ['Ctrl', 'w'] });

      // Re-load and verify
      loader.load();
      const bindings = loader.getBindings('claude-code');
      expect(bindings).toHaveProperty('Sandwich');
      expect(bindings!['Sandwich']).toEqual({ action: 'keyboard', keys: ['Ctrl', 'w'] });
    });
  });

  // =========================================================================
  // Stick Config
  // =========================================================================

  describe('getStickConfig', () => {
    it('returns defaults when profile has no sticks section', () => {
      loader.load();
      const left = loader.getStickConfig('left');
      expect(left).toEqual({ mode: 'disabled', deadzone: 0.25, repeatRate: 100 });

      const right = loader.getStickConfig('right');
      expect(right).toEqual({ mode: 'disabled', deadzone: 0.25, repeatRate: 100 });
    });

    it('returns stick config from profile when present', () => {
      const profileWithSticks = {
        ...DEFAULT_PROFILE,
        sticks: {
          left: { mode: 'cursor', deadzone: 0.3, repeatRate: 80 },
          right: { mode: 'scroll', deadzone: 0.2, repeatRate: 150 },
        },
      };
      writeYaml('profiles/default.yaml', profileWithSticks);
      loader.load();

      expect(loader.getStickConfig('left')).toEqual({ mode: 'cursor', deadzone: 0.3, repeatRate: 80 });
      expect(loader.getStickConfig('right')).toEqual({ mode: 'scroll', deadzone: 0.2, repeatRate: 150 });
    });

    it('returns defaults for missing stick when only one is configured', () => {
      const profileWithOneStick = {
        ...DEFAULT_PROFILE,
        sticks: {
          left: { mode: 'cursor', deadzone: 0.25, repeatRate: 100 },
        },
      };
      writeYaml('profiles/default.yaml', profileWithOneStick);
      loader.load();

      expect(loader.getStickConfig('left')).toEqual({ mode: 'cursor', deadzone: 0.25, repeatRate: 100 });
      expect(loader.getStickConfig('right')).toEqual({ mode: 'disabled', deadzone: 0.25, repeatRate: 100 });
    });

    it('throws when called before load', () => {
      expect(() => loader.getStickConfig('left')).toThrow('Configuration not loaded');
    });
  });

  // =========================================================================
  // Haptic Feedback Setting
  // =========================================================================

  describe('hapticFeedback', () => {
    it('defaults to true when not present in settings.yaml', () => {
      // SETTINGS fixture has no hapticFeedback key
      loader.load();
      expect(loader.getHapticFeedback()).toBe(true);
    });

    it('reads hapticFeedback from settings.yaml when present', () => {
      writeYaml('settings.yaml', { activeProfile: 'default', hapticFeedback: false });
      loader.load();
      expect(loader.getHapticFeedback()).toBe(false);
    });

    it('setHapticFeedback persists to settings.yaml', () => {
      loader.load();
      loader.setHapticFeedback(false);

      const onDisk = readYaml<any>('settings.yaml');
      expect(onDisk.hapticFeedback).toBe(false);
    });

    it('setHapticFeedback round-trips through reload', () => {
      loader.load();
      loader.setHapticFeedback(false);

      // Create a fresh loader and reload
      const loader2 = new ConfigLoader(TEST_DIR);
      loader2.load();
      expect(loader2.getHapticFeedback()).toBe(false);
    });

    it('throws when called before load', () => {
      expect(() => loader.getHapticFeedback()).toThrow('Configuration not loaded');
    });
  });

  // =========================================================================
  // Sidebar preferences
  // =========================================================================

  describe('sidebar preferences', () => {
    it('getSidebarPrefs returns defaults when settings.yaml has no sidebar section', () => {
      // SETTINGS fixture has no sidebar key
      loader.load();
      expect(loader.getSidebarPrefs()).toEqual({ side: 'left', width: 320 });
    });

    it('getSidebarPrefs reads saved values from settings.yaml', () => {
      writeYaml('settings.yaml', { activeProfile: 'default', sidebar: { side: 'right', width: 400 } });
      loader.load();
      expect(loader.getSidebarPrefs()).toEqual({ side: 'right', width: 400 });
    });

    it('setSidebarPrefs updates only side, keeps width', () => {
      writeYaml('settings.yaml', { activeProfile: 'default', sidebar: { side: 'left', width: 320 } });
      loader.load();
      loader.setSidebarPrefs({ side: 'right' });
      expect(loader.getSidebarPrefs()).toEqual({ side: 'right', width: 320 });
    });

    it('setSidebarPrefs updates only width, keeps side', () => {
      writeYaml('settings.yaml', { activeProfile: 'default', sidebar: { side: 'right', width: 320 } });
      loader.load();
      loader.setSidebarPrefs({ width: 400 });
      expect(loader.getSidebarPrefs()).toEqual({ side: 'right', width: 400 });
    });

    it('setSidebarPrefs persists to disk', () => {
      loader.load();
      loader.setSidebarPrefs({ side: 'right', width: 500 });

      const onDisk = readYaml<any>('settings.yaml');
      expect(onDisk.sidebar.side).toBe('right');
      expect(onDisk.sidebar.width).toBe(500);
    });

    it('getSidebarPrefs fills missing fields from defaults', () => {
      writeYaml('settings.yaml', { activeProfile: 'default', sidebar: { side: 'right' } });
      loader.load();
      expect(loader.getSidebarPrefs()).toEqual({ side: 'right', width: 320 });
    });

    it('throws when called before load', () => {
      expect(() => loader.getSidebarPrefs()).toThrow('Configuration not loaded');
    });
  });

  // =========================================================================
  // buildSpawnConfig (via getSpawnConfig)
  // =========================================================================

  describe('buildSpawnConfig', () => {
    it('builds spawn config with command', () => {
      writeYaml('tools.yaml', {
        cliTypes: { test: { name: 'Test', command: 'python' } },
      });
      loader.load();
      expect(loader.getSpawnConfig('test')).toEqual({ command: 'python', args: [] });
    });

    it('builds spawn config without command', () => {
      writeYaml('tools.yaml', {
        cliTypes: { test: { name: 'Test', command: '' } },
      });
      loader.load();
      expect(loader.getSpawnConfig('test')).toEqual({ command: '', args: [] });
    });
  });
});

// ============================================================================
// getStickDirectionBinding
// ============================================================================

import { stickVirtualButtonName, STICK_VIRTUAL_BUTTONS } from '../src/config/loader.js';

describe('getStickDirectionBinding', () => {
  let loader: ConfigLoader;

  beforeEach(() => {
    fs.mkdirSync(TEST_DIR + '-stick', { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR + '-stick', { recursive: true, force: true });
  });

  function setupWithGlobal(globalBindings: Record<string, any>): void {
    const dir = TEST_DIR + '-stick';
    const writeYamlStick = (rel: string, data: unknown) => {
      const fullPath = path.join(dir, rel);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, YAML.stringify(data), 'utf8');
    };

    writeYamlStick('directories.yaml', { workingDirectories: [] });
    writeYamlStick('tools.yaml', { cliTypes: { test: { name: 'Test', command: 'test' } } });
    writeYamlStick('settings.yaml', { activeProfile: 'default' });
    writeYamlStick('profiles/default.yaml', {
      name: 'Default',
      cliTypes: { test: {} },
      global: globalBindings,
    });

    loader = new ConfigLoader(dir);
    loader.load();
  }

  it('returns binding for an explicit stick direction', () => {
    setupWithGlobal({
      LeftStickUp: { action: 'keyboard', keys: ['up'] },
    });
    const binding = loader.getStickDirectionBinding('left', 'up');
    expect(binding).toEqual({ action: 'keyboard', keys: ['up'] });
  });

  it('returns null when no binding for stick direction', () => {
    setupWithGlobal({});
    expect(loader.getStickDirectionBinding('right', 'down')).toBeNull();
  });

  it('distinguishes left from right stick', () => {
    setupWithGlobal({
      LeftStickUp: { action: 'keyboard', keys: ['up'] },
      RightStickUp: { action: 'session-switch', direction: 'previous' },
    });
    expect(loader.getStickDirectionBinding('left', 'up')).toEqual({ action: 'keyboard', keys: ['up'] });
    expect(loader.getStickDirectionBinding('right', 'up')).toEqual({ action: 'session-switch', direction: 'previous' });
  });

  it('returns null for directions without explicit bindings even when others exist', () => {
    setupWithGlobal({
      RightStickDown: { action: 'keyboard', keys: ['pagedown'] },
    });
    expect(loader.getStickDirectionBinding('right', 'up')).toBeNull();
    expect(loader.getStickDirectionBinding('left', 'down')).toBeNull();
  });
});

// ============================================================================
// stickVirtualButtonName
// ============================================================================

describe('stickVirtualButtonName', () => {
  it('builds left stick up name', () => {
    expect(stickVirtualButtonName('left', 'up')).toBe('LeftStickUp');
  });

  it('builds right stick down name', () => {
    expect(stickVirtualButtonName('right', 'down')).toBe('RightStickDown');
  });

  it('builds left stick right name', () => {
    expect(stickVirtualButtonName('left', 'right')).toBe('LeftStickRight');
  });

  it('builds right stick left name', () => {
    expect(stickVirtualButtonName('right', 'left')).toBe('RightStickLeft');
  });
});

describe('STICK_VIRTUAL_BUTTONS', () => {
  it('contains exactly 8 virtual button names', () => {
    expect(STICK_VIRTUAL_BUTTONS).toHaveLength(8);
  });

  it('includes all 4 directions for each stick', () => {
    expect(STICK_VIRTUAL_BUTTONS).toContain('LeftStickUp');
    expect(STICK_VIRTUAL_BUTTONS).toContain('LeftStickDown');
    expect(STICK_VIRTUAL_BUTTONS).toContain('LeftStickLeft');
    expect(STICK_VIRTUAL_BUTTONS).toContain('LeftStickRight');
    expect(STICK_VIRTUAL_BUTTONS).toContain('RightStickUp');
    expect(STICK_VIRTUAL_BUTTONS).toContain('RightStickDown');
    expect(STICK_VIRTUAL_BUTTONS).toContain('RightStickLeft');
    expect(STICK_VIRTUAL_BUTTONS).toContain('RightStickRight');
  });
});

// ============================================================================
// slugify (standalone export)
// ============================================================================

import { slugify } from '../src/config/loader.js';

describe('slugify', () => {
  it('converts name to kebab-case slug', () => {
    expect(slugify('Claude Code')).toBe('claude-code');
  });

  it('handles special characters', () => {
    expect(slugify('My Tool (v2)')).toBe('my-tool-v2');
  });

  it('strips leading and trailing hyphens', () => {
    expect(slugify('--hello--')).toBe('hello');
  });

  it('handles already-kebab input', () => {
    expect(slugify('claude-code')).toBe('claude-code');
  });

  it('collapses multiple separators', () => {
    expect(slugify('a   b   c')).toBe('a-b-c');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });
});
