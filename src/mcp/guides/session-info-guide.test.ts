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
  constructor(caps = { available: true, openwhisper: true, piper: true, ffmpeg: true }) {
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

    it('should include aiagent_states', () => {
      const info = getSessionInfo(new FakeConfigLoader() as any, new FakeSessionManager() as any);
      expect(info.aiagent_states).toEqual(['planning', 'implementing', 'completed', 'idle']);
    });

    it('should include telegram in system_skill_types', () => {
      const info = getSessionInfo(new FakeConfigLoader() as any, new FakeSessionManager() as any);
      expect(info.system_skill_types).toContain('telegram');
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

    it('should include all four capability fields', () => {
      const info = getSessionInfo(
        new FakeConfigLoader() as any,
        new FakeSessionManager() as any,
        undefined,
        undefined,
        [],
        new FakeCapabilityDetector() as any,
      );
      expect(info.telegramCapabilities).toHaveProperty('available');
      expect(info.telegramCapabilities).toHaveProperty('openwhisper');
      expect(info.telegramCapabilities).toHaveProperty('piper');
      expect(info.telegramCapabilities).toHaveProperty('ffmpeg');
    });

    it('should reflect detector results when all tools available', () => {
      const info = getSessionInfo(
        new FakeConfigLoader() as any,
        new FakeSessionManager() as any,
        undefined,
        undefined,
        [],
        new FakeCapabilityDetector() as any,
      );
      expect(info.telegramCapabilities).toEqual({
        available: true,
        openwhisper: true,
        piper: true,
        ffmpeg: true,
      });
    });

    it('should reflect detector results when all tools disabled', () => {
      const info = getSessionInfo(
        new FakeConfigLoader() as any,
        new FakeSessionManager() as any,
        undefined,
        undefined,
        [],
        new FakeCapabilityDetector({ available: false, openwhisper: false, piper: false, ffmpeg: false }) as any,
      );
      expect(info.telegramCapabilities).toEqual({
        available: false,
        openwhisper: false,
        piper: false,
        ffmpeg: false,
      });
    });

    it('should reflect partial capability availability', () => {
      const info = getSessionInfo(
        new FakeConfigLoader() as any,
        new FakeSessionManager() as any,
        undefined,
        undefined,
        [],
        new FakeCapabilityDetector({ available: true, openwhisper: true, piper: false, ffmpeg: true }) as any,
      );
      expect(info.telegramCapabilities.openwhisper).toBe(true);
      expect(info.telegramCapabilities.piper).toBe(false);
      expect(info.telegramCapabilities.ffmpeg).toBe(true);
    });
  });
});
