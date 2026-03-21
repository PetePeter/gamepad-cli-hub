/**
 * Config loader unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigLoader } from '../src/config/loader.js';

// Mock fs module
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => ''),
    writeFileSync: vi.fn(),
  },
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(),
}));

// Mock YAML module - need to use importActual to preserve named exports
vi.mock('yaml', async (importOriginal) => {
  const actual = await importOriginal<typeof import('yaml')>();
  return {
    ...actual,
    parse: vi.fn(() => ({})),
    stringify: vi.fn(() => 'yaml output'),
  };
});

import * as fs from 'fs';
import * as YAML from 'yaml';

const MOCK_CONFIG = {
  cliTypes: {
    'claude-code': {
      name: 'Claude Code',
      spawn: {
        command: 'wt',
        args: ['-w', '0', 'cc'],
      },
      bindings: {
        A: { action: 'keyboard', keys: ['Clear'] },
        B: { action: 'voice', holdDuration: 500 },
      },
    },
    'copilot-cli': {
      name: 'GitHub Copilot CLI',
      spawn: {
        command: 'wt',
        args: ['-w', '0', 'gh', 'copilot'],
      },
      bindings: {
        A: { action: 'keyboard', keys: ['Clear'] },
        Y: { action: 'keyboard', keys: ['Ctrl', 'c'] },
      },
    },
  },
  global: {
    Up: { action: 'session-switch', direction: 'previous' },
    Down: { action: 'session-switch', direction: 'next' },
  },
};

describe('ConfigLoader', () => {
  let loader: ConfigLoader;
  const testConfigPath = '/test/config/bindings.yaml';

  beforeEach(() => {
    loader = new ConfigLoader(testConfigPath);
    vi.clearAllMocks();
  });

  describe('load', () => {
    it('loads and parses YAML configuration file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('yaml content');
      vi.mocked(YAML.parse).mockReturnValue(MOCK_CONFIG);

      loader.load();

      expect(fs.existsSync).toHaveBeenCalledWith(testConfigPath);
      expect(fs.readFileSync).toHaveBeenCalledWith(testConfigPath, 'utf8');
      expect(YAML.parse).toHaveBeenCalledWith('yaml content');
    });

    it('throws error when config file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => loader.load()).toThrow(`Configuration file not found: ${testConfigPath}`);
    });
  });

  describe('getBindings', () => {
    it('returns bindings for a valid CLI type', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('yaml content');
      vi.mocked(YAML.parse).mockReturnValue(MOCK_CONFIG);

      loader.load();

      const bindings = loader.getBindings('claude-code');
      expect(bindings).toEqual(MOCK_CONFIG.cliTypes['claude-code'].bindings);
    });

    it('returns null for non-existent CLI type', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('yaml content');
      vi.mocked(YAML.parse).mockReturnValue(MOCK_CONFIG);

      loader.load();

      const bindings = loader.getBindings('non-existent');
      expect(bindings).toBeNull();
    });

    it('throws error when called before load', () => {
      expect(() => loader.getBindings('claude-code')).toThrow('Configuration not loaded');
    });
  });

  describe('getSpawnConfig', () => {
    it('returns spawn config for a valid CLI type', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('yaml content');
      vi.mocked(YAML.parse).mockReturnValue(MOCK_CONFIG);

      loader.load();

      const spawnConfig = loader.getSpawnConfig('claude-code');
      expect(spawnConfig).toEqual(MOCK_CONFIG.cliTypes['claude-code'].spawn);
    });

    it('returns null for non-existent CLI type', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('yaml content');
      vi.mocked(YAML.parse).mockReturnValue(MOCK_CONFIG);

      loader.load();

      const spawnConfig = loader.getSpawnConfig('non-existent');
      expect(spawnConfig).toBeNull();
    });

    it('throws error when called before load', () => {
      expect(() => loader.getSpawnConfig('claude-code')).toThrow('Configuration not loaded');
    });
  });

  describe('getGlobalBindings', () => {
    it('returns global bindings after load', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('yaml content');
      vi.mocked(YAML.parse).mockReturnValue(MOCK_CONFIG);

      loader.load();

      const globalBindings = loader.getGlobalBindings();
      expect(globalBindings).toEqual(MOCK_CONFIG.global);
    });

    it('throws error when called before load', () => {
      expect(() => loader.getGlobalBindings()).toThrow('Configuration not loaded');
    });
  });

  describe('getCliTypeName', () => {
    it('returns display name for valid CLI type', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('yaml content');
      vi.mocked(YAML.parse).mockReturnValue(MOCK_CONFIG);

      loader.load();

      const name = loader.getCliTypeName('claude-code');
      expect(name).toBe('Claude Code');
    });

    it('returns null for non-existent CLI type', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('yaml content');
      vi.mocked(YAML.parse).mockReturnValue(MOCK_CONFIG);

      loader.load();

      const name = loader.getCliTypeName('non-existent');
      expect(name).toBeNull();
    });
  });

  describe('getCliTypes', () => {
    it('returns array of CLI type keys', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('yaml content');
      vi.mocked(YAML.parse).mockReturnValue(MOCK_CONFIG);

      loader.load();

      const cliTypes = loader.getCliTypes();
      expect(cliTypes).toEqual(['claude-code', 'copilot-cli']);
    });
  });

  describe('getConfig', () => {
    it('returns full config object', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('yaml content');
      vi.mocked(YAML.parse).mockReturnValue(MOCK_CONFIG);

      loader.load();

      const config = loader.getConfig();
      expect(config).toEqual(MOCK_CONFIG);
    });
  });

  describe('setBinding', () => {
    function loadMockConfig() {
      // Deep clone to avoid mutation across tests
      const config = JSON.parse(JSON.stringify(MOCK_CONFIG));
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('yaml content');
      vi.mocked(YAML.parse).mockReturnValue(config);
      loader.load();
      return config;
    }

    it('throws error when called before load', () => {
      expect(() => loader.setBinding('A', null, { action: 'keyboard', keys: ['Enter'] }))
        .toThrow('Configuration not loaded');
    });

    it('sets a global binding and writes to disk', () => {
      loadMockConfig();
      const newBinding = { action: 'keyboard' as const, keys: ['Enter'] };

      loader.setBinding('A', null, newBinding);

      const config = loader.getConfig();
      expect(config.global['A']).toEqual(newBinding);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        testConfigPath,
        expect.any(String),
        'utf8'
      );
    });

    it('updates an existing global binding', () => {
      loadMockConfig();
      const newBinding = { action: 'spawn' as const, cliType: 'copilot-cli' };

      loader.setBinding('Up', null, newBinding);

      const config = loader.getConfig();
      expect(config.global['Up']).toEqual(newBinding);
    });

    it('sets a CLI-specific binding and writes to disk', () => {
      loadMockConfig();
      const newBinding = { action: 'keyboard' as const, keys: ['Ctrl', 'z'] };

      loader.setBinding('X', 'claude-code', newBinding);

      const config = loader.getConfig();
      expect(config.cliTypes['claude-code'].bindings['X']).toEqual(newBinding);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('throws error for unknown CLI type', () => {
      loadMockConfig();
      const newBinding = { action: 'keyboard' as const, keys: ['Enter'] };

      expect(() => loader.setBinding('A', 'nonexistent', newBinding))
        .toThrow('Unknown CLI type: nonexistent');
    });

    it('calls YAML.stringify when saving', () => {
      loadMockConfig();
      const newBinding = { action: 'list-sessions' as const };

      loader.setBinding('Start', null, newBinding);

      expect(YAML.stringify).toHaveBeenCalled();
    });
  });
});
