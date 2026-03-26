import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as YAML from 'yaml';
import { logger } from '../utils/logger.js';
import type { SessionInfo } from '../types/session.js';

const SESSIONS_FILE = join(process.cwd(), 'config', 'sessions.yaml');

/** Persist current sessions to disk so they survive restarts. */
export function saveSessions(sessions: SessionInfo[]): void {
  try {
    const data = { sessions: sessions.map(s => ({
      id: s.id,
      name: s.name,
      cliType: s.cliType,
      processId: s.processId,
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
