import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InputConfigStore } from '../src/config/input-config-store.js';
import * as fs from 'fs';
import * as path from 'path';

const TEST_DIR = path.join(process.cwd(), '.test-input-config-' + Date.now());

beforeEach(() => fs.mkdirSync(TEST_DIR, { recursive: true }));
afterEach(() => fs.rmSync(TEST_DIR, { recursive: true, force: true }));

describe('InputConfigStore', () => {
  it('returns defaults when no file exists', () => {
    const store = new InputConfigStore(TEST_DIR);
    store.load();
    expect(store.getStickConfig('left').mode).toBe('disabled');
    expect(store.getDpadConfig().initialDelay).toBe(400);
    expect(store.getActivityTimeout()).toBe(5000);
    expect(store.getChipbarActions()).toEqual([]);
  });

  it('setChipbarActions persists and reloads', () => {
    const store = new InputConfigStore(TEST_DIR);
    store.load();
    store.setChipbarActions([{ label: 'Plans', sequence: 'open plans{Enter}' }]);
    const fresh = new InputConfigStore(TEST_DIR);
    fresh.load();
    expect(fresh.getChipbarActions()).toHaveLength(1);
    expect(fresh.getChipbarActions()[0].label).toBe('Plans');
  });

  it('setActivityTimeout persists', () => {
    const store = new InputConfigStore(TEST_DIR);
    store.load();
    store.setActivityTimeout(9999);
    const fresh = new InputConfigStore(TEST_DIR);
    fresh.load();
    expect(fresh.getActivityTimeout()).toBe(9999);
  });

  it('load() with corrupt YAML does not throw and returns defaults', () => {
    const store = new InputConfigStore(TEST_DIR);
    fs.writeFileSync(store.filePath, ':\n  bad: [unterminated', 'utf8');
    expect(() => store.load()).not.toThrow();
    expect(store.getActivityTimeout()).toBe(5000);
    expect(store.getChipbarActions()).toEqual([]);
    expect(store.getStickConfig('left').mode).toBe('disabled');
  });
});
