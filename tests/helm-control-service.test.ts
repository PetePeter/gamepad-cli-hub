import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelmControlService } from '../src/mcp/helm-control-service.js';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeService() {
  const ptyManager = {
    has: vi.fn(() => true),
    deliverText: vi.fn(() => Promise.resolve()),
    write: vi.fn(),
  };
  const sessionManager = {
    getSession: vi.fn((id: string) => ({ id, name: 'Claude', cliType: 'claude-code' })),
    getAllSessions: vi.fn(() => [{ id: 's1', name: 'Claude', cliType: 'claude-code' }]),
  };
  const planManager = {
    getForDirectory: vi.fn(() => []),
  };
  const configLoader = {
    getWorkingDirectories: vi.fn(() => []),
    getCliTypeEntry: vi.fn(() => ({})),
    getAllCliTypes: vi.fn(() => []),
    getCliTypeConfig: vi.fn(() => ({})),
  };

  const service = new HelmControlService(
    planManager as unknown as import('../src/session/plan-manager.js').PlanManager,
    sessionManager as unknown as import('../src/session/manager.js').SessionManager,
    ptyManager as unknown as import('../src/session/pty-manager.js').PtyManager,
    configLoader as unknown as import('../src/config/loader.js').ConfigLoader,
  );

  return { service, ptyManager, sessionManager };
}

describe('HelmControlService.sendTextToSession', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delivers text, then sends a separate submit action when submit is true', async () => {
    const { service, ptyManager } = makeService();
    await service.sendTextToSession('s1', 'hello');
    expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', 'hello');
    expect(ptyManager.write).toHaveBeenCalledWith('s1', '\r');
  });

  it('does not send a submit action when submit is false', async () => {
    const { service, ptyManager } = makeService();
    await service.sendTextToSession('s1', 'hello', { submit: false });
    expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', 'hello');
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
    expect(callArg).toMatch(/^\[HELM_MSG\]/);

    const envelopeMatch = callArg.match(/^\[HELM_MSG\](\{[^\n]+\})\nhello/);
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
    });

    const callArg = (ptyManager.deliverText as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    const envelopeMatch = callArg.match(/^\[HELM_MSG\](\{[^\n]+\})\nhello/);
    const envelope = JSON.parse(envelopeMatch![1]);
    expect(envelope.expectsResponse).toBe(false);
  });

  it('does not wrap text when no sender info is provided', async () => {
    const { service, ptyManager } = makeService();
    await service.sendTextToSession('s1', 'hello');
    expect(ptyManager.deliverText).toHaveBeenCalledWith('s1', 'hello');
    expect(ptyManager.write).toHaveBeenCalledWith('s1', '\r');
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
});
