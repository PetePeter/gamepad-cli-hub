import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CliTypeStore } from '../src/config/cli-type-store.js';
import * as fs from 'fs';
import * as path from 'path';

const TEST_DIR = path.join(process.cwd(), '.test-cli-type-store-' + Date.now());

beforeEach(() => fs.mkdirSync(TEST_DIR, { recursive: true }));
afterEach(() => fs.rmSync(TEST_DIR, { recursive: true, force: true }));

describe('CliTypeStore', () => {
  it('returns empty list on fresh store with no file', () => {
    const store = new CliTypeStore(TEST_DIR);
    store.load();
    expect(store.list()).toEqual([]);
  });

  it('add and get round-trip', () => {
    const store = new CliTypeStore(TEST_DIR);
    store.load();
    store.add('cc', { name: 'Claude', initialPrompt: [] });
    const fresh = new CliTypeStore(TEST_DIR);
    fresh.load();
    expect(fresh.get('cc')?.name).toBe('Claude');
  });

  it('add throws on duplicate key', () => {
    const store = new CliTypeStore(TEST_DIR);
    store.load();
    store.add('cc', { name: 'Claude', initialPrompt: [] });
    expect(() => store.add('cc', { name: 'Claude2', initialPrompt: [] })).toThrow();
  });

  it('remove deletes entry', () => {
    const store = new CliTypeStore(TEST_DIR);
    store.load();
    store.add('cc', { name: 'Claude', initialPrompt: [] });
    store.remove('cc');
    expect(store.get('cc')).toBeUndefined();
  });

  it('reorder swaps entries', () => {
    const store = new CliTypeStore(TEST_DIR);
    store.load();
    store.add('a', { name: 'A', initialPrompt: [] });
    store.add('b', { name: 'B', initialPrompt: [] });
    store.reorder(0, 'down');
    expect(store.list()).toEqual(['b', 'a']);
  });

  it('save and reload preserves all fields', () => {
    const store = new CliTypeStore(TEST_DIR);
    store.load();
    store.add('cc', { name: 'Claude', initialPrompt: [{ label: 'hi', sequence: 'hello' }], spawnCommand: 'claude' });
    const fresh = new CliTypeStore(TEST_DIR);
    fresh.load();
    expect(fresh.get('cc')?.spawnCommand).toBe('claude');
    expect(fresh.get('cc')?.initialPrompt).toHaveLength(1);
  });

  it('load() with corrupt YAML does not throw and returns empty store', () => {
    const store = new CliTypeStore(TEST_DIR);
    fs.writeFileSync(store.filePath, ':\n  bad: [unterminated', 'utf8');
    expect(() => store.load()).not.toThrow();
    expect(store.list()).toEqual([]);
  });

  it('reorder() with out-of-bounds index is a no-op', () => {
    const store = new CliTypeStore(TEST_DIR);
    store.load();
    store.add('a', { name: 'A', initialPrompt: [] });
    store.add('b', { name: 'B', initialPrompt: [] });
    store.reorder(99, 'up');
    store.reorder(-1, 'down');
    expect(store.list()).toEqual(['a', 'b']);
  });

  it('importBulk() populates all entries and saves in one round-trip', () => {
    const store = new CliTypeStore(TEST_DIR);
    store.load();
    store.importBulk({
      cc: { name: 'Claude', initialPrompt: [] },
      cp: { name: 'Copilot', initialPrompt: [] },
    });
    const fresh = new CliTypeStore(TEST_DIR);
    fresh.load();
    expect(fresh.list()).toEqual(['cc', 'cp']);
    expect(fresh.get('cc')?.name).toBe('Claude');
    expect(fresh.get('cp')?.name).toBe('Copilot');
  });

  /**
   * `pasteMode` was removed along with the four non-pty delivery modes. A user
   * config written before that removal still carries the key, sometimes with a
   * value that no longer means anything. Loading must treat it as inert data,
   * never as a parse error — there is no schema validation here by design, and
   * this pins that guarantee rather than leaving it to be true by accident.
   */
  it('loads a config carrying a removed pasteMode key without throwing', () => {
    fs.writeFileSync(
      path.join(TEST_DIR, 'cli-types.yaml'),
      'cc:\n  name: Claude\n  pasteMode: sendkeys\n  initialPrompt: []\n',
      'utf8',
    );

    const store = new CliTypeStore(TEST_DIR);
    expect(() => store.load()).not.toThrow();
    expect(store.get('cc')?.name).toBe('Claude');
  });
});
