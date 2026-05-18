import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SkillReview, SkillSource, SkillStats } from '../types/skill.js';
import { atomicWriteFileSync, isAnyString, isNumber, isRecord } from './persistence-utils.js';

interface PersistedSkillAnalytics {
  useCount: number;
  reviews: SkillReview[];
}

type SkillAnalyticsFile = Record<string, PersistedSkillAnalytics>;

export class SkillAnalyticsManager {
  constructor(private readonly filePath: string) {}

  incrementUseCount(skillId: string): number {
    const data = this.load();
    const entry = ensureEntry(data, skillId);
    entry.useCount += 1;
    this.save(data);
    return entry.useCount;
  }

  addReview(skillId: string, review: SkillReview, options: { source?: SkillSource } = {}): SkillStats {
    if (options.source === 'system') {
      throw new Error('System skills cannot receive feedback');
    }
    if (!Number.isInteger(review.stars) || review.stars < 1 || review.stars > 5) {
      throw new Error('Review stars must be between 1 and 5');
    }

    const data = this.load();
    const entry = ensureEntry(data, skillId);
    entry.reviews.push({
      stars: review.stars,
      summary: review.summary,
      ...(review.improvement ? { improvement: review.improvement } : {}),
      cliName: review.cliName,
      cliType: review.cliType,
      timestamp: review.timestamp,
    });
    this.save(data);
    return toStats(entry);
  }

  getStats(skillId: string): SkillStats {
    const data = this.load();
    return toStats(data[skillId] ?? { useCount: 0, reviews: [] });
  }

  clearReviews(skillId: string): SkillStats {
    const data = this.load();
    const entry = ensureEntry(data, skillId);
    entry.reviews = [];
    this.save(data);
    return toStats(entry);
  }

  resetUseCount(skillId: string): SkillStats {
    const data = this.load();
    const entry = ensureEntry(data, skillId);
    entry.useCount = 0;
    this.save(data);
    return toStats(entry);
  }

  resetAllCounts(): void {
    const data = this.load();
    for (const entry of Object.values(data)) {
      entry.useCount = 0;
    }
    this.save(data);
  }

  private load(): SkillAnalyticsFile {
    mkdirSync(dirname(this.filePath), { recursive: true });
    if (!existsSync(this.filePath)) {
      atomicWriteFileSync(this.filePath, '{}\n');
      return {};
    }

    const parsed = JSON.parse(readFileSync(this.filePath, 'utf8') || '{}') as unknown;
    if (!isRecord(parsed)) {
      throw new Error('Invalid skill-analytics.json: expected an object');
    }

    const normalized: SkillAnalyticsFile = {};
    for (const [skillId, value] of Object.entries(parsed)) {
      if (!isRecord(value)) continue;
      normalized[skillId] = {
        useCount: isNumber(value.useCount) && value.useCount >= 0 ? Math.floor(value.useCount) : 0,
        reviews: Array.isArray(value.reviews) ? value.reviews.map(normalizeReview).filter((r): r is SkillReview => r !== null) : [],
      };
    }
    return normalized;
  }

  private save(data: SkillAnalyticsFile): void {
    atomicWriteFileSync(this.filePath, `${JSON.stringify(data, null, 2)}\n`);
  }
}

function ensureEntry(data: SkillAnalyticsFile, skillId: string): PersistedSkillAnalytics {
  data[skillId] ??= { useCount: 0, reviews: [] };
  return data[skillId];
}

function toStats(entry: PersistedSkillAnalytics): SkillStats {
  const reviewCount = entry.reviews.length;
  const avgRating = reviewCount === 0
    ? 0
    : Number((entry.reviews.reduce((sum, review) => sum + review.stars, 0) / reviewCount).toFixed(1));
  return {
    useCount: entry.useCount,
    avgRating,
    reviewCount,
    reviews: entry.reviews.map((review) => ({ ...review })),
  };
}

function normalizeReview(value: unknown): SkillReview | null {
  if (!isRecord(value)) return null;
  if (!isNumber(value.stars) || value.stars < 1 || value.stars > 5) return null;
  if (!isAnyString(value.summary) || !isAnyString(value.cliName) || !isAnyString(value.cliType) || !isAnyString(value.timestamp)) {
    return null;
  }
  return {
    stars: Math.round(value.stars),
    summary: value.summary,
    ...(isAnyString(value.improvement) && value.improvement ? { improvement: value.improvement } : {}),
    cliName: value.cliName,
    cliType: value.cliType,
    timestamp: value.timestamp,
  };
}
