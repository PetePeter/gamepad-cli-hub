/**
 * ConfigLoader.reloadActiveProfileIfChanged() tests
 *
 * Verifies that profile edits on disk are picked up at session-spawn time
 * without restarting the app, and that mid-edit / bad YAML never crashes.
 *
 * Uses real temp YAML files — no mocks.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigLoader } from '../../src/config/loader.js';
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_DIR = path.join(process.cwd(), '.test-loader-reload-' + Date.now());

function writeYaml(relativePath: string, data: unknown): void {
  const fullPath = path.join(TEST_DIR, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, YAML.stringify(data), 'utf8');
}

function writeRaw(relativePath: string, content: string): void {
  const fullPath = path.join(TEST_DIR, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
}

function buildProfile(toolName: string) {
  return {
    name: 'Default',
    tools: {
      'claude-code': {
        name: toolName,
        spawnCommand: 'claude',
        initialPrompt: [],
      },
    },
    workingDirectories: [],
    bindings: {
      'claude-code': {
        A: { action: 'keyboard', sequence: '{Enter}' },
      },
    },
  };
}

const SETTINGS = { activeProfile: 'default' };

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let loader: ConfigLoader;

beforeEach(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  writeYaml('settings.yaml', SETTINGS);
  writeYaml('profiles/default.yaml', buildProfile('Original'));
  loader = new ConfigLoader(TEST_DIR);
  loader.load();
});

afterEach(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('reloadActiveProfileIfChanged', () => {

  it('returns without re-parsing when file is unchanged (mtime guard)', () => {
    // Profile on disk still has 'Original'; call reload without touching the file.
    loader.reloadActiveProfileIfChanged();

    // Confirm the original value is still in place.
    expect(loader.getCliTypeEntry('claude-code')?.name).toBe('Original');
  });

  it('picks up changed tool entry after the profile file is updated on disk', () => {
    // Write a new profile with a different name — forces a new mtime.
    // Use a 1ms sleep workaround: on fast filesystems mtime may not advance
    // within the same millisecond, so we touch the file with an explicit future
    // time to guarantee a different mtime.
    const profilePath = path.join(TEST_DIR, 'profiles', 'default.yaml');
    const futureMs = Date.now() + 1000;
    fs.writeFileSync(profilePath, YAML.stringify(buildProfile('Updated')), 'utf8');
    // Backdate the cached mtime to simulate "file changed since last load".
    // We do this by using utimesSync to guarantee mtime differs.
    const futureDate = new Date(futureMs);
    fs.utimesSync(profilePath, futureDate, futureDate);

    loader.reloadActiveProfileIfChanged();

    expect(loader.getCliTypeEntry('claude-code')?.name).toBe('Updated');
  });

  it('does not throw and preserves old profile when YAML on disk is invalid', () => {
    const profilePath = path.join(TEST_DIR, 'profiles', 'default.yaml');

    // Write syntactically broken YAML with a future mtime so the mtime guard
    // is bypassed and the reload actually attempts a parse.
    fs.writeFileSync(profilePath, ': this is: broken: yaml::::', 'utf8');
    const futureDate = new Date(Date.now() + 2000);
    fs.utimesSync(profilePath, futureDate, futureDate);

    // Must not throw — bad YAML is swallowed.
    expect(() => loader.reloadActiveProfileIfChanged()).not.toThrow();

    // Old profile still in place because the failed reload kept the previous value.
    // Note: after the failed reload, activeProfile stays as 'Original' but the
    // mtime was updated by the stat call inside the method — subsequent calls
    // should also be safe (they'll see the same bad mtime and retry, but swallow
    // again).  The key invariant is: no throw and old data is accessible.
    //
    // In this implementation loadActiveProfile() throws on bad YAML, which means
    // activeProfile is NOT replaced — the existing value from before the call remains.
    expect(loader.getCliTypeEntry('claude-code')?.name).toBe('Original');
  });

});
