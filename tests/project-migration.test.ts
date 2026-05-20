import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as YAML from 'yaml';
import { savePlanFile, savePlanSequences, loadProjectRecords, loadPlanFile, loadPlanSequences, loadSessions } from '../src/session/persistence.js';
import { migrateProjects } from '../src/session/project-migration.js';
import type { PlanItem, PlanSequence } from '../src/types/plan.js';
import type { SessionInfo } from '../src/types/session.js';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

function makePlan(id: string, dirPath: string): PlanItem {
  return {
    id,
    humanId: `P-${id.slice(0, 4)}`,
    dirPath,
    title: `Task ${id}`,
    description: 'desc',
    status: 'ready',
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('migrateProjects', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-project-migration-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates one project for multiple worktrees sharing the same git common-dir', () => {
    const worktreeA = 'X:\\coding\\repo-a';
    const worktreeB = 'X:\\coding\\repo-b';

    savePlanFile(makePlan('aaaa0001-0000-0000-0000-000000000001', worktreeA), path.join(tmpDir, 'plans'));
    savePlanFile(makePlan('bbbb0002-0000-0000-0000-000000000002', worktreeB), path.join(tmpDir, 'plans'));
    savePlanSequences([{
      id: 'seq-1',
      dirPath: worktreeB,
      title: 'Mission',
      missionStatement: '',
      sharedMemory: '',
      order: 0,
      createdAt: 1,
      updatedAt: 1,
    } satisfies PlanSequence], path.join(tmpDir, 'plan-sequences.json'));
    fs.writeFileSync(path.join(tmpDir, 'sessions.yaml'), YAML.stringify({
      sessions: [{
        id: 's1',
        name: 'Codex',
        cliType: 'codex',
        processId: 1,
        workingDir: worktreeA,
      } satisfies SessionInfo],
    }), 'utf8');

    const runGit = (cwd: string, args: string[]) => {
      if (args.includes('--show-toplevel')) return cwd;
      if (args.includes('--git-common-dir')) return 'X:\\coding\\repo\\.git';
      return null;
    };

    const result = migrateProjects(tmpDir, runGit);
    const projects = loadProjectRecords(path.join(tmpDir, 'projects.json'));
    const planA = loadPlanFile('X%3A%5Ccoding%5Crepo-a@aaaa0001-0000-0000-0000-000000000001.json', path.join(tmpDir, 'plans'));
    const planB = loadPlanFile('X%3A%5Ccoding%5Crepo-b@bbbb0002-0000-0000-0000-000000000002.json', path.join(tmpDir, 'plans'));
    const sequences = loadPlanSequences(path.join(tmpDir, 'plan-sequences.json'));
    const sessions = loadSessions(path.join(tmpDir, 'sessions.yaml'));

    expect(result.updatedPlans).toBe(2);
    expect(result.updatedSequences).toBe(1);
    expect(result.updatedSessions).toBe(1);
    expect(projects).toHaveLength(1);
    expect(projects[0].alternatePaths).toContain('x:\\coding\\repo-b');
    expect(planA?.projectId).toBe(projects[0].id);
    expect(planB?.projectId).toBe(projects[0].id);
    expect(sequences[0]?.projectId).toBe(projects[0].id);
    expect(sessions[0]?.projectId).toBe(projects[0].id);
  });

  it('keeps session workingDir intact while consolidating the owning project to the worktree root', () => {
    fs.writeFileSync(path.join(tmpDir, 'sessions.yaml'), YAML.stringify({
      sessions: [{
        id: 's1',
        name: 'Codex',
        cliType: 'codex',
        processId: 1,
        workingDir: 'X:\\coding\\repo-a\\packages\\ui',
      } satisfies SessionInfo],
    }), 'utf8');

    migrateProjects(tmpDir, (_cwd, args) => {
      if (args.includes('--show-toplevel')) return 'X:\\coding\\repo-a';
      if (args.includes('--git-common-dir')) return 'X:\\coding\\repo\\.git';
      return null;
    });

    const projects = loadProjectRecords(path.join(tmpDir, 'projects.json'));
    const sessions = loadSessions(path.join(tmpDir, 'sessions.yaml'));

    expect(projects[0]?.canonicalPath).toBe('x:\\coding\\repo-a');
    expect(projects[0]?.alternatePaths).toEqual([]);
    expect(sessions[0]?.workingDir).toBe('x:\\coding\\repo-a\\packages\\ui');
    expect(sessions[0]?.projectId).toBe(projects[0]?.id);
  });

  it('is idempotent on repeat startup', () => {
    savePlanFile(makePlan('aaaa0001-0000-0000-0000-000000000001', 'X:\\coding\\repo-a'), path.join(tmpDir, 'plans'));
    const runGit = (cwd: string, args: string[]) => {
      if (args.includes('--show-toplevel')) return cwd;
      if (args.includes('--git-common-dir')) return 'X:\\coding\\repo\\.git';
      return null;
    };

    const first = migrateProjects(tmpDir, runGit);
    const second = migrateProjects(tmpDir, runGit);

    expect(first.updatedPlans).toBe(1);
    expect(second.updatedPlans).toBe(0);
    expect(second.updatedSequences).toBe(0);
    expect(second.updatedSessions).toBe(0);
    expect(loadProjectRecords(path.join(tmpDir, 'projects.json'))).toHaveLength(1);
  });

  it('writes a migration marker and recoverable backups for touched files', () => {
    savePlanFile(makePlan('aaaa0001-0000-0000-0000-000000000001', 'X:\\coding\\repo-a'), path.join(tmpDir, 'plans'));
    fs.writeFileSync(path.join(tmpDir, 'sessions.yaml'), YAML.stringify({
      sessions: [{
        id: 's1',
        name: 'Codex',
        cliType: 'codex',
        processId: 1,
        workingDir: 'X:\\coding\\repo-a',
      } satisfies SessionInfo],
    }), 'utf8');

    migrateProjects(tmpDir, () => null);

    const marker = JSON.parse(fs.readFileSync(path.join(tmpDir, 'project-migration-state.json'), 'utf8'));
    expect(marker.status).toBe('completed');
    expect(fs.existsSync(path.join(tmpDir, 'project-migration-backup', 'plans'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'project-migration-backup', 'sessions.yaml'))).toBe(true);
  });

  it('can resume safely after an interrupted migration marker is left behind', () => {
    savePlanFile(makePlan('aaaa0001-0000-0000-0000-000000000001', 'X:\\coding\\repo-a'), path.join(tmpDir, 'plans'));
    fs.writeFileSync(path.join(tmpDir, 'project-migration-state.json'), JSON.stringify({
      version: 1,
      status: 'running',
      startedAt: 1,
      backupDir: path.join(tmpDir, 'project-migration-backup'),
    }, null, 2), 'utf8');

    const result = migrateProjects(tmpDir, () => null);
    const marker = JSON.parse(fs.readFileSync(path.join(tmpDir, 'project-migration-state.json'), 'utf8'));

    expect(result.updatedPlans).toBe(1);
    expect(marker.status).toBe('completed');
    expect(loadProjectRecords(path.join(tmpDir, 'projects.json'))).toHaveLength(1);
  });
});
