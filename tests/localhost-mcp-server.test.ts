import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelmControlService } from '../src/mcp/helm-control-service.js';
import { LocalhostMcpServer } from '../src/mcp/localhost-mcp-server.js';
import { mintSessionAuthToken } from '../src/mcp/session-auth.js';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeService(): HelmControlService {
  return {
    listClis: vi.fn(() => [{ cliType: 'codex', name: 'codex', command: 'codex', supportsResume: false, supportedDirPaths: ['X:\\coding\\gamepad-cli-hub'] }]),
    listDirectories: vi.fn(() => [{ dirPath: 'X:\\coding\\gamepad-cli-hub', name: 'Helm', source: ['config', 'plans'], planCount: 8, sessionCount: 0 }]),
    listPlans: vi.fn((dirPath: string) => [{ id: 'p1', dirPath, title: 'Task', description: 'Desc', status: 'ready' }]),
    plansSummary: vi.fn(() => [{ id: 'p1', humanId: 'P-0001', title: 'Task', status: 'ready', blockedBy: [], blocks: [] }]),
    getPlan: vi.fn((id: string) => ({ id, dirPath: '/proj', title: 'Task', description: 'Desc', status: 'ready' })),
    createPlan: vi.fn((dirPath: string, title: string, description: string, type?: string) => ({ id: 'created', dirPath, title, description, status: 'ready', ...(type ? { type } : {}) })),
    updatePlan: vi.fn((id: string, updates: { title?: string; description?: string; type?: string | null }) => ({ id, dirPath: '/proj', title: updates.title ?? 'Task', description: updates.description ?? 'Desc', status: 'ready', ...(updates.type ? { type: updates.type } : {}) })),
    deletePlan: vi.fn(() => true),
    completePlan: vi.fn((id: string, _notes?: string) => ({ id, dirPath: '/proj', title: 'Task', description: 'Desc', status: 'done' })),
    setPlanState: vi.fn((id: string, status: string) => ({ id, dirPath: '/proj', title: 'Task', description: 'Desc', status })),
    linkPlans: vi.fn(),
    unlinkPlans: vi.fn(),
    listContexts: vi.fn((dirPath: string) => [{ id: 'ctx-1', dirPath, title: 'Testing Strategy', type: 'Testing', permission: 'readonly', content: 'Use vitest', x: null, y: null, createdAt: 1, updatedAt: 1, sequenceIds: ['seq-1'] }]),
    getContext: vi.fn((id: string) => ({ id, dirPath: '/proj', title: 'Testing Strategy', type: 'Testing', permission: 'readonly', content: 'Use vitest', x: null, y: null, createdAt: 1, updatedAt: 1, sequenceIds: ['seq-1'] })),
    createContext: vi.fn((input: Record<string, unknown>) => ({ id: 'ctx-1', createdAt: 1, updatedAt: 1, x: null, y: null, content: '', type: 'Knowledge', permission: 'readonly', ...input })),
    updateContext: vi.fn((id: string, updates: Record<string, unknown>) => ({ id, dirPath: '/proj', title: 'Updated Context', type: 'Knowledge', permission: 'readonly', content: '', x: null, y: null, createdAt: 1, updatedAt: 2, ...updates })),
    deleteContext: vi.fn(() => true),
    appendContext: vi.fn((id: string, text: string) => ({ id, dirPath: '/proj', title: 'Running Notes', type: 'Knowledge', permission: 'writable', content: `Before\n\n${text}`, x: null, y: null, createdAt: 1, updatedAt: 2 })),
    setContextPosition: vi.fn((id: string, x: number | null, y: number | null) => ({ id, dirPath: '/proj', title: 'Visual Anchor', type: 'Knowledge', permission: 'readonly', content: '', x, y, createdAt: 1, updatedAt: 2 })),
    listPlanAttachments: vi.fn(() => [{ id: 'a1', planId: 'p1', filename: 'note.txt', sizeBytes: 5, relativePath: 'p1/a1.txt', createdAt: 1, updatedAt: 1 }]),
    addPlanAttachment: vi.fn((planId: string, input: { filename: string; text?: string; contentBase64?: string; contentType?: string }) => ({
      id: 'a1',
      planId,
      filename: input.filename,
      ...(input.contentType ? { contentType: input.contentType } : {}),
      sizeBytes: input.text?.length ?? 3,
      relativePath: `${planId}/a1.txt`,
      createdAt: 1,
      updatedAt: 1,
    })),
    deletePlanAttachment: vi.fn(() => true),
    getPlanAttachment: vi.fn((planId: string, attachmentId: string) => ({
      attachment: { id: attachmentId, planId, filename: 'note.txt', sizeBytes: 5, relativePath: `${planId}/${attachmentId}.txt`, createdAt: 1, updatedAt: 1 },
      tempPath: 'C:\\Temp\\helm-attachment-a1-note.txt',
    })),
    exportDirectory: vi.fn((dirPath: string) => ({ dirPath, items: [], dependencies: [] })),
    exportItem: vi.fn((id: string) => ({ item: { id, dirPath: '/proj', title: 'Task', description: 'Desc', status: 'ready' }, dependencies: [] })),
    spawnCli: vi.fn((cliType: string, dirPath: string, name: string) => ({ id: 's2', name, cliType, workingDir: dirPath })),
    listSessions: vi.fn((dirPath?: string) => [{ id: 's1', name: 'Claude', cliType: 'claude-code', ...(dirPath ? { workingDir: dirPath } : {}) }]),
    getSession: vi.fn((sessionId: string) => ({ id: sessionId, name: 'Claude', cliType: 'claude-code' })),
    sendTextToSession: vi.fn(async (sessionRef: string, text: string, _options?: { submit?: boolean; senderSessionId?: string; senderSessionName?: string; expectsResponse?: boolean }) => ({ success: true, sessionId: sessionRef, name: 'Claude' })),
    readSessionTerminal: vi.fn((sessionRef: string, lines = 50, mode = 'both') => ({
      sessionId: sessionRef,
      name: 'Claude',
      cliType: 'claude-code',
      requestedLines: lines,
      returnedLines: 1,
      mode,
      ptyRunning: true,
      raw: ['\x1b[32mhello\x1b[0m'],
      stripped: ['hello'],
      lastOutputAt: 1234,
    })),
    setSessionWorkingPlan: vi.fn((sessionRef: string, planId: string) => ({ sessionId: sessionRef, name: 'Claude', planId, planTitle: 'Task', planStatus: 'coding' })),
    getTelegramStatus: vi.fn(() => ({
      enabled: true,
      configured: true,
      running: true,
      available: true,
      chatConfigured: true,
      allowedUsersConfigured: true,
      openChannels: 1,
      guidance: 'Use Telegram only for mobile-friendly urgent blockers.',
    })),
    listTelegramChannels: vi.fn(() => []),
    closeTelegramChannel: vi.fn(async (channelId: string) => ({ id: channelId, sessionId: 's1', sessionName: 'Claude', topicId: 42, status: 'closed', createdAt: 1, updatedAt: 3 })),
    sendTelegramChat: vi.fn(async (sessionRef: string, message: string) => ({
      sent: true,
    })),
    notifyUser: vi.fn((sessionRef: string, title: string, content: string) => ({ delivered: 'bubble', sessionRef, title, content })),
    getAppVisibility: vi.fn(() => ({ visibility: 'visible-focused', screenLocked: false, activeSessionId: 's1' })),
    createScheduledTask: vi.fn((params: Record<string, unknown>) => ({ id: 'task-1', status: 'pending', ...params })),
    listScheduledTasks: vi.fn(() => [{ id: 'task-1', title: 'Follow up', status: 'pending' }]),
    getScheduledTask: vi.fn((id: string) => ({ id, title: 'Follow up', status: 'pending' })),
    updateScheduledTask: vi.fn((id: string, updates: Record<string, unknown>) => ({ id, title: 'Updated', status: 'pending', ...updates })),
    cancelScheduledTask: vi.fn(() => true),
    deleteScheduledTask: vi.fn(() => true),
  } as unknown as HelmControlService;
}

async function rpc(port: number, token: string | null, body: unknown, headers: Record<string, string> = {}) {
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };
  if (token !== null) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }
  return fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify(body),
});
}

describe('LocalhostMcpServer', () => {
  const servers: LocalhostMcpServer[] = [];

  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop()!;
      await server.close();
    }
  });

  it('does not start when HELM_MCP_TOKEN is missing', async () => {
    const server = new LocalhostMcpServer(makeService(), { env: {} });
    servers.push(server);
    await expect(server.start()).resolves.toBe(false);
    expect(server.getAddress()).toBeNull();
  });

  it('requires bearer auth', async () => {
    const server = new LocalhostMcpServer(makeService(), { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const response = await rpc(port, null, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    expect(response.status).toBe(401);
  });

  it('serves initialize and tools/list requests', async () => {
    const server = new LocalhostMcpServer(makeService(), { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const initResponse = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    });
    const initJson = await initResponse.json();
    expect(initJson.result.protocolVersion).toBe('2025-06-18');

    const toolsResponse = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });
    const toolsJson = await toolsResponse.json();
    expect(Array.isArray(toolsJson.result.tools)).toBe(true);
    expect(toolsJson.result.tools.some((tool: { name: string }) => tool.name === 'plans_list')).toBe(true);
    const planCreateTool = toolsJson.result.tools.find((tool: { name: string }) => tool.name === 'plan_create');
    const planCompleteTool = toolsJson.result.tools.find((tool: { name: string }) => tool.name === 'plan_complete');
    const planNextLinkTool = toolsJson.result.tools.find((tool: { name: string }) => tool.name === 'plan_nextplan_link');
    const planSetStateTool = toolsJson.result.tools.find((tool: { name: string }) => tool.name === 'plan_set_state');
    const sendTextTool = toolsJson.result.tools.find((tool: { name: string }) => tool.name === 'session_send_text');
    const readTerminalTool = toolsJson.result.tools.find((tool: { name: string }) => tool.name === 'session_read_terminal');
    const attachmentAddTool = toolsJson.result.tools.find((tool: { name: string }) => tool.name === 'plan_attachment_add');
    const attachmentGetTool = toolsJson.result.tools.find((tool: { name: string }) => tool.name === 'plan_attachment_get');
    const telegramStatusTool = toolsJson.result.tools.find((tool: { name: string }) => tool.name === 'telegram_status');
    const telegramChatTool = toolsJson.result.tools.find((tool: { name: string }) => tool.name === 'telegram_chat');
    const schedulerCreateAlias = toolsJson.result.tools.find((tool: { name: string }) => tool.name === 'scheduler:create');
    const schedulerDeleteAlias = toolsJson.result.tools.find((tool: { name: string }) => tool.name === 'scheduler:delete');
    const notifyUserTool = toolsJson.result.tools.find((tool: { name: string }) => tool.name === 'notify_user');
    const appVisibilityTool = toolsJson.result.tools.find((tool: { name: string }) => tool.name === 'get_app_visibility');
    expect(planCreateTool.description).toContain('Problem Statement');
    expect(planCreateTool.description).toContain('Acceptance Criteria');
    expect(planCreateTool.description).toContain('QUESTION:');
    expect(planCreateTool.description).toContain('plan_nextplan_link');
    expect(planCreateTool.description).toContain('claim it by calling plan_set_state');
    expect(planCompleteTool.description).toContain('P-00xx');
    expect(planCompleteTool.description).toContain('implemented behavior');
    expect(planCompleteTool.description).toContain('tests or review');
    expect(planNextLinkTool.description).toContain('blocking questions');
    expect(planSetStateTool.description).toContain('planning');
    expect(planSetStateTool.description).toContain('ready');
    expect(planSetStateTool.description).toContain('session_set_working_plan');
    expect(sendTextTool.description).toContain('always submitted atomically');
    expect(sendTextTool.description).toContain('session_read_terminal');
    expect(readTerminalTool.description).toContain('terminal tail');
    expect(readTerminalTool.description).toContain('verify the recipient received');
    expect(readTerminalTool.description).toContain('raw ANSI');
    expect(attachmentAddTool.description).toContain('10MB');
    expect(attachmentAddTool.description).toContain('Helm config');
    expect(attachmentGetTool.description).toContain('temp file');
    expect(attachmentGetTool.description).toContain('inline');
    expect(telegramStatusTool.description).toContain('No bot token');
    expect(telegramChatTool!.description).toContain('mobile-friendly');
    expect(schedulerCreateAlias!.description).toContain('scheduled_task_create');
    expect(schedulerDeleteAlias!.description).toContain('Delete');
    expect(notifyUserTool!.description).toContain('notificationMode=llm');
    expect(appVisibilityTool!.description).toContain('screen-lock');
  });

  it('dispatches tool calls into the shared service', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const response = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'session_send_text',
        arguments: { sessionId: 's1', text: 'hello', senderSessionId: 's1' },
      },
    }, {
      Accept: 'application/json, text/event-stream',
      'Mcp-Method': 'tools/call',
      'Mcp-Name': 'session_send_text',
    });
    const json = await response.json();
    expect((service.sendTextToSession as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('s1', 'hello', { senderSessionId: 's1', senderSessionName: 'Claude' });
    expect(json.result.structuredContent).toEqual({ success: true, sessionId: 's1', name: 'Claude' });
  });

  it('dispatches context tools through the MCP surface', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const listResponse = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 34,
      method: 'tools/call',
      params: {
        name: 'context_list',
        arguments: { dirPath: '/proj' },
      },
    });
    const listJson = await listResponse.json();
    expect((service.listContexts as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('/proj');
    expect(listJson.result.structuredContent.items[0].id).toBe('ctx-1');

    const createResponse = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 35,
      method: 'tools/call',
      params: {
        name: 'context_create',
        arguments: { dirPath: '/proj', title: 'Testing Strategy', permission: 'readonly' },
      },
    });
    const createJson = await createResponse.json();
    expect((service.createContext as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({
      dirPath: '/proj',
      title: 'Testing Strategy',
      permission: 'readonly',
    });
    expect(createJson.result.structuredContent.title).toBe('Testing Strategy');
  });

  it('dispatches session_set_working_plan through the MCP surface', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const response = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 36,
      method: 'tools/call',
      params: {
        name: 'session_set_working_plan',
        arguments: { sessionId: 's1', planId: 'plan-1' },
      },
    });
    const json = await response.json();
    expect((service.setSessionWorkingPlan as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('s1', 'plan-1');
    expect(json.result.structuredContent).toEqual({
      sessionId: 's1',
      name: 'Claude',
      planId: 'plan-1',
      planTitle: 'Task',
      planStatus: 'coding',
    });
  });

  it('dispatches session_read_terminal through the MCP surface', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const response = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 41,
      method: 'tools/call',
      params: {
        name: 'session_read_terminal',
        arguments: { name: 'Claude', lines: 120, mode: 'both' },
      },
    });
    const json = await response.json();

    expect((service.readSessionTerminal as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('Claude', 120, 'both');
    expect(json.result.structuredContent).toMatchObject({
      sessionId: 'Claude',
      requestedLines: 120,
      raw: ['\x1b[32mhello\x1b[0m'],
      stripped: ['hello'],
    });
  });

  it('adds ownership reminders to plan_create and plan_set_state text without changing structured content', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const createResponse = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 37,
      method: 'tools/call',
      params: {
        name: 'plan_create',
        arguments: { dirPath: '/proj', title: 'Task', description: 'Desc' },
      },
    });
    const createJson = await createResponse.json();
    expect(createJson.result.structuredContent).toEqual({
      id: 'created',
      dirPath: '/proj',
      title: 'Task',
      description: 'Desc',
      status: 'ready',
    });
    expect(createJson.result.content[0].text).toContain('Reminder: creating a plan does not assign ownership');
    expect(createJson.result.content[0].text).toContain('Problem Statement');
    expect(createJson.result.content[0].text).toContain('QUESTION:');
    expect(createJson.result.content[0].text).toContain('plan_nextplan_link');
    expect(createJson.result.content[0].text).toContain('session_set_working_plan');

    const setStateResponse = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 38,
      method: 'tools/call',
      params: {
        name: 'plan_set_state',
        arguments: { id: 'p1', status: 'coding', sessionId: 's1' },
      },
    });
    const setStateJson = await setStateResponse.json();
    expect(setStateJson.result.structuredContent).toEqual({
      id: 'p1',
      dirPath: '/proj',
      title: 'Task',
      description: 'Desc',
      status: 'coding',
    });
    expect(setStateJson.result.content[0].text).toContain('Reminder: ownership is explicit');
    expect(setStateJson.result.content[0].text).toContain('session_set_working_plan');
  });

  it('sets plan type through plan_create and plan_update MCP calls', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const createResponse = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 39,
      method: 'tools/call',
      params: {
        name: 'plan_create',
        arguments: { dirPath: '/proj', title: 'Task', description: 'Desc', type: 'bug' },
      },
    });
    const createJson = await createResponse.json();
    expect((service.createPlan as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('/proj', 'Task', 'Desc', 'bug');
    expect(createJson.result.structuredContent.type).toBe('bug');

    const updateResponse = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 40,
      method: 'tools/call',
      params: {
        name: 'plan_update',
        arguments: { id: 'p1', type: 'research' },
      },
    });
    const updateJson = await updateResponse.json();
    expect((service.updatePlan as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('p1', { type: 'research' });
    expect(updateJson.result.structuredContent.type).toBe('research');
  });

  it('dispatches plan attachment tools through the MCP surface', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const addResponse = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 60,
      method: 'tools/call',
      params: {
        name: 'plan_attachment_add',
        arguments: { planId: 'P-0001', filename: 'note.txt', text: 'hello', contentType: 'text/plain' },
      },
    });
    const addJson = await addResponse.json();
    expect((service.addPlanAttachment as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('P-0001', {
      filename: 'note.txt',
      text: 'hello',
      contentType: 'text/plain',
    });
    expect(addJson.result.structuredContent).toMatchObject({ id: 'a1', planId: 'P-0001', filename: 'note.txt' });

    const listResponse = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 61,
      method: 'tools/call',
      params: {
        name: 'plan_attachment_list',
        arguments: { planId: 'P-0001' },
      },
    });
    const listJson = await listResponse.json();
    expect((service.listPlanAttachments as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('P-0001');
    expect(listJson.result.structuredContent.items[0].id).toBe('a1');

    const getResponse = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 62,
      method: 'tools/call',
      params: {
        name: 'plan_attachment_get',
        arguments: { planId: 'P-0001', attachmentId: 'a1' },
      },
    });
    const getJson = await getResponse.json();
    expect((service.getPlanAttachment as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('P-0001', 'a1');
    expect(getJson.result.structuredContent.tempPath).toContain('helm-attachment');

    const deleteResponse = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 63,
      method: 'tools/call',
      params: {
        name: 'plan_attachment_delete',
        arguments: { planId: 'P-0001', attachmentId: 'a1' },
      },
    });
    const deleteJson = await deleteResponse.json();
    expect((service.deletePlanAttachment as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('P-0001', 'a1');
    expect(deleteJson.result.structuredContent).toEqual({ deleted: true });
  });

  it('dispatches telegram tools through the MCP surface', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const statusResponse = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 70,
      method: 'tools/call',
      params: { name: 'telegram_status', arguments: {} },
    });
    const statusJson = await statusResponse.json();
    expect((service.getTelegramStatus as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    expect(statusJson.result.structuredContent.available).toBe(true);
    expect(JSON.stringify(statusJson.result.structuredContent)).not.toContain('botToken');

    const chatResponse = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 71,
      method: 'tools/call',
      params: { name: 'telegram_chat', arguments: { sessionId: 's1', message: 'Need a quick decision?' } },
    });
    const chatJson = await chatResponse.json();
    expect((service.sendTelegramChat as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('s1', 'Need a quick decision?', undefined);
    expect(chatJson.result.structuredContent.sent).toBe(true);

    const attachment = { name: 'log.txt', data: 'aGVsbG8=', mime: 'text/plain' };
    await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 711,
      method: 'tools/call',
      params: { name: 'telegram_chat', arguments: { sessionId: 's1', message: 'See log', attachment } },
    });
    expect((service.sendTelegramChat as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('s1', 'See log', attachment);

    const closeResponse = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 72,
      method: 'tools/call',
      params: { name: 'telegram_channel_close', arguments: { channelId: 'tc1' } },
    });
    const closeJson = await closeResponse.json();
    expect((service.closeTelegramChannel as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('tc1');
    expect(closeJson.result.structuredContent.status).toBe('closed');
  });

  it('dispatches LLM notification tools through the MCP surface', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const notifyResponse = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 73,
      method: 'tools/call',
      params: { name: 'notify_user', arguments: { sessionId: 's1', title: 'Need input', content: 'Choose one' } },
    });
    const notifyJson = await notifyResponse.json();
    expect((service.notifyUser as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('s1', 'Need input', 'Choose one');
    expect(notifyJson.result.structuredContent.delivered).toBe('bubble');

    const visibilityResponse = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 74,
      method: 'tools/call',
      params: { name: 'get_app_visibility', arguments: {} },
    });
    const visibilityJson = await visibilityResponse.json();
    expect((service.getAppVisibility as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    expect(visibilityJson.result.structuredContent).toMatchObject({ visibility: 'visible-focused', activeSessionId: 's1' });
  });

  it('dispatches scheduler alias tools through the MCP surface', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 81,
      method: 'tools/call',
      params: {
        name: 'scheduler:create',
        arguments: {
          title: 'Follow up',
          initialPrompt: 'check status',
          cliType: 'claude-code',
          dirPath: 'X:\\coding\\gamepad-cli-hub',
          scheduledTime: '2026-05-04T10:00:00Z',
        },
      },
    });
    expect((service.createScheduledTask as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Follow up',
      scheduledTime: '2026-05-04T10:00:00Z',
    }));

    await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 811,
      method: 'tools/call',
      params: {
        name: 'scheduled_task_create',
        arguments: {
          title: 'Weekday report',
          initialPrompt: 'report',
          cliType: 'claude-code',
          dirPath: 'X:\\coding\\gamepad-cli-hub',
          scheduledTime: '2026-05-04T08:00:00Z',
          scheduleKind: 'cron',
          cronExpression: '0 9 * * 1-5',
          endDate: '2026-12-31T23:59:59Z',
        },
      },
    });
    expect((service.createScheduledTask as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(expect.objectContaining({
      scheduleKind: 'cron',
      cronExpression: '0 9 * * 1-5',
      endDate: '2026-12-31T23:59:59Z',
    }));

    await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 82,
      method: 'tools/call',
      params: { name: 'scheduler:list', arguments: {} },
    });
    expect((service.listScheduledTasks as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalled();

    await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 83,
      method: 'tools/call',
      params: { name: 'scheduler:update', arguments: { id: 'task-1', title: 'Updated' } },
    });
    expect((service.updateScheduledTask as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('task-1', { title: 'Updated' });

    await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 84,
      method: 'tools/call',
      params: { name: 'scheduler:delete', arguments: { id: 'task-1' } },
    });
    expect((service.deleteScheduledTask as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('task-1');
  });

  it('clears plan type through plan_update when type is null', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 41,
      method: 'tools/call',
      params: {
        name: 'plan_update',
        arguments: { id: 'p1', type: null },
      },
    });

    expect((service.updatePlan as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('p1', { type: null });
  });

  it('wraps array results in a record for structuredContent', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const response = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 31,
      method: 'tools/call',
      params: {
        name: 'plans_list',
        arguments: { dirPath: 'X:\\coding\\gamepad-cli-hub' },
      },
    });
    const json = await response.json();
    expect(json.result.structuredContent).toEqual({
      items: [{ id: 'p1', dirPath: 'X:\\coding\\gamepad-cli-hub', title: 'Task', description: 'Desc', status: 'ready' }],
    });
  });

  it('plans_summary dispatches to plansSummary and wraps array result', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const response = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 32,
      method: 'tools/call',
      params: {
        name: 'plans_summary',
        arguments: { dirPath: 'X:\\coding\\gamepad-cli-hub' },
      },
    });
    const json = await response.json();
    expect(service.plansSummary).toHaveBeenCalledWith('X:\\coding\\gamepad-cli-hub');
    expect(json.result.structuredContent).toEqual({
      items: [{ id: 'p1', humanId: 'P-0001', title: 'Task', status: 'ready', blockedBy: [], blocks: [] }],
    });
  });

  it('lists directories through the MCP surface', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const response = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 32,
      method: 'tools/call',
      params: {
        name: 'directories_list',
        arguments: {},
      },
    });
    const json = await response.json();
    expect(json.result.structuredContent).toEqual({
      items: [{ dirPath: 'X:\\coding\\gamepad-cli-hub', name: 'Helm', source: ['config', 'plans'], planCount: 8, sessionCount: 0 }],
    });
  });

  it('lists configured cli types through the MCP surface', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const response = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 34,
      method: 'tools/call',
      params: {
        name: 'tools_list',
        arguments: {},
      },
    });
    const json = await response.json();
    expect(json.result.structuredContent).toEqual({
      items: [{ cliType: 'codex', name: 'codex', command: 'codex', supportsResume: false, supportedDirPaths: ['X:\\coding\\gamepad-cli-hub'] }],
    });
  });

  it('spawns a cli session through the MCP surface', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const response = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 35,
      method: 'tools/call',
      params: {
        name: 'session_create',
        arguments: { cliType: 'codex', dirPath: 'X:\\coding\\gamepad-cli-hub', name: 'Builder' },
      },
    });
    const json = await response.json();
    expect((service.spawnCli as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('codex', 'X:\\coding\\gamepad-cli-hub', 'Builder', undefined);
    expect(json.result.structuredContent).toEqual({ id: 's2', name: 'Builder', cliType: 'codex', workingDir: 'X:\\coding\\gamepad-cli-hub' });
  });

  it('passes an optional dirPath filter into sessions_list', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 33,
      method: 'tools/call',
      params: {
        name: 'sessions_list',
        arguments: { dirPath: 'X:\\coding\\gamepad-cli-hub' },
      },
    });

    expect((service.listSessions as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('X:\\coding\\gamepad-cli-hub');
  });

  it('returns explicit errors instead of null structured content for invalid plan transitions', async () => {
    const service = makeService();
    (service.getPlan as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'p1', dirPath: '/proj', title: 'Task', description: 'Desc', status: 'ready' });
    (service.setPlanState as unknown as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const response = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'plan_set_state',
        arguments: { id: 'p1', status: 'blocked', stateInfo: 'waiting' },
      },
    });
    const json = await response.json();
    expect(json.error.message).toContain('could not be set to blocked');
  });

  it('requires a sessionId when setting an unassigned plan to doing', async () => {
    const service = makeService();
    (service.getPlan as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'p1', dirPath: '/proj', title: 'Task', description: 'Desc', status: 'ready' });

    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const response = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'plan_set_state',
        arguments: { id: 'p1', status: 'coding' },
      },
    });
    const json = await response.json();
    expect(json.error.message).toContain('sessionId is required');
  });

  it('returns explicit not-found errors for session_get', async () => {
    const service = makeService();
    (service.getSession as unknown as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const response = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'session_get',
        arguments: { sessionId: 'missing-session' },
      },
    });
    const json = await response.json();
    expect(json.error.message).toBe('Session not found: missing-session');
  });

  it('passes sender info into sendTextToSession', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const response = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 38,
      method: 'tools/call',
      params: {
        name: 'session_send_text',
        arguments: { sessionId: 's1', text: 'hello', senderSessionId: 's1' },
      },
    });
    const json = await response.json();
    expect((service.sendTextToSession as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('s1', 'hello', { senderSessionId: 's1', senderSessionName: 'Claude' });
    expect(json.result.structuredContent).toEqual({ success: true, sessionId: 's1', name: 'Claude' });
  });

  it('infers sender info from a trusted session token when explicit sender fields are omitted', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;
    const sessionToken = mintSessionAuthToken('secret-token', 'sender-1', 'Codex Session');

    const response = await rpc(port, sessionToken, {
      jsonrpc: '2.0',
      id: 38.5,
      method: 'tools/call',
      params: {
        name: 'session_send_text',
        arguments: { sessionId: 's1', text: 'hello', expectsResponse: true },
      },
    });
    const json = await response.json();
    expect((service.sendTextToSession as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('s1', 'hello', {
      senderSessionId: 'sender-1',
      senderSessionName: 'Codex Session',
      expectsResponse: true,
    });
    expect(json.result.structuredContent).toEqual({ success: true, sessionId: 's1', name: 'Claude' });
  });

  it('passes expectsResponse into sendTextToSession', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const response = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 39,
      method: 'tools/call',
      params: {
        name: 'session_send_text',
        arguments: { sessionId: 's1', text: 'hello', senderSessionId: 's1', expectsResponse: true },
      },
    });
    const json = await response.json();
    expect((service.sendTextToSession as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('s1', 'hello', { senderSessionId: 's1', senderSessionName: 'Claude', expectsResponse: true });
    expect(json.result.structuredContent).toEqual({ success: true, sessionId: 's1', name: 'Claude' });
  });

  it('rejects session_send_text when sender info is missing', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const response = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 40,
      method: 'tools/call',
      params: {
        name: 'session_send_text',
        arguments: { sessionId: 's1', text: 'hello' },
      },
    });
    const json = await response.json();
    expect(json.error.message).toContain('senderSessionId is required');
  });

  it('rejects session_send_text when senderSessionId does not match a known session', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const response = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 40.1,
      method: 'tools/call',
      params: {
        name: 'session_send_text',
        arguments: { sessionId: 's1', text: 'hello', senderSessionId: 'unknown-id' },
      },
    });
    const json = await response.json();
    expect(json.error.message).toContain('Unknown sender session');
    expect(json.error.message).toContain('HELM_SESSION_ID');
  });

  it('rejects session_send_text when neither sessionId nor name is provided', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const response = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 41,
      method: 'tools/call',
      params: {
        name: 'session_send_text',
        arguments: { text: 'hello', senderSessionId: 's1' },
      },
    });
    const json = await response.json();
    expect(json.error.message).toContain('sessionId is required');
  });

  it('rejects session_send_text when text is missing', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const response = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 42,
      method: 'tools/call',
      params: {
        name: 'session_send_text',
        arguments: { sessionId: 's1', senderSessionId: 's1' },
      },
    });
    const json = await response.json();
    expect(json.error.message).toContain('text is required');
  });

  it('returns 405 for GET requests', async () => {
    const server = new LocalhostMcpServer(makeService(), { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const response = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'GET' });
    expect(response.status).toBe(405);
  });

  it('session_info guide documents AIAGENT transitions, state systems, integration patterns, and errors', () => {
    const service = new HelmControlService(
      {} as any,
      {
        getSession: vi.fn(() => ({
          id: 'sess-123',
          name: 'Claude-Main',
          cliType: 'claude-code',
          processId: 42,
          workingDir: 'X:\\coding\\gamepad-cli-hub',
        })),
      } as any,
      {} as any,
      {
        getMcpConfig: vi.fn(() => ({ port: 47373, authToken: 'secret-token-value' })),
        getWorkingDirectories: vi.fn(() => [{ path: 'X:\\coding\\gamepad-cli-hub', name: 'Helm' }]),
      } as any,
      {} as any,
    );

    const content = service.getSessionInfo({ sessionId: 'sess-123', sessionName: 'Claude-Main' });
    const guide = content.aiagent_state_guide!;

    expect(content.aiagent_states).toEqual(['planning', 'implementing', 'completed', 'idle']);
    expect(guide.how_to_update.description).toContain('session_set_aiagent_state');
    expect(guide.state_transitions).toHaveLength(5);
    expect(guide.state_transitions.every((transition) => transition.from && transition.to && transition.when)).toBe(true);
    expect(guide.integration_patterns.map((pattern) => pattern.scenario)).toEqual([
      'Starting implementation',
      'Completing work',
    ]);
  });

  it('session_info returns complete SessionInfo with MCP endpoint and state registry', async () => {
    const service = makeService();
    (service as any).getSessionInfo = vi.fn((authContext) => ({
      sessionId: 'sess-123',
      sessionName: 'Claude-Main',
      cliType: 'claude-code',
      workingDir: 'X:\\coding\\gamepad-cli-hub',
      mcp_url: 'http://127.0.0.1:47373/mcp',
      mcp_token: 'secret-token-value',
      aiagent_states: ['planning', 'implementing', 'completed', 'idle'],
      available_directories: [
        { path: 'X:\\coding\\gamepad-cli-hub', name: 'Helm' },
      ],
    }));

    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const response = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 100,
      method: 'tools/call',
      params: {
        name: 'session_info',
        arguments: {},
      },
    });

    const json = await response.json();
    expect((service as any).getSessionInfo).toHaveBeenCalled();
    const content = json.result.structuredContent;
    expect(content.sessionId).toBe('sess-123');
    expect(content.sessionName).toBe('Claude-Main');
    expect(content.cliType).toBe('claude-code');
    expect(content.mcp_url).toBe('http://127.0.0.1:47373/mcp');
    expect(content.aiagent_states).toContain('planning');
    expect(content.aiagent_states).toContain('implementing');
    expect(content.available_tools).toBeUndefined();
    expect(content.available_directories).toHaveLength(1);
  });

  it('session_info tool is included in tools/list response', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const response = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 101,
      method: 'tools/list',
      params: {},
    });

    const json = await response.json();
    const sessionInfoTool = json.result.tools.find((t: { name: string }) => t.name === 'session_info');
    expect(sessionInfoTool).toBeDefined();
    expect(sessionInfoTool.title).toBe('Get Session Info');
    expect(sessionInfoTool.description).toContain('AIAGENT state registry');
    expect(sessionInfoTool.description).toContain('MCP endpoint URL');
    expect(sessionInfoTool.description).toContain('WHEN:');
    expect(sessionInfoTool.description).toContain('session_set_aiagent_state');
    expect(sessionInfoTool.inputSchema.properties).toEqual({});
  });

  it('session_info response reminds agents to set AIAGENT state', async () => {
    const service = makeService();
    (service as any).getSessionInfo = vi.fn(() => ({
      mandatory_rules: ['ALWAYS call session_set_aiagent_state when your phase changes.'],
      mcp_url: 'http://127.0.0.1:47373/mcp',
      mcp_token: 'secret-token-value',
      aiagent_states: ['planning', 'implementing', 'completed', 'idle'],
      available_directories: [],
    }));
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const response = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 102,
      method: 'tools/call',
      params: { name: 'session_info', arguments: {} },
    });

    const json = await response.json();
    expect(json.result.content[0].text).toContain('Reminder: now call session_set_aiagent_state');
    expect(json.result.structuredContent.mandatory_rules[0]).toContain('session_set_aiagent_state');
  });

  it('session_read_terminal response reminds agents to verify handoff receipt', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const response = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 103,
      method: 'tools/call',
      params: {
        name: 'session_read_terminal',
        arguments: { sessionId: 's1', lines: 20, mode: 'stripped' },
      },
    });

    const json = await response.json();
    expect(json.result.content[0].text).toContain('inspect this terminal tail for receipt evidence');
    expect(json.result.content[0].text).toContain('report that uncertainty');
  });

  describe('plan_complete with documentation', () => {
    it('accepts valid documentation and passes it through', async () => {
      const service = makeService();
      (service.getPlan as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'p1', dirPath: '/proj', title: 'Task', description: 'Desc', status: 'coding' });
      (service.completePlan as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'p1', dirPath: '/proj', title: 'Task', description: 'Desc', status: 'done', completionNotes: 'All tests pass and feature works' });

      const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
      servers.push(server);
      await server.start();
      const port = server.getAddress()!.port;

      const response = await rpc(port, 'secret-token', {
        jsonrpc: '2.0',
        id: 50,
        method: 'tools/call',
        params: {
          name: 'plan_complete',
          arguments: { id: 'p1', documentation: 'All tests pass and feature works' },
        },
      });
      const json = await response.json();
      expect((service.completePlan as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('p1', 'All tests pass and feature works');
      expect(json.result.structuredContent.completionNotes).toBe('All tests pass and feature works');
    });

    it('rejects missing documentation param', async () => {
      const service = makeService();
      const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
      servers.push(server);
      await server.start();
      const port = server.getAddress()!.port;

      const response = await rpc(port, 'secret-token', {
        jsonrpc: '2.0',
        id: 51,
        method: 'tools/call',
        params: {
          name: 'plan_complete',
          arguments: { id: 'p1' },
        },
      });
      const json = await response.json();
      expect(json.error.message).toContain('documentation is required');
    });

    it('rejects documentation shorter than 10 characters', async () => {
      const service = makeService();
      const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
      servers.push(server);
      await server.start();
      const port = server.getAddress()!.port;

      const response = await rpc(port, 'secret-token', {
        jsonrpc: '2.0',
        id: 52,
        method: 'tools/call',
        params: {
          name: 'plan_complete',
          arguments: { id: 'p1', documentation: 'short' },
        },
      });
      const json = await response.json();
      expect(json.error.message).toContain('at least 10 characters');
    });
  });

  describe('session_send_text MCP response — helmPreambleForInterSession', () => {
    it('session_send_text MCP response when preambleUsed=true', async () => {
      const service = makeService();
      // Update mock to return two sessions
      (service.listSessions as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
        { id: 's1', name: 'Claude', cliType: 'claude-code' },
        { id: 's2', name: 'Worker', cliType: 'claude-code' },
      ]);

      const sendTextMock = (service.sendTextToSession as unknown as ReturnType<typeof vi.fn>);
      sendTextMock.mockImplementationOnce(async () => ({
        success: true,
        sessionId: 's1',
        name: 'Claude',
        preambleUsed: true,
      }));

      const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
      servers.push(server);
      await server.start();
      const port = server.getAddress()!.port;

      const response = await rpc(port, 'secret-token', {
        jsonrpc: '2.0',
        id: 80,
        method: 'tools/call',
        params: {
          name: 'session_send_text',
          arguments: { sessionId: 's1', text: 'hello', senderSessionId: 's2', expectsResponse: false },
        },
      });

      expect(response.ok).toBe(true);
      const json = await response.json();
      expect(json).toBeDefined();

      if (json.error) {
        throw new Error(`MCP error: ${json.error.message}`);
      }

      expect(json.result).toBeDefined();
      expect(json.result.structuredContent).toEqual({
        success: true,
        sessionId: 's1',
        name: 'Claude',
        preambleUsed: true,
      });

      // When preambleUsed=true, the response should NOT include the polling-specific text
      const textContent = json.result.content[0].text;
      expect(textContent).not.toContain('cannot reply via HELM_MSG');
      // It should include the standard reminder (getToolReminder for session_send_text)
      expect(textContent).toContain('session_read_terminal');
    });

    it('session_send_text MCP response when preambleUsed=false with expectsResponse=true', async () => {
      const service = makeService();
      // Update mock to return multiple sessions
      (service.listSessions as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
        { id: 'target-sess', name: 'Recipient', cliType: 'claude-code' },
        { id: 'sender-sess', name: 'Sender', cliType: 'claude-code' },
      ]);

      const sendTextMock = (service.sendTextToSession as unknown as ReturnType<typeof vi.fn>);
      sendTextMock.mockImplementationOnce(async () => ({
        success: true,
        sessionId: 'target-sess',
        name: 'Recipient',
        preambleUsed: false,
      }));

      const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
      servers.push(server);
      await server.start();
      const port = server.getAddress()!.port;

      const response = await rpc(port, 'secret-token', {
        jsonrpc: '2.0',
        id: 81,
        method: 'tools/call',
        params: {
          name: 'session_send_text',
          arguments: {
            sessionId: 'target-sess',
            text: 'what is the status?',
            senderSessionId: 'sender-sess',
            expectsResponse: true,
          },
        },
      });
      const json = await response.json();

      expect(json.result.structuredContent).toEqual({
        success: true,
        sessionId: 'target-sess',
        name: 'Recipient',
        preambleUsed: false,
      });

      // When preambleUsed=false, the response should include the polling hint
      const textContent = json.result.content[0].text;
      expect(textContent).toContain('cannot reply via HELM_MSG');
      expect(textContent).toContain("session_read_terminal with sessionId='target-sess'");
      expect(textContent).toContain("lines=50, mode='stripped'");
    });

    it('session_send_text MCP response when preambleUsed=false includes exact sessionId in polling hint', async () => {
      const service = makeService();
      // Update mock to return multiple sessions
      (service.listSessions as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
        { id: 'abc-123-xyz', name: 'MySession', cliType: 'claude-code' },
        { id: 'sender1', name: 'Sender', cliType: 'claude-code' },
      ]);

      const sendTextMock = (service.sendTextToSession as unknown as ReturnType<typeof vi.fn>);
      sendTextMock.mockImplementationOnce(async () => ({
        success: true,
        sessionId: 'abc-123-xyz',
        name: 'MySession',
        preambleUsed: false,
      }));

      const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
      servers.push(server);
      await server.start();
      const port = server.getAddress()!.port;

      const response = await rpc(port, 'secret-token', {
        jsonrpc: '2.0',
        id: 82,
        method: 'tools/call',
        params: {
          name: 'session_send_text',
          arguments: {
            sessionId: 'abc-123-xyz',
            text: 'test message',
            senderSessionId: 'sender1',
          },
        },
      });
      const json = await response.json();
      const textContent = json.result.content[0].text;

      // The polling hint must contain the exact sessionId for the read_terminal call
      expect(textContent).toContain("sessionId='abc-123-xyz'");
      expect(textContent).not.toContain('target-sess');
    });

    it('session_send_text text response is properly formatted when preambleUsed=false', async () => {
      const service = makeService();
      // Update mock to return multiple sessions
      (service.listSessions as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
        { id: 's1', name: 'Claude', cliType: 'claude-code' },
        { id: 's2', name: 'Worker', cliType: 'claude-code' },
      ]);

      const sendTextMock = (service.sendTextToSession as unknown as ReturnType<typeof vi.fn>);
      sendTextMock.mockImplementationOnce(async () => ({
        success: true,
        sessionId: 's1',
        name: 'Claude',
        preambleUsed: false,
      }));

      const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
      servers.push(server);
      await server.start();
      const port = server.getAddress()!.port;

      const response = await rpc(port, 'secret-token', {
        jsonrpc: '2.0',
        id: 83,
        method: 'tools/call',
        params: {
          name: 'session_send_text',
          arguments: {
            sessionId: 's1',
            text: 'message',
            senderSessionId: 's2',
            expectsResponse: false,
          },
        },
      });
      const json = await response.json();
      const textContent = json.result.content[0].text;

      // Should start with the JSON result
      expect(textContent).toMatch(/^\{\s*"success"/);
      // Should include the polling hint after the JSON
      expect(textContent).toContain('cannot reply via HELM_MSG');
    });

    it('session_send_text with preambleUsed=true uses standard reminder text', async () => {
      const service = makeService();
      // Update mock to return multiple sessions
      (service.listSessions as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
        { id: 's1', name: 'Claude', cliType: 'claude-code' },
        { id: 's2', name: 'Worker', cliType: 'claude-code' },
      ]);

      const sendTextMock = (service.sendTextToSession as unknown as ReturnType<typeof vi.fn>);
      sendTextMock.mockImplementationOnce(async () => ({
        success: true,
        sessionId: 's1',
        name: 'Claude',
        preambleUsed: true,
      }));

      const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
      servers.push(server);
      await server.start();
      const port = server.getAddress()!.port;

      const response = await rpc(port, 'secret-token', {
        jsonrpc: '2.0',
        id: 84,
        method: 'tools/call',
        params: {
          name: 'session_send_text',
          arguments: {
            sessionId: 's1',
            text: 'hello with preamble',
            senderSessionId: 's2',
            expectsResponse: true,
          },
        },
      });
      const json = await response.json();
      const textContent = json.result.content[0].text;

      // The standard reminder for session_send_text mentions session_read_terminal
      expect(textContent).toContain('session_read_terminal');
      // But should NOT mention the no-preamble polling scenario
      expect(textContent).not.toContain('cannot reply via HELM_MSG');
    });

    it('session_send_text distinguishes between preamble=true and preamble=false responses', async () => {
      const service = makeService();
      // Update mock to return multiple sessions
      (service.listSessions as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
        { id: 's1', name: 'Claude', cliType: 'claude-code' },
        { id: 's2', name: 'Worker', cliType: 'claude-code' },
      ]);

      const sendTextMock = (service.sendTextToSession as unknown as ReturnType<typeof vi.fn>);

      const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
      servers.push(server);
      await server.start();
      const port = server.getAddress()!.port;

      // Call 1: with preamble
      sendTextMock.mockImplementationOnce(async () => ({
        success: true,
        sessionId: 's1',
        name: 'Claude',
        preambleUsed: true,
      }));

      const response1 = await rpc(port, 'secret-token', {
        jsonrpc: '2.0',
        id: 85,
        method: 'tools/call',
        params: {
          name: 'session_send_text',
          arguments: { sessionId: 's1', text: 'msg1', senderSessionId: 's2' },
        },
      });
      const json1 = await response1.json();
      const text1 = json1.result.content[0].text;
      const hasPreambleText1 = text1.includes('cannot reply via HELM_MSG');

      // Call 2: without preamble
      sendTextMock.mockImplementationOnce(async () => ({
        success: true,
        sessionId: 's1',
        name: 'Claude',
        preambleUsed: false,
      }));

      const response2 = await rpc(port, 'secret-token', {
        jsonrpc: '2.0',
        id: 86,
        method: 'tools/call',
        params: {
          name: 'session_send_text',
          arguments: { sessionId: 's1', text: 'msg2', senderSessionId: 's2' },
        },
      });
      const json2 = await response2.json();
      const text2 = json2.result.content[0].text;
      const hasPreambleText2 = text2.includes('cannot reply via HELM_MSG');

      // Response 1 should NOT have the polling hint (preamble was used)
      expect(hasPreambleText1).toBe(false);
      // Response 2 should HAVE the polling hint (preamble was not used)
      expect(hasPreambleText2).toBe(true);
    });
  });
});
