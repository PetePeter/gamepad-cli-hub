import { describe, it, expect } from 'vitest';
import { getToolReminder } from './reminders';

describe('getToolReminder', () => {
  it('should return non-empty reminder for notify_user mentioning aiagent_state', () => {
    const reminder = getToolReminder('notify_user');
    expect(reminder.length).toBeGreaterThan(0);
    expect(reminder).toContain('session_set_aiagent_state');
  });

  it('should return empty string for unknown tool', () => {
    expect(getToolReminder('nonexistent_tool')).toBe('');
  });

  it('should return reminder for session_send_text', () => {
    const reminder = getToolReminder('session_send_text');
    expect(reminder.length).toBeGreaterThan(0);
  });
});
