import { describe, it, expect } from 'vitest';
import { getSessionInfo } from './session-info-guide';

class FakeSessionManager {
  getSession(_id: string) {
    return { workingDir: '/home/user/project' };
  }
}

describe('getSessionInfo', () => {
  const authContext = { sessionId: 'test-session-123' };
  const mgr = new FakeSessionManager() as any;

  describe('response shape', () => {
    it('has exactly your_session_id, your_working_dir, helm_workflow', () => {
      const info = getSessionInfo(mgr, authContext);
      expect(Object.keys(info).sort()).toEqual(['helm_workflow', 'your_session_id', 'your_working_dir']);
    });

    it('your_session_id reflects authContext', () => {
      const info = getSessionInfo(mgr, authContext);
      expect(info.your_session_id).toBe('test-session-123');
    });

    it('your_working_dir reflects session workingDir', () => {
      const info = getSessionInfo(mgr, authContext);
      expect(info.your_working_dir).toBe('/home/user/project');
    });

    it('helm_workflow points to startup skill', () => {
      const info = getSessionInfo(mgr, authContext);
      expect(info.helm_workflow).toContain('startup');
    });

    it('does not include mandatory_rules', () => {
      expect(getSessionInfo(mgr, authContext)).not.toHaveProperty('mandatory_rules');
    });

    it('does not include mcp_url or mcp_token', () => {
      const info = getSessionInfo(mgr, authContext);
      expect(info).not.toHaveProperty('mcp_url');
      expect(info).not.toHaveProperty('mcp_token');
    });

    it('does not include telegramCapabilities', () => {
      expect(getSessionInfo(mgr, authContext)).not.toHaveProperty('telegramCapabilities');
    });

    it('does not include skills or available_projects', () => {
      const info = getSessionInfo(mgr, authContext);
      expect(info).not.toHaveProperty('skills');
      expect(info).not.toHaveProperty('available_projects');
    });
  });

  describe('defaults', () => {
    it('your_session_id is empty string when no authContext', () => {
      expect(getSessionInfo(mgr).your_session_id).toBe('');
    });

    it('your_working_dir is empty string when session not found', () => {
      const emptyMgr = { getSession: () => null } as any;
      expect(getSessionInfo(emptyMgr, authContext).your_working_dir).toBe('');
    });
  });
});
