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
    listPlans: vi.fn((dirPath: string) => [{ id: 'p1', dirPath, title: 'Task', description: 'Desc', status: 'startable' }]),
    plansSummary: vi.fn(() => [{ id: 'p1', humanId: 'P-0001', title: 'Task', status: 'startable', blockedBy: [], blocks: [] }]),
    getPlan: vi.fn((id: string) => ({ id, dirPath: '/proj', title: 'Task', description: 'Desc', status: 'startable' })),
    createPlan: vi.fn((dirPath: string, title: string, description: string) => ({ id: 'created', dirPath, title, description, status: 'startable' })),
    updatePlan: vi.fn((id: string, updates: { title?: string; description?: string }) => ({ id, dirPath: '/proj', title: updates.title ?? 'Task', description: updates.description ?? 'Desc', status: 'startable' })),
    deletePlan: vi.fn(() => true),
    completePlan: vi.fn((id: string) => ({ id, dirPath: '/proj', title: 'Task', description: 'Desc', status: 'done' })),
    setPlanState: vi.fn((id: string, status: string) => ({ id, dirPath: '/proj', title: 'Task', description: 'Desc', status })),
    linkPlans: vi.fn(),
    unlinkPlans: vi.fn(),
    exportDirectory: vi.fn((dirPath: string) => ({ dirPath, items: [], dependencies: [] })),
    exportItem: vi.fn((id: string) => ({ item: { id, dirPath: '/proj', title: 'Task', description: 'Desc', status: 'startable' }, dependencies: [] })),
    spawnCli: vi.fn((cliType: string, dirPath: string, name: string) => ({ id: 's2', name, cliType, workingDir: dirPath })),
    listSessions: vi.fn((dirPath?: string) => [{ id: 's1', name: 'Claude', cliType: 'claude-code', ...(dirPath ? { workingDir: dirPath } : {}) }]),
    getSession: vi.fn((sessionId: string) => ({ id: sessionId, name: 'Claude', cliType: 'claude-code' })),
    sendTextToSession: vi.fn(async (sessionRef: string, text: string, _options?: { submit?: boolean; senderSessionId?: string; senderSessionName?: string; expectsResponse?: boolean }) => ({ success: true, sessionId: sessionRef, name: 'Claude' })),
    setSessionWorkingPlan: vi.fn((sessionRef: string, planId: string) => ({ sessionId: sessionRef, name: 'Claude', planId, planTitle: 'Task', planStatus: 'doing' })),
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
    expect((service.sendTextToSession as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('s1', 'hello', { submit: true, senderSessionId: 's1', senderSessionName: 'Claude' });
    expect(json.result.structuredContent).toEqual({ success: true, sessionId: 's1', name: 'Claude' });
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
      planStatus: 'doing',
    });
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
      items: [{ id: 'p1', dirPath: 'X:\\coding\\gamepad-cli-hub', title: 'Task', description: 'Desc', status: 'startable' }],
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
      items: [{ id: 'p1', humanId: 'P-0001', title: 'Task', status: 'startable', blockedBy: [], blocks: [] }],
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
        name: 'helm_session_create',
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
    (service.getPlan as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'p1', dirPath: '/proj', title: 'Task', description: 'Desc', status: 'startable' });
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
    (service.getPlan as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'p1', dirPath: '/proj', title: 'Task', description: 'Desc', status: 'startable' });

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
        arguments: { id: 'p1', status: 'doing' },
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

  it('supports submit=false to send text without Enter', async () => {
    const service = makeService();
    const server = new LocalhostMcpServer(service, { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const response = await rpc(port, 'secret-token', {
      jsonrpc: '2.0',
      id: 37,
      method: 'tools/call',
      params: {
        name: 'session_send_text',
        arguments: { sessionId: 's1', text: 'hello', submit: false, senderSessionId: 's1' },
      },
    });
    const json = await response.json();
    expect((service.sendTextToSession as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('s1', 'hello', { submit: false, senderSessionId: 's1', senderSessionName: 'Claude' });
    expect(json.result.structuredContent).toEqual({ success: true, sessionId: 's1', name: 'Claude' });
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
    expect((service.sendTextToSession as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('s1', 'hello', { submit: true, senderSessionId: 's1', senderSessionName: 'Claude' });
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
      submit: true,
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
    expect((service.sendTextToSession as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('s1', 'hello', { submit: true, senderSessionId: 's1', senderSessionName: 'Claude', expectsResponse: true });
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
      available_tools: [
        { name: 'tools_list', title: 'List CLI Types' },
        { name: 'session_info', title: 'Get Session Info' },
      ],
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
    expect(content.available_tools).toHaveLength(2);
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
    expect(sessionInfoTool.inputSchema.properties).toEqual({});
  });
});
