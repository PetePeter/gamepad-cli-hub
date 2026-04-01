/**
 * Config loader unit tests — split config system
 *
 * Tests cover: loading from 4 files, existing getters, setBinding,
 * profile CRUD, working directory CRUD, and tools CRUD.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigLoader } from '../src/config/loader.js';
import { stickVirtualButtonName, STICK_VIRTUAL_BUTTONS } from '../src/config/loader.js';
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

const SETTINGS = { activeProfile: 'default' };

const DEFAULT_PROFILE = {
  name: 'Default',
  tools: {
    'claude-code': {
      name: 'Claude Code',
      command: 'cc',
      initialPrompt: [],
    },
    'copilot-cli': {
      name: 'GitHub Copilot CLI',
      command: 'copilot',
      initialPrompt: [],
    },
  },
  workingDirectories: [
    { name: 'Projects', path: 'X:\\coding' },
    { name: 'Home', path: 'C:\\Users\\oscar' },
  ],
  bindings: {
    'claude-code': {
      A: { action: 'keyboard', sequence: '{Ctrl+L}' },
      B: { action: 'voice', key: 'Space', mode: 'hold' },
    },
    'copilot-cli': {
      A: { action: 'keyboard', sequence: '{Ctrl+L}' },
      Y: { action: 'keyboard', sequence: '{Ctrl+C}' },
    },
  },
};

function setupTestFiles(): void {
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
      expect(bindings).toEqual(DEFAULT_PROFILE.bindings['claude-code']);
    });

    it('returns null for non-existent CLI type', () => {
      loader.load();
      expect(loader.getBindings('non-existent')).toBeNull();
    });

    it('throws error when called before load', () => {
      expect(() => loader.getBindings('claude-code')).toThrow('Configuration not loaded');
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

  describe('getWorkingDirectories', () => {
    it('returns directories from directories.yaml', () => {
      loader.load();
      expect(loader.getWorkingDirectories()).toEqual(DEFAULT_PROFILE.workingDirectories);
    });
  });

  // =========================================================================
  // setBinding (backward compatible)
  // =========================================================================

  describe('setBinding', () => {
    it('throws error when called before load', () => {
      expect(() => loader.setBinding('A', 'claude-code', { action: 'keyboard', keys: ['Enter'] }))
        .toThrow('Configuration not loaded');
    });

    it('sets a CLI-specific binding and persists', () => {
      loader.load();
      const newBinding = { action: 'keyboard' as const, keys: ['Ctrl', 'z'] };
      loader.setBinding('X', 'claude-code', newBinding);

      expect(loader.getBindings('claude-code')!['X']).toEqual(newBinding);

      const onDisk = readYaml<any>('profiles/default.yaml');
      expect(onDisk.bindings['claude-code']['X']).toEqual(newBinding);
    });

    it('throws error for unknown CLI type', () => {
      loader.load();
      expect(() => loader.setBinding('A', 'nonexistent', { action: 'keyboard', keys: ['Enter'] }))
        .toThrow('Unknown CLI type: nonexistent');
    });

    it('sets a sequence-list binding and persists', () => {
      loader.load();
      const seqListBinding = {
        action: 'sequence-list' as const,
        items: [
          { label: 'Clear', sequence: '/clear{Enter}' },
          { label: 'Help', sequence: '/help{Enter}' },
        ],
      };
      loader.setBinding('Y', 'claude-code', seqListBinding);

      expect(loader.getBindings('claude-code')!['Y']).toEqual(seqListBinding);

      const onDisk = readYaml<any>('profiles/default.yaml');
      expect(onDisk.bindings['claude-code']['Y']).toEqual(seqListBinding);
    });

    it('round-trips sequence-list binding through save and reload', () => {
      loader.load();
      const seqListBinding = {
        action: 'sequence-list' as const,
        items: [
          { label: 'Compact', sequence: '/compact{Enter}' },
        ],
      };
      loader.setBinding('Y', 'copilot-cli', seqListBinding);

      // Reload from disk
      const loader2 = new ConfigLoader(TEST_DIR);
      loader2.load();
      expect(loader2.getBindings('copilot-cli')!['Y']).toEqual(seqListBinding);
    });
  });

  // =========================================================================
  // copyCliBindings
  // =========================================================================

  describe('copyCliBindings', () => {
    it('copies all bindings from one CLI to another', () => {
      loader.load();
      loader.copyCliBindings('claude-code', 'copilot-cli');
      const target = loader.getBindings('copilot-cli')!;
      // claude-code has A and B — both should now exist on copilot-cli
      expect(target['A']).toEqual({ action: 'keyboard', sequence: '{Ctrl+L}' });
      expect(target['B']).toEqual({ action: 'voice', key: 'Space', mode: 'hold' });
    });

    it('overwrites existing bindings on target', () => {
      loader.load();
      // copilot-cli already has A={Ctrl+L} and Y={Ctrl+C}
      loader.copyCliBindings('claude-code', 'copilot-cli');
      const target = loader.getBindings('copilot-cli')!;
      // A was overwritten with claude-code's A
      expect(target['A']).toEqual({ action: 'keyboard', sequence: '{Ctrl+L}' });
      // Y was not in source — should remain untouched
      expect(target['Y']).toEqual({ action: 'keyboard', sequence: '{Ctrl+C}' });
    });

    it('returns count of copied bindings', () => {
      loader.load();
      const count = loader.copyCliBindings('claude-code', 'copilot-cli');
      expect(count).toBe(2); // A and B
    });

    it('throws for unknown source CLI', () => {
      loader.load();
      expect(() => loader.copyCliBindings('nonexistent', 'copilot-cli'))
        .toThrow('No bindings found for source: nonexistent');
    });

    it('throws for unknown target CLI', () => {
      loader.load();
      expect(() => loader.copyCliBindings('claude-code', 'nonexistent'))
        .toThrow('Unknown target CLI type: nonexistent');
    });

    it('persists copied bindings to disk', () => {
      loader.load();
      loader.copyCliBindings('claude-code', 'copilot-cli');
      const fresh = new ConfigLoader(TEST_DIR);
      fresh.load();
      const target = fresh.getBindings('copilot-cli')!;
      expect(target['B']).toEqual({ action: 'voice', key: 'Space', mode: 'hold' });
    });

    it('does not mutate source bindings via shared reference', () => {
      loader.load();
      loader.copyCliBindings('claude-code', 'copilot-cli');
      // Modify target binding — should not affect source
      loader.setBinding('A', 'copilot-cli', { action: 'keyboard', sequence: '{Enter}' });
      const source = loader.getBindings('claude-code')!;
      expect(source['A']).toEqual({ action: 'keyboard', sequence: '{Ctrl+L}' });
    });
  });

  // =========================================================================
  // Sequences (named groups)
  // =========================================================================

  describe('Sequences', () => {
    beforeEach(() => {
      // Set up a profile with sequences
      const profileWithSequences = {
        ...DEFAULT_PROFILE,
        tools: {
          ...DEFAULT_PROFILE.tools,
          'claude-code': {
            ...DEFAULT_PROFILE.tools['claude-code'],
            sequences: {
              prompts: [
                { label: 'commit', sequence: 'use skill(commit)' },
                { label: 'review', sequence: 'use skill(code-review-it)' },
              ],
              snippets: [
                { label: 'hello', sequence: 'Hello world!' },
              ],
            },
          },
        },
      };
      writeYaml('profiles/default.yaml', profileWithSequences);
      loader = new ConfigLoader(TEST_DIR);
    });

    it('getSequences returns all groups for a CLI type', () => {
      loader.load();
      const sequences = loader.getSequences('claude-code');
      expect(Object.keys(sequences)).toEqual(['prompts', 'snippets']);
      expect(sequences['prompts']).toHaveLength(2);
      expect(sequences['snippets']).toHaveLength(1);
    });

    it('getSequences returns empty object for CLI without sequences', () => {
      loader.load();
      const sequences = loader.getSequences('copilot-cli');
      expect(sequences).toEqual({});
    });

    it('getSequences returns empty object for unknown CLI', () => {
      loader.load();
      const sequences = loader.getSequences('nonexistent');
      expect(sequences).toEqual({});
    });

    it('getSequenceGroup returns specific group', () => {
      loader.load();
      const prompts = loader.getSequenceGroup('claude-code', 'prompts');
      expect(prompts).toHaveLength(2);
      expect(prompts![0]).toEqual({ label: 'commit', sequence: 'use skill(commit)' });
    });

    it('getSequenceGroup returns null for unknown group', () => {
      loader.load();
      expect(loader.getSequenceGroup('claude-code', 'nonexistent')).toBeNull();
    });

    it('getSequenceGroup returns null for unknown CLI', () => {
      loader.load();
      expect(loader.getSequenceGroup('nonexistent', 'prompts')).toBeNull();
    });

    it('copyCliBindings also copies sequences', () => {
      loader.load();
      loader.copyCliBindings('claude-code', 'copilot-cli');
      const sequences = loader.getSequences('copilot-cli');
      expect(Object.keys(sequences)).toEqual(['prompts', 'snippets']);
      expect(sequences['prompts']).toHaveLength(2);
    });

    it('copied sequences are deep clones (no shared references)', () => {
      loader.load();
      loader.copyCliBindings('claude-code', 'copilot-cli');
      // Mutate target sequences — should not affect source
      const targetSeq = loader.getSequences('copilot-cli');
      targetSeq['prompts'].push({ label: 'new', sequence: 'new item' });
      const sourceSeq = loader.getSequences('claude-code');
      expect(sourceSeq['prompts']).toHaveLength(2);
    });

    it('copyCliBindings persists sequences to disk', () => {
      loader.load();
      loader.copyCliBindings('claude-code', 'copilot-cli');
      const fresh = new ConfigLoader(TEST_DIR);
      fresh.load();
      const sequences = fresh.getSequences('copilot-cli');
      expect(sequences['prompts']).toHaveLength(2);
    });

    it('setSequenceGroup creates a new group', () => {
      loader.load();
      loader.setSequenceGroup('copilot-cli', 'shortcuts', [
        { label: 'clear', sequence: '/clear{Enter}' },
      ]);
      const group = loader.getSequenceGroup('copilot-cli', 'shortcuts');
      expect(group).toHaveLength(1);
      expect(group![0]).toEqual({ label: 'clear', sequence: '/clear{Enter}' });
    });

    it('setSequenceGroup updates an existing group', () => {
      loader.load();
      loader.setSequenceGroup('claude-code', 'prompts', [
        { label: 'only', sequence: 'one item' },
      ]);
      const group = loader.getSequenceGroup('claude-code', 'prompts');
      expect(group).toHaveLength(1);
      expect(group![0].label).toBe('only');
    });

    it('setSequenceGroup persists to disk', () => {
      loader.load();
      loader.setSequenceGroup('copilot-cli', 'actions', [
        { label: 'test', sequence: 'npm test{Enter}' },
      ]);
      const fresh = new ConfigLoader(TEST_DIR);
      fresh.load();
      expect(fresh.getSequenceGroup('copilot-cli', 'actions')).toHaveLength(1);
    });

    it('setSequenceGroup throws for unknown CLI type', () => {
      loader.load();
      expect(() => loader.setSequenceGroup('nonexistent', 'g', [])).toThrow('Unknown CLI type');
    });

    it('removeSequenceGroup deletes a group', () => {
      loader.load();
      loader.removeSequenceGroup('claude-code', 'prompts');
      expect(loader.getSequenceGroup('claude-code', 'prompts')).toBeNull();
      // Other groups preserved
      expect(loader.getSequenceGroup('claude-code', 'snippets')).toHaveLength(1);
    });

    it('removeSequenceGroup cleans up empty sequences object', () => {
      loader.load();
      loader.removeSequenceGroup('claude-code', 'prompts');
      loader.removeSequenceGroup('claude-code', 'snippets');
      expect(loader.getSequences('claude-code')).toEqual({});
    });

    it('removeSequenceGroup persists to disk', () => {
      loader.load();
      loader.removeSequenceGroup('claude-code', 'snippets');
      const fresh = new ConfigLoader(TEST_DIR);
      fresh.load();
      expect(fresh.getSequenceGroup('claude-code', 'snippets')).toBeNull();
      expect(fresh.getSequenceGroup('claude-code', 'prompts')).toHaveLength(2);
    });

    it('removeSequenceGroup is a no-op for nonexistent group', () => {
      loader.load();
      loader.removeSequenceGroup('claude-code', 'nonexistent');
      // No throw, sequences unchanged
      expect(loader.getSequences('claude-code')).toHaveProperty('prompts');
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
      expect(onDisk.bindings).toEqual({});
      expect(onDisk.tools).toEqual({});
      expect(onDisk.workingDirectories).toEqual([]);
    });

    it('createProfile with copyFrom clones an existing profile', () => {
      loader.load();
      loader.createProfile('gaming', 'default');

      const onDisk = readYaml<any>('profiles/gaming.yaml');
      expect(onDisk.name).toBe('gaming');
      expect(onDisk.bindings['claude-code']).toEqual(DEFAULT_PROFILE.bindings['claude-code']);
      expect(onDisk.tools).toEqual(DEFAULT_PROFILE.tools);
      expect(onDisk.workingDirectories).toEqual(DEFAULT_PROFILE.workingDirectories);
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
        tools: DEFAULT_PROFILE.tools,
        workingDirectories: DEFAULT_PROFILE.workingDirectories,
        bindings: { 'claude-code': { A: { action: 'keyboard', keys: ['Escape'] } } },
      };
      writeYaml('profiles/gaming.yaml', gamingProfile);

      loader.switchProfile('gaming');

      expect(loader.getActiveProfile()).toBe('gaming');
      expect(loader.getBindings('claude-code')).toEqual(gamingProfile.bindings['claude-code']);

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
        tools: DEFAULT_PROFILE.tools,
        workingDirectories: DEFAULT_PROFILE.workingDirectories,
        bindings: { 'claude-code': {} },
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

      const onDisk = readYaml<any>('profiles/default.yaml');
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

      const onDisk = readYaml<any>('profiles/default.yaml');
      expect(onDisk.tools['new-tool']).toBeDefined();
      expect(onDisk.tools['new-tool'].command).toBe('echo');
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

      const onDisk = readYaml<any>('profiles/default.yaml');
      expect(onDisk.tools['copilot-cli']).toBeUndefined();
    });

    it('removeCliType throws for non-existent key', () => {
      loader.load();
      expect(() => loader.removeCliType('nope')).toThrow('CLI type not found: nope');
    });

    it('initialPromptDelay is preserved through updateCliType', () => {
      // Write a profile with initialPromptDelay set on a tool
      const profileWithDelay = {
        ...DEFAULT_PROFILE,
        tools: {
          'claude-code': {
            name: 'Claude Code',
            command: 'cc',
            initialPrompt: [{ label: 'Prompt', sequence: 'hello' }],
            initialPromptDelay: 3000,
          },
          'copilot-cli': {
            name: 'GitHub Copilot CLI',
            command: 'copilot',
            initialPrompt: [],
          },
        },
      };
      writeYaml('profiles/default.yaml', profileWithDelay);
      loader.load();

      // Update name and command — delay should survive
      loader.updateCliType('claude-code', 'CC Renamed', 'cc2', [{ label: 'New', sequence: 'new prompt' }]);

      const entry = loader.getCliTypeEntry('claude-code');
      expect(entry).not.toBeNull();
      expect(entry!.name).toBe('CC Renamed');
      expect(entry!.command).toBe('cc2');
      expect(entry!.initialPrompt).toEqual([{ label: 'New', sequence: 'new prompt' }]);
      expect(entry!.initialPromptDelay).toBe(3000);

      // Verify persisted to disk
      const onDisk = readYaml<any>('profiles/default.yaml');
      expect(onDisk.tools['claude-code'].initialPromptDelay).toBe(3000);
    });

    it('initialPromptDelay is loaded from disk on fresh load', () => {
      const profileWithDelay = {
        ...DEFAULT_PROFILE,
        tools: {
          'claude-code': {
            name: 'Claude Code',
            command: 'cc',
            initialPrompt: [],
            initialPromptDelay: 1500,
          },
        },
      };
      writeYaml('profiles/default.yaml', profileWithDelay);
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
      loader.addCliType('my-tool', 'My Tool', 'mytool', [{ label: 'Prompt', sequence: 'hello' }], 5000);

      const entry = loader.getCliTypeEntry('my-tool');
      expect(entry).not.toBeNull();
      expect(entry!.initialPromptDelay).toBe(5000);

      const onDisk = readYaml<any>('profiles/default.yaml');
      expect(onDisk.tools['my-tool'].initialPromptDelay).toBe(5000);
    });

    it('updateCliType with initialPromptDelay saves new value (not preserving old)', () => {
      const profileWithDelay = {
        ...DEFAULT_PROFILE,
        tools: {
          'claude-code': {
            name: 'Claude Code',
            command: 'cc',
            initialPrompt: [],
            initialPromptDelay: 3000,
          },
          'copilot-cli': {
            name: 'GitHub Copilot CLI',
            command: 'copilot',
            initialPrompt: [],
          },
        },
      };
      writeYaml('profiles/default.yaml', profileWithDelay);
      loader.load();

      loader.updateCliType('claude-code', 'CC Updated', 'cc2', [{ label: 'Prompt', sequence: 'prompt' }], 7000);

      const entry = loader.getCliTypeEntry('claude-code');
      expect(entry!.initialPromptDelay).toBe(7000);

      const onDisk = readYaml<any>('profiles/default.yaml');
      expect(onDisk.tools['claude-code'].initialPromptDelay).toBe(7000);
    });

    it('updateCliType preserves sequences and other optional fields', () => {
      const profileWithExtras = {
        ...DEFAULT_PROFILE,
        tools: {
          ...DEFAULT_PROFILE.tools,
          'claude-code': {
            ...DEFAULT_PROFILE.tools['claude-code'],
            sequences: { prompts: [{ label: 'commit', sequence: 'use skill(commit)' }] },
            handoffCommand: 'go implement it\r',
            renameCommand: '/session {cliSessionName}',
            resumeCommand: 'claude --resume {cliSessionName}',
            continueCommand: 'claude --continue',
          },
        },
      };
      writeYaml('profiles/default.yaml', profileWithExtras);
      loader = new ConfigLoader(TEST_DIR);
      loader.load();

      // Edit only name/command — all other fields must survive
      loader.updateCliType('claude-code', 'CC Renamed', 'cc2');
      const entry = loader.getCliTypeEntry('claude-code')!;
      expect(entry.name).toBe('CC Renamed');
      expect(entry.command).toBe('cc2');
      expect(entry.sequences).toEqual({ prompts: [{ label: 'commit', sequence: 'use skill(commit)' }] });
      expect(entry.handoffCommand).toBe('go implement it\r');
      expect(entry.renameCommand).toBe('/session {cliSessionName}');
      expect(entry.resumeCommand).toBe('claude --resume {cliSessionName}');
      expect(entry.continueCommand).toBe('claude --continue');
    });

    it('updateCliType with options sets optional command fields', () => {
      loader.load();
      loader.updateCliType('claude-code', 'CC', 'cc', [], 0, {
        handoffCommand: 'do it',
        renameCommand: '/name {cliSessionName}',
      });
      const entry = loader.getCliTypeEntry('claude-code')!;
      expect(entry.handoffCommand).toBe('do it');
      expect(entry.renameCommand).toBe('/name {cliSessionName}');
    });

    it('updateCliType with empty string clears optional field', () => {
      const profileWithHandoff = {
        ...DEFAULT_PROFILE,
        tools: {
          ...DEFAULT_PROFILE.tools,
          'claude-code': { ...DEFAULT_PROFILE.tools['claude-code'], handoffCommand: 'go' },
        },
      };
      writeYaml('profiles/default.yaml', profileWithHandoff);
      loader = new ConfigLoader(TEST_DIR);
      loader.load();

      loader.updateCliType('claude-code', 'CC', 'cc', [], 0, { handoffCommand: '' });
      const entry = loader.getCliTypeEntry('claude-code')!;
      expect(entry.handoffCommand).toBeUndefined();
    });

    it('addCliType with options stores optional command fields', () => {
      loader.load();
      loader.addCliType('new-tool', 'New', 'newtool', [], 0, {
        handoffCommand: 'build it',
        resumeCommand: 'newtool --resume {cliSessionName}',
      });
      const entry = loader.getCliTypeEntry('new-tool')!;
      expect(entry.handoffCommand).toBe('build it');
      expect(entry.resumeCommand).toBe('newtool --resume {cliSessionName}');
      expect(entry.renameCommand).toBeUndefined();
    });

    it('updateCliType round-trip preserves all fields on disk', () => {
      const profileWithAll = {
        ...DEFAULT_PROFILE,
        tools: {
          ...DEFAULT_PROFILE.tools,
          'claude-code': {
            ...DEFAULT_PROFILE.tools['claude-code'],
            sequences: { prompts: [{ label: 'x', sequence: 'y' }] },
            handoffCommand: 'h',
            continueCommand: 'c',
          },
        },
      };
      writeYaml('profiles/default.yaml', profileWithAll);
      loader = new ConfigLoader(TEST_DIR);
      loader.load();

      loader.updateCliType('claude-code', 'New Name', 'new-cmd');

      // Reload from disk
      const fresh = new ConfigLoader(TEST_DIR);
      fresh.load();
      const entry = fresh.getCliTypeEntry('claude-code')!;
      expect(entry.name).toBe('New Name');
      expect(entry.command).toBe('new-cmd');
      expect(entry.sequences).toEqual({ prompts: [{ label: 'x', sequence: 'y' }] });
      expect(entry.handoffCommand).toBe('h');
      expect(entry.continueCommand).toBe('c');
    });

    it('auto-migrates string initialPrompt to SequenceListItem array on load', () => {
      const profileWithStringPrompt = {
        ...DEFAULT_PROFILE,
        tools: {
          'claude-code': {
            name: 'Claude Code',
            command: 'cc',
            initialPrompt: 'hello world',
            initialPromptDelay: 1000,
          },
        },
      };
      writeYaml('profiles/default.yaml', profileWithStringPrompt);
      loader.load();

      const entry = loader.getCliTypeEntry('claude-code');
      expect(entry!.initialPrompt).toEqual([{ label: 'Prompt', sequence: 'hello world' }]);
      expect(entry!.initialPromptDelay).toBe(1000);

      // Verify migrated on disk too
      const onDisk = readYaml<any>('profiles/default.yaml');
      expect(onDisk.tools['claude-code'].initialPrompt).toEqual([{ label: 'Prompt', sequence: 'hello world' }]);
    });

    it('auto-migrates empty string initialPrompt to empty array', () => {
      const profileWithEmptyPrompt = {
        ...DEFAULT_PROFILE,
        tools: {
          'claude-code': {
            name: 'Claude Code',
            command: 'cc',
            initialPrompt: '',
          },
        },
      };
      writeYaml('profiles/default.yaml', profileWithEmptyPrompt);
      loader.load();

      const entry = loader.getCliTypeEntry('claude-code');
      expect(entry!.initialPrompt).toEqual([]);
    });

    it('does not re-migrate already-migrated initialPrompt arrays', () => {
      const profileWithArray = {
        ...DEFAULT_PROFILE,
        tools: {
          'claude-code': {
            name: 'Claude Code',
            command: 'cc',
            initialPrompt: [{ label: 'Cmd', sequence: '/clear{Enter}' }],
          },
        },
      };
      writeYaml('profiles/default.yaml', profileWithArray);
      loader.load();

      const entry = loader.getCliTypeEntry('claude-code');
      expect(entry!.initialPrompt).toEqual([{ label: 'Cmd', sequence: '/clear{Enter}' }]);
    });
  });

  describe('button naming in bindings', () => {
    it('loads bindings with Sandwich button name', () => {
      const profileWithSandwich = {
        name: 'Test',
        tools: DEFAULT_PROFILE.tools,
        workingDirectories: DEFAULT_PROFILE.workingDirectories,
        bindings: {
          'claude-code': {
            Sandwich: { action: 'keyboard', sequence: '{Escape}' },
          },
        },
      };
      writeYaml('profiles/default.yaml', profileWithSandwich);
      loader.load();

      const bindings = loader.getBindings('claude-code');
      expect(bindings).toHaveProperty('Sandwich');
      expect(bindings!['Sandwich']).toEqual({ action: 'keyboard', sequence: '{Escape}' });
    });

    it('loads bindings with Xbox button name', () => {
      const profileWithXbox = {
        name: 'Test',
        tools: DEFAULT_PROFILE.tools,
        workingDirectories: DEFAULT_PROFILE.workingDirectories,
        bindings: {
          'claude-code': {
            Xbox: { action: 'keyboard', sequence: '{Enter}' },
            Back: { action: 'keyboard', sequence: '{Escape}' },
          },
        },
      };
      writeYaml('profiles/default.yaml', profileWithXbox);
      loader.load();

      const bindings = loader.getBindings('claude-code');
      expect(bindings).toHaveProperty('Xbox');
      expect(bindings!['Xbox']).toEqual({ action: 'keyboard', sequence: '{Enter}' });
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
  // getDpadConfig
  // =========================================================================

  describe('getDpadConfig', () => {
    it('returns defaults when profile has no dpad section', () => {
      loader.load();
      expect(loader.getDpadConfig()).toEqual({ initialDelay: 400, repeatRate: 120 });
    });

    it('returns dpad config from profile when present', () => {
      const profileWithDpad = {
        ...DEFAULT_PROFILE,
        dpad: { initialDelay: 300, repeatRate: 80 },
      };
      writeYaml('profiles/default.yaml', profileWithDpad);
      loader.load();

      expect(loader.getDpadConfig()).toEqual({ initialDelay: 300, repeatRate: 80 });
    });

    it('fills in defaults for partial dpad config', () => {
      const profileWithPartialDpad = {
        ...DEFAULT_PROFILE,
        dpad: { initialDelay: 500 },
      };
      writeYaml('profiles/default.yaml', profileWithPartialDpad);
      loader.load();

      expect(loader.getDpadConfig()).toEqual({ initialDelay: 500, repeatRate: 120 });
    });
  });

  // =========================================================================
  // Activity config
  // =========================================================================

  describe('getActivityTimeout', () => {
    it('returns default 5000ms when profile has no activity section', () => {
      loader.load();
      expect(loader.getActivityTimeout()).toBe(5000);
    });

    it('returns activity timeout from profile when present', () => {
      const profileWithActivity = {
        ...DEFAULT_PROFILE,
        activity: { timeoutMs: 45000 },
      };
      writeYaml('profiles/default.yaml', profileWithActivity);
      loader.load();

      expect(loader.getActivityTimeout()).toBe(45000);
    });
  });

  describe('setActivityTimeout', () => {
    it('sets activity timeout and persists to profile', () => {
      loader.load();
      loader.setActivityTimeout(60000);

      expect(loader.getActivityTimeout()).toBe(60000);

      const profile = readYaml<typeof DEFAULT_PROFILE & { activity?: { timeoutMs: number } }>('profiles/default.yaml');
      expect(profile.activity?.timeoutMs).toBe(60000);
    });

    it('updates existing activity config', () => {
      const profileWithActivity = {
        ...DEFAULT_PROFILE,
        activity: { timeoutMs: 45000 },
      };
      writeYaml('profiles/default.yaml', profileWithActivity);
      loader.load();

      loader.setActivityTimeout(15000);

      const profile = readYaml<typeof DEFAULT_PROFILE & { activity?: { timeoutMs: number } }>('profiles/default.yaml');
      expect(profile.activity?.timeoutMs).toBe(15000);
    });
  });

  // =========================================================================
  // Scroll binding type
  // =========================================================================

  describe('scroll binding type', () => {
    it('can store and retrieve scroll bindings', () => {
      loader.load();
      loader.setBinding('RightStickUp', 'claude-code', { action: 'scroll', direction: 'up', lines: 3 } as any);
      loader.setBinding('RightStickDown', 'claude-code', { action: 'scroll', direction: 'down' } as any);

      const bindings = loader.getBindings('claude-code')!;
      expect(bindings['RightStickUp']).toEqual({ action: 'scroll', direction: 'up', lines: 3 });
      expect(bindings['RightStickDown']).toEqual({ action: 'scroll', direction: 'down' });
    });

    it('persists scroll bindings to disk', () => {
      loader.load();
      loader.setBinding('RightStickUp', 'claude-code', { action: 'scroll', direction: 'up' } as any);

      // Reload from disk
      const freshLoader = new ConfigLoader(TEST_DIR);
      freshLoader.load();
      const bindings = freshLoader.getBindings('claude-code')!;
      expect(bindings['RightStickUp']).toEqual({ action: 'scroll', direction: 'up' });
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
      expect(loader.getSidebarPrefs()).toEqual({ width: 1280, height: undefined, x: undefined, y: undefined });
    });

    it('getSidebarPrefs reads saved values from settings.yaml', () => {
      writeYaml('settings.yaml', { activeProfile: 'default', sidebar: { width: 400 } });
      loader.load();
      expect(loader.getSidebarPrefs()).toMatchObject({ width: 400 });
    });

    it('setSidebarPrefs updates only width', () => {
      writeYaml('settings.yaml', { activeProfile: 'default', sidebar: { width: 320 } });
      loader.load();
      loader.setSidebarPrefs({ width: 400 });
      expect(loader.getSidebarPrefs()).toMatchObject({ width: 400 });
    });

    it('setSidebarPrefs persists to disk', () => {
      loader.load();
      loader.setSidebarPrefs({ width: 500 });

      const onDisk = readYaml<any>('settings.yaml');
      expect(onDisk.sidebar.width).toBe(500);
    });

    it('getSidebarPrefs fills missing fields from defaults', () => {
      writeYaml('settings.yaml', { activeProfile: 'default', sidebar: {} });
      loader.load();
      expect(loader.getSidebarPrefs()).toEqual({ width: 1280, height: undefined, x: undefined, y: undefined });
    });

    it('round-trips height, x, y through set/get', () => {
      loader.load();
      loader.setSidebarPrefs({ width: 1000, height: 600, x: 100, y: 50 });
      const prefs = loader.getSidebarPrefs();
      expect(prefs.height).toBe(600);
      expect(prefs.x).toBe(100);
      expect(prefs.y).toBe(50);
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
      const profile = { ...DEFAULT_PROFILE, tools: { test: { name: 'Test', command: 'python' } } };
      writeYaml('profiles/default.yaml', profile);
      loader.load();
      expect(loader.getSpawnConfig('test')).toEqual({ command: 'python', args: [] });
    });

    it('builds spawn config without command', () => {
      const profile = { ...DEFAULT_PROFILE, tools: { test: { name: 'Test', command: '' } } };
      writeYaml('profiles/default.yaml', profile);
      loader.load();
      expect(loader.getSpawnConfig('test')).toEqual({ command: '', args: [] });
    });
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
