import { existsSync, readFileSync } from 'node:fs';
import * as YAML from 'yaml';
import { logger } from '../utils/logger.js';
import type { DraftPrompt } from '../types/session.js';
import { DRAFTS_FILE } from './persistence-paths.js';
import { atomicWriteFileSync, isNumber, isRecord, isString } from './persistence-utils.js';

function isDraftPrompt(value: unknown): value is DraftPrompt {
  if (!isRecord(value)) return false;
  return isString(value.id)
    && isString(value.sessionId)
    && typeof value.label === 'string'
    && typeof value.text === 'string'
    && isNumber(value.createdAt);
}

function sanitizeDrafts(value: unknown): Record<string, DraftPrompt[]> {
  if (!isRecord(value)) return {};
  const result: Record<string, DraftPrompt[]> = {};
  for (const [sessionId, drafts] of Object.entries(value)) {
    if (!Array.isArray(drafts)) continue;
    const validDrafts = drafts.filter(isDraftPrompt);
    if (validDrafts.length > 0) result[sessionId] = validDrafts;
  }
  return result;
}

export function saveDrafts(drafts: Record<string, DraftPrompt[]>): void {
  try {
    atomicWriteFileSync(DRAFTS_FILE, YAML.stringify({ drafts }));
  } catch (err) {
    logger.error(`Failed to save drafts: ${err}`);
  }
}

export function loadDrafts(): Record<string, DraftPrompt[]> {
  try {
    if (!existsSync(DRAFTS_FILE)) return {};
    const parsed = YAML.parse(readFileSync(DRAFTS_FILE, 'utf8')) as unknown;
    return isRecord(parsed) ? sanitizeDrafts(parsed.drafts) : {};
  } catch (err) {
    logger.error(`Failed to load drafts: ${err}`);
    return {};
  }
}
