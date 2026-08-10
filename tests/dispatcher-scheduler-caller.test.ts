import { describe, expect, it } from 'vitest';
import { callMcpTool } from '../src/mcp/tools/dispatcher.js';
import type { HelmControlService } from '../src/mcp/helm-control-service.js';
import type { McpToolDispatcherDeps } from '../src/mcp/tools/dispatcher.js';

class FakeSchedulerService {
  received: Record<string, unknown> | null = null;

  createScheduledTask(params: Record<string, unknown>) {
    this.received = params;
    return { id: 'task-1' };
  }
}

function deps(service: FakeSchedulerService): McpToolDispatcherDeps {
  return {
    service: service as unknown as HelmControlService,
    setPlanStateWithValidation: () => ({}),
    completePlanWithValidation: () => ({}),
  };
}

describe('scheduler_create targetSession:"caller"', () => {
  it('persists the authenticated caller as the direct target', async () => {
    const service = new FakeSchedulerService();

    await expect(callMcpTool(deps(service), 'scheduler_create', {
      title: 'Self timer', initialPrompt: 'Continue', cliType: 'claude', dirPath: 'X:\\work',
      scheduledTime: '2026-08-11T00:00:00.000Z', mode: 'direct', targetSession: 'caller',
    }, { sessionId: 'creator-session' })).resolves.toEqual({ id: 'task-1' });

    expect(service.received).toMatchObject({ mode: 'direct', targetSessionId: 'creator-session' });
  });

  it('requires an authenticated session for caller targeting', async () => {
    const service = new FakeSchedulerService();

    await expect(callMcpTool(deps(service), 'scheduler_create', {
      title: 'Self timer', initialPrompt: 'Continue', cliType: 'claude', dirPath: 'X:\\work',
      scheduledTime: '2026-08-11T00:00:00.000Z', mode: 'direct', targetSession: 'caller',
    }, {})).rejects.toThrow('could not determine your session');
  });
});
