import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { ConfigLoader } from '../src/config/loader.js';
import type { McpConfig } from '../src/config/loader.js';
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';

const TEST_DIR = path.join(process.cwd(), '.test-mcp-config-' + Date.now());

function writeYaml(relativePath: string, data: unknown): void {
  const fullPath = path.join(TEST_DIR, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, YAML.stringify(data), 'utf8');
}

function readYaml<T>(relativePath: string): T {
  const fullPath = path.join(TEST_DIR, relativePath);
  return YAML.parse(fs.readFileSync(fullPath, 'utf8')) as T;
}

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

describe('ConfigLoader - McpConfig', () => {
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

  it('returns defaults when the mcp section is missing', () => {
    setupTestFiles();
    loader = new ConfigLoader(TEST_DIR);
    loader.load();

    expect(loader.getMcpConfig()).toEqual({
      enabled: false,
      port: 47373,
      authToken: '',
    });
  });

  it('returns saved config when the mcp section exists', () => {
    const mcp: McpConfig = {
      enabled: true,
      port: 48123,
      authToken: 'abc123',
    };
    setupTestFiles({ mcp });
    loader = new ConfigLoader(TEST_DIR);
    loader.load();

    expect(loader.getMcpConfig()).toEqual(mcp);
  });

  it('merges partial updates into the current mcp config', () => {
    setupTestFiles({ mcp: { enabled: true, port: 48000, authToken: 'old-token' } });
    loader = new ConfigLoader(TEST_DIR);
    loader.load();

    loader.setMcpConfig({ authToken: 'new-token' });

    expect(loader.getMcpConfig()).toEqual({
      enabled: true,
      port: 48000,
      authToken: 'new-token',
    });
  });

  it('persists changes to disk and survives reload', () => {
    setupTestFiles();
    loader = new ConfigLoader(TEST_DIR);
    loader.load();

    loader.setMcpConfig({ enabled: true, port: 49000, authToken: 'persisted-token' });

    const saved = readYaml<any>('settings.yaml');
    expect(saved.mcp).toEqual({
      enabled: true,
      port: 49000,
      authToken: 'persisted-token',
    });

    const loader2 = new ConfigLoader(TEST_DIR);
    loader2.load();
    expect(loader2.getMcpConfig()).toEqual({
      enabled: true,
      port: 49000,
      authToken: 'persisted-token',
    });
  });

  it('normalizes invalid ports back to the default', () => {
    setupTestFiles({ mcp: { enabled: true, port: 99999, authToken: 'abc' } });
    loader = new ConfigLoader(TEST_DIR);
    loader.load();

    expect(loader.getMcpConfig().port).toBe(47373);

    loader.setMcpConfig({ port: -1 });
    expect(loader.getMcpConfig().port).toBe(47373);
  });
});
