import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelmControlService } from '../src/mcp/helm-control-service.js';
import { LocalhostMcpServer } from '../src/mcp/localhost-mcp-server.js';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeService(): HelmControlService {
  return {
    listPlans: vi.fn((dirPath: string) => [{ id: 'p1', dirPath, title: 'Task', description: 'Desc', status: 'startable' }]),
    getPlan: vi.fn((id: string) => ({ id, dirPath: '/proj', title: 'Task', description: 'Desc', status: 'startable' })),
    createPlan: vi.fn((dirPath: string, title: string, description: string) => ({ id: 'created', dirPath, title, description, status: 'startable' })),
    updatePlan: vi.fn((id: string, updates: { title?: string; description?: string }) => ({ id, dirPath: '/proj', title: updates.title ?? 'Task', description: updates.description ?? 'Desc', status: 'startable' })),
    deletePlan: vi.fn(() => true),
    completePlan: vi.fn((id: string) => ({ id, dirPath: '/proj', title: 'Task', description: 'Desc', status: 'done' })),
    setPlanState: vi.fn((id: string, status: string) => ({ id, dirPath: '/proj', title: 'Task', description: 'Desc', status })),
    addDependency: vi.fn(() => true),
    removeDependency: vi.fn(() => true),
    exportDirectory: vi.fn((dirPath: string) => ({ dirPath, items: [], dependencies: [] })),
    exportItem: vi.fn((id: string) => ({ item: { id, dirPath: '/proj', title: 'Task', description: 'Desc', status: 'startable' }, dependencies: [] })),
    listSessions: vi.fn(() => [{ id: 's1', name: 'Claude', cliType: 'claude-code' }]),
    getSession: vi.fn((sessionId: string) => ({ id: sessionId, name: 'Claude', cliType: 'claude-code' })),
    sendTextToSession: vi.fn(async () => ({ success: true })),
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
        arguments: { sessionId: 's1', text: 'hello' },
      },
    }, {
      Accept: 'application/json, text/event-stream',
      'Mcp-Method': 'tools/call',
      'Mcp-Name': 'session_send_text',
    });
    const json = await response.json();
    expect((service.sendTextToSession as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('s1', 'hello');
    expect(json.result.structuredContent).toEqual({ success: true });
  });

  it('returns 405 for GET requests', async () => {
    const server = new LocalhostMcpServer(makeService(), { token: 'secret-token', port: 0 });
    servers.push(server);
    await server.start();
    const port = server.getAddress()!.port;

    const response = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'GET' });
    expect(response.status).toBe(405);
  });
});
