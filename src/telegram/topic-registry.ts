import { existsSync, readFileSync } from 'node:fs';
import * as YAML from 'yaml';
import { TELEGRAM_TOPICS_FILE } from '../session/persistence-paths.js';
import { atomicWriteFileSync, isNumber, isRecord, isString } from '../session/persistence-utils.js';
import { logger } from '../utils/logger.js';

export interface TelegramTopicRecord {
  topicId: number;
  sessionId: string;
  sessionName: string;
  createdAt: number;
  updatedAt: number;
}

function isTopicRecord(value: unknown): value is TelegramTopicRecord {
  return isRecord(value)
    && isNumber(value.topicId)
    && isString(value.sessionId)
    && isString(value.sessionName)
    && isNumber(value.createdAt)
    && isNumber(value.updatedAt);
}

export class TelegramTopicRegistry {
  constructor(private readonly filePath = TELEGRAM_TOPICS_FILE) {}

  list(): TelegramTopicRecord[] {
    return this.load();
  }

  upsert(record: Omit<TelegramTopicRecord, 'createdAt' | 'updatedAt'>): void {
    const now = Date.now();
    const records = this.load();
    const index = records.findIndex(item => item.topicId === record.topicId);
    const next: TelegramTopicRecord = {
      ...record,
      createdAt: index >= 0 ? records[index].createdAt : now,
      updatedAt: now,
    };
    if (index >= 0) records[index] = next;
    else records.push(next);
    this.save(records);
  }

  remove(topicId: number): void {
    const records = this.load();
    const next = records.filter(record => record.topicId !== topicId);
    if (next.length !== records.length) this.save(next);
  }

  private load(): TelegramTopicRecord[] {
    try {
      if (!existsSync(this.filePath)) return [];
      const parsed = YAML.parse(readFileSync(this.filePath, 'utf8')) as unknown;
      if (!isRecord(parsed) || !Array.isArray(parsed.topics)) return [];
      return parsed.topics.filter(isTopicRecord);
    } catch (err) {
      logger.error(`[TelegramTopicRegistry] Failed to load topics: ${err}`);
      return [];
    }
  }

  private save(topics: TelegramTopicRecord[]): void {
    try {
      atomicWriteFileSync(this.filePath, YAML.stringify({ topics }));
    } catch (err) {
      logger.error(`[TelegramTopicRegistry] Failed to save topics: ${err}`);
    }
  }
}
