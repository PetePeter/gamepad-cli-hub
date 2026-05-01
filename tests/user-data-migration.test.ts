import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('migrateUserDataFolder', () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = join(tmpdir(), `helm-migration-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(baseDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(baseDir)) rmSync(baseDir, { recursive: true, force: true });
  });

  it('copies old dir to new dir when old exists and new does not', async () => {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const oldDir = join(baseDir, 'gamepad-cli-hub');
    const newDir = join(baseDir, 'Helm');
    mkdirSync(join(oldDir, 'config'), { recursive: true });
    writeFileSync(join(oldDir, 'config', 'test.yaml'), 'key: value');

    const { migrateUserDataFolder } = await import('../src/electron/user-data-migration.js');
    migrateUserDataFolder(baseDir, true);

    expect(existsSync(join(newDir, 'config', 'test.yaml'))).toBe(true);
    // Old dir preserved
    expect(existsSync(oldDir)).toBe(true);
  });

  it('is a no-op when new dir already exists', async () => {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const oldDir = join(baseDir, 'gamepad-cli-hub');
    const newDir = join(baseDir, 'Helm');
    mkdirSync(join(oldDir, 'config'), { recursive: true });
    mkdirSync(join(newDir, 'existing'), { recursive: true });
    writeFileSync(join(newDir, 'existing', 'keep.txt'), 'kept');

    const { migrateUserDataFolder } = await import('../src/electron/user-data-migration.js');
    migrateUserDataFolder(baseDir, true);

    // New dir untouched
    expect(existsSync(join(newDir, 'existing', 'keep.txt'))).toBe(true);
  });

  it('is a no-op when old dir does not exist', async () => {
    const newDir = join(baseDir, 'Helm');

    const { migrateUserDataFolder } = await import('../src/electron/user-data-migration.js');
    migrateUserDataFolder(baseDir, true);

    expect(existsSync(newDir)).toBe(false);
  });

  it('is skipped when isPackaged is false', async () => {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const oldDir = join(baseDir, 'gamepad-cli-hub');
    mkdirSync(join(oldDir, 'config'), { recursive: true });
    writeFileSync(join(oldDir, 'config', 'test.yaml'), 'key: value');

    const { migrateUserDataFolder } = await import('../src/electron/user-data-migration.js');
    migrateUserDataFolder(baseDir, false);

    expect(existsSync(join(baseDir, 'Helm'))).toBe(false);
  });
});
