import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { McpConfig } from '../config/loader.js';
import { logger } from '../utils/logger.js';
import { HelmControlService } from './helm-control-service.js';

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
}

interface McpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const MCP_PROTOCOL_VERSION = '2025-06-18';
const DEFAULT_PORT = 47373;
const DEFAULT_HOST = '127.0.0.1';
const MCP_PATH = '/mcp';

const TOOLS: McpTool[] = [
  {
    name: 'plans_list',
    title: 'List Plans',
    description: 'List all plan items for a directory.',
    inputSchema: {
      type: 'object',
      properties: { dirPath: { type: 'string' } },
      required: ['dirPath'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_get',
    title: 'Get Plan',
    description: 'Get a single plan item by ID.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_create',
    title: 'Create Plan',
    description: 'Create a plan item in a directory.',
    inputSchema: {
      type: 'object',
      properties: {
        dirPath: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['dirPath', 'title', 'description'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_update',
    title: 'Update Plan',
    description: 'Update a plan item title and or description.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_delete',
    title: 'Delete Plan',
    description: 'Delete a plan item.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_set_state',
    title: 'Set Plan State',
    description: 'Set a plan item state to pending, startable, doing, wait-tests, blocked, or question.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'startable', 'doing', 'wait-tests', 'blocked', 'question'] },
        stateInfo: { type: 'string' },
        sessionId: { type: 'string' },
      },
      required: ['id', 'status'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_complete',
    title: 'Complete Plan',
    description: 'Mark a doing or wait-tests plan item as done.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_add_dependency',
    title: 'Add Dependency',
    description: 'Add a dependency edge from one plan item to another.',
    inputSchema: {
      type: 'object',
      properties: {
        fromId: { type: 'string' },
        toId: { type: 'string' },
      },
      required: ['fromId', 'toId'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_remove_dependency',
    title: 'Remove Dependency',
    description: 'Remove a dependency edge between two plan items.',
    inputSchema: {
      type: 'object',
      properties: {
        fromId: { type: 'string' },
        toId: { type: 'string' },
      },
      required: ['fromId', 'toId'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_export_directory',
    title: 'Export Directory Plans',
    description: 'Export all plan items and dependencies for a directory.',
    inputSchema: {
      type: 'object',
      properties: { dirPath: { type: 'string' } },
      required: ['dirPath'],
      additionalProperties: false,
    },
  },
  {
    name: 'sessions_list',
    title: 'List Sessions',
    description: 'List currently known Helm sessions.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'session_get',
    title: 'Get Session',
    description: 'Get one Helm session by ID.',
    inputSchema: {
      type: 'object',
      properties: { sessionId: { type: 'string' } },
      required: ['sessionId'],
      additionalProperties: false,
    },
  },
  {
    name: 'session_send_text',
    title: 'Send Text To Session',
    description: 'Send text to a running session PTY.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['sessionId', 'text'],
      additionalProperties: false,
    },
  },
];

export interface LocalhostMcpServerOptions {
  host?: string;
  port?: number;
  token?: string;
  enabled?: boolean;
  env?: NodeJS.ProcessEnv;
}

export class LocalhostMcpServer {
  private server = createServer((req, res) => {
    void this.handleRequest(req, res);
  });
  private started = false;
  private readonly host: string;
  private port: number;
  private token: string;
  private enabled: boolean;

  constructor(
    private readonly service: HelmControlService,
    options: LocalhostMcpServerOptions = {},
  ) {
    const env = options.env ?? process.env;
    this.host = options.host ?? env.HELM_MCP_HOST ?? DEFAULT_HOST;
    this.port = options.port ?? parsePort(env.HELM_MCP_PORT) ?? DEFAULT_PORT;
    this.token = options.token ?? env.HELM_MCP_TOKEN ?? '';
    this.enabled = options.enabled ?? (env.HELM_MCP_ENABLED ? env.HELM_MCP_ENABLED === '1' : this.token.trim().length > 0);
  }

  isEnabled(): boolean {
    return this.enabled && this.token.trim().length > 0;
  }

  async start(): Promise<boolean> {
    if (!this.isEnabled()) {
      logger.info('[MCP] Localhost MCP server disabled by config or missing auth token');
      return false;
    }
    if (this.started) return true;
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, this.host, () => {
        this.server.off('error', reject);
        resolve();
      });
    });
    this.started = true;
    logger.info(`[MCP] Listening on http://${this.host}:${this.port}${MCP_PATH}`);
    return true;
  }

  async applyConfig(config: McpConfig): Promise<void> {
    const nextEnabled = config.enabled === true;
    const nextPort = parsePort(String(config.port)) ?? DEFAULT_PORT;
    const nextToken = config.authToken ?? '';
    const shouldRestart = this.started && (nextPort !== this.port || nextToken !== this.token || nextEnabled !== this.enabled);

    this.enabled = nextEnabled;
    this.port = nextPort;
    this.token = nextToken;

    if (shouldRestart) {
      await this.close();
    }
    if (this.isEnabled()) {
      await this.start();
    } else if (this.started) {
      await this.close();
    }
  }

  async close(): Promise<void> {
    if (!this.started) return;
    await new Promise<void>((resolve, reject) => {
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    this.started = false;
    logger.info('[MCP] Localhost MCP server stopped');
  }

  getAddress(): AddressInfo | null {
    const address = this.server.address();
    return address && typeof address !== 'string' ? address : null;
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if ((req.url ?? '') !== MCP_PATH) {
      this.writeJson(res, 404, { error: 'Not found' });
      return;
    }
    if (req.method === 'GET') {
      res.writeHead(405, { Allow: 'POST' });
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST, GET' });
      res.end();
      return;
    }
    if (!this.isAuthorized(req)) {
      logger.warn('[MCP] Unauthorized request rejected');
      this.writeJson(res, 401, { error: 'Unauthorized' });
      return;
    }

    let payload: JsonRpcRequest;
    try {
      payload = JSON.parse(await this.readBody(req)) as JsonRpcRequest;
    } catch {
      this.writeJson(res, 400, { error: 'Invalid JSON' });
      return;
    }

    const id = payload.id ?? null;
    if (payload.jsonrpc !== '2.0' || typeof payload.method !== 'string') {
      this.writeJsonRpcError(res, id, -32600, 'Invalid Request');
      return;
    }

    if (payload.id === undefined) {
      if (payload.method === 'notifications/initialized') {
        res.writeHead(202);
        res.end();
        return;
      }
      this.writeJson(res, 202, {});
      return;
    }

    try {
      switch (payload.method) {
        case 'initialize':
          this.writeJsonRpcResult(res, id, {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: 'helm-localhost-mcp', version: '1.0.0' },
          });
          return;
        case 'tools/list':
          this.writeJsonRpcResult(res, id, { tools: TOOLS });
          return;
        case 'tools/call': {
          const params = payload.params ?? {};
          const name = asString(params.name, 'Tool name is required');
          const args = asRecord(params.arguments);
          const result = await this.callTool(name, args);
          this.writeJsonRpcResult(res, id, {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
          });
          return;
        }
        default:
          this.writeJsonRpcError(res, id, -32601, `Method not found: ${payload.method}`);
      }
    } catch (error) {
      this.writeJsonRpcError(res, id, -32000, error instanceof Error ? error.message : String(error));
    }
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'plans_list':
        return this.service.listPlans(asString(args.dirPath, 'dirPath is required'));
      case 'plan_get':
        return requireResult(
          this.service.getPlan(asString(args.id, 'id is required')),
          `Plan not found: ${asString(args.id, 'id is required')}`,
        );
      case 'plan_create':
        return this.service.createPlan(
          asString(args.dirPath, 'dirPath is required'),
          asString(args.title, 'title is required'),
          asString(args.description, 'description is required'),
        );
      case 'plan_update':
        return requireResult(
          this.service.updatePlan(asString(args.id, 'id is required'), {
            ...(typeof args.title === 'string' ? { title: args.title } : {}),
            ...(typeof args.description === 'string' ? { description: args.description } : {}),
          }),
          `Plan not found: ${asString(args.id, 'id is required')}`,
        );
      case 'plan_delete':
        return {
          deleted: requireBooleanResult(
            this.service.deletePlan(asString(args.id, 'id is required')),
            `Plan not found: ${asString(args.id, 'id is required')}`,
          ),
        };
      case 'plan_set_state':
        return this.setPlanStateWithValidation(
          asString(args.id, 'id is required'),
          asPlanStatus(args.status),
          typeof args.stateInfo === 'string' ? args.stateInfo : undefined,
          typeof args.sessionId === 'string' ? args.sessionId : undefined,
        );
      case 'plan_complete':
        return this.completePlanWithValidation(asString(args.id, 'id is required'));
      case 'plan_add_dependency':
        return {
          added: requireBooleanResult(
            this.service.addDependency(
              asString(args.fromId, 'fromId is required'),
              asString(args.toId, 'toId is required'),
            ),
            'Dependency could not be added. Check IDs, directory match, duplicate edges, and cycle constraints.',
          ),
        };
      case 'plan_remove_dependency':
        return {
          removed: requireBooleanResult(
            this.service.removeDependency(
              asString(args.fromId, 'fromId is required'),
              asString(args.toId, 'toId is required'),
            ),
            'Dependency not found.',
          ),
        };
      case 'plan_export_directory':
        return requireResult(
          this.service.exportDirectory(asString(args.dirPath, 'dirPath is required')),
          `No plans found for directory: ${asString(args.dirPath, 'dirPath is required')}`,
        );
      case 'sessions_list':
        return this.service.listSessions();
      case 'session_get':
        return requireResult(
          this.service.getSession(asString(args.sessionId, 'sessionId is required')),
          `Session not found: ${asString(args.sessionId, 'sessionId is required')}`,
        );
      case 'session_send_text':
        return this.service.sendTextToSession(
          asString(args.sessionId, 'sessionId is required'),
          asString(args.text, 'text is required'),
        );
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private setPlanStateWithValidation(
    id: string,
    status: 'pending' | 'startable' | 'doing' | 'wait-tests' | 'blocked' | 'question',
    stateInfo?: string,
    sessionId?: string,
  ): unknown {
    const current = requireResult(this.service.getPlan(id), `Plan not found: ${id}`);
    if (status === 'doing' && !sessionId && !current.sessionId) {
      throw new Error('sessionId is required when setting a plan to doing unless it is already assigned to a session');
    }
    return requireResult(
      this.service.setPlanState(id, status, stateInfo, sessionId),
      `Plan ${id} could not be set to ${status} from its current state`,
    );
  }

  private completePlanWithValidation(id: string): unknown {
    requireResult(this.service.getPlan(id), `Plan not found: ${id}`);
    return requireResult(
      this.service.completePlan(id),
      `Plan ${id} could not be completed from its current state`,
    );
  }

  private isAuthorized(req: IncomingMessage): boolean {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return false;
    const provided = Buffer.from(header.slice(7), 'utf8');
    const expected = Buffer.from(this.token, 'utf8');
    if (provided.length !== expected.length) return false;
    return timingSafeEqual(provided, expected);
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  private writeJsonRpcResult(res: ServerResponse, id: JsonRpcId, result: unknown): void {
    this.writeJson(res, 200, { jsonrpc: '2.0', id, result });
  }

  private writeJsonRpcError(res: ServerResponse, id: JsonRpcId, code: number, message: string): void {
    this.writeJson(res, 200, { jsonrpc: '2.0', id, error: { code, message } });
  }

  private writeJson(res: ServerResponse, statusCode: number, body: unknown): void {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(body));
  }
}

function parsePort(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return null;
  return parsed;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown, errorMessage: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(errorMessage);
  }
  return value;
}

function asPlanStatus(value: unknown): 'pending' | 'startable' | 'doing' | 'wait-tests' | 'blocked' | 'question' {
  if (value === 'pending' || value === 'startable' || value === 'doing' || value === 'wait-tests' || value === 'blocked' || value === 'question') {
    return value;
  }
  throw new Error('status must be one of pending, startable, doing, wait-tests, blocked, or question');
}

function requireResult<T>(value: T | null, message: string): T {
  if (value === null) {
    throw new Error(message);
  }
  return value;
}

function requireBooleanResult(value: boolean, message: string): true {
  if (!value) {
    throw new Error(message);
  }
  return true;
}
