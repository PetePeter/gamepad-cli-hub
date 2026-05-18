import { describe, it, expect, vi } from 'vitest';
import { getSessionInfo } from './session-info-guide';

// Minimal fakes matching the real function signature

class FakeConfigLoader {
  private telegramEnabled: boolean;
  constructor(telegramEnabled = true) {
    this.telegramEnabled = telegramEnabled;
  }
  getMcpConfig() {
    return { port: 47373, authToken: 'test-token', enabled: true };
  }
  getTelegramConfig() {
    return { enabled: this.telegramEnabled };
  }
}

class FakeSessionManager {
  getSession(_id: string) {
    return { workingDir: '/home/user/project' };
  }
}

class FakeCapabilityDetector {
  private caps: any;
  constructor(caps = { available: true, openwhisper: true, openwhisperPath: '/usr/bin/whisper', piper: true, piperPath: '/usr/bin/piper', ffmpeg: true, ffmpegPath: '/usr/bin/ffmpeg' }) {
    this.caps = caps;
  }
  getCapabilities() {
    return this.caps;
  }
}

describe('getSessionInfo', () => {
  const authContext = { sessionId: 'test-session-123' };

  describe('structure', () => {
    it('should include mandatory_rules array', () => {
      const info = getSessionInfo(new FakeConfigLoader() as any, new FakeSessionManager() as any, authContext);
      expect(Array.isArray(info.mandatory_rules)).toBe(true);
      expect(info.mandatory_rules.length).toBeGreaterThan(0);
    });

    it('should include session context fields', () => {
      const info = getSessionInfo(new FakeConfigLoader() as any, new FakeSessionManager() as any, authContext);
      expect(info.your_session_id).toBe('test-session-123');
      expect(info.your_working_dir).toBe('/home/user/project');
    });

    it('should include MCP server info', () => {
      const info = getSessionInfo(new FakeConfigLoader() as any, new FakeSessionManager() as any, authContext);
      expect(info.mcp_url).toContain('47373');
      expect(info.mcp_token).toBe('test-token');
    });

  });

  describe('telegramCapabilities', () => {
    it('should default to all-false when no capabilityDetector provided', () => {
      const info = getSessionInfo(new FakeConfigLoader() as any, new FakeSessionManager() as any);
      expect(info.telegramCapabilities).toEqual({
        available: false,
        openwhisper: false,
        piper: false,
        ffmpeg: false,
      });
    });

    it('should include capability flags and paths when all tools available', () => {
      const info = getSessionInfo(
        new FakeConfigLoader() as any,
        new FakeSessionManager() as any,
        undefined,
        undefined,
        [],
        new FakeCapabilityDetector() as any,
      );
      expect(info.telegramCapabilities.available).toBe(true);
      expect(info.telegramCapabilities.openwhisper).toBe(true);
      expect(info.telegramCapabilities.openwhisperPath).toBe('/usr/bin/whisper');
      expect(info.telegramCapabilities.piper).toBe(true);
      expect(info.telegramCapabilities.piperPath).toBe('/usr/bin/piper');
      expect(info.telegramCapabilities.ffmpeg).toBe(true);
      expect(info.telegramCapabilities.ffmpegPath).toBe('/usr/bin/ffmpeg');
    });

    it('should omit paths when tools are not available', () => {
      const info = getSessionInfo(
        new FakeConfigLoader() as any,
        new FakeSessionManager() as any,
        undefined,
        undefined,
        [],
        new FakeCapabilityDetector({ available: false, openwhisper: false, piper: false, ffmpeg: false }) as any,
      );
      expect(info.telegramCapabilities.available).toBe(false);
      expect(info.telegramCapabilities.openwhisperPath).toBeUndefined();
      expect(info.telegramCapabilities.piperPath).toBeUndefined();
      expect(info.telegramCapabilities.ffmpegPath).toBeUndefined();
    });

    it('should reflect partial capability availability and paths', () => {
      const info = getSessionInfo(
        new FakeConfigLoader() as any,
        new FakeSessionManager() as any,
        undefined,
        undefined,
        [],
        new FakeCapabilityDetector({ available: true, openwhisper: true, openwhisperPath: '/usr/bin/whisper', piper: false, ffmpeg: true, ffmpegPath: '/usr/bin/ffmpeg' }) as any,
      );
      expect(info.telegramCapabilities.openwhisper).toBe(true);
      expect(info.telegramCapabilities.openwhisperPath).toBe('/usr/bin/whisper');
      expect(info.telegramCapabilities.piper).toBe(false);
      expect(info.telegramCapabilities.piperPath).toBeUndefined();
      expect(info.telegramCapabilities.ffmpeg).toBe(true);
      expect(info.telegramCapabilities.ffmpegPath).toBe('/usr/bin/ffmpeg');
    });
  });
});
