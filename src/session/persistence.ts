import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as YAML from 'yaml';
import { logger } from '../utils/logger.js';
import { getConfigDir } from '../utils/app-paths.js';
import type { SessionInfo, DraftPrompt } from '../types/session.js';
import type { PlanItem, PlanDependency, DirectoryPlan, PlanSequence } from '../types/plan.js';
import type { ScheduledTask } from '../types/scheduled-task.js';

const __persistence_dirname = dirname(fileURLToPath(import.meta.url));
const SESSIONS_FILE = join(getConfigDir(__persistence_dirname), 'sessions.yaml');
const DRAFTS_FILE = join(getConfigDir(__persistence_dirname), 'drafts.yaml');
const PLANS_FILE = join(getConfigDir(__persistence_dirname), 'plans.yaml');
const DEFAULT_PLANS_DIR = join(getConfigDir(__persistence_dirname), 'plans');
const DEFAULT_PLAN_DEPS_FILE = join(getConfigDir(__persistence_dirname), 'plan-dependencies.json');
const DEFAULT_PLAN_SEQUENCES_FILE = join(getConfigDir(__persistence_dirname), 'plan-sequences.json');
const SCHEDULED_TASKS_FILE = join(getConfigDir(__persistence_dirname), 'scheduled-tasks.yaml');

/** Persist current sessions to disk so they survive restarts. */
export function saveSessions(sessions: SessionInfo[]): void {
  try {
    const data = { sessions: sessions.map(s => ({
      id: s.id,
      name: s.name,
      cliType: s.cliType,
      processId: s.processId,
      ...(s.workingDir ? { workingDir: s.workingDir } : {}),
      ...(s.cliSessionName ? { cliSessionName: s.cliSessionName } : {}),
      ...(s.currentPlanId ? { currentPlanId: s.currentPlanId } : {}),
      ...(s.topicId != null ? { topicId: s.topicId } : {}),
      ...(s.aiagentState ? { aiagentState: s.aiagentState } : {}),
      // windowId is intentionally NOT persisted — it's ephemeral
    }))};
    writeFileSync(SESSIONS_FILE, YAML.stringify(data), 'utf8');
  } catch (err) {
    logger.error(`Failed to save sessions: ${err}`);
  }
}

/** Load previously persisted sessions from disk. */
export function loadSessions(): SessionInfo[] {
  try {
    if (!existsSync(SESSIONS_FILE)) return [];
    const content = readFileSync(SESSIONS_FILE, 'utf8');
    const parsed = YAML.parse(content) as { sessions?: SessionInfo[] };
    return parsed?.sessions ?? [];
  } catch (err) {
    logger.error(`Failed to load sessions: ${err}`);
    return [];
  }
}

/** Wipe the persisted sessions file. */
export function clearPersistedSessions(): void {
  try {
    if (existsSync(SESSIONS_FILE)) {
      writeFileSync(SESSIONS_FILE, YAML.stringify({ sessions: [] }), 'utf8');
    }
  } catch (err) {
    logger.error(`Failed to clear persisted sessions: ${err}`);
  }
}

/** Persist drafts to disk. */
export function saveDrafts(drafts: Record<string, DraftPrompt[]>): void {
  try {
    writeFileSync(DRAFTS_FILE, YAML.stringify({ drafts }), 'utf8');
  } catch (err) {
    logger.error(`Failed to save drafts: ${err}`);
  }
}

/** Load persisted drafts from disk. */
export function loadDrafts(): Record<string, DraftPrompt[]> {
  try {
    if (!existsSync(DRAFTS_FILE)) return {};
    const content = readFileSync(DRAFTS_FILE, 'utf8');
    const parsed = YAML.parse(content) as { drafts?: Record<string, DraftPrompt[]> };
    return parsed?.drafts ?? {};
  } catch (err) {
    logger.error(`Failed to load drafts: ${err}`);
    return {};
  }
}

/** Persist directory plans to disk (legacy — used only by migration and tests). */
export function savePlans(plans: Record<string, DirectoryPlan>): void {
  try {
    writeFileSync(PLANS_FILE, YAML.stringify({ plans }), 'utf8');
  } catch (err) {
    logger.error(`Failed to save plans: ${err}`);
  }
}

/** Load persisted directory plans from disk. */
export function loadPlans(plansFile?: string): Record<string, DirectoryPlan> {
  const file = plansFile ?? PLANS_FILE;
  try {
    if (!existsSync(file)) return {};
    const content = readFileSync(file, 'utf8');
    const parsed = YAML.parse(content) as { plans?: Record<string, DirectoryPlan> };
    return parsed?.plans ?? {};
  } catch (err) {
    logger.error(`Failed to load plans: ${err}`);
    return {};
  }
}

// ─── Individual plan file persistence ──────────────────────────────────────

const FILE_VERSION = 1;

/**
 * Encode a dirPath + planId into a safe filename.
 * URL-encodes dirPath (so any @ becomes %40) then appends @ + first 8 chars of planId.
 */
export function encodeFilename(dirPath: string, planId: string): string {
  return `${encodeURIComponent(dirPath)}@${planId}.json`;
}

/** Decode a plan filename back to dirPath and planId. */
export function decodeFilename(filename: string): { dirPath: string; planId: string } {
  const name = basename(filename, '.json');
  const atIdx = name.lastIndexOf('@');
  return {
    dirPath: decodeURIComponent(name.slice(0, atIdx)),
    planId: name.slice(atIdx + 1),
  };
}

/** Write a single plan item as an individual JSON file. Creates the plans/ dir if needed. */
export function savePlanFile(item: PlanItem, plansDir = DEFAULT_PLANS_DIR): void {
  try {
    mkdirSync(plansDir, { recursive: true });
    const filename = encodeFilename(item.dirPath, item.id);
    const data = { ...item, _fileVersion: FILE_VERSION };
    writeFileSync(join(plansDir, filename), JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    logger.error(`Failed to save plan file ${item.id}: ${err}`);
  }
}

/** Load a single plan item from disk. Returns null if not found or invalid. */
export function loadPlanFile(filename: string, plansDir = DEFAULT_PLANS_DIR): PlanItem | null {
  try {
    const filePath = join(plansDir, filename);
    if (!existsSync(filePath)) return null;
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    // Strip file-level metadata before returning as PlanItem
    const { _fileVersion: _v, ...item } = raw;
    return item as PlanItem;
  } catch (err) {
    logger.error(`Failed to load plan file ${filename}: ${err}`);
    return null;
  }
}

/** Delete the plan file matching the given plan ID. Returns true if deleted. */
export function deletePlanFile(planId: string, plansDir = DEFAULT_PLANS_DIR): boolean {
  try {
    if (!existsSync(plansDir)) return false;
    const files = readdirSync(plansDir, { withFileTypes: true });
    let deleted = false;
    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith('.json')) continue;
      const filePath = join(plansDir, f.name);
      const { planId: decodedId } = decodeFilename(f.name);
      const matchesFilename = planId === decodedId;

      let matchesContent = false;
      if (!matchesFilename) {
        try {
          const raw = JSON.parse(readFileSync(filePath, 'utf8')) as { id?: string };
          matchesContent = raw?.id === planId;
        } catch (err) {
          logger.warn(`Failed to inspect plan file ${f.name} while deleting ${planId}: ${err}`);
        }
      }

      if (matchesFilename || matchesContent) {
        unlinkSync(filePath);
        deleted = true;
      }
    }
    return deleted;
  } catch (err) {
    logger.error(`Failed to delete plan file for ${planId}: ${err}`);
    return false;
  }
}

/** List all .json filenames directly in the plans directory (excludes subdirs). */
export function listPlanFiles(plansDir = DEFAULT_PLANS_DIR): string[] {
  try {
    if (!existsSync(plansDir)) return [];
    return readdirSync(plansDir, { withFileTypes: true })
      .filter(f => f.isFile() && f.name.endsWith('.json'))
      .map(f => f.name);
  } catch (err) {
    logger.error(`Failed to list plan files: ${err}`);
    return [];
  }
}

/** Write the global dependency registry to disk. */
export function saveDependencies(deps: PlanDependency[], depsFile = DEFAULT_PLAN_DEPS_FILE): void {
  try {
    writeFileSync(depsFile, JSON.stringify({ version: 1, dependencies: deps }, null, 2), 'utf8');
  } catch (err) {
    logger.error(`Failed to save plan dependencies: ${err}`);
  }
}

/** Load the global dependency registry from disk. Returns [] if not found. */
export function loadDependencies(depsFile = DEFAULT_PLAN_DEPS_FILE): PlanDependency[] {
  try {
    if (!existsSync(depsFile)) return [];
    const raw = JSON.parse(readFileSync(depsFile, 'utf8'));
    return raw?.dependencies ?? [];
  } catch (err) {
    logger.error(`Failed to load plan dependencies: ${err}`);
    return [];
  }
}

/**
 * Remove dependency edges whose fromId or toId no longer exist in validPlanIds.
 * Saves the cleaned dependency list.
 */
export function cleanupOrphanDependencies(
  validPlanIds: Set<string>,
  depsFile = DEFAULT_PLAN_DEPS_FILE,
): { removed: number; deps: PlanDependency[] } {
  const deps = loadDependencies(depsFile);
  const cleaned = deps.filter(d => validPlanIds.has(d.fromId) && validPlanIds.has(d.toId));
  const removed = deps.length - cleaned.length;
  if (removed > 0) {
    saveDependencies(cleaned, depsFile);
    logger.info(`[Persistence] Cleaned up ${removed} orphan dependency edge(s)`);
  }
  return { removed, deps: cleaned };
}

/** Write the global plan sequence registry to disk. */
export function savePlanSequences(sequences: PlanSequence[], sequencesFile = DEFAULT_PLAN_SEQUENCES_FILE): void {
  try {
    writeFileSync(sequencesFile, JSON.stringify({ version: 1, sequences }, null, 2), 'utf8');
  } catch (err) {
    logger.error(`Failed to save plan sequences: ${err}`);
  }
}

/** Load the global plan sequence registry from disk. Returns [] if not found. */
export function loadPlanSequences(sequencesFile = DEFAULT_PLAN_SEQUENCES_FILE): PlanSequence[] {
  try {
    if (!existsSync(sequencesFile)) return [];
    const raw = JSON.parse(readFileSync(sequencesFile, 'utf8'));
    return Array.isArray(raw?.sequences) ? raw.sequences : [];
  } catch (err) {
    logger.error(`Failed to load plan sequences: ${err}`);
    return [];
  }
}

// ─── Scheduled tasks persistence ───────────────────────────────────────────────

/** Persist scheduled tasks to disk. */
export function saveScheduledTasks(tasks: ScheduledTask[]): void {
  try {
    const data = { tasks: tasks.map(t => ({
      ...t,
      scheduledTime: t.scheduledTime.toISOString(),
      ...(t.nextRunAt ? { nextRunAt: t.nextRunAt.toISOString() } : {}),
    }))};
    writeFileSync(SCHEDULED_TASKS_FILE, YAML.stringify(data), 'utf8');
  } catch (err) {
    logger.error(`Failed to save scheduled tasks: ${err}`);
  }
}

/** Load persisted scheduled tasks from disk. */
export function loadScheduledTasks(): ScheduledTask[] {
  try {
    if (!existsSync(SCHEDULED_TASKS_FILE)) return [];
    const content = readFileSync(SCHEDULED_TASKS_FILE, 'utf8');
    const parsed = YAML.parse(content) as { tasks?: Array<Omit<ScheduledTask, 'scheduledTime'> & { scheduledTime: string }> };
    return parsed?.tasks?.map(t => ({
      ...t,
      scheduledTime: new Date(t.scheduledTime),
      ...(typeof (t as any).nextRunAt === 'string' ? { nextRunAt: new Date((t as any).nextRunAt) } : {}),
    })) ?? [];
  } catch (err) {
    logger.error(`Failed to load scheduled tasks: ${err}`);
    return [];
  }
}
