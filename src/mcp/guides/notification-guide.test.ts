import { describe, it, expect } from 'vitest';
import { buildNotificationGuide } from './notification-guide';

describe('buildNotificationGuide', () => {
  const guide = buildNotificationGuide();

  it('should include preferred_tool as notify_user', () => {
    expect(guide.preferred_tool).toBe('notify_user');
  });

  it('should have when_to_notify covering completion, blocked, and error', () => {
    const combined = guide.when_to_notify.join(' ');
    expect(combined).toContain('completes');
    expect(combined).toContain('blocked');
    expect(combined).toContain('error');
  });

  it('should have examples with concrete title strings', () => {
    expect(guide.examples.length).toBeGreaterThanOrEqual(3);
    for (const ex of guide.examples) {
      expect(typeof ex.title).toBe('string');
      expect(ex.title.length).toBeGreaterThan(0);
      expect(typeof ex.content).toBe('string');
      expect(ex.content.length).toBeGreaterThan(0);
    }
  });

  it('should have a completion example with Work complete title', () => {
    const completion = guide.examples.find(
      (e) => e.title && e.title.toLowerCase().includes('work complete'),
    );
    expect(completion).toBeDefined();
    expect(completion!.content).toBeDefined();
  });

  it('should have an error example with Error title', () => {
    const error = guide.examples.find(
      (e) => e.title && e.title.toLowerCase().includes('error'),
    );
    expect(error).toBeDefined();
    expect(error!.content).toBeDefined();
  });

  it('should have routing_outcomes with expected keys', () => {
    expect(guide.routing_outcomes).toHaveProperty('toast');
    expect(guide.routing_outcomes).toHaveProperty('taskbar_flash');
    expect(guide.routing_outcomes).toHaveProperty('bubble');
    expect(guide.routing_outcomes).toHaveProperty('telegram');
    expect(guide.routing_outcomes).toHaveProperty('none');
  });

  it('should have llm_triggers covering key scenarios', () => {
    const combined = guide.llm_triggers.map((t) => t.trigger).join(' ');
    expect(combined).toContain('complete');
    expect(combined).toContain('error');
  });
});
