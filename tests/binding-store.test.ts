import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BindingStore } from '../src/config/binding-store.js';
import * as fs from 'fs';
import * as path from 'path';

const TEST_DIR = path.join(process.cwd(), '.test-binding-store-' + Date.now());

beforeEach(() => fs.mkdirSync(TEST_DIR, { recursive: true }));
afterEach(() => fs.rmSync(TEST_DIR, { recursive: true, force: true }));

describe('BindingStore', () => {
  it('returns null for unknown cli type', () => {
    const store = new BindingStore(TEST_DIR);
    store.load();
    expect(store.get('unknown')).toBeNull();
  });

  it('setButton and get round-trip', () => {
    const store = new BindingStore(TEST_DIR);
    store.load();
    store.setButton('A', 'cc', { action: 'keyboard', sequence: '{Enter}' });
    const fresh = new BindingStore(TEST_DIR);
    fresh.load();
    expect(fresh.get('cc')?.A).toEqual({ action: 'keyboard', sequence: '{Enter}' });
  });

  it('removeButton deletes just that button', () => {
    const store = new BindingStore(TEST_DIR);
    store.load();
    store.setButton('A', 'cc', { action: 'keyboard', sequence: '{Enter}' });
    store.setButton('B', 'cc', { action: 'voice', key: 'Space', mode: 'hold' });
    store.removeButton('A', 'cc');
    expect(store.get('cc')?.A).toBeUndefined();
    expect(store.get('cc')?.B).toBeDefined();
  });

  it('copy duplicates all bindings to dst, leaves src unchanged', () => {
    const store = new BindingStore(TEST_DIR);
    store.load();
    store.setButton('A', 'src', { action: 'keyboard', sequence: '{Enter}' });
    store.copy('src', 'dst');
    expect(store.get('dst')?.A).toEqual({ action: 'keyboard', sequence: '{Enter}' });
    expect(store.get('src')?.A).toBeDefined();
  });

  it('copy throws when source CLI type has no bindings', () => {
    const store = new BindingStore(TEST_DIR);
    store.load();
    expect(() => store.copy('missing', 'dst')).toThrow();
  });

  it('removeButton does not save when button does not exist', () => {
    const store = new BindingStore(TEST_DIR);
    store.load();
    store.setButton('A', 'cc', { action: 'keyboard', sequence: '{Enter}' });
    const mtimeBefore = fs.statSync(store.filePath).mtimeMs;
    // Sleep one tick equivalent — use a busy loop with a fresh stat to ensure
    // any subsequent write would update mtime (filesystems have ms resolution).
    const start = Date.now();
    while (Date.now() - start < 20) { /* spin */ }
    store.removeButton('Nonexistent', 'cc');
    const mtimeAfter = fs.statSync(store.filePath).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore);
  });

  it('importBulk populates all bindings and saves', () => {
    const store = new BindingStore(TEST_DIR);
    store.load();
    store.importBulk({
      cc: { A: { action: 'keyboard', sequence: '{Enter}' } },
      cp: { B: { action: 'voice', key: 'Space', mode: 'tap' } },
    });
    const fresh = new BindingStore(TEST_DIR);
    fresh.load();
    expect(fresh.get('cc')?.A).toEqual({ action: 'keyboard', sequence: '{Enter}' });
    expect(fresh.get('cp')?.B).toEqual({ action: 'voice', key: 'Space', mode: 'tap' });
  });
});
