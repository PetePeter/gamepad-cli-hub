import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { SkillAnalyticsManager } from '../src/session/skill-analytics-manager.js';

let tempDir = '';

function makeManager(): SkillAnalyticsManager {
  tempDir = mkdtempSync(join(tmpdir(), 'helm-skill-analytics-'));
  return new SkillAnalyticsManager(join(tempDir, 'skill-analytics.json'));
}

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = '';
});

describe('SkillAnalyticsManager', () => {
  it('increments use count and persists it', () => {
    const manager = makeManager();

    expect(manager.incrementUseCount('skill-1')).toBe(1);
    expect(manager.incrementUseCount('skill-1')).toBe(2);

    const reloaded = new SkillAnalyticsManager(join(tempDir, 'skill-analytics.json'));
    expect(reloaded.getStats('skill-1').useCount).toBe(2);
  });

  it('stores reviews with cli attribution and computes averages', () => {
    const manager = makeManager();

    manager.addReview('skill-1', {
      stars: 5,
      summary: 'Useful framing',
      cliName: 'Claude Code',
      cliType: 'claude-code',
      timestamp: '2026-05-18T01:00:00.000Z',
    });
    manager.addReview('skill-1', {
      stars: 3,
      summary: 'Could be shorter',
      improvement: 'Tighten examples',
      cliName: 'Codex',
      cliType: 'codex',
      timestamp: '2026-05-18T02:00:00.000Z',
    });

    expect(manager.getStats('skill-1')).toEqual({
      useCount: 0,
      avgRating: 4,
      reviewCount: 2,
      reviews: [
        {
          stars: 5,
          summary: 'Useful framing',
          cliName: 'Claude Code',
          cliType: 'claude-code',
          timestamp: '2026-05-18T01:00:00.000Z',
        },
        {
          stars: 3,
          summary: 'Could be shorter',
          improvement: 'Tighten examples',
          cliName: 'Codex',
          cliType: 'codex',
          timestamp: '2026-05-18T02:00:00.000Z',
        },
      ],
    });
  });

  it('validates review stars from 1 to 5', () => {
    const manager = makeManager();
    const review = {
      stars: 0,
      summary: 'Nope',
      cliName: 'Codex',
      cliType: 'codex',
      timestamp: '2026-05-18T01:00:00.000Z',
    };

    expect(() => manager.addReview('skill-1', review)).toThrow('stars must be between 1 and 5');
    expect(() => manager.addReview('skill-1', { ...review, stars: 6 })).toThrow('stars must be between 1 and 5');
  });

  it('rejects feedback for system skills', () => {
    const manager = makeManager();

    expect(() => manager.addReview('sys-agent-plan', {
      stars: 5,
      summary: 'Good',
      cliName: 'Codex',
      cliType: 'codex',
      timestamp: '2026-05-18T01:00:00.000Z',
    }, { source: 'system' })).toThrow('System skills cannot receive feedback');
  });

  it('clears reviews and resets counts independently', () => {
    const manager = makeManager();
    manager.incrementUseCount('skill-1');
    manager.incrementUseCount('skill-2');
    manager.addReview('skill-1', {
      stars: 4,
      summary: 'Helpful',
      cliName: 'Codex',
      cliType: 'codex',
      timestamp: '2026-05-18T01:00:00.000Z',
    });

    manager.clearReviews('skill-1');
    expect(manager.getStats('skill-1').reviewCount).toBe(0);
    expect(manager.getStats('skill-1').useCount).toBe(1);

    manager.resetUseCount('skill-1');
    expect(manager.getStats('skill-1').useCount).toBe(0);
    expect(manager.getStats('skill-2').useCount).toBe(1);

    manager.resetAllCounts();
    expect(manager.getStats('skill-2').useCount).toBe(0);
  });

  it('seeds an empty analytics file when missing', () => {
    const manager = makeManager();

    expect(manager.getStats('skill-1')).toEqual({
      useCount: 0,
      avgRating: 0,
      reviewCount: 0,
      reviews: [],
    });
    expect(JSON.parse(readFileSync(join(tempDir, 'skill-analytics.json'), 'utf8'))).toEqual({});
  });
});
