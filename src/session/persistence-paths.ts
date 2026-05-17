import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfigDir } from '../utils/app-paths.js';

const persistenceDirname = dirname(fileURLToPath(import.meta.url));
const configDir = getConfigDir(persistenceDirname);

export const SESSIONS_FILE = join(configDir, 'sessions.yaml');
export const DRAFTS_FILE = join(configDir, 'drafts.yaml');
export const PLANS_FILE = join(configDir, 'plans.yaml');
export const DEFAULT_PLANS_DIR = join(configDir, 'plans');
export const DEFAULT_PLAN_DEPS_FILE = join(configDir, 'plan-dependencies.json');
export const DEFAULT_PLAN_SEQUENCES_FILE = join(configDir, 'plan-sequences.json');
export const DEFAULT_PROJECTS_FILE = join(configDir, 'projects.json');
export const DEFAULT_PLAN_CONTEXTS_FILE = join(configDir, 'plan-contexts.json');
export const DEFAULT_PLAN_CONTEXT_BINDINGS_FILE = join(configDir, 'plan-context-bindings.json');
export const SCHEDULED_TASKS_FILE = join(configDir, 'scheduled-tasks.yaml');
