import { describe, it, expect } from 'vitest';
import { formatPlanRecap } from '../recap-formatter';
import type { PlanItem } from '../../types/plan';

function makePlan(overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id: 'uuid-1234',
    humanId: 'P-0042',
    dirPath: '/some/dir',
    title: 'My Task',
    description: '',
    status: 'coding',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

const DIVIDER = '─'.repeat(48);

describe('formatPlanRecap — never-read (Gate 1)', () => {
  it('produces Gate 1 block containing the plan humanId', () => {
    const out = formatPlanRecap(makePlan(), 'never-read');
    expect(out).toContain('❌ PLAN COMPLETION BLOCKED');
    expect(out).toContain('P-0042');
    expect(out).toContain(DIVIDER);
    expect(out).toContain('You have not read this plan in this session.');
    expect(out).toContain('plan_get');
    expect(out).toContain('uuid-1234');
  });

  it('falls back to raw UUID when humanId is absent', () => {
    const out = formatPlanRecap(makePlan({ humanId: undefined }), 'never-read');
    expect(out).toContain('uuid-1234');
  });
});

describe('formatPlanRecap — stale (Gate 2)', () => {
  it('produces Gate 2 block with correct minutesAgo and writesSince values', () => {
    const out = formatPlanRecap(makePlan(), 'stale', { minutesAgo: 15, writesSince: 73 });
    expect(out).toContain('⚠️');
    expect(out).toContain('STALE READ');
    expect(out).toContain('P-0042');
    expect(out).toContain('15 minutes ago');
    expect(out).toContain('73 PTY writes');
    expect(out).toContain('Re-read');
    expect(out).toContain(DIVIDER);
  });

  it('includes plan humanId in the header', () => {
    const out = formatPlanRecap(makePlan({ humanId: 'P-0099' }), 'stale', { minutesAgo: 5, writesSince: 60 });
    expect(out).toContain('P-0099');
  });
});

describe('formatPlanRecap — pass (Gate 3)', () => {
  it('extracts lines under ## Acceptance Criteria and prefixes with ✓', () => {
    const description = `Some intro\n\n## Acceptance Criteria\n\n- All tests pass\n- Coverage > 80%\n\n## Other\n\nStuff`;
    const out = formatPlanRecap(makePlan({ description }), 'pass');
    expect(out).toContain('🔁 COMPLETION RECAP');
    expect(out).toContain('P-0042');
    expect(out).toContain('Acceptance Criteria:');
    expect(out).toContain('  ✓ All tests pass');
    expect(out).toContain('  ✓ Coverage > 80%');
    expect(out).toContain('Please confirm each criterion is met');
    // Should NOT contain "Other" section content
    expect(out).not.toContain('Stuff');
  });

  it('extracts lines under ## Done Statement and prefixes with ✓', () => {
    const description = `## Done Statement\n\nFeature shipped\nDocumentation updated`;
    const out = formatPlanRecap(makePlan({ description }), 'pass');
    expect(out).toContain('  ✓ Feature shipped');
    expect(out).toContain('  ✓ Documentation updated');
  });

  it('produces soft re-read block when neither section is found', () => {
    const description = `Just some description without sections.`;
    const out = formatPlanRecap(makePlan({ description }), 'pass');
    expect(out).toContain('🔁 COMPLETION RECAP');
    expect(out).toContain('P-0042');
    expect(out).toContain('No Acceptance Criteria or Done Statement sections found');
    expect(out).toContain('plan_get');
    expect(out).not.toContain('  ✓');
  });

  it('all outcomes include the plan humanId in the header', () => {
    const plan = makePlan({ humanId: 'P-0007', description: '' });
    expect(formatPlanRecap(plan, 'never-read')).toContain('P-0007');
    expect(formatPlanRecap(plan, 'stale', { minutesAgo: 1, writesSince: 51 })).toContain('P-0007');
    expect(formatPlanRecap(plan, 'pass')).toContain('P-0007');
  });

  it('includes the plan title in pass output', () => {
    const out = formatPlanRecap(makePlan({ title: 'Implement the widget' }), 'pass');
    expect(out).toContain('Title:  Implement the widget');
  });
});
