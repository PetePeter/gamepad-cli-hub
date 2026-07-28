/**
 * ConfigLoader fleet accessors — locks the OFF-by-default contract and the
 * partial-merge / port-normalisation behaviour, mirroring mcp-config.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigLoader } from '../src/config/loader.js';
import type { FleetConfig } from '../src/config/loader.js';
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';

const TEST_DIR = path.join(process.cwd(), '.test-fleet-config-' + Date.now());

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

describe('ConfigLoader - FleetConfig', () => {
  beforeEach(() => fs.mkdirSync(TEST_DIR, { recursive: true }));
  afterEach(() => fs.rmSync(TEST_DIR, { recursive: true, force: true }));

  it('is OFF by default with 0.0.0.0:47474 when the section is missing', () => {
    setup();
    const loader = new ConfigLoader(TEST_DIR);
    loader.load();
    expect(loader.getFleetConfig()).toEqual({ enabled: false, host: '0.0.0.0', port: 47474 });
  });

  it('adopts a pre-rename `federation:` block so an existing install keeps working', () => {
    // Settings written before the Fleet rename. Losing this silently turns the
    // feature off on upgrade, which reads exactly like the bug we just fixed.
    setup({ federation: { enabled: true, host: '10.98.1.140', port: 47474 } });
    const loader = new ConfigLoader(TEST_DIR);
    loader.load();
    expect(loader.getFleetConfig()).toEqual({ enabled: true, host: '10.98.1.140', port: 47474 });
  });

  it('prefers the current `fleet:` block when both are present', () => {
    setup({
      federation: { enabled: false, host: '0.0.0.0', port: 47474 },
      fleet: { enabled: true, host: '10.0.0.5', port: 47000 },
    });
    const loader = new ConfigLoader(TEST_DIR);
    loader.load();
    expect(loader.getFleetConfig().enabled).toBe(true);
    expect(loader.getFleetConfig().host).toBe('10.0.0.5');
  });

  it('returns saved config when present', () => {
    const fleet: FleetConfig = { enabled: true, host: '192.168.1.10', port: 55000 };
    setup({ fleet });
    const loader = new ConfigLoader(TEST_DIR);
    loader.load();
    expect(loader.getFleetConfig()).toEqual(fleet);
  });

  it('merges partial updates and persists (survives reload)', () => {
    setup();
    const loader = new ConfigLoader(TEST_DIR);
    loader.load();
    loader.setFleetConfig({ enabled: true, port: 49999 });

    const saved = readYaml<any>('settings.yaml');
    expect(saved.fleet).toEqual({ enabled: true, host: '0.0.0.0', port: 49999 });

    const loader2 = new ConfigLoader(TEST_DIR);
    loader2.load();
    expect(loader2.getFleetConfig()).toEqual({ enabled: true, host: '0.0.0.0', port: 49999 });
  });

  it('normalises invalid ports back to the default', () => {
    setup({ fleet: { enabled: true, host: '0.0.0.0', port: 99999 } });
    const loader = new ConfigLoader(TEST_DIR);
    loader.load();
    expect(loader.getFleetConfig().port).toBe(47474);

    loader.setFleetConfig({ port: -5 });
    expect(loader.getFleetConfig().port).toBe(47474);
  });

  it('coerces an enabled:"true" string to a real boolean false unless strictly true', () => {
    setup({ fleet: { enabled: 'yes', host: '', port: 47474 } as unknown });
    const loader = new ConfigLoader(TEST_DIR);
    loader.load();
    const cfg = loader.getFleetConfig();
    expect(cfg.enabled).toBe(false);      // only literal true enables
    expect(cfg.host).toBe('0.0.0.0');     // empty host falls back to default
  });
});
