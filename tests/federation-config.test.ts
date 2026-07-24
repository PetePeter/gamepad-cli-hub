/**
 * ConfigLoader federation accessors — locks the OFF-by-default contract and the
 * partial-merge / port-normalisation behaviour, mirroring mcp-config.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigLoader } from '../src/config/loader.js';
import type { FederationConfig } from '../src/config/loader.js';
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';

const TEST_DIR = path.join(process.cwd(), '.test-federation-config-' + Date.now());

function writeYaml(rel: string, data: unknown): void {
  const full = path.join(TEST_DIR, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, YAML.stringify(data), 'utf8');
}
function readYaml<T>(rel: string): T {
  return YAML.parse(fs.readFileSync(path.join(TEST_DIR, rel), 'utf8')) as T;
}

const MINIMAL_PROFILE = {
  name: 'Default',
  tools: { 'claude-code': { name: 'Claude Code', command: 'cc' } },
  workingDirectories: [],
  bindings: {},
};

function setup(settingsOverrides: Record<string, unknown> = {}): void {
  writeYaml('settings.yaml', { activeProfile: 'default', ...settingsOverrides });
  writeYaml('profiles/default.yaml', MINIMAL_PROFILE);
}

describe('ConfigLoader - FederationConfig', () => {
  beforeEach(() => fs.mkdirSync(TEST_DIR, { recursive: true }));
  afterEach(() => fs.rmSync(TEST_DIR, { recursive: true, force: true }));

  it('is OFF by default with 0.0.0.0:47474 when the section is missing', () => {
    setup();
    const loader = new ConfigLoader(TEST_DIR);
    loader.load();
    expect(loader.getFederationConfig()).toEqual({ enabled: false, host: '0.0.0.0', port: 47474 });
  });

  it('returns saved config when present', () => {
    const federation: FederationConfig = { enabled: true, host: '192.168.1.10', port: 55000 };
    setup({ federation });
    const loader = new ConfigLoader(TEST_DIR);
    loader.load();
    expect(loader.getFederationConfig()).toEqual(federation);
  });

  it('merges partial updates and persists (survives reload)', () => {
    setup();
    const loader = new ConfigLoader(TEST_DIR);
    loader.load();
    loader.setFederationConfig({ enabled: true, port: 49999 });

    const saved = readYaml<any>('settings.yaml');
    expect(saved.federation).toEqual({ enabled: true, host: '0.0.0.0', port: 49999 });

    const loader2 = new ConfigLoader(TEST_DIR);
    loader2.load();
    expect(loader2.getFederationConfig()).toEqual({ enabled: true, host: '0.0.0.0', port: 49999 });
  });

  it('normalises invalid ports back to the default', () => {
    setup({ federation: { enabled: true, host: '0.0.0.0', port: 99999 } });
    const loader = new ConfigLoader(TEST_DIR);
    loader.load();
    expect(loader.getFederationConfig().port).toBe(47474);

    loader.setFederationConfig({ port: -5 });
    expect(loader.getFederationConfig().port).toBe(47474);
  });

  it('coerces an enabled:"true" string to a real boolean false unless strictly true', () => {
    setup({ federation: { enabled: 'yes', host: '', port: 47474 } as unknown });
    const loader = new ConfigLoader(TEST_DIR);
    loader.load();
    const cfg = loader.getFederationConfig();
    expect(cfg.enabled).toBe(false);      // only literal true enables
    expect(cfg.host).toBe('0.0.0.0');     // empty host falls back to default
  });
});
