import { describe, it, expect } from 'vitest';
import { buildSessionSendTextGuide } from '../src/mcp/guides/session-send-text-guide';

describe('buildSessionSendTextGuide', () => {
  const guide = buildSessionSendTextGuide();

  it('returns a string, not a JSON object', () => {
    expect(typeof guide).toBe('string');
    expect(guide.startsWith('{')).toBe(false);
  });

  it('references session_send_text tool', () => {
    expect(guide).toContain('session_send_text');
  });

  it('enforces 10-minute poll interval', () => {
    expect(guide).toContain('10 minutes');
  });

  it('documents expectsResponse', () => {
    expect(guide).toContain('expectsResponse');
  });
});
