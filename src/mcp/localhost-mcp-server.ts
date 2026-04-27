import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { McpConfig } from '../config/loader.js';
import { logger } from '../utils/logger.js';
import { HelmControlService } from './helm-control-service.js';
import { parseSessionAuthToken } from './session-auth.js';

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

interface AuthContext {
  sessionId?: string;
  sessionName?: string;
}

const MCP_PROTOCOL_VERSION = '2025-06-18';
const DEFAULT_PORT = 47373;
const DEFAULT_HOST = '127.0.0.1';
const MCP_PATH = '/mcp';

const TOOLS: McpTool[] = [
  {
    name: 'tools_list',
    title: 'List CLI Types',
    description: 'List CLI types configured in Helm and the configured working directories they can be spawned into. Call this near the start of a Helm workflow when you need to know what CLIs and spawn targets are actually available before creating a session.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'plans_list',
    title: 'List Plans',
    description: 'List all plan items for a directory. Use this before editing or assigning plan work so you can reference the human-readable plan IDs Helm returns.',
    inputSchema: {
      type: 'object',
      properties: { dirPath: { type: 'string' } },
      required: ['dirPath'],
      additionalProperties: false,
    },
  },
  {
    name: 'plans_summary',
    title: 'Plans Summary',
    description: 'List all plans for a directory as a compact summary — status, human-readable ID, title, and dependency relationships. Call this first when orienting to a project so you know what work exists and what is blocked by what. Use plan_get for the full description of a specific plan.',
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
    description: 'Get a single plan item by ID. Use this when you need full plan details, including human-readable ID and timestamps, before changing state or discussing a plan with the user.',
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
        type: { type: 'string', enum: ['bug', 'feature', 'research'] },
      },
      required: ['dirPath', 'title', 'description'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_update',
    title: 'Update Plan',
    description: 'Update a plan item title, description, and/or type.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        type: { type: 'string', enum: ['bug', 'feature', 'research'] },
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
    description: 'Set a plan item state to planning, startable, coding, review, or blocked. Use this when the lifecycle state itself changed; if you only need the session row to point at the current plan, prefer session_set_working_plan.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string', enum: ['planning', 'startable', 'coding', 'review', 'blocked'] },
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
    description: 'Mark a coding or review plan item as done.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_nextplan_link',
    title: 'Link Next Plan',
    description: 'Link one plan item as a prerequisite for another. A plan can have many outgoing links (to many next plans) and many incoming links (from many previous plans). The source plan must complete before the target plan can start.',
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
    name: 'plan_nextplan_unlink',
    title: 'Unlink Next Plan',
    description: 'Remove a prerequisite link between two plan items.',
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
    name: 'directories_list',
    title: 'List Directories',
    description: 'List known working directories, including configured folders and directories that currently have plans or sessions. Call this when you need to discover which project directories Helm knows about before creating plans or sessions.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'session_create',
    title: 'Create Session',
    description: 'Spawn a new CLI session in a configured working directory and give it a stable display name for later lookup. Call this when no suitable session exists yet and you need Helm to launch one.',
    inputSchema: {
      type: 'object',
      properties: {
        cliType: { type: 'string' },
        dirPath: { type: 'string' },
        name: { type: 'string' },
        prompt: { type: 'string' },
      },
      required: ['cliType', 'dirPath', 'name'],
      additionalProperties: false,
    },
  },
  {
    name: 'sessions_list',
    title: 'List Sessions',
    description: 'List currently known Helm sessions, optionally filtered to one working directory. Call this before sending text so you can target an existing session instead of spawning blindly.',
    inputSchema: {
      type: 'object',
      properties: {
        dirPath: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'session_get',
    title: 'Get Session',
    description: 'Get one Helm session by session ID or exact display name. Use this when you need session details, including its current working-plan pointer, before deciding what to send or update.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        name: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'session_send_text',
    title: 'Send Text To Session',
    description:
      'Send text to a running session PTY. ' +
      'DESTINATION: Provide sessionId (the target session that will receive the text). ' +
      'SENDER: Provide senderSessionId (your own session ID from the HELM_SESSION_ID env var). ' +
      'IMPORTANT: Destination and sender MUST be different sessions — self-messages are rejected. ' +
      'When submit is true (default), Helm inserts the text and then issues a send/submit action separately. ' +
      'Optional expectsResponse marks HELM inter-LLM envelopes that expect a reply. ' +
      'RECEIVING RESPONSES: When the target session replies, Helm pastes a [HELM_MSG] envelope directly into the sender session\'s chatbox as a new user message — there is no polling or callback; the reply arrives as an inbound chat turn in your own session.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: '[DESTINATION] Target session ID — MUST be different from senderSessionId.',
        },
        text: { type: 'string' },
        submit: { type: 'boolean', default: true },
        senderSessionId: {
          type: 'string',
          description:
            '[SENDER] Your session ID — MUST equal the HELM_SESSION_ID environment variable injected by Helm at startup. ' +
            'Retrieve it with `echo $HELM_SESSION_ID` (bash) or read process.env.HELM_SESSION_ID (Node.js). ' +
            'IMPORTANT: must be DIFFERENT from the destination sessionId.',
        },
        expectsResponse: { type: 'boolean', default: false },
      },
      required: ['text', 'sessionId', 'senderSessionId'],
      additionalProperties: false,
    },
  },
  {
    name: 'session_set_working_plan',
    title: 'Set Session Working Plan',
    description: 'Update which plan the session row should show as currently being worked on, assigning the plan to that session when allowed. Call this when the agent has moved on to a different plan item and you want the Helm session list to reflect that explicitly.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        name: { type: 'string' },
        planId: { type: 'string' },
      },
      required: ['planId'],
      additionalProperties: false,
    },
  },
  {
    name: 'session_info',
    title: 'Get Session Info',
    description: 'Retrieve current session context including MCP endpoint URL, AIAGENT state registry, available tools, and working directories. Autocall at session startup to prime the AIAGENT state registry. Returns mcp_url and mcp_token for building MCP requests, plus the canonical list of valid AIAGENT-* state tags.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'session_set_aiagent_state',
    title: 'Set Session AIAGENT State',
    description: 'Update the AIAGENT state for a session. This state persists across restarts and is controlled by external agents to show the current working state (planning, implementing, completed, idle).',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        name: { type: 'string' },
        state: { type: 'string', enum: ['planning', 'implementing', 'completed', 'idle'] },
      },
      required: ['state'],
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
    const authContext = this.getAuthContext(req);
    if (!authContext) {
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
          const result = await this.callTool(name, args, authContext);
          const structuredContent = normalizeStructuredContent(result);
          this.writeJsonRpcResult(res, id, {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            structuredContent,
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

  private async callTool(name: string, args: Record<string, unknown>, authContext: AuthContext): Promise<unknown> {
    switch (name) {
      case 'plans_list':
        return this.service.listPlans(asString(args.dirPath, 'dirPath is required'));
      case 'plans_summary':
        return this.service.plansSummary(asString(args.dirPath, 'dirPath is required'));
      case 'tools_list':
        return this.service.listClis();
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
          typeof args.type === 'string' ? (args.type as 'bug' | 'feature' | 'research') : undefined,
        );
      case 'plan_update':
        return requireResult(
          this.service.updatePlan(asString(args.id, 'id is required'), {
            ...(typeof args.title === 'string' ? { title: args.title } : {}),
            ...(typeof args.description === 'string' ? { description: args.description } : {}),
            ...(typeof args.type === 'string' ? { type: args.type as 'bug' | 'feature' | 'research' } : {}),
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
      case 'plan_nextplan_link':
        this.service.linkPlans(
          asString(args.fromId, 'fromId is required'),
          asString(args.toId, 'toId is required'),
        );
        return { linked: true };
      case 'plan_nextplan_unlink':
        this.service.unlinkPlans(
          asString(args.fromId, 'fromId is required'),
          asString(args.toId, 'toId is required'),
        );
        return { unlinked: true };
      case 'directories_list':
        return this.service.listDirectories();
      case 'session_create':
        return this.service.spawnCli(
          asString(args.cliType, 'cliType is required'),
          asString(args.dirPath, 'dirPath is required'),
          asString(args.name, 'name is required'),
          typeof args.prompt === 'string' ? args.prompt : undefined,
        );
      case 'sessions_list':
        return this.service.listSessions(typeof args.dirPath === 'string' ? args.dirPath : undefined);
      case 'session_get':
        return requireResult(
          this.service.getSession(asString(args.sessionId ?? args.name, 'sessionId or name is required')),
          `Session not found: ${asString(args.sessionId ?? args.name, 'sessionId or name is required')}`,
        );
      case 'session_send_text': {
        const explicitSenderId = typeof args.senderSessionId === 'string' ? args.senderSessionId : undefined;
        const senderSessionId = explicitSenderId ?? authContext.sessionId;
        if (!senderSessionId) {
          throw new Error(
            'senderSessionId is required — use the HELM_SESSION_ID environment variable injected by Helm at startup.',
          );
        }
        // Session-scoped tokens are trusted; global-token callers must verify against known sessions.
        let senderSessionName: string;
        if (!explicitSenderId && authContext.sessionName) {
          senderSessionName = authContext.sessionName;
        } else {
          const knownSessions = this.service.listSessions();
          const senderSession = knownSessions.find((s) => s.id === senderSessionId);
          if (!senderSession) {
            throw new Error(
              `Unknown sender session: senderSessionId "${senderSessionId}" does not match any active Helm session. ` +
                'senderSessionId must be the exact value of the HELM_SESSION_ID environment variable ' +
                'that Helm injected into your session at startup — do not guess or construct this value.',
            );
          }
          senderSessionName = senderSession.name;
        }
        return this.service.sendTextToSession(
          asString(args.sessionId, 'sessionId is required'),
          asString(args.text, 'text is required'),
          {
            submit: typeof args.submit === 'boolean' ? args.submit : true,
            senderSessionId,
            senderSessionName,
            ...(typeof args.expectsResponse === 'boolean' ? { expectsResponse: args.expectsResponse } : {}),
          },
        );
      }
      case 'session_set_working_plan':
        return this.service.setSessionWorkingPlan(
          asString(args.sessionId ?? args.name, 'sessionId or name is required'),
          asString(args.planId, 'planId is required'),
        );
      case 'session_info':
        return this.service.getSessionInfo(authContext);
      case 'session_set_aiagent_state':
        return this.service.setAiagentState(
          asString(args.sessionId ?? args.name, 'sessionId or name is required'),
          asAiagentState(args.state, 'state must be one of planning, implementing, completed, or idle'),
        );
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private setPlanStateWithValidation(
    id: string,
    status: 'planning' | 'startable' | 'coding' | 'review' | 'blocked',
    stateInfo?: string,
    sessionId?: string,
  ): unknown {
    const current = requireResult(this.service.getPlan(id), `Plan not found: ${id}`);
    if (status === 'coding' && !sessionId && !current.sessionId) {
      throw new Error('sessionId is required when setting a plan to coding unless it is already assigned to a session');
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

  private getAuthContext(req: IncomingMessage): AuthContext | null {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    const token = header.slice(7);
    const provided = Buffer.from(token, 'utf8');
    const expected = Buffer.from(this.token, 'utf8');
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) {
      return {};
    }
    return parseSessionAuthToken(this.token, token);
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

function asPlanStatus(value: unknown): 'planning' | 'startable' | 'coding' | 'review' | 'blocked' {
  if (value === 'planning' || value === 'startable' || value === 'coding' || value === 'review' || value === 'blocked') {
    return value;
  }
  throw new Error('status must be one of planning, startable, coding, review, or blocked');
}

function asAiagentState(value: unknown, errorMessage?: string): 'planning' | 'implementing' | 'completed' | 'idle' {
  if (value === 'planning' || value === 'implementing' || value === 'completed' || value === 'idle') {
    return value;
  }
  throw new Error(errorMessage ?? 'state must be one of planning, implementing, completed, or idle');
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

function normalizeStructuredContent(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (Array.isArray(value)) {
    return { items: value };
  }
  return { result: value ?? null };
}
