import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelmControlService } from '../src/mcp/helm-control-service.js';
import { parseSessionAuthToken } from '../src/mcp/session-auth.js';
import { logger } from '../src/utils/logger.js';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeService() {
  const ptyManager = {
    has: vi.fn(() => true),
    deliverText: vi.fn(() => Promise.resolve()),
    write: vi.fn(),
    spawn: vi.fn(() => ({ pid: 1234 })),
    kill: vi.fn(),
  };
  const sessionManager = {
    getSession: vi.fn((id: string) => ({ id, name: 'Claude', cliType: 'claude-code' })),
    getAllSessions: vi.fn(() => [{ id: 's1', name: 'Claude', cliType: 'claude-code' }]),
    addSession: vi.fn(),
    updateSession: vi.fn(),
    removeSession: vi.fn(),
  };
  const planManager = {
    getForDirectory: vi.fn(() => []),
    getItem: vi.fn(),
    setState: vi.fn(),
  };
  const configLoader = {
    getWorkingDirectories: vi.fn(() => [{ name: 'Helm', path: '/work' }]),
    getCliTypeEntry: vi.fn(() => ({})),
    getAllCliTypes: vi.fn(() => []),
    getCliTypeConfig: vi.fn(() => ({})),
    getMcpConfig: vi.fn(() => ({ enabled: true, port: 47373, authToken: 'helm-token' })),
  };

  const service = new HelmControlService(
    planManager as unknown as import('../src/session/plan-manager.js').PlanManager,
    sessionManager as unknown as import('../src/session/manager.js').SessionManager,
    ptyManager as unknown as import('../src/session/pty-manager.js').PtyManager,
    configLoader as unknown as import('../src/config/loader.js').ConfigLoader,
  );

  return { service, ptyManager, sessionManager, configLoader };
}

describe('HelmControlService.sendTextToSession', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delivers text, then sends a separate submit action when submit is true', async () => {
    const { service, ptyManager } = makeService();
    await service.sendTextToSession('s1', 'hello', { senderSessionId: 'sid', senderSessionName: 'Sender' });
    expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', expect.stringContaining('hello'));
    expect(ptyManager.write).toHaveBeenCalledWith('s1', '\r');
  });

  it('does not send a submit action when submit is false', async () => {
    const { service, ptyManager } = makeService();
    await service.sendTextToSession('s1', 'hello', { submit: false, senderSessionId: 'sid', senderSessionName: 'Sender' });
    expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', expect.stringContaining('hello'));
    expect(ptyManager.write).not.toHaveBeenCalled();
  });

  it('wraps text in HELM_MSG envelope with sender info and metadata', async () => {
    const { service, ptyManager } = makeService();
    await service.sendTextToSession('s1', 'hello', {
      senderSessionId: 'sender1',
      senderSessionName: 'Sender',
      expectsResponse: true,
    });

    const callArg = (ptyManager.deliverText as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(callArg).toMatch(/^\[HELM_MSG: expectsResponse=true\. To reply, call MCP tool mcp__helm__session_send_text with: sessionId="sender1"/);
    expect(callArg).toContain('senderSessionId=<your env $HELM_SESSION_ID>');

    const envelopeMatch = callArg.match(/^\[HELM_MSG[^\]]*\](\{[^\n]+\})\nhello/);
    expect(envelopeMatch).toBeTruthy();

    const envelope = JSON.parse(envelopeMatch![1]);
    expect(envelope).toMatchObject({
      type: 'inter_llm_message',
      fromSessionId: 'sender1',
      fromSessionName: 'Sender',
      expectsResponse: true,
    });
    expect(envelope.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('defaults expectsResponse to false in envelope', async () => {
    const { service, ptyManager } = makeService();
    await service.sendTextToSession('s1', 'hello', {
      senderSessionId: 'sender1',
      senderSessionName: 'Sender',
    });

    const callArg = (ptyManager.deliverText as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(callArg).toMatch(/^\[HELM_MSG\]\{/);
    const envelopeMatch = callArg.match(/^\[HELM_MSG\](\{[^\n]+\})\nhello/);
    const envelope = JSON.parse(envelopeMatch![1]);
    expect(envelope.expectsResponse).toBe(false);
  });

  it('throws when sender info is missing', async () => {
    const { service } = makeService();
    await expect(service.sendTextToSession('s1', 'hello')).rejects.toThrow('senderSessionId and senderSessionName are required');
  });

  it('throws when only senderSessionId is provided without senderSessionName', async () => {
    const { service } = makeService();
    await expect(service.sendTextToSession('s1', 'hello', { senderSessionId: 'sid' })).rejects.toThrow('senderSessionId and senderSessionName are required');
  });

  it('throws when session is not found', async () => {
    const { service, sessionManager } = makeService();
    (sessionManager.getSession as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (sessionManager.getAllSessions as ReturnType<typeof vi.fn>).mockReturnValue([]);
    await expect(service.sendTextToSession('missing', 'hello')).rejects.toThrow('Session not found: missing');
  });

  it('throws when PTY is not running', async () => {
    const { service, ptyManager } = makeService();
    (ptyManager.has as ReturnType<typeof vi.fn>).mockReturnValue(false);
    await expect(service.sendTextToSession('s1', 'hello')).rejects.toThrow('Session PTY is not running: s1');
  });

  it('throws when sender and receiver are the same session', async () => {
    const { service } = makeService();
    await expect(
      service.sendTextToSession('s1', 'hello', { senderSessionId: 's1', senderSessionName: 'Same' }),
    ).rejects.toThrow('Cannot send a message from a session to itself — sender and receiver must be different sessions');
  });
});

describe('HelmControlService.spawnCli', () => {
  it('injects Helm-managed environment variables into spawned CLI sessions', () => {
    const { service, ptyManager, configLoader } = makeService();
    (configLoader.getCliTypeEntry as ReturnType<typeof vi.fn>).mockReturnValue({
      name: 'Claude Code',
      command: 'claude',
      env: [{ name: 'EXTRA_FLAG', value: 'enabled' }],
    });

    service.spawnCli('claude-code', '/work', 'Claude');

    expect(ptyManager.spawn).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({
          EXTRA_FLAG: 'enabled',
          HELM_MCP_TOKEN: expect.any(String),
          HELM_SESSION_ID: expect.any(String),
          HELM_SESSION_NAME: 'Claude',
        }),
      }),
    );
    const env = (ptyManager.spawn as ReturnType<typeof vi.fn>).mock.calls[0][0].env;
    expect(parseSessionAuthToken('helm-token', env.HELM_MCP_TOKEN)).toEqual({
      sessionId: env.HELM_SESSION_ID,
      sessionName: 'Claude',
    });
  });

  it('sets the explicit working plan for a session and reassigns a startable plan', () => {
    const { service, sessionManager } = makeService();
    const planManager = (service as any).planManager;
    (sessionManager.getSession as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 's1',
      name: 'Claude',
      cliType: 'claude-code',
      workingDir: '/work',
    });
    (planManager.getItem as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'plan-1',
      dirPath: '/work',
      title: 'Auth refactor',
      description: 'Desc',
      status: 'ready',
    });
    (planManager.setState as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'plan-1',
      dirPath: '/work',
      title: 'Auth refactor',
      description: 'Desc',
      status: 'coding',
      sessionId: 's1',
    });

    const result = service.setSessionWorkingPlan('s1', 'plan-1');

    expect(planManager.setState).toHaveBeenCalledWith('plan-1', 'coding', undefined, 's1');
    expect(sessionManager.updateSession).toHaveBeenCalledWith('s1', { currentPlanId: 'plan-1' });
    expect(result).toEqual({
      sessionId: 's1',
      name: 'Claude',
      planId: 'plan-1',
      planTitle: 'Auth refactor',
      planStatus: 'coding',
    });
  });
});

describe('HelmControlService.getSessionInfo', () => {
  it('returns agent plan guidance and descriptive tool summaries', () => {
    const { service } = makeService();

    const info = service.getSessionInfo({ sessionId: 's1', sessionName: 'Claude' });

    expect(info.agent_plan_guide?.required_description_sections).toEqual([
      'Problem Statement',
      'User POV',
      'Done Statement',
      'Files / Classes Affected',
      'TDD Suggestions',
      'Acceptance Criteria',
    ]);
    expect(info.agent_plan_guide?.when_to_create_plan.join(' ')).toContain('follow-up work');
    expect(info.agent_plan_guide?.question_plan_workflow.join(' ')).toContain('plan_nextplan_link');
    expect(info.agent_plan_guide?.completion_documentation.join(' ')).toContain('tests or review');

    const createTool = info.available_tools.find((tool) => tool.name === 'plan_create');
    const completeTool = info.available_tools.find((tool) => tool.name === 'plan_complete');
    const linkTool = info.available_tools.find((tool) => tool.name === 'plan_nextplan_link');
    expect(createTool?.description).toContain('Problem Statement');
    expect(createTool?.description).toContain('Acceptance Criteria');
    expect(completeTool?.description).toContain('tests/review');
    expect(linkTool?.description).toContain('QUESTION plan');
  });
});

describe('HelmControlService.closeSession', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('removes the session from SessionManager when given a valid sessionId', () => {
    const { service, ptyManager, sessionManager } = makeService();
    (sessionManager.getSession as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 's1',
      name: 'Claude',
      cliType: 'claude-code',
    });

    const result = service.closeSession('s1');

    expect(ptyManager.kill).toHaveBeenCalledWith('s1');
    expect(sessionManager.removeSession).toHaveBeenCalledWith('s1');
    expect(result).toEqual({ sessionId: 's1', name: 'Claude' });
  });

  it('accepts both sessionId and session name', () => {
    const { service, ptyManager, sessionManager } = makeService();
    (sessionManager.getSession as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (sessionManager.getAllSessions as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 's1', name: 'Claude', cliType: 'claude-code' },
    ]);

    const result = service.closeSession('Claude');

    expect(ptyManager.kill).toHaveBeenCalledWith('s1');
    expect(sessionManager.removeSession).toHaveBeenCalledWith('s1');
    expect(result).toEqual({ sessionId: 's1', name: 'Claude' });
  });

  it('throws when session not found', () => {
    const { service, sessionManager } = makeService();
    (sessionManager.getSession as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (sessionManager.getAllSessions as ReturnType<typeof vi.fn>).mockReturnValue([]);

    expect(() => service.closeSession('nonexistent')).toThrow('Session not found: nonexistent');
  });

  it('continues if ptyManager.kill() throws an error', () => {
    const { service, ptyManager, sessionManager } = makeService();
    const killError = new Error('PTY kill failed');
    (ptyManager.kill as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw killError;
    });
    (sessionManager.getSession as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 's1',
      name: 'Claude',
      cliType: 'claude-code',
    });

    const result = service.closeSession('s1');

    expect(sessionManager.removeSession).toHaveBeenCalledWith('s1');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to kill PTY for session s1:'),
    );
    expect(result).toEqual({ sessionId: 's1', name: 'Claude' });
  });
});
