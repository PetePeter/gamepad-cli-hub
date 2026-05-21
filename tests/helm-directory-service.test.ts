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
    getForDirectory: vi.fn((dir: string) =>
      planDirs.includes(dir) ? [{ id: 'p1', dirPath: dir }] : [],
    ),
    getAllPlanDirectories: vi.fn(() => planDirs),
  };
}

function makeProjectStore(records: Array<{ id: string; canonicalPath: string; name: string }>) {
  return {
    findByPath: vi.fn((path: string) =>
      records.find((r) => r.canonicalPath === path),
    ),
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

  it('lists two manually-configured folders as separate entries with their own projectIds', () => {
    const configLoader = makeConfigLoader([
      { path: '/repo/main', name: 'Main' },
      { path: '/repo/other', name: 'Other' },
    ]);
    const sessionManager = makeSessionManager([
      { workingDir: '/repo/main', projectPath: '/repo/main' },
      { workingDir: '/repo/other', projectPath: '/repo/other' },
    ]);
    const planManager = makePlanManager(['/repo/main', '/repo/other']);
    const projectStore = makeProjectStore([
      { id: 'proj-1', canonicalPath: '/repo/main', name: 'repo' },
      { id: 'proj-2', canonicalPath: '/repo/other', name: 'other' },
    ]);

    const service = new HelmDirectoryService(configLoader as any, sessionManager as any, planManager as any, projectStore as any);
    const dirs = service.listDirectories();

    expect(dirs).toHaveLength(2);
    const main = dirs.find((d) => d.dirPath === '/repo/main');
    const other = dirs.find((d) => d.dirPath === '/repo/other');
    expect(main?.projectId).toBe('proj-1');
    expect(other?.projectId).toBe('proj-2');
    expect(main?.source).toContain('config');
    expect(other?.source).toContain('config');
  });

  it('returns separate entries for each configured folder', () => {
    const configLoader = makeConfigLoader([
      { path: '/repo/main', name: 'Main' },
      { path: '/repo/other', name: 'Other' },
    ]);
    const sessionManager = makeSessionManager([]);
    const planManager = makePlanManager([]);
    const projectStore = makeProjectStore([
      { id: 'proj-1', canonicalPath: '/repo/main', name: 'repo' },
    ]);

    const service = new HelmDirectoryService(configLoader as any, sessionManager as any, planManager as any, projectStore as any);
    const dirs = service.listDirectories();

    expect(dirs).toHaveLength(2);
    const main = dirs.find((d) => d.dirPath === '/repo/main');
    const other = dirs.find((d) => d.dirPath === '/repo/other');
    expect(main?.projectId).toBe('proj-1');
    expect(other?.projectId).toBeUndefined();
    expect(main?.name).toBe('Main');
    expect(other?.name).toBe('Other');
  });

  it('routes session and plan counts to the correct folder entry', () => {
    const configLoader = makeConfigLoader([
      { path: '/repo/main', name: 'Main' },
      { path: '/repo/other', name: 'Other' },
    ]);
    const sessionManager = makeSessionManager([
      { workingDir: '/repo/main', projectPath: '/repo/main' },
      { workingDir: '/repo/other', projectPath: '/repo/other' },
      { workingDir: '/repo/other', projectPath: '/repo/other' },
    ]);
    const planManager = makePlanManager(['/repo/main', '/repo/main']);
    const projectStore = makeProjectStore([{ id: 'proj-1', canonicalPath: '/repo/main', name: 'repo' }]);

    const service = new HelmDirectoryService(configLoader as any, sessionManager as any, planManager as any, projectStore as any);
    const dirs = service.listDirectories();

    const main = dirs.find((d) => d.dirPath === '/repo/main');
    const other = dirs.find((d) => d.dirPath === '/repo/other');
    expect(main?.sessionCount).toBe(1);
    expect(other?.sessionCount).toBe(2);
    expect(main?.source).toContain('plans');
  });

  it('directory with no project record has no projectId', () => {
    const configLoader = makeConfigLoader([{ path: '/repo/main', name: 'Main' }]);
    const sessionManager = makeSessionManager([]);
    const planManager = makePlanManager([]);
    const projectStore = makeProjectStore([]);

    const service = new HelmDirectoryService(configLoader as any, sessionManager as any, planManager as any, projectStore as any);
    const dirs = service.listDirectories();

    expect(dirs).toHaveLength(1);
    expect(dirs[0].projectId).toBeUndefined();
  });
});
