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

  it('creates one project per distinct directory path', () => {
    const dirA = 'X:\\coding\\repo-a';
    const dirB = 'X:\\coding\\repo-b';

    savePlanFile(makePlan('aaaa0001-0000-0000-0000-000000000001', dirA), path.join(tmpDir, 'plans'));
    savePlanFile(makePlan('bbbb0002-0000-0000-0000-000000000002', dirB), path.join(tmpDir, 'plans'));
    savePlanSequences([{
      id: 'seq-1',
      dirPath: dirB,
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
        workingDir: dirA,
      } satisfies SessionInfo],
    }), 'utf8');

    const result = migrateProjects(tmpDir);
    const projects = loadProjectRecords(path.join(tmpDir, 'projects.json'));
    const planA = loadPlanFile('X%3A%5Ccoding%5Crepo-a@aaaa0001-0000-0000-0000-000000000001.json', path.join(tmpDir, 'plans'));
    const planB = loadPlanFile('X%3A%5Ccoding%5Crepo-b@bbbb0002-0000-0000-0000-000000000002.json', path.join(tmpDir, 'plans'));
    const sequences = loadPlanSequences(path.join(tmpDir, 'plan-sequences.json'));
    const sessions = loadSessions(path.join(tmpDir, 'sessions.yaml'));

    // Two distinct directories → two separate projects
    expect(result.updatedPlans).toBe(2);
    expect(result.updatedSequences).toBe(1);
    expect(result.updatedSessions).toBe(1);
    expect(projects).toHaveLength(2);

    const projectForA = projects.find(p => p.canonicalPath === 'x:\\coding\\repo-a');
    const projectForB = projects.find(p => p.canonicalPath === 'x:\\coding\\repo-b');
    expect(projectForA).toBeDefined();
    expect(projectForB).toBeDefined();
    expect(planA?.projectId).toBe(projectForA!.id);
    expect(planB?.projectId).toBe(projectForB!.id);
    expect(sequences[0]?.projectId).toBe(projectForB!.id);
    expect(sessions[0]?.projectId).toBe(projectForA!.id);
  });

  it('keeps session workingDir intact and links it to the correct project', () => {
    fs.writeFileSync(path.join(tmpDir, 'sessions.yaml'), YAML.stringify({
      sessions: [{
        id: 's1',
        name: 'Codex',
        cliType: 'codex',
        processId: 1,
        workingDir: 'X:\\coding\\repo-a',
      } satisfies SessionInfo],
    }), 'utf8');

    migrateProjects(tmpDir);

    const projects = loadProjectRecords(path.join(tmpDir, 'projects.json'));
    const sessions = loadSessions(path.join(tmpDir, 'sessions.yaml'));

    // canonicalPath is normalized; workingDir is preserved as the original string
    expect(projects[0]?.canonicalPath).toBe('x:\\coding\\repo-a');
    expect(sessions[0]?.workingDir).toBe('x:\\coding\\repo-a'); // loadSessions normalizes to lowercase on Windows
    expect(sessions[0]?.projectId).toBe(projects[0]?.id);

  });

  it('is idempotent on repeat startup', () => {
    savePlanFile(makePlan('aaaa0001-0000-0000-0000-000000000001', 'X:\\coding\\repo-a'), path.join(tmpDir, 'plans'));

    const first = migrateProjects(tmpDir);
    const second = migrateProjects(tmpDir);

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

    migrateProjects(tmpDir);

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

    const result = migrateProjects(tmpDir);
    const marker = JSON.parse(fs.readFileSync(path.join(tmpDir, 'project-migration-state.json'), 'utf8'));

    expect(result.updatedPlans).toBe(1);
    expect(marker.status).toBe('completed');
    expect(loadProjectRecords(path.join(tmpDir, 'projects.json'))).toHaveLength(1);
  });
});
