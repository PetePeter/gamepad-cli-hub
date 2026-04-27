/**
 * Unit tests for plan filter matching logic.
 *
 * Tests the matchesFilters() function from plan-screen.ts which filters
 * plan items by type (bug/feature/research/untyped) and status
 * (planning/ready/coding/review/blocked/done).
 */

import { describe, it, expect } from 'vitest';
import type { PlanItem, PlanStatus, PlanType } from '../src/types/plan.js';

/**
 * Replicate the matchesFilters logic from plan-screen.ts for testing.
 */
function matchesFilters(item: PlanItem, filters: {
  types: { bug: boolean; feature: boolean; research: boolean; untyped: boolean };
  statuses: { planning: boolean; ready: boolean; coding: boolean; review: boolean; blocked: boolean; done: boolean };
}): boolean {
  const typeMatch = !item.type ? filters.types.untyped : filters.types[item.type] ?? true;
  if (!typeMatch) return false;

  const statusMatch = filters.statuses[item.status] ?? false;
  return statusMatch;
}

function createItem(
  id: string,
  type?: PlanType,
  status: PlanStatus = 'ready',
): PlanItem {
  return {
    id,
    dirPath: '/test',
    title: id,
    description: '',
    status,
    type,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe('plan filter matching logic', () => {
  describe('type filtering', () => {
    const allTypes = {
      bug: true,
      feature: true,
      research: true,
      untyped: true,
    };

    it('all types selected → all items pass', () => {
      const filters = {
        types: allTypes,
        statuses: { planning: true, ready: true, coding: true, review: true, blocked: true, done: true },
      };

      expect(matchesFilters(createItem('bug-item', 'bug'), filters)).toBe(true);
      expect(matchesFilters(createItem('feature-item', 'feature'), filters)).toBe(true);
      expect(matchesFilters(createItem('research-item', 'research'), filters)).toBe(true);
      expect(matchesFilters(createItem('untyped-item', undefined), filters)).toBe(true);
    });

    it('only bug type selected → only bug items pass', () => {
      const filters = {
        types: { bug: true, feature: false, research: false, untyped: false },
        statuses: { planning: true, ready: true, coding: true, review: true, blocked: true, done: true },
      };

      expect(matchesFilters(createItem('bug-item', 'bug'), filters)).toBe(true);
      expect(matchesFilters(createItem('feature-item', 'feature'), filters)).toBe(false);
      expect(matchesFilters(createItem('research-item', 'research'), filters)).toBe(false);
      expect(matchesFilters(createItem('untyped-item', undefined), filters)).toBe(false);
    });

    it('only feature type selected → only feature items pass', () => {
      const filters = {
        types: { bug: false, feature: true, research: false, untyped: false },
        statuses: { planning: true, ready: true, coding: true, review: true, blocked: true, done: true },
      };

      expect(matchesFilters(createItem('bug-item', 'bug'), filters)).toBe(false);
      expect(matchesFilters(createItem('feature-item', 'feature'), filters)).toBe(true);
      expect(matchesFilters(createItem('research-item', 'research'), filters)).toBe(false);
      expect(matchesFilters(createItem('untyped-item', undefined), filters)).toBe(false);
    });

    it('only research type selected → only research items pass', () => {
      const filters = {
        types: { bug: false, feature: false, research: true, untyped: false },
        statuses: { planning: true, ready: true, coding: true, review: true, blocked: true, done: true },
      };

      expect(matchesFilters(createItem('bug-item', 'bug'), filters)).toBe(false);
      expect(matchesFilters(createItem('feature-item', 'feature'), filters)).toBe(false);
      expect(matchesFilters(createItem('research-item', 'research'), filters)).toBe(true);
      expect(matchesFilters(createItem('untyped-item', undefined), filters)).toBe(false);
    });

    it('only untyped selected → only items with no type pass', () => {
      const filters = {
        types: { bug: false, feature: false, research: false, untyped: true },
        statuses: { planning: true, ready: true, coding: true, review: true, blocked: true, done: true },
      };

      expect(matchesFilters(createItem('bug-item', 'bug'), filters)).toBe(false);
      expect(matchesFilters(createItem('feature-item', 'feature'), filters)).toBe(false);
      expect(matchesFilters(createItem('research-item', 'research'), filters)).toBe(false);
      expect(matchesFilters(createItem('untyped-item', undefined), filters)).toBe(true);
    });

    it('edge case: no types selected → all items filtered', () => {
      const filters = {
        types: { bug: false, feature: false, research: false, untyped: false },
        statuses: { planning: true, ready: true, coding: true, review: true, blocked: true, done: true },
      };

      expect(matchesFilters(createItem('bug-item', 'bug'), filters)).toBe(false);
      expect(matchesFilters(createItem('feature-item', 'feature'), filters)).toBe(false);
      expect(matchesFilters(createItem('research-item', 'research'), filters)).toBe(false);
      expect(matchesFilters(createItem('untyped-item', undefined), filters)).toBe(false);
    });

    it('combined type selection (bug + feature)', () => {
      const filters = {
        types: { bug: true, feature: true, research: false, untyped: false },
        statuses: { planning: true, ready: true, coding: true, review: true, blocked: true, done: true },
      };

      expect(matchesFilters(createItem('bug-item', 'bug'), filters)).toBe(true);
      expect(matchesFilters(createItem('feature-item', 'feature'), filters)).toBe(true);
      expect(matchesFilters(createItem('research-item', 'research'), filters)).toBe(false);
      expect(matchesFilters(createItem('untyped-item', undefined), filters)).toBe(false);
    });
  });

  describe('status filtering', () => {
    const allStatuses = {
      planning: true,
      ready: true,
      coding: true,
      review: true,
      blocked: true,
      done: true,
    };
    const allTypes = {
      bug: true,
      feature: true,
      research: true,
      untyped: true,
    };

    it('all statuses selected → all items pass', () => {
      const filters = { types: allTypes, statuses: allStatuses };

      expect(matchesFilters(createItem('1', 'bug', 'planning'), filters)).toBe(true);
      expect(matchesFilters(createItem('2', 'feature', 'ready'), filters)).toBe(true);
      expect(matchesFilters(createItem('3', 'research', 'coding'), filters)).toBe(true);
      expect(matchesFilters(createItem('4', 'bug', 'review'), filters)).toBe(true);
      expect(matchesFilters(createItem('5', 'feature', 'blocked'), filters)).toBe(true);
      expect(matchesFilters(createItem('6', 'research', 'done'), filters)).toBe(true);
    });

    it('only planning status → only planning items pass', () => {
      const filters = {
        types: allTypes,
        statuses: { planning: true, ready: false, coding: false, review: false, blocked: false, done: false },
      };

      expect(matchesFilters(createItem('1', 'bug', 'planning'), filters)).toBe(true);
      expect(matchesFilters(createItem('2', 'feature', 'ready'), filters)).toBe(false);
      expect(matchesFilters(createItem('3', 'research', 'coding'), filters)).toBe(false);
      expect(matchesFilters(createItem('4', 'bug', 'review'), filters)).toBe(false);
      expect(matchesFilters(createItem('5', 'feature', 'blocked'), filters)).toBe(false);
      expect(matchesFilters(createItem('6', 'research', 'done'), filters)).toBe(false);
    });

    it('only ready status → only ready items pass', () => {
      const filters = {
        types: allTypes,
        statuses: { planning: false, ready: true, coding: false, review: false, blocked: false, done: false },
      };

      expect(matchesFilters(createItem('1', 'bug', 'planning'), filters)).toBe(false);
      expect(matchesFilters(createItem('2', 'feature', 'ready'), filters)).toBe(true);
      expect(matchesFilters(createItem('3', 'research', 'coding'), filters)).toBe(false);
      expect(matchesFilters(createItem('4', 'bug', 'review'), filters)).toBe(false);
      expect(matchesFilters(createItem('5', 'feature', 'blocked'), filters)).toBe(false);
      expect(matchesFilters(createItem('6', 'research', 'done'), filters)).toBe(false);
    });

    it('only coding status → only coding items pass', () => {
      const filters = {
        types: allTypes,
        statuses: { planning: false, ready: false, coding: true, review: false, blocked: false, done: false },
      };

      expect(matchesFilters(createItem('1', 'bug', 'planning'), filters)).toBe(false);
      expect(matchesFilters(createItem('2', 'feature', 'ready'), filters)).toBe(false);
      expect(matchesFilters(createItem('3', 'research', 'coding'), filters)).toBe(true);
      expect(matchesFilters(createItem('4', 'bug', 'review'), filters)).toBe(false);
      expect(matchesFilters(createItem('5', 'feature', 'blocked'), filters)).toBe(false);
      expect(matchesFilters(createItem('6', 'research', 'done'), filters)).toBe(false);
    });

    it('only review status → only review items pass', () => {
      const filters = {
        types: allTypes,
        statuses: { planning: false, ready: false, coding: false, review: true, blocked: false, done: false },
      };

      expect(matchesFilters(createItem('1', 'bug', 'planning'), filters)).toBe(false);
      expect(matchesFilters(createItem('2', 'feature', 'ready'), filters)).toBe(false);
      expect(matchesFilters(createItem('3', 'research', 'coding'), filters)).toBe(false);
      expect(matchesFilters(createItem('4', 'bug', 'review'), filters)).toBe(true);
      expect(matchesFilters(createItem('5', 'feature', 'blocked'), filters)).toBe(false);
      expect(matchesFilters(createItem('6', 'research', 'done'), filters)).toBe(false);
    });

    it('only blocked status → only blocked items pass', () => {
      const filters = {
        types: allTypes,
        statuses: { planning: false, ready: false, coding: false, review: false, blocked: true, done: false },
      };

      expect(matchesFilters(createItem('1', 'bug', 'planning'), filters)).toBe(false);
      expect(matchesFilters(createItem('2', 'feature', 'ready'), filters)).toBe(false);
      expect(matchesFilters(createItem('3', 'research', 'coding'), filters)).toBe(false);
      expect(matchesFilters(createItem('4', 'bug', 'review'), filters)).toBe(false);
      expect(matchesFilters(createItem('5', 'feature', 'blocked'), filters)).toBe(true);
      expect(matchesFilters(createItem('6', 'research', 'done'), filters)).toBe(false);
    });

    it('only done status → only done items pass', () => {
      const filters = {
        types: allTypes,
        statuses: { planning: false, ready: false, coding: false, review: false, blocked: false, done: true },
      };

      expect(matchesFilters(createItem('1', 'bug', 'planning'), filters)).toBe(false);
      expect(matchesFilters(createItem('2', 'feature', 'ready'), filters)).toBe(false);
      expect(matchesFilters(createItem('3', 'research', 'coding'), filters)).toBe(false);
      expect(matchesFilters(createItem('4', 'bug', 'review'), filters)).toBe(false);
      expect(matchesFilters(createItem('5', 'feature', 'blocked'), filters)).toBe(false);
      expect(matchesFilters(createItem('6', 'research', 'done'), filters)).toBe(true);
    });

    it('edge case: no statuses selected → all items filtered', () => {
      const filters = {
        types: allTypes,
        statuses: { planning: false, ready: false, coding: false, review: false, blocked: false, done: false },
      };

      expect(matchesFilters(createItem('1', 'bug', 'planning'), filters)).toBe(false);
      expect(matchesFilters(createItem('2', 'feature', 'ready'), filters)).toBe(false);
      expect(matchesFilters(createItem('3', 'research', 'coding'), filters)).toBe(false);
      expect(matchesFilters(createItem('4', 'bug', 'review'), filters)).toBe(false);
      expect(matchesFilters(createItem('5', 'feature', 'blocked'), filters)).toBe(false);
      expect(matchesFilters(createItem('6', 'research', 'done'), filters)).toBe(false);
    });
  });

  describe('combined type and status filtering', () => {
    const allTypes = {
      bug: true,
      feature: true,
      research: true,
      untyped: true,
    };
    const allStatuses = {
      planning: true,
      ready: true,
      coding: true,
      review: true,
      blocked: true,
      done: true,
    };

    it('bug type + active status (coding/review/blocked) → bug items with active status only', () => {
      const filters = {
        types: { bug: true, feature: false, research: false, untyped: false },
        statuses: { planning: false, ready: false, coding: true, review: true, blocked: true, done: false },
      };

      expect(matchesFilters(createItem('bug-coding', 'bug', 'coding'), filters)).toBe(true);
      expect(matchesFilters(createItem('bug-review', 'bug', 'review'), filters)).toBe(true);
      expect(matchesFilters(createItem('bug-blocked', 'bug', 'blocked'), filters)).toBe(true);
      expect(matchesFilters(createItem('bug-planning', 'bug', 'planning'), filters)).toBe(false);
      expect(matchesFilters(createItem('bug-ready', 'bug', 'ready'), filters)).toBe(false);
      expect(matchesFilters(createItem('bug-done', 'bug', 'done'), filters)).toBe(false);

      // Feature items should not pass type filter
      expect(matchesFilters(createItem('feature-coding', 'feature', 'coding'), filters)).toBe(false);
    });

    it('feature type + planning status → feature items in planning only', () => {
      const filters = {
        types: { bug: false, feature: true, research: false, untyped: false },
        statuses: { planning: true, ready: true, coding: false, review: false, blocked: false, done: false },
      };

      expect(matchesFilters(createItem('feature-planning', 'feature', 'planning'), filters)).toBe(true);
      expect(matchesFilters(createItem('feature-ready', 'feature', 'ready'), filters)).toBe(true);
      expect(matchesFilters(createItem('feature-coding', 'feature', 'coding'), filters)).toBe(false);

      // Bug items should not pass type filter
      expect(matchesFilters(createItem('bug-planning', 'bug', 'planning'), filters)).toBe(false);
    });

    it('research type + terminal status (done) → research items that are done only', () => {
      const filters = {
        types: { bug: false, feature: false, research: true, untyped: false },
        statuses: { planning: false, ready: false, coding: false, review: false, blocked: false, done: true },
      };

      expect(matchesFilters(createItem('research-done', 'research', 'done'), filters)).toBe(true);
      expect(matchesFilters(createItem('research-coding', 'research', 'coding'), filters)).toBe(false);

      // Untyped items should not pass type filter
      expect(matchesFilters(createItem('untyped-done', undefined, 'done'), filters)).toBe(false);
    });

    it('untyped + coding → untyped items in coding status only', () => {
      const filters = {
        types: { bug: false, feature: false, research: false, untyped: true },
        statuses: { planning: false, ready: false, coding: true, review: false, blocked: false, done: false },
      };

      expect(matchesFilters(createItem('untyped-coding', undefined, 'coding'), filters)).toBe(true);
      expect(matchesFilters(createItem('untyped-done', undefined, 'done'), filters)).toBe(false);

      // Typed items should not pass
      expect(matchesFilters(createItem('bug-coding', 'bug', 'coding'), filters)).toBe(false);
    });
  });

  describe('active/terminal/planning status groups', () => {
    const allTypes = {
      bug: true,
      feature: true,
      research: true,
      untyped: true,
    };

    it('active status group (coding + review + blocked)', () => {
      const activeFilters = {
        types: allTypes,
        statuses: { planning: false, ready: false, coding: true, review: true, blocked: true, done: false },
      };

      expect(matchesFilters(createItem('active-coding', 'bug', 'coding'), activeFilters)).toBe(true);
      expect(matchesFilters(createItem('active-review', 'feature', 'review'), activeFilters)).toBe(true);
      expect(matchesFilters(createItem('active-blocked', 'research', 'blocked'), activeFilters)).toBe(true);
      expect(matchesFilters(createItem('not-ready', 'bug', 'ready'), activeFilters)).toBe(false);
      expect(matchesFilters(createItem('not-planning', 'bug', 'planning'), activeFilters)).toBe(false);
      expect(matchesFilters(createItem('not-done', 'bug', 'done'), activeFilters)).toBe(false);
    });

    it('terminal status group (done only)', () => {
      const terminalFilters = {
        types: allTypes,
        statuses: { planning: false, ready: false, coding: false, review: false, blocked: false, done: true },
      };

      expect(matchesFilters(createItem('terminal-done', 'bug', 'done'), terminalFilters)).toBe(true);
      expect(matchesFilters(createItem('not-terminal', 'feature', 'coding'), terminalFilters)).toBe(false);
      expect(matchesFilters(createItem('not-terminal', 'research', 'ready'), terminalFilters)).toBe(false);
    });

    it('planning status group (planning + ready)', () => {
      const planningFilters = {
        types: allTypes,
        statuses: { planning: true, ready: true, coding: false, review: false, blocked: false, done: false },
      };

      expect(matchesFilters(createItem('planning-stage', 'bug', 'planning'), planningFilters)).toBe(true);
      expect(matchesFilters(createItem('ready-stage', 'feature', 'ready'), planningFilters)).toBe(true);
      expect(matchesFilters(createItem('not-planning', 'research', 'coding'), planningFilters)).toBe(false);
      expect(matchesFilters(createItem('not-planning', 'bug', 'review'), planningFilters)).toBe(false);
    });
  });
});
