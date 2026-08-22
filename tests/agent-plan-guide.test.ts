import { describe, it, expect } from 'vitest';
import { buildAgentPlanGuide, REQUIRED_PLAN_DESCRIPTION_SECTIONS } from '../src/mcp/guides/agent-plan-guide';

describe('buildAgentPlanGuide', () => {
  const guide = buildAgentPlanGuide();

  it('returns a string, not a JSON object', () => {
    expect(typeof guide).toBe('string');
    expect(guide.startsWith('{')).toBe(false);
  });

  it('documents QUESTION: plan workflow', () => {
    expect(guide).toContain('QUESTION:');
    expect(guide).toContain('plan_nextplan_link');
  });

  it('includes all required description sections', () => {
    for (const section of REQUIRED_PLAN_DESCRIPTION_SECTIONS) {
      expect(guide).toContain(section);
    }
  });
});
