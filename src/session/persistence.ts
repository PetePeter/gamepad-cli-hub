import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as YAML from 'yaml';
import { logger } from '../utils/logger.js';
import { getConfigDir } from '../utils/app-paths.js';
import type { SessionInfo, DraftPrompt } from '../types/session.js';
import type { DirectoryPlan } from '../types/plan.js';

const __persistence_dirname = dirname(fileURLToPath(import.meta.url));
const SESSIONS_FILE = join(getConfigDir(__persistence_dirname), 'sessions.yaml');
const DRAFTS_FILE = join(getConfigDir(__persistence_dirname), 'drafts.yaml');
const PLANS_FILE = join(getConfigDir(__persistence_dirname), 'plans.yaml');

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
      ...(s.topicId != null ? { topicId: s.topicId } : {}),
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

/** Persist directory plans to disk. */
export function savePlans(plans: Record<string, DirectoryPlan>): void {
  try {
    writeFileSync(PLANS_FILE, YAML.stringify({ plans }), 'utf8');
  } catch (err) {
    logger.error(`Failed to save plans: ${err}`);
  }
}

/** Load persisted directory plans from disk. */
export function loadPlans(): Record<string, DirectoryPlan> {
  try {
    if (!existsSync(PLANS_FILE)) return {};
    const content = readFileSync(PLANS_FILE, 'utf8');
    const parsed = YAML.parse(content) as { plans?: Record<string, DirectoryPlan> };
    return parsed?.plans ?? {};
  } catch (err) {
    logger.error(`Failed to load plans: ${err}`);
    return {};
  }
}
