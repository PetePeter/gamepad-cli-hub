import { existsSync, readFileSync } from 'node:fs';
import * as YAML from 'yaml';
import { logger } from '../utils/logger.js';
import type { SessionInfo } from '../types/session.js';
import { SESSIONS_FILE } from './persistence-paths.js';
import { atomicWriteFileSync, isNumber, isRecord, isString } from './persistence-utils.js';

function serializeSession(s: SessionInfo): Record<string, unknown> {
  return {
    id: s.id,
    name: s.name,
    cliType: s.cliType,
    processId: s.processId,
    ...(s.workingDir ? { workingDir: s.workingDir } : {}),
    ...(s.projectId ? { projectId: s.projectId } : {}),
    ...(s.projectPath ? { projectPath: s.projectPath } : {}),
    ...(s.cliSessionName ? { cliSessionName: s.cliSessionName } : {}),
    ...(s.currentPlanId ? { currentPlanId: s.currentPlanId } : {}),
    ...(s.topicId != null ? { topicId: s.topicId } : {}),
    ...(s.aiagentState ? { aiagentState: s.aiagentState } : {}),
  };
}

function isSessionInfo(value: unknown): value is SessionInfo {
  if (!isRecord(value)) return false;
  return isString(value.id) && isString(value.name) && isString(value.cliType) && isNumber(value.processId);
}

export function saveSessions(sessions: SessionInfo[], sessionsFile = SESSIONS_FILE): void {
  try {
    atomicWriteFileSync(sessionsFile, YAML.stringify({ sessions: sessions.map(serializeSession) }));
  } catch (err) {
    logger.error(`Failed to save sessions: ${err}`);
  }
}

export function loadSessions(sessionsFile = SESSIONS_FILE): SessionInfo[] {
  try {
    if (!existsSync(sessionsFile)) return [];
    const parsed = YAML.parse(readFileSync(sessionsFile, 'utf8')) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.sessions)) return [];
    return parsed.sessions.filter(isSessionInfo);
  } catch (err) {
    logger.error(`Failed to load sessions: ${err}`);
    return [];
  }
}

export function clearPersistedSessions(sessionsFile = SESSIONS_FILE): void {
  try {
    if (existsSync(sessionsFile)) {
      atomicWriteFileSync(sessionsFile, YAML.stringify({ sessions: [] }));
    }
  } catch (err) {
    logger.error(`Failed to clear persisted sessions: ${err}`);
  }
}
