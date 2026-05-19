/**
 * HelmDirectoryService tests — project-aware directory listing.
 */

import { describe, it, expect, vi } from 'vitest';
import { HelmDirectoryService } from '../src/mcp/services/helm-directory-service.js';

function makeConfigLoader(workingDirs: Array<{ path: string; name: string }>) {
  return {
    getWorkingDirectories: vi.fn(() => workingDirs),
    getCliTypes: vi.fn(() => []),
    getCliTypeEntry: vi.fn(() => null),
  };
}

function makeSessionManager(sessions: Array<{ workingDir?: string; projectPath?: string }>) {
  return {
    getAllSessions: vi.fn(() => sessions),
  };
}

function makePlanManager(planDirs: string[]) {
  return {
    getForDirectory: vi.fn((dir: string) => {
      // Simulate project-aware aggregation: if dir is the canonical path,
      // return items from all worktrees under the same project root
      if (dir === '/repo/main') {
        return planDirs
          .filter((d) => d === '/repo/main' || d === '/repo/worktree-a')
          .map((d) => ({ id: 'p1', dirPath: d }));
      }
      return planDirs.includes(dir) ? [{ id: 'p1', dirPath: dir }] : [];
    }),
    getAllPlanDirectories: vi.fn(() => planDirs),
  };
}

function makeProjectStore(records: Array<{ id: string; canonicalPath: string; name: string }>) {
  return {
    resolveForPath: vi.fn((path: string) => {
      const rec = records.find((r) => r.canonicalPath === path || path === '/repo/worktree-a');
      if (rec) return rec;
      if (path === '/repo/worktree-a') return records[0];
      return { id: `proj-${path}`, canonicalPath: path, name: path.split(/[/\\]/).pop() ?? path };
    }),
  };
}

describe('HelmDirectoryService', () => {
  it('lists configured directories with project consolidation', () => {
    const configLoader = makeConfigLoader([{ path: '/repo/main', name: 'Main' }]);
    const sessionManager = makeSessionManager([]);
    const planManager = makePlanManager([]);
    const projectStore = makeProjectStore([{ id: 'proj-1', canonicalPath: '/repo/main', name: 'repo' }]);

    const service = new HelmDirectoryService(configLoader as any, sessionManager as any, planManager as any, projectStore as any);
    const dirs = service.listDirectories();

    expect(dirs).toHaveLength(1);
    expect(dirs[0].dirPath).toBe('/repo/main');
    expect(dirs[0].projectId).toBe('proj-1');
    expect(dirs[0].source).toContain('config');
  });

  it('includes plan directories outside the configured list', () => {
    const configLoader = makeConfigLoader([{ path: '/repo/main', name: 'Main' }]);
    const sessionManager = makeSessionManager([]);
    const planManager = makePlanManager(['/repo/main', '/other/project']);
    const projectStore = makeProjectStore([]);

    const service = new HelmDirectoryService(configLoader as any, sessionManager as any, planManager as any, projectStore as any);
    const dirs = service.listDirectories();

    const paths = dirs.map((d) => d.dirPath);
    expect(paths).toContain('/repo/main');
    expect(paths).toContain('/other/project');
    const other = dirs.find((d) => d.dirPath === '/other/project');
    expect(other?.source).toContain('plans');
    expect(other?.source).not.toContain('config');
  });

  it('includes session directories outside the configured list', () => {
    const configLoader = makeConfigLoader([{ path: '/repo/main', name: 'Main' }]);
    const sessionManager = makeSessionManager([{ workingDir: '/session-only/dir', projectPath: '/session-only/dir' }]);
    const planManager = makePlanManager([]);
    const projectStore = makeProjectStore([]);

    const service = new HelmDirectoryService(configLoader as any, sessionManager as any, planManager as any, projectStore as any);
    const dirs = service.listDirectories();

    const paths = dirs.map((d) => d.dirPath);
    expect(paths).toContain('/session-only/dir');
    const sessionDir = dirs.find((d) => d.dirPath === '/session-only/dir');
    expect(sessionDir?.source).toContain('sessions');
    expect(sessionDir?.source).not.toContain('config');
  });

  it('keeps alternate folders as separate entries with same projectId', () => {
    const configLoader = makeConfigLoader([
      { path: '/repo/main', name: 'Main' },
      { path: '/repo/worktree-a', name: 'WT A' },
    ]);
    const sessionManager = makeSessionManager([
      { workingDir: '/repo/main', projectPath: '/repo/main' },
      { workingDir: '/repo/worktree-a', projectPath: '/repo/worktree-a' },
    ]);
    const planManager = makePlanManager(['/repo/main', '/repo/worktree-a']);
    const projectStore = makeProjectStore([{ id: 'proj-1', canonicalPath: '/repo/main', name: 'repo' }]);

    const service = new HelmDirectoryService(configLoader as any, sessionManager as any, planManager as any, projectStore as any);
    const dirs = service.listDirectories();

    expect(dirs).toHaveLength(2);
    expect(dirs[0].dirPath).toBe('/repo/main');
    expect(dirs[1].dirPath).toBe('/repo/worktree-a');
    expect(dirs[0].projectId).toBe('proj-1');
    expect(dirs[1].projectId).toBe('proj-1');
    expect(dirs[0].source).toContain('config');
    expect(dirs[1].source).toContain('config');
  });

  it('returns separate entries for each configured alternate folder', () => {
    const configLoader = makeConfigLoader([
      { path: '/repo/main', name: 'Main' },
      { path: '/repo/worktree-a', name: 'WT A' },
    ]);
    const sessionManager = makeSessionManager([]);
    const planManager = makePlanManager([]);
    const projectStore = makeProjectStore([{ id: 'proj-1', canonicalPath: '/repo/main', name: 'repo' }]);

    const service = new HelmDirectoryService(configLoader as any, sessionManager as any, planManager as any, projectStore as any);
    const dirs = service.listDirectories();

    expect(dirs).toHaveLength(2);
    const main = dirs.find((d) => d.dirPath === '/repo/main');
    const wt = dirs.find((d) => d.dirPath === '/repo/worktree-a');
    expect(main?.projectId).toBe('proj-1');
    expect(wt?.projectId).toBe('proj-1');
    expect(main?.name).toBe('Main');
    expect(wt?.name).toBe('WT A');
  });

  it('routes session and plan counts to the correct alternate entry', () => {
    const configLoader = makeConfigLoader([
      { path: '/repo/main', name: 'Main' },
      { path: '/repo/worktree-a', name: 'WT A' },
    ]);
    const sessionManager = makeSessionManager([
      { workingDir: '/repo/main', projectPath: '/repo/main' },
      { workingDir: '/repo/worktree-a', projectPath: '/repo/worktree-a' },
      { workingDir: '/repo/worktree-a', projectPath: '/repo/worktree-a' },
    ]);
    const planManager = makePlanManager(['/repo/main', '/repo/main']);
    const projectStore = makeProjectStore([{ id: 'proj-1', canonicalPath: '/repo/main', name: 'repo' }]);

    const service = new HelmDirectoryService(configLoader as any, sessionManager as any, planManager as any, projectStore as any);
    const dirs = service.listDirectories();

    const main = dirs.find((d) => d.dirPath === '/repo/main');
    const wt = dirs.find((d) => d.dirPath === '/repo/worktree-a');
    expect(main?.sessionCount).toBe(1);
    expect(wt?.sessionCount).toBe(2);
    expect(main?.source).toContain('plans');
  });

  it('does not count canonical projectPath sessions on alternate folder rows', () => {
    const configLoader = makeConfigLoader([
      { path: '/repo/main', name: 'Main' },
      { path: '/repo/worktree-a', name: 'WT A' },
    ]);
    const sessionManager = makeSessionManager([
      { workingDir: '/repo/worktree-a', projectPath: '/repo/main' },
    ]);
    const planManager = makePlanManager([]);
    const projectStore = makeProjectStore([{ id: 'proj-1', canonicalPath: '/repo/main', name: 'repo' }]);

    const service = new HelmDirectoryService(configLoader as any, sessionManager as any, planManager as any, projectStore as any);
    const dirs = service.listDirectories();

    const main = dirs.find((d) => d.dirPath === '/repo/main');
    const wt = dirs.find((d) => d.dirPath === '/repo/worktree-a');
    expect(main?.sessionCount).toBe(0);
    expect(wt?.sessionCount).toBe(1);
  });
});
