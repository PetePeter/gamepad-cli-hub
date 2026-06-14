import { describe, it, expect } from 'vitest';
import { buildTelegramGuide } from './telegram-guide';

describe('buildTelegramGuide', () => {
  const guide = buildTelegramGuide();

  it('returns a string', () => {
    expect(typeof guide).toBe('string');
  });

  it('references telegram_status.capabilities and not the dead session_info source', () => {
    expect(guide).toContain('telegram_status.capabilities');
    expect(guide).not.toContain('session_info.telegramCapabilities');
  });

  it('instructs to call telegram_send_voice for TTS (no manual piper/ffmpeg steps)', () => {
    expect(guide).toContain('telegram_send_voice');
  });

  it('states that text is the default reply channel and voice is on explicit request', () => {
    expect(guide.toLowerCase()).toContain('text is the default');
    expect(guide.toLowerCase()).toContain('explicit');
  });
});
