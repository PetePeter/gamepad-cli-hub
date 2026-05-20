/**
 * recap-formatter — formats PTY block messages for the completion recap gate.
 * Three outcomes: never-read (Gate 1), stale (Gate 2), pass (Gate 3).
 */

import type { PlanItem } from '../types/plan.js';

export type RecapOutcome = 'never-read' | 'stale' | 'pass';
export interface StaleStats { minutesAgo: number; writesSince: number }

const DIVIDER = '─'.repeat(48);

/**
 * Produce the PTY block for the given recap outcome.
 * @param item   The plan item being completed.
 * @param outcome Gate outcome.
 * @param stats  Required when outcome === 'stale'.
 */
export function formatPlanRecap(item: PlanItem, outcome: RecapOutcome, stats?: StaleStats): string {
  const id = item.humanId ?? item.id;

  switch (outcome) {
    case 'never-read':
      return [
        DIVIDER,
        `❌ PLAN COMPLETION BLOCKED — ${id}`,
        DIVIDER,
        'You have not read this plan in this session.',
        '',
        'Action required:',
        `  Call plan_get with id "${item.id}" to read the plan,`,
        '  verify your work against its criteria, then call plan_complete again.',
        DIVIDER,
        '',
      ].join('\n');

    case 'stale': {
      const { minutesAgo = 0, writesSince = 0 } = stats ?? {};
      return [
        DIVIDER,
        `⚠️  STALE READ — ${id}`,
        DIVIDER,
        `You read this plan ${minutesAgo} minutes ago and have made`,
        `${writesSince} PTY writes since then.`,
        '',
        'Action required:',
        '  Re-read the plan with plan_get, verify your work',
        '  against its criteria, then call plan_complete again.',
        DIVIDER,
        '',
      ].join('\n');
    }

    case 'pass': {
      const criteria = extractCriteria(item.description);
      if (criteria.length > 0) {
        const lines = criteria.map(line => `  ✓ ${line}`);
        return [
          DIVIDER,
          `🔁 COMPLETION RECAP — ${id}`,
          DIVIDER,
          `Title:  ${item.title}`,
          '',
          'Acceptance Criteria:',
          ...lines,
          '',
          'Please confirm each criterion is met before continuing.',
          DIVIDER,
          '',
        ].join('\n');
      }
      // No sections found
      return [
        DIVIDER,
        `🔁 COMPLETION RECAP — ${id}`,
        DIVIDER,
        `Title:  ${item.title}`,
        '',
        'No Acceptance Criteria or Done Statement sections found in this plan.',
        '',
        'Action:',
        '  Re-read the plan description (plan_get) and manually verify',
        '  your work covers what was asked before continuing.',
        DIVIDER,
        '',
      ].join('\n');
    }
  }
}

/**
 * Extract non-empty lines under ## Acceptance Criteria or ## Done Statement headings.
 * Returns an empty array if neither section is found.
 */
function extractCriteria(description: string): string[] {
  if (!description) return [];

  const lines = description.split('\n');
  const result: string[] = [];
  let inSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^##\s+(Acceptance Criteria|Done Statement)\s*$/.test(trimmed)) {
      inSection = true;
      continue;
    }
    // Stop at next heading
    if (/^#/.test(trimmed) && inSection) {
      inSection = false;
      continue;
    }
    if (inSection && trimmed.length > 0) {
      // Strip leading list markers (-, *, checkbox [ ] / [x])
      result.push(trimmed.replace(/^[-*]\s+(\[[ xX]\]\s+)?/, ''));
    }
  }

  return result;
}
