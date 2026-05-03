import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelmControlService, parseSubmitSuffix } from '../src/mcp/helm-control-service.js';
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
    getTerminalTail: vi.fn(() => ({
      raw: ['\x1b[31mraw\x1b[0m'],
      stripped: ['raw'],
      lastOutputAt: 1234,
    })),
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
    resolveItemRef: vi.fn((ref: string) => {
      const item = planManager.getItem(ref);
      return item ? { status: 'found' as const, item } : { status: 'missing' as const };
    }),
    setState: vi.fn(),
  };
  const configLoader = {
    getWorkingDirectories: vi.fn(() => [{ name: 'Helm', path: '/work' }]),
    getCliTypeEntry: vi.fn(() => ({})),
    getAllCliTypes: vi.fn(() => []),
    getCliTypeConfig: vi.fn(() => ({})),
    getMcpConfig: vi.fn(() => ({ enabled: true, port: 47373, authToken: 'helm-token' })),
    getTelegramConfig: vi.fn(() => ({
      enabled: true,
      botToken: 'configured',
      chatId: 123,
      allowedUserIds: [456],
      instanceName: 'Home',
      safeModeDefault: true,
      notifyOnComplete: true,
      notifyOnIdle: true,
      notifyOnError: true,
      notifyOnCrash: true,
    })),
  };

  const service = new HelmControlService(
    planManager as unknown as import('../src/session/plan-manager.js').PlanManager,
    sessionManager as unknown as import('../src/session/manager.js').SessionManager,
    ptyManager as unknown as import('../src/session/pty-manager.js').PtyManager,
    configLoader as unknown as import('../src/config/loader.js').ConfigLoader,
  );

  return { service, ptyManager, sessionManager, configLoader, planManager };
}

describe('HelmControlService.sendTextToSession', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delivers text atomically with submitSuffix for auto-execution', async () => {
    const { service, ptyManager } = makeService();
    await service.sendTextToSession('s1', 'hello', { senderSessionId: 'sid', senderSessionName: 'Sender' });
    expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', expect.stringContaining('hello'));
    expect(ptyManager.write).toHaveBeenCalledWith('s1', '\r');
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

  it('prefers exact session name matches over ID lookup results', async () => {
    const { service, ptyManager, sessionManager } = makeService();
    (sessionManager.getAllSessions as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'codex-1', name: 'codex', cliType: 'codex' },
      { id: 'potato-4', name: 'potato', cliType: 'claude-code' },
    ]);
    (sessionManager.getSession as ReturnType<typeof vi.fn>).mockImplementation((ref: string) => {
      if (ref === 'potato') return { id: 'codex-1', name: 'codex', cliType: 'codex' };
      if (ref === 'potato-4') return { id: 'potato-4', name: 'potato', cliType: 'claude-code' };
      return null;
    });

    const result = await service.sendTextToSession('potato', 'hello potato', {
      senderSessionId: 'sender',
      senderSessionName: 'Sender',
    });

    expect(result.sessionId).toBe('potato-4');
    expect(ptyManager.deliverText).toHaveBeenCalledWith('potato-4', expect.stringContaining('hello potato'));
  });

  it('resolves exact session IDs when no name matches', async () => {
    const { service, ptyManager, sessionManager } = makeService();
    (sessionManager.getAllSessions as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'potato-4', name: 'potato', cliType: 'claude-code' },
    ]);
    (sessionManager.getSession as ReturnType<typeof vi.fn>).mockImplementation((ref: string) => (
      ref === 'codex-1' ? { id: 'codex-1', name: 'codex', cliType: 'codex' } : null
    ));

    const result = await service.sendTextToSession('codex-1', 'hello codex', {
      senderSessionId: 'sender',
      senderSessionName: 'Sender',
    });

    expect(result.sessionId).toBe('codex-1');
    expect(ptyManager.deliverText).toHaveBeenCalledWith('codex-1', expect.stringContaining('hello codex'));
  });

  it('rejects ambiguous session names before falling back to IDs', async () => {
    const { service, sessionManager } = makeService();
    (sessionManager.getAllSessions as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'first', name: 'potato', cliType: 'claude-code' },
      { id: 'second', name: 'potato', cliType: 'codex' },
    ]);
    (sessionManager.getSession as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'third', name: 'other', cliType: 'codex' });

    await expect(
      service.sendTextToSession('potato', 'hello', { senderSessionId: 'sender', senderSessionName: 'Sender' }),
    ).rejects.toThrow('Multiple sessions found with name: potato. Use sessionId instead.');
  });
});

describe('HelmControlService plan sequences', () => {
  it('returns sequence membership and shared memory for a plan', () => {
    const { service, planManager } = makeService();
    const plan = {
      id: 'plan-1',
      humanId: 'P-0001',
      dirPath: '/work',
      title: 'Plan',
      description: 'Body',
      status: 'ready',
      sequenceId: 'seq-1',
      createdAt: 1,
      updatedAt: 1,
    };
    const sequence = {
      id: 'seq-1',
      dirPath: '/work',
      title: 'Sequence',
      missionStatement: 'Mission',
      sharedMemory: 'Shared notes',
      order: 0,
      createdAt: 1,
      updatedAt: 2,
    };
    (planManager.getItem as ReturnType<typeof vi.fn>).mockReturnValue(plan);
    (planManager.getForDirectory as ReturnType<typeof vi.fn>).mockReturnValue([plan]);
    (planManager as any).getSequencesForDirectory = vi.fn(() => [sequence]);

    expect(service.listPlanSequences({ planRef: 'P-0001' })).toEqual([
      expect.objectContaining({
        id: 'seq-1',
        sharedMemory: 'Shared notes',
        memberPlanIds: ['plan-1'],
        memberHumanIds: ['P-0001'],
        selectedForPlan: true,
      }),
    ]);
  });

  it('requires expectedUpdatedAt to match for mutexed sequence memory appends', () => {
    const { service, planManager } = makeService();
    const sequence = {
      id: 'seq-1',
      dirPath: '/work',
      title: 'Sequence',
      missionStatement: 'Mission',
      sharedMemory: 'Before',
      order: 0,
      createdAt: 1,
      updatedAt: 22,
    };
    (planManager as any).getSequence = vi.fn(() => sequence);
    (planManager as any).updateSequence = vi.fn((_id: string, updates: { sharedMemory: string }) => ({
      ...sequence,
      ...updates,
      updatedAt: 23,
    }));

    expect(() => service.appendPlanSequenceMemory('seq-1', 'After', 21)).toThrow('updated concurrently');
    expect(service.appendPlanSequenceMemory('seq-1', 'After', 22)).toMatchObject({
      sharedMemory: 'Before\n\nAfter',
      updatedAt: 23,
    });
  });
});

describe('HelmControlService directory validation', () => {
  it('createPlan rejects unconfigured dirPath', () => {
    const { service } = makeService();
    expect(() => service.createPlan('/unconfigured', 'Title', 'Desc')).toThrow('not configured in Helm');
  });

  it('createPlan accepts configured dirPath', () => {
    const { service, planManager } = makeService();
    (planManager as any).createWithType = vi.fn(() => ({ id: 'p1', dirPath: '/work', title: 'Title', status: 'ready' }));
    expect(() => service.createPlan('/work', 'Title', 'Desc')).not.toThrow();
    expect((planManager as any).createWithType).toHaveBeenCalledWith('/work', 'Title', 'Desc', undefined);
  });

  it('createPlanSequence rejects unconfigured dirPath', () => {
    const { service } = makeService();
    expect(() => service.createPlanSequence({ dirPath: '/unconfigured', title: 'Seq' })).toThrow('not configured in Helm');
  });

  it('createPlanSequence accepts configured dirPath', () => {
    const { service, planManager } = makeService();
    (planManager as any).createSequence = vi.fn(() => ({ id: 's1', dirPath: '/work', title: 'Seq', missionStatement: '', sharedMemory: '', order: 0 }));
    expect(() => service.createPlanSequence({ dirPath: '/work', title: 'Seq' })).not.toThrow();
    expect((planManager as any).createSequence).toHaveBeenCalledWith('/work', 'Seq', '', '');
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

  describe('initialPrompt scheduling', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('sends configured initialPrompt sequences to PTY after delay', async () => {
      const { service, ptyManager, configLoader } = makeService();
      (configLoader.getCliTypeEntry as ReturnType<typeof vi.fn>).mockReturnValue({
        name: 'Claude Code',
        command: 'claude',
        initialPrompt: [{ label: 'hello', sequence: 'Hello world{Enter}' }],
        initialPromptDelay: 1000,
      });

      service.spawnCli('claude-code', '/work', 'Claude');
      expect(ptyManager.write).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      expect(ptyManager.deliverText).toHaveBeenCalledWith(
        expect.any(String),
        'Hello world',
      );
      expect(ptyManager.write).toHaveBeenCalledWith(expect.any(String), '\r');
    });

    it('sends helmInitialPrompt when configured', async () => {
      const { service, ptyManager, configLoader } = makeService();
      (configLoader.getCliTypeEntry as ReturnType<typeof vi.fn>).mockReturnValue({
        name: 'GLM CC',
        command: 'claude',
        helmInitialPrompt: true,
        initialPromptDelay: 500,
      });

      service.spawnCli('glm-cc', '/work', 'Worker');
      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      expect(ptyManager.deliverText).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('session_info'),
      );
    });

    it('delivers MCP prompt after initialPrompt completes', async () => {
      const { service, ptyManager, configLoader } = makeService();
      (configLoader.getCliTypeEntry as ReturnType<typeof vi.fn>).mockReturnValue({
        name: 'Claude Code',
        command: 'claude',
        initialPrompt: [{ label: 'init', sequence: 'init{Enter}' }],
        initialPromptDelay: 500,
      });

      service.spawnCli('claude-code', '/work', 'Claude', 'custom prompt');
      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      expect(ptyManager.deliverText).toHaveBeenCalledWith(
        expect.any(String),
        'init',
      );
      expect(ptyManager.write).toHaveBeenCalledWith(expect.any(String), '\r');
      expect(ptyManager.deliverText).toHaveBeenCalledWith(
        expect.any(String),
        'custom prompt',
      );
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

  it('accepts P-id plan references when setting the explicit working plan', () => {
    const { service, sessionManager } = makeService();
    const planManager = (service as any).planManager;
    (sessionManager.getSession as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 's1',
      name: 'Claude',
      cliType: 'claude-code',
      workingDir: '/work',
    });
    const plan = {
      id: 'plan-1',
      humanId: 'P-0042',
      dirPath: '/work',
      title: 'Auth refactor',
      description: 'Desc',
      status: 'ready',
    };
    (planManager.getItem as ReturnType<typeof vi.fn>).mockImplementation((ref: string) => ref === 'plan-1' ? plan : null);
    (planManager.resolveItemRef as ReturnType<typeof vi.fn>).mockImplementation((ref: string) => (
      ref === 'P-0042' ? { status: 'found', item: plan } : { status: 'missing' }
    ));
    (planManager.setState as ReturnType<typeof vi.fn>).mockReturnValue({ ...plan, status: 'coding', sessionId: 's1' });

    const result = service.setSessionWorkingPlan('s1', 'P-0042');

    expect(planManager.setState).toHaveBeenCalledWith('plan-1', 'coding', undefined, 's1');
    expect(result.planId).toBe('plan-1');
  });

  it('reports ambiguous P-id references clearly', () => {
    const { service, sessionManager } = makeService();
    const planManager = (service as any).planManager;
    (sessionManager.getSession as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 's1',
      name: 'Claude',
      cliType: 'claude-code',
      workingDir: '/work',
    });
    (planManager.resolveItemRef as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'ambiguous',
      matches: [
        { id: 'a', humanId: 'P-0042', dirPath: '/work' },
        { id: 'b', humanId: 'P-0042', dirPath: '/other' },
      ],
    });

    expect(() => service.setSessionWorkingPlan('s1', 'P-0042')).toThrow('Plan reference is ambiguous: P-0042');
  });
});

describe('HelmControlService.getSessionInfo', () => {
  it('returns agent plan guidance without duplicating the MCP tool list', () => {
    const { service } = makeService();

    const info = service.getSessionInfo({ sessionId: 's1', sessionName: 'Claude' });

    expect(info.mandatory_rules).toEqual(expect.arrayContaining([
      expect.stringContaining('session_set_aiagent_state'),
      expect.stringContaining('plan_set_state'),
      expect.stringContaining('QUESTION:'),
      expect.stringContaining('session_read_terminal'),
    ]));
    expect(info.session_send_text_guide?.inter_llm_handoff_protocol.join(' ')).toContain('submit=true');
    expect(info.session_send_text_guide?.inter_llm_handoff_protocol.join(' ')).toContain('session_read_terminal');
    expect(info.agent_plan_guide?.required_description_sections).toEqual([
      'Problem Statement',
      'User POV',
      'Done Statement',
      'Files / Classes Affected',
      'TDD Suggestions',
      'Acceptance Criteria',
    ]);
    expect(info.agent_plan_guide?.plan_identifier_semantics.join(' ')).toContain('P-0035');
    expect(info.agent_plan_guide?.plan_identifier_semantics.join(' ')).toContain('canonical UUID');
    expect(info.agent_plan_guide?.when_to_create_plan.join(' ')).toContain('follow-up work');
    expect(info.agent_plan_guide?.question_plan_workflow.join(' ')).toContain('plan_nextplan_link');
    expect(info.agent_plan_guide?.completion_documentation.join(' ')).toContain('tests or review');
    expect(info.agent_plan_guide?.plan_attachment_guide.length).toBeGreaterThanOrEqual(3);
    expect(info.agent_plan_guide?.plan_attachment_guide.join(' ')).toContain('hasAttachments');
    expect(info.agent_plan_guide?.sequence_memory_guide.length).toBeGreaterThanOrEqual(4);
    expect(info.agent_plan_guide?.sequence_memory_guide.join(' ')).toContain('plan_sequence_list');

    expect(info).not.toHaveProperty('available_tools');
  });

  it('includes non-empty plan_attachment_guide and sequence_memory_guide arrays', () => {
    const { service } = makeService();

    const info = service.getSessionInfo();

    expect(info.agent_plan_guide).toBeDefined();
    expect(Array.isArray(info.agent_plan_guide?.plan_attachment_guide)).toBe(true);
    expect(info.agent_plan_guide?.plan_attachment_guide!.length).toBeGreaterThanOrEqual(3);
    expect(info.agent_plan_guide?.plan_attachment_guide!.every((item: string) => item.length > 0)).toBe(true);

    expect(Array.isArray(info.agent_plan_guide?.sequence_memory_guide)).toBe(true);
    expect(info.agent_plan_guide?.sequence_memory_guide!.length).toBeGreaterThanOrEqual(4);
    expect(info.agent_plan_guide?.sequence_memory_guide!.every((item: string) => item.length > 0)).toBe(true);

    // Verify content expectations
    expect(info.agent_plan_guide?.plan_attachment_guide!.join(' ')).toContain('plan_attachment_list');
    expect(info.agent_plan_guide?.plan_attachment_guide!.join(' ')).toContain('plan_attachment_get');
    expect(info.agent_plan_guide?.sequence_memory_guide!.join(' ')).toContain('plan_sequence_list');
    expect(info.agent_plan_guide?.sequence_memory_guide!.join(' ')).toContain('expectedUpdatedAt');
  });

  it('includes notification_guide explaining when and how to notify the user', () => {
    const { service } = makeService();
    const info = service.getSessionInfo();

    expect(info.notification_guide).toBeDefined();
    expect(info.notification_guide?.when_to_notify.length).toBeGreaterThanOrEqual(3);
    expect(info.notification_guide?.when_not_to_notify.length).toBeGreaterThanOrEqual(2);
    expect(info.notification_guide?.preferred_tool).toContain('notify_user');
    expect(info.notification_guide?.when_not_to_notify.join(' ')).toContain('get_app_visibility');
    const routing = JSON.stringify(info.notification_guide?.routing_outcomes);
    expect(routing).toContain('toast');
    expect(routing).toContain('bubble');
    expect(routing).toContain('telegram');
    expect(routing).toContain('none');
    expect(info.notification_guide?.telegram_usage.join(' ')).toContain('mobile');
  });
});

describe('HelmControlService.getPlan', () => {
  it('returns hasAttachments without inlining sequence data', () => {
    const { planManager, sessionManager, ptyManager, configLoader } = makeService();
    const plan = { id: 'plan-1', humanId: 'P-0001', dirPath: '/work', title: 'Task', description: 'Desc', status: 'ready', sequenceId: 'seq-1' };
    (planManager.getItem as ReturnType<typeof vi.fn>).mockReturnValue(plan);
    (planManager.resolveItemRef as ReturnType<typeof vi.fn>).mockReturnValue({ status: 'found', item: plan });
    const attachmentManager = {
      list: vi.fn(() => [{ id: 'a1', planId: 'plan-1', filename: 'note.txt', sizeBytes: 1, relativePath: 'plan-1/a1.txt', createdAt: 1, updatedAt: 1 }]),
      add: vi.fn(),
      delete: vi.fn(),
      getToTempFile: vi.fn(),
      deletePlanAttachments: vi.fn(),
    };
    const service = new HelmControlService(
      planManager as unknown as import('../src/session/plan-manager.js').PlanManager,
      sessionManager as unknown as import('../src/session/manager.js').SessionManager,
      ptyManager as unknown as import('../src/session/pty-manager.js').PtyManager,
      configLoader as unknown as import('../src/config/loader.js').ConfigLoader,
      attachmentManager as any,
    );

    const result = service.getPlan('P-0001') as any;

    expect(result.hasAttachments).toBe(true);
    expect(result.sequenceId).toBe('seq-1');
    expect(result.sequence).toBeUndefined();
    expect(result.sequenceMemoryGuide).toBeUndefined();
  });

  it('returns hasAttachments false when no attachments exist', () => {
    const { planManager, sessionManager, ptyManager, configLoader } = makeService();
    const plan = { id: 'plan-1', humanId: 'P-0001', dirPath: '/work', title: 'Task', description: 'Desc', status: 'ready' };
    (planManager.resolveItemRef as ReturnType<typeof vi.fn>).mockReturnValue({ status: 'found', item: plan });
    const attachmentManager = {
      list: vi.fn(() => []),
      add: vi.fn(),
      delete: vi.fn(),
      getToTempFile: vi.fn(),
      deletePlanAttachments: vi.fn(),
    };
    const service = new HelmControlService(
      planManager as unknown as import('../src/session/plan-manager.js').PlanManager,
      sessionManager as unknown as import('../src/session/manager.js').SessionManager,
      ptyManager as unknown as import('../src/session/pty-manager.js').PtyManager,
      configLoader as unknown as import('../src/config/loader.js').ConfigLoader,
      attachmentManager as any,
    );

    const result = service.getPlan('P-0001') as any;

    expect(result.hasAttachments).toBe(false);
  });

  it('returns hasAttachments true after adding an attachment', () => {
    const { planManager, sessionManager, ptyManager, configLoader } = makeService();
    const plan = { id: 'plan-1', humanId: 'P-0001', dirPath: '/work', title: 'Task', description: 'Desc', status: 'ready' };
    (planManager.resolveItemRef as ReturnType<typeof vi.fn>).mockReturnValue({ status: 'found', item: plan });
    const attachments = [{ id: 'a1', planId: 'plan-1', filename: 'note.txt', sizeBytes: 5, relativePath: 'plan-1/a1.txt', createdAt: 1, updatedAt: 1 }];
    const attachmentManager = {
      list: vi.fn(() => attachments),
      add: vi.fn(),
      delete: vi.fn(),
      getToTempFile: vi.fn(),
      deletePlanAttachments: vi.fn(),
    };
    const service = new HelmControlService(
      planManager as unknown as import('../src/session/plan-manager.js').PlanManager,
      sessionManager as unknown as import('../src/session/manager.js').SessionManager,
      ptyManager as unknown as import('../src/session/pty-manager.js').PtyManager,
      configLoader as unknown as import('../src/config/loader.js').ConfigLoader,
      attachmentManager as any,
    );

    const result = service.getPlan('P-0001') as any;

    expect(result.hasAttachments).toBe(true);
    expect(attachmentManager.list).toHaveBeenCalledWith('plan-1');
  });

  it('does not include sequence key even when plan has sequenceId', () => {
    const { planManager, sessionManager, ptyManager, configLoader } = makeService();
    const plan = { id: 'plan-1', humanId: 'P-0001', dirPath: '/work', title: 'Task', description: 'Desc', status: 'ready', sequenceId: 'seq-1' };
    (planManager.resolveItemRef as ReturnType<typeof vi.fn>).mockReturnValue({ status: 'found', item: plan });
    const attachmentManager = {
      list: vi.fn(() => []),
      add: vi.fn(),
      delete: vi.fn(),
      getToTempFile: vi.fn(),
      deletePlanAttachments: vi.fn(),
    };
    const service = new HelmControlService(
      planManager as unknown as import('../src/session/plan-manager.js').PlanManager,
      sessionManager as unknown as import('../src/session/manager.js').SessionManager,
      ptyManager as unknown as import('../src/session/pty-manager.js').PtyManager,
      configLoader as unknown as import('../src/config/loader.js').ConfigLoader,
      attachmentManager as any,
    );

    const result = service.getPlan('P-0001') as any;

    expect(Object.prototype.hasOwnProperty.call(result, 'sequenceId')).toBe(true);
    expect(result.sequenceId).toBe('seq-1');
    expect(Object.prototype.hasOwnProperty.call(result, 'sequence')).toBe(false);
  });
});

describe('HelmControlService.readSessionTerminal', () => {
  it('returns terminal tail metadata and clamps line count', () => {
    const { service, ptyManager, sessionManager } = makeService();
    (sessionManager.getSession as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 's1',
      name: 'Claude',
      cliType: 'claude-code',
      workingDir: '/work',
    });

    const result = service.readSessionTerminal('s1', 120, 'both');

    expect(ptyManager.getTerminalTail).toHaveBeenCalledWith('s1', 120, 'both');
    expect(result).toEqual({
      sessionId: 's1',
      name: 'Claude',
      cliType: 'claude-code',
      workingDir: '/work',
      requestedLines: 120,
      returnedLines: 1,
      mode: 'both',
      ptyRunning: true,
      lastOutputAt: 1234,
      raw: ['\x1b[31mraw\x1b[0m'],
      stripped: ['raw'],
    });
  });

  it('rejects invalid line counts', () => {
    const { service } = makeService();
    expect(() => service.readSessionTerminal('s1', 0, 'raw')).toThrow('lines must be a positive integer');
  });
});

describe('HelmControlService plan attachments', () => {
  it('resolves P-id plan refs before calling the attachment manager', () => {
    const { planManager, sessionManager, ptyManager, configLoader } = makeService();
    const plan = { id: 'plan-1', humanId: 'P-0001', dirPath: '/work', title: 'Task', description: 'Desc', status: 'ready' };
    (planManager.resolveItemRef as ReturnType<typeof vi.fn>).mockReturnValue({ status: 'found', item: plan });
    const attachmentManager = {
      list: vi.fn(() => []),
      add: vi.fn((_planId: string, input: { filename: string; content: Buffer; contentType?: string }) => ({
        id: 'a1',
        planId: 'plan-1',
        filename: input.filename,
        sizeBytes: input.content.byteLength,
        relativePath: 'plan-1/a1.txt',
        createdAt: 1,
        updatedAt: 1,
      })),
      delete: vi.fn(() => true),
      getToTempFile: vi.fn(),
      deletePlanAttachments: vi.fn(),
    };
    const service = new HelmControlService(
      planManager as unknown as import('../src/session/plan-manager.js').PlanManager,
      sessionManager as unknown as import('../src/session/manager.js').SessionManager,
      ptyManager as unknown as import('../src/session/pty-manager.js').PtyManager,
      configLoader as unknown as import('../src/config/loader.js').ConfigLoader,
      attachmentManager as any,
    );

    const attachment = service.addPlanAttachment('P-0001', {
      filename: 'note.txt',
      text: 'hello',
      contentType: 'text/plain',
    });

    expect(attachmentManager.add).toHaveBeenCalledWith('plan-1', {
      filename: 'note.txt',
      content: Buffer.from('hello', 'utf8'),
      contentType: 'text/plain',
    });
    expect(attachment.sizeBytes).toBe(5);
  });

  it('requires exactly one attachment content input', () => {
    const { service, planManager } = makeService();
    (planManager.resolveItemRef as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'found',
      item: { id: 'plan-1', dirPath: '/work', title: 'Task', description: 'Desc', status: 'ready' },
    });

    expect(() => service.addPlanAttachment('plan-1', { filename: 'empty.txt' })).toThrow('exactly one');
    expect(() => service.addPlanAttachment('plan-1', {
      filename: 'double.txt',
      text: 'hello',
      contentBase64: Buffer.from('hello').toString('base64'),
    })).toThrow('exactly one');
  });

  it('rejects invalid base64 attachment input before writing', () => {
    const { service, planManager } = makeService();
    (planManager.resolveItemRef as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'found',
      item: { id: 'plan-1', dirPath: '/work', title: 'Task', description: 'Desc', status: 'ready' },
    });

    expect(() => service.addPlanAttachment('plan-1', {
      filename: 'bad.bin',
      contentBase64: 'not base64!',
    })).toThrow('valid base64');
  });
});

describe('HelmControlService telegram channels', () => {
  it('reports Telegram availability without exposing secrets', () => {
    const { service } = makeService();
    service.setTelegramBridge({
      isRunning: vi.fn(() => true),
      listChannels: vi.fn(() => [{ id: 'tc1', sessionId: 's1', sessionName: 'Claude', status: 'open', createdAt: 1, updatedAt: 1 }]),
      createChannel: vi.fn(),
      closeChannel: vi.fn(),
      sendToUser: vi.fn(),
    });

    const status = service.getTelegramStatus();

    expect(status).toMatchObject({
      enabled: true,
      configured: true,
      running: true,
      available: true,
      openChannels: 1,
    });
    expect(JSON.stringify(status)).not.toContain('botToken');
  });

  it('sends mobile-friendly messages through the bridge via sendTelegramChat', async () => {
    const { service, sessionManager } = makeService();
    (sessionManager.getSession as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 's1',
      name: 'Claude',
      cliType: 'claude-code',
      workingDir: '/work',
    });
    const bridge = {
      isRunning: vi.fn(() => true),
      listChannels: vi.fn(() => []),
      closeChannel: vi.fn(),
      sendToUser: vi.fn(async () => ({ sent: true })),
    };
    service.setTelegramBridge(bridge);

    const result = await service.sendTelegramChat('s1', 'Need a quick decision?');

    expect(bridge.sendToUser).toHaveBeenCalledWith({ sessionId: 's1', text: 'Need a quick decision?' });
    expect(result.sent).toBe(true);
  });

  it('rejects wide messages in sendTelegramChat', async () => {
    const { service } = makeService();

    service.setTelegramBridge({
      isRunning: vi.fn(() => true),
      listChannels: vi.fn(() => []),
      closeChannel: vi.fn(),
      sendToUser: vi.fn(),
    });

    await expect(service.sendTelegramChat('s1', 'x'.repeat(141))).rejects.toThrow('140 characters');
  });

  it('rejects invalid base64 attachments in sendTelegramChat before bridge delivery', async () => {
    const { service, sessionManager } = makeService();
    (sessionManager.getSession as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 's1',
      name: 'Claude',
      cliType: 'claude-code',
      workingDir: '/work',
    });
    const bridge = {
      isRunning: vi.fn(() => true),
      listChannels: vi.fn(() => []),
      closeChannel: vi.fn(),
      sendToUser: vi.fn(async () => ({ sent: true })),
    };
    service.setTelegramBridge(bridge);

    const result = await service.sendTelegramChat('s1', 'see attached', {
      name: 'log.txt',
      data: 'not valid base64!',
      mime: 'text/plain',
    });

    expect(result.sent).toBe(false);
    expect(result.reason).toContain('valid base64');
    expect(bridge.sendToUser).not.toHaveBeenCalled();
  });

  it('getAvailableTools lists exactly 3 telegram tools and no removed tools', () => {
    const { service } = makeService();

    const tools = (service as any).getAvailableTools() as Array<{ name: string }>;
    const tgTools = tools.filter((t: { name: string }) => t.name.startsWith('telegram_'));

    expect(tgTools.map((t: { name: string }) => t.name)).toEqual(
      expect.arrayContaining(['telegram_status', 'telegram_chat', 'telegram_channel_close']),
    );
    expect(tgTools).toHaveLength(3);

    // Removed tools must NOT be present
    const removedToolNames = ['telegram_send', 'telegram_set_output_mode', 'telegram_channel_create', 'telegram_channel_list'];
    const allToolNames = tools.map((t: { name: string }) => t.name);
    for (const removed of removedToolNames) {
      expect(allToolNames).not.toContain(removed);
    }
  });
});

describe('HelmControlService LLM notifications', () => {
  it('routes notifyUser through NotificationManager using session refs', () => {
    const { service, sessionManager } = makeService();
    (sessionManager.getSession as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 's1',
      name: 'Claude',
      cliType: 'claude-code',
      workingDir: '/work',
    });
    const notificationManager = {
      notifyLlmDirected: vi.fn(() => 'bubble'),
      getAppVisibilityDetails: vi.fn(() => ({ visibility: 'visible-focused', screenLocked: false, activeSessionId: 's2' })),
    };
    service.setNotificationManager(notificationManager as any);

    expect(service.notifyUser('s1', 'Need input', 'Please choose one')).toEqual({ delivered: 'bubble' });
    expect(notificationManager.notifyLlmDirected).toHaveBeenCalledWith('s1', 'Need input', 'Please choose one');
    expect(service.getAppVisibility()).toEqual({ visibility: 'visible-focused', screenLocked: false, activeSessionId: 's2' });
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

describe('HelmControlService.sendTextToSession — helmPreambleForInterSession toggle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sendTextToSession with preamble enabled (default)', async () => {
    const { service, ptyManager, configLoader } = makeService();
    // Recipient tool config absent helmPreambleForInterSession field — defaults to true
    (configLoader.getCliTypeEntry as ReturnType<typeof vi.fn>).mockReturnValue({
      name: 'Claude Code',
      command: 'claude',
      // helmPreambleForInterSession is undefined, should default to true
    });

    const result = await service.sendTextToSession('s1', 'hello', {
      senderSessionId: 'sender1',
      senderSessionName: 'Sender',
    });

    expect(result.preambleUsed).toBe(true);
    const deliverCall = (ptyManager.deliverText as ReturnType<typeof vi.fn>).mock.calls[0];
    const message = deliverCall[1] as string;
    expect(message).toMatch(/^\[HELM_MSG\]/);
    expect(message).toContain('"type":"inter_llm_message"');
    expect(message).toContain('hello');
  });

  it('sendTextToSession with preamble enabled (explicit true)', async () => {
    const { service, ptyManager, configLoader } = makeService();
    // Recipient tool config has helmPreambleForInterSession: true
    (configLoader.getCliTypeEntry as ReturnType<typeof vi.fn>).mockReturnValue({
      name: 'Claude Code',
      command: 'claude',
      helmPreambleForInterSession: true,
    });

    const result = await service.sendTextToSession('s1', 'hello', {
      senderSessionId: 'sender1',
      senderSessionName: 'Sender',
    });

    expect(result.preambleUsed).toBe(true);
    const deliverCall = (ptyManager.deliverText as ReturnType<typeof vi.fn>).mock.calls[0];
    const message = deliverCall[1] as string;
    expect(message).toMatch(/^\[HELM_MSG\]/);
    expect(message).toContain('"type":"inter_llm_message"');
    expect(message).toContain('hello');
  });

  it('sendTextToSession with preamble disabled', async () => {
    const { service, ptyManager, configLoader } = makeService();
    // Recipient tool config has helmPreambleForInterSession: false
    (configLoader.getCliTypeEntry as ReturnType<typeof vi.fn>).mockReturnValue({
      name: 'Claude Code',
      command: 'claude',
      helmPreambleForInterSession: false,
    });

    const result = await service.sendTextToSession('s1', 'hello from sender', {
      senderSessionId: 'sender1',
      senderSessionName: 'Sender',
    });

    expect(result.preambleUsed).toBe(false);
    expect(configLoader.getCliTypeEntry).toHaveBeenCalledWith('claude-code');
    const deliverCall = (ptyManager.deliverText as ReturnType<typeof vi.fn>).mock.calls[0];
    const message = deliverCall[1] as string;
    // Submit suffix is now sent via ptyManager.write separately
    expect(message).toBe('hello from sender');
    expect(ptyManager.write).toHaveBeenCalledWith('s1', '\r');
    expect(message).not.toMatch(/^\[HELM_MSG\]/);
    expect(message).not.toContain('inter_llm_message');
  });

  it('sendTextToSession preamble=false respects text content exactly', async () => {
    const { service, ptyManager, configLoader } = makeService();
    (configLoader.getCliTypeEntry as ReturnType<typeof vi.fn>).mockReturnValue({
      helmPreambleForInterSession: false,
    });

    const multilineText = 'Line 1\nLine 2\nSpecial chars: $, %, &, @';
    const result = await service.sendTextToSession('s1', multilineText, {
      senderSessionId: 'sender1',
      senderSessionName: 'Sender',
    });

    expect(result.preambleUsed).toBe(false);
    const deliverCall = (ptyManager.deliverText as ReturnType<typeof vi.fn>).mock.calls[0];
    const message = deliverCall[1] as string;
    // Submit suffix is now sent via ptyManager.write separately
    expect(message).toBe(multilineText);
    expect(ptyManager.write).toHaveBeenCalledWith('s1', '\r');
  });

  it('sendTextToSession preamble=true includes sender info in envelope', async () => {
    const { service, ptyManager, configLoader } = makeService();
    (configLoader.getCliTypeEntry as ReturnType<typeof vi.fn>).mockReturnValue({
      helmPreambleForInterSession: true,
    });

    await service.sendTextToSession('s1', 'test', {
      senderSessionId: 'agent-1',
      senderSessionName: 'Research Agent',
      expectsResponse: true,
    });

    const deliverCall = (ptyManager.deliverText as ReturnType<typeof vi.fn>).mock.calls[0];
    const message = deliverCall[1] as string;
    const envelopeMatch = message.match(/^\[HELM_MSG[^\]]*\](\{[^\n]+\})\n/);
    expect(envelopeMatch).toBeTruthy();
    const envelope = JSON.parse(envelopeMatch![1]);
    expect(envelope.fromSessionId).toBe('agent-1');
    expect(envelope.fromSessionName).toBe('Research Agent');
    expect(envelope.expectsResponse).toBe(true);
  });

  it('sendTextToSession returns correct preambleUsed value in both cases', async () => {
    const { service, configLoader } = makeService();

    // Test with preamble disabled
    (configLoader.getCliTypeEntry as ReturnType<typeof vi.fn>).mockReturnValue({
      helmPreambleForInterSession: false,
    });
    const noPreambleResult = await service.sendTextToSession('s1', 'msg', {
      senderSessionId: 'sender1',
      senderSessionName: 'Sender',
    });
    expect(noPreambleResult).toMatchObject({
      success: true,
      sessionId: 's1',
      name: 'Claude',
      preambleUsed: false,
    });

    // Test with preamble enabled
    (configLoader.getCliTypeEntry as ReturnType<typeof vi.fn>).mockReturnValue({
      helmPreambleForInterSession: true,
    });
    const preambleResult = await service.sendTextToSession('s1', 'msg', {
      senderSessionId: 'sender1',
      senderSessionName: 'Sender',
    });
    expect(preambleResult).toMatchObject({
      success: true,
      sessionId: 's1',
      name: 'Claude',
      preambleUsed: true,
    });
  });

  it('sendTextToSession with preamble=false does not include expectsResponse in text', async () => {
    const { service, ptyManager, configLoader } = makeService();
    (configLoader.getCliTypeEntry as ReturnType<typeof vi.fn>).mockReturnValue({
      helmPreambleForInterSession: false,
    });

    await service.sendTextToSession('s1', 'check status', {
      senderSessionId: 'sender1',
      senderSessionName: 'Sender',
      expectsResponse: true,
    });

    const deliverCall = (ptyManager.deliverText as ReturnType<typeof vi.fn>).mock.calls[0];
    const message = deliverCall[1] as string;
    // Without preamble, plain text — submit goes through ptyManager.write
    expect(message).toBe('check status');
    expect(ptyManager.write).toHaveBeenCalledWith('s1', '\r');
    expect(message).not.toContain('expectsResponse');
  });
});

// =============================================================================
// parseSubmitSuffix — escape sequence parsing for submit behavior
// =============================================================================

describe('parseSubmitSuffix', () => {
  describe('escape sequence parsing', () => {
    it('converts escape notation \\r to CR character', () => {
      expect(parseSubmitSuffix('\\r')).toBe('\r');
    });

    it('converts escape notation \\n to LF character', () => {
      expect(parseSubmitSuffix('\\n')).toBe('\n');
    });

    it('converts escape notation \\t to TAB character', () => {
      expect(parseSubmitSuffix('\\t')).toBe('\t');
    });

    it('converts escape notation \\r\\n to CRLF sequence', () => {
      expect(parseSubmitSuffix('\\r\\n')).toBe('\r\n');
    });

    it('handles mixed sequences like \\r\\n\\r (passthrough)', () => {
      // Only exact matches for \\r, \\n, \\t, \\r\\n are parsed.
      // \\r\\n\\r is not an exact match, so it passes through as-is.
      expect(parseSubmitSuffix('\\r\\n\\r')).toBe('\\r\\n\\r');
    });
  });

  describe('default behavior', () => {
    it('returns CR character when suffix is undefined', () => {
      expect(parseSubmitSuffix()).toBe('\r');
    });

    it('returns CR character when suffix is empty string', () => {
      expect(parseSubmitSuffix('')).toBe('\r');
    });

    it('returns CR character when suffix is null (falsy)', () => {
      expect(parseSubmitSuffix(null as unknown as string)).toBe('\r');
    });

    it('passes through whitespace-only string (not empty/falsy)', () => {
      // parseSubmitSuffix checks 'if (!suffix)', which is falsy check.
      // Whitespace-only string '   ' is truthy, so it passes through.
      expect(parseSubmitSuffix('   ')).toBe('   ');
    });
  });

  describe('edge cases', () => {
    it('passes through unrecognized strings as-is', () => {
      expect(parseSubmitSuffix('foo')).toBe('foo');
    });

    it('passes through arbitrary text without parsing', () => {
      expect(parseSubmitSuffix('hello world')).toBe('hello world');
    });

    it('preserves backslash in non-recognized sequences', () => {
      expect(parseSubmitSuffix('\\x')).toBe('\\x');
    });

    it('does not parse sequences inside larger strings', () => {
      // Only exact matches are parsed, e.g. just '\\r', not 'prefix\\rsuffix'
      expect(parseSubmitSuffix('prefix\\r')).toBe('prefix\\r');
    });

    it('differentiates between \\r and \\r\\n', () => {
      const cr = parseSubmitSuffix('\\r');
      const crlf = parseSubmitSuffix('\\r\\n');
      expect(cr).not.toBe(crlf);
      expect(cr).toBe('\r');
      expect(crlf).toBe('\r\n');
    });

    it('is case-sensitive (does not parse \\R as CR)', () => {
      expect(parseSubmitSuffix('\\R')).toBe('\\R');
    });

    it('handles actual control characters in input', () => {
      // If someone passes an actual CR character, it should pass through
      expect(parseSubmitSuffix('\r')).toBe('\r');
    });

    it('handles actual LF character in input', () => {
      expect(parseSubmitSuffix('\n')).toBe('\n');
    });

    it('handles actual TAB character in input', () => {
      expect(parseSubmitSuffix('\t')).toBe('\t');
    });

    it('handles actual CRLF sequence in input', () => {
      expect(parseSubmitSuffix('\r\n')).toBe('\r\n');
    });
  });

  describe('idempotency and stability', () => {
    it('returns consistent results for the same input', () => {
      const input = '\\r';
      expect(parseSubmitSuffix(input)).toBe(parseSubmitSuffix(input));
    });

    it('parsing twice does not change the result', () => {
      // First parse: '\\r' → '\r'
      const firstParse = parseSubmitSuffix('\\r');
      // Second parse: '\r' → '\r' (passthrough, not a recognized escape sequence)
      const secondParse = parseSubmitSuffix(firstParse);
      expect(secondParse).toBe('\r');
    });
  });

  describe('integration with sendTextToSession', () => {
    it('parseSubmitSuffix is used by sendTextToSession to determine submit behavior', async () => {
      const { service, ptyManager, configLoader } = makeService();
      (configLoader.getCliTypeEntry as ReturnType<typeof vi.fn>).mockReturnValue({
        submitSuffix: '\\n',
      });

      await service.sendTextToSession('s1', 'command', {
        senderSessionId: 'sender1',
        senderSessionName: 'Sender',
      });

      // Should have called ptyManager.write with LF (\n) as the submit suffix, not CR (\r)
      expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', expect.stringContaining('command'));
      expect(ptyManager.write).toHaveBeenCalledWith('s1', '\n');
    });

    it('sendTextToSession defaults to CR when no submitSuffix is configured', async () => {
      const { service, ptyManager, configLoader } = makeService();
      (configLoader.getCliTypeEntry as ReturnType<typeof vi.fn>).mockReturnValue({});

      await service.sendTextToSession('s1', 'command', {
        senderSessionId: 'sender1',
        senderSessionName: 'Sender',
      });

      expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', expect.stringContaining('command'));
      expect(ptyManager.write).toHaveBeenCalledWith('s1', '\r');
    });

    it('sendTextToSession with preamble=false also uses parseSubmitSuffix', async () => {
      const { service, ptyManager, configLoader } = makeService();
      (configLoader.getCliTypeEntry as ReturnType<typeof vi.fn>).mockReturnValue({
        helmPreambleForInterSession: false,
        submitSuffix: '\\r\\n',
      });

      await service.sendTextToSession('s1', 'command', {
        senderSessionId: 'sender1',
        senderSessionName: 'Sender',
      });

      expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', 'command');
      expect(ptyManager.write).toHaveBeenCalledWith('s1', '\r\n');
    });
  });
});
