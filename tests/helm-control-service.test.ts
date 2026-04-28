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

    expect(info).not.toHaveProperty('available_tools');
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

    expect(ptyManager.getTerminalTail).toHaveBeenCalledWith('s1', 100, 'both');
    expect(result).toEqual({
      sessionId: 's1',
      name: 'Claude',
      cliType: 'claude-code',
      workingDir: '/work',
      requestedLines: 120,
      returnedLines: 1,
      clamped: true,
      maxLines: 100,
      mode: 'both',
      ptyRunning: true,
      lastOutputAt: 1234,
      raw: ['\x1b[31mraw\x1b[0m'],
      stripped: ['raw'],
    });
  });

  it('rejects invalid line counts', () => {
    const { service } = makeService();
    expect(() => service.readSessionTerminal('s1', 0, 'raw')).toThrow('lines must be an integer from 1 to 100');
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
      listChannels: vi.fn(() => [{ id: 'tc1', sessionId: 's1', sessionName: 'Claude', status: 'open', expectsResponse: true, createdAt: 1, updatedAt: 1 }]),
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

  it('creates channels and sends mobile-friendly messages through the bridge', async () => {
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
      createChannel: vi.fn(async () => ({ id: 'tc1', sessionId: 's1', sessionName: 'Claude', topicId: 42, status: 'open' as const, expectsResponse: true, createdAt: 1, updatedAt: 1 })),
      closeChannel: vi.fn(),
      sendToUser: vi.fn(async () => ({
        sent: true,
        channel: { id: 'tc1', sessionId: 's1', sessionName: 'Claude', topicId: 42, status: 'open' as const, expectsResponse: true, createdAt: 1, updatedAt: 2 },
        messageId: 99,
      })),
    };
    service.setTelegramBridge(bridge);

    const channel = await service.createTelegramChannel('s1', true);
    const sent = await service.sendTelegramToUser('s1', 'Need a quick decision?', { expectsResponse: true });

    expect(bridge.createChannel).toHaveBeenCalledWith({ sessionId: 's1', expectsResponse: true });
    expect(bridge.sendToUser).toHaveBeenCalledWith({ sessionId: 's1', text: 'Need a quick decision?', expectsResponse: true });
    expect(channel.id).toBe('tc1');
    expect(sent.sent).toBe(true);
  });

  it('rejects unavailable Telegram and wide messages', async () => {
    const { service } = makeService();

    await expect(service.sendTelegramToUser('s1', 'hello')).rejects.toThrow('Telegram bridge');

    service.setTelegramBridge({
      isRunning: vi.fn(() => true),
      listChannels: vi.fn(() => []),
      createChannel: vi.fn(),
      closeChannel: vi.fn(),
      sendToUser: vi.fn(),
    });

    await expect(service.sendTelegramToUser('s1', 'x'.repeat(141))).rejects.toThrow('140 characters');
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
