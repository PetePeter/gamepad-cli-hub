import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfigDir } from '../utils/app-paths.js';
import { logger } from '../utils/logger.js';
import { listPlanFiles, loadPlanFile, loadPlanSequences, savePlanFile, savePlanSequences, saveSessions, loadSessions } from './persistence.js';
import { ProjectStore } from './project-store.js';
import type { GitRunner } from './project-identity.js';

const __migration_dirname = dirname(fileURLToPath(import.meta.url));

export interface ProjectMigrationResult {
  migratedProjects: number;
  updatedPlans: number;
  updatedSequences: number;
  updatedSessions: number;
}

/**
 * First-run project migration:
 * - creates stable Project records from existing plans/sequences/sessions
 * - annotates those records with projectId
 * - collapses many worktree paths into one project when git common-dir matches
 *
 * The migration is idempotent: re-running only re-saves when project linkage changed.
 */
export function migrateProjects(configDir?: string, runGit?: GitRunner): ProjectMigrationResult {
  const resolvedConfigDir = configDir ?? getConfigDir(__migration_dirname);
  const plansDir = join(resolvedConfigDir, 'plans');
  const sequencesFile = join(resolvedConfigDir, 'plan-sequences.json');
  const sessionsFile = join(resolvedConfigDir, 'sessions.yaml');
  const projectsFile = join(resolvedConfigDir, 'projects.json');

  const store = new ProjectStore(runGit, projectsFile);
  const beforeCount = store.list().length;
  let updatedPlans = 0;
  let updatedSequences = 0;
  let updatedSessions = 0;

  if (existsSync(plansDir)) {
    for (const filename of listPlanFiles(plansDir)) {
      const item = loadPlanFile(filename, plansDir);
      if (!item) continue;
      const project = store.resolveForPath(item.dirPath);
      if (item.projectId !== project.id) {
        item.projectId = project.id;
        savePlanFile(item, plansDir);
        updatedPlans++;
      }
    }
  }

  if (existsSync(sequencesFile)) {
    const sequences = loadPlanSequences(sequencesFile);
    let changed = false;
    for (const sequence of sequences) {
      const project = store.resolveForPath(sequence.dirPath);
      if (sequence.projectId !== project.id) {
        sequence.projectId = project.id;
        sequence.updatedAt = Date.now();
        updatedSequences++;
        changed = true;
      }
    }
    if (changed) {
      savePlanSequences(sequences, sequencesFile);
    }
  }

  if (existsSync(sessionsFile)) {
    const sessions = loadSessions(sessionsFile);
    let changed = false;
    for (const session of sessions) {
      if (!session.workingDir) continue;
      const project = store.resolveForPath(session.workingDir);
      if (session.projectId !== project.id) {
        session.projectId = project.id;
        updatedSessions++;
        changed = true;
      }
    }
    if (changed) {
      saveSessions(sessions, sessionsFile);
    }
  }

  const afterCount = store.list().length;
  if (store.isDirty() || updatedPlans > 0 || updatedSequences > 0 || updatedSessions > 0) {
    store.save();
    logger.info(`[ProjectMigration] Projects=${afterCount} plans=${updatedPlans} sequences=${updatedSequences} sessions=${updatedSessions}`);
  }

  return {
    migratedProjects: Math.max(0, afterCount - beforeCount),
    updatedPlans,
    updatedSequences,
    updatedSessions,
  };
}
