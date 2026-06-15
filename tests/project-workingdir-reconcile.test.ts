/**
 * Tests for project → working-directory registration:
 *  - ConfigLoader.ensureWorkingDirectory (normalize + dedup + persist)
 *  - reconcileProjectWorkingDirectories (startup backfill)
 *  - resolveWorkingDirectory (self-healing MCP gate)
 *
 * Regression: projects created via the Projects screen by older builds were
 * absent from input-config.yaml's workingDirectories, so MCP plan/session
 * creation threw "Working directory is not configured in Helm".
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigLoader } from '../src/config/loader.js';
import { ProjectStore } from '../src/session/project-store.js';
import { reconcileProjectWorkingDirectories } from '../src/session/project-workingdir-reconcile.js';
import { resolveWorkingDirectory } from '../src/mcp/services/working-dir-gate.js';

const TEST_DIR = path.join(process.cwd(), '.test-reconcile-' + Date.now());
const PROJECTS_FILE = path.join(TEST_DIR, 'projects.json');

function newLoader(): ConfigLoader {
  const loader = new ConfigLoader(TEST_DIR);
  loader.load();
  return loader;
}

function writeProjects(projects: unknown[]): ProjectStore {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify({ version: 1, projects }, null, 2), 'utf8');
  return new ProjectStore(PROJECTS_FILE);
}

beforeEach(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(TEST_DIR, 'settings.yaml'),
    'hapticFeedback: true\nnotifications: true\nescProtectionEnabled: true\n',
    'utf8',
  );
});

afterEach(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('ConfigLoader.ensureWorkingDirectory', () => {
  it('registers a new working directory', () => {
    const loader = newLoader();
    loader.ensureWorkingDirectory('x:\\coding\\glinet-plugin', 'glinet-plugin');
    const dirs = loader.getWorkingDirectories();
    expect(dirs).toHaveLength(1);
    expect(dirs[0]).toMatchObject({ name: 'glinet-plugin', path: 'x:\\coding\\glinet-plugin' });
  });

  it('is idempotent — does not duplicate an already-registered path', () => {
    const loader = newLoader();
    loader.ensureWorkingDirectory('x:\\coding\\glinet-plugin', 'glinet-plugin');
    loader.ensureWorkingDirectory('x:\\coding\\glinet-plugin', 'glinet-plugin');
    expect(loader.getWorkingDirectories()).toHaveLength(1);
  });

  it('dedups case-insensitively on win32 drive paths', () => {
    const loader = newLoader();
    loader.ensureWorkingDirectory('X:\\coding\\glinet-plugin');
    loader.ensureWorkingDirectory('x:\\coding\\glinet-plugin');
    expect(loader.getWorkingDirectories()).toHaveLength(1);
  });

  it('persists across loader instances', () => {
    newLoader().ensureWorkingDirectory('x:\\coding\\glinet-plugin', 'glinet-plugin');
    const fresh = newLoader();
    expect(fresh.getWorkingDirectories()).toHaveLength(1);
  });
});

describe('reconcileProjectWorkingDirectories', () => {
  it('registers canonical paths of existing projects', () => {
    const loader = newLoader();
    const store = writeProjects([
      { id: 'a', name: 'glinet-plugin', canonicalPath: 'x:\\coding\\glinet-plugin' },
    ]);
    const added = reconcileProjectWorkingDirectories(store, loader);
    expect(added).toBe(1);
    expect(loader.getWorkingDirectories().map((d) => d.path)).toContain('x:\\coding\\glinet-plugin');
  });

  it('registers alternate paths too', () => {
    const loader = newLoader();
    const store = writeProjects([
      {
        id: 'a',
        name: 'proj',
        canonicalPath: 'x:\\coding\\proj',
        alternatePaths: ['x:\\coding\\proj-worktree'],
      },
    ]);
    const added = reconcileProjectWorkingDirectories(store, loader);
    expect(added).toBe(2);
    const paths = loader.getWorkingDirectories().map((d) => d.path);
    expect(paths).toContain('x:\\coding\\proj');
    expect(paths).toContain('x:\\coding\\proj-worktree');
  });

  it('is idempotent and skips already-registered paths', () => {
    const loader = newLoader();
    loader.ensureWorkingDirectory('x:\\coding\\glinet-plugin', 'glinet-plugin');
    const store = writeProjects([
      { id: 'a', name: 'glinet-plugin', canonicalPath: 'x:\\coding\\glinet-plugin' },
    ]);
    const added = reconcileProjectWorkingDirectories(store, loader);
    expect(added).toBe(0);
    expect(loader.getWorkingDirectories()).toHaveLength(1);
  });

  it('does not duplicate a path registered under different case', () => {
    const loader = newLoader();
    loader.ensureWorkingDirectory('X:\\coding\\glinet-plugin');
    const store = writeProjects([
      { id: 'a', name: 'glinet-plugin', canonicalPath: 'x:\\coding\\glinet-plugin' },
    ]);
    const added = reconcileProjectWorkingDirectories(store, loader);
    expect(added).toBe(0);
    expect(loader.getWorkingDirectories()).toHaveLength(1);
  });
});

describe('resolveWorkingDirectory (self-healing gate)', () => {
  it('returns the entry when already registered', () => {
    const loader = newLoader();
    loader.ensureWorkingDirectory('x:\\coding\\glinet-plugin', 'glinet-plugin');
    const store = writeProjects([]);
    const result = resolveWorkingDirectory(loader, store, 'x:\\coding\\glinet-plugin');
    expect(result.path).toBe('x:\\coding\\glinet-plugin');
  });

  it('self-heals: registers an unregistered path that is a known project', () => {
    const loader = newLoader();
    const store = writeProjects([
      { id: 'a', name: 'glinet-plugin', canonicalPath: 'x:\\coding\\glinet-plugin' },
    ]);
    const result = resolveWorkingDirectory(loader, store, 'x:\\coding\\glinet-plugin');
    expect(result.path).toBe('x:\\coding\\glinet-plugin');
    // persisted for next time
    expect(loader.getWorkingDirectories().map((d) => d.path)).toContain('x:\\coding\\glinet-plugin');
  });

  it('throws for a path that is neither registered nor a known project', () => {
    const loader = newLoader();
    const store = writeProjects([]);
    expect(() => resolveWorkingDirectory(loader, store, 'x:\\coding\\unknown')).toThrow(
      /not configured in Helm/,
    );
  });
});
