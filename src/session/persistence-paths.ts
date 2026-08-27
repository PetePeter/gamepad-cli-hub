import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfigDir } from '../utils/app-paths.js';

const persistenceDirname = dirname(fileURLToPath(import.meta.url));
const configDir = getConfigDir(persistenceDirname);

export const SESSIONS_FILE = join(configDir, 'sessions.yaml');
export const TELEGRAM_TOPICS_FILE = join(configDir, 'telegram-topics.yaml');
export const DRAFTS_FILE = join(configDir, 'drafts.yaml');
export const PLANS_FILE = join(configDir, 'plans.yaml');
export const DEFAULT_PLANS_DIR = join(configDir, 'plans');
export const DEFAULT_PLAN_DEPS_FILE = join(configDir, 'plan-dependencies.json');
export const DEFAULT_PLAN_SEQUENCES_FILE = join(configDir, 'plan-sequences.json');
export const DEFAULT_PROJECTS_FILE = join(configDir, 'projects.json');
export const DEFAULT_PLAN_CONTEXTS_FILE = join(configDir, 'plan-contexts.json');
export const DEFAULT_PLAN_CONTEXT_BINDINGS_FILE = join(configDir, 'plan-context-bindings.json');
export const SCHEDULED_TASKS_FILE = join(configDir, 'scheduled-tasks.yaml');
export const SCHEDULED_TASK_HISTORY_FILE = join(configDir, 'scheduled-task-history.yaml');
export const RECYCLE_BIN_FILE = join(configDir, 'recycle-bin.yaml');
export const RUNTIME_GROUPS_FILE = join(configDir, 'runtime-groups.yaml');
export const ARTIFACTS_FILE = join(configDir, 'artifacts.yaml');
export const PEERS_FILE = join(configDir, 'peers.yaml');
export const MACHINE_IDENTITY_FILE = join(configDir, 'machine-identity.yaml');
export const SELF_SIGNED_CERT_FILE = join(configDir, 'self-signed-cert.yaml');
export const PEER_PINS_FILE = join(configDir, 'peer-pins.yaml');
export const PEER_SECRETS_FILE = join(configDir, 'peer-secrets.yaml');
export const PEER_AUDIT_FILE = join(configDir, 'peer-audit.yaml');
export const MEMORIES_FILE = join(configDir, 'memories.json');
export const MEMORY_ATTACHMENTS_DIR = join(configDir, 'memory-attachments');

// Descriptive aliases keep callers independent of the on-disk file naming.
export const MEMORY_FILE = MEMORIES_FILE;
