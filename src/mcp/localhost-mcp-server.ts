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
const REQUIRED_PLAN_DESCRIPTION_SECTIONS = [
  'Problem Statement',
  'User POV',
  'Done Statement',
  'Files / Classes Affected',
  'TDD Suggestions',
  'Acceptance Criteria',
];

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
    description: 'List all plan items for a directory. Use this before editing or assigning plan work so you can reference the human-readable P-00xx plan IDs Helm returns.',
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
    description: 'List all plans for a directory as a compact summary — status, canonical ID, human-readable P-00xx ID, title, and dependency relationships. Call this first when orienting to a project so you know what work exists and what is blocked by what. Use plan_get for the full description of a specific plan before claiming, updating, or creating linked follow-ups.',
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
    description: 'Get a single plan item by UUID or P-00xx human-readable ID. Use this when you need full plan details, including human-readable ID and timestamps, before changing state, preserving existing description content, or discussing a plan with the user.',
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
    description: `Create a plan item in a directory when follow-up work, later cleanup, or a blocking question should survive the current session. Optionally set type to "bug", "feature", or "research". The description should include these sections: ${REQUIRED_PLAN_DESCRIPTION_SECTIONS.join(', ')}. For blocking questions, create a separate plan titled "QUESTION: ..." and link it to the original blocked plan with plan_nextplan_link so the question must be resolved first. The new plan starts in "planning" status with no session owner. When you begin working on this plan, claim it by calling plan_set_state with status "coding" and your sessionId, then call session_set_working_plan.`,
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
    description: 'Update a plan item title, description, and/or type by UUID or P-00xx human-readable ID. Set type to "bug", "feature", or "research"; pass null to clear the type.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        type: { anyOf: [{ type: 'string', enum: ['bug', 'feature', 'research'] }, { type: 'null' }] },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_delete',
    title: 'Delete Plan',
    description: 'Delete a plan item by UUID or P-00xx human-readable ID.',
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
    description: 'Set a plan item state by UUID or P-00xx human-readable ID to planning, ready, coding, review, or blocked. Use this when the lifecycle state itself changed; if you only need the session row to point at the current plan, prefer session_set_working_plan. IMPORTANT: When setting status to "coding", you must pass sessionId to claim ownership. The "planning" and "ready" states automatically clear any previous session owner. "review" and "blocked" preserve existing ownership. Always call session_set_working_plan after claiming a plan to update the session\'s visible working plan.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string', enum: ['planning', 'ready', 'coding', 'review', 'blocked'] },
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
    description: 'Mark a coding or review plan item as done by UUID or P-00xx human-readable ID. Requires documentation of what was done (minimum 10 characters). Good completion notes summarize implemented behavior, important files changed, tests or review performed, and any remaining risk.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        documentation: { type: 'string', description: 'Documentation of what was accomplished (minimum 10 characters)' },
      },
      required: ['id', 'documentation'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_reopen',
    title: 'Reopen Plan',
    description: 'Revert a done plan back to ready or planning by UUID or P-00xx human-readable ID based on its current dependencies. Use this to undo an accidental plan_complete call. The plan\'s sessionId is cleared on reopen.',
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
    description: 'Link one plan item as a prerequisite for another by UUID or P-00xx human-readable ID. A plan can have many outgoing links (to many next plans) and many incoming links (from many previous plans). The source plan must complete before the target plan can start. Use this for blocking questions by linking the separate QUESTION plan to the original blocked plan.',
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
    description: 'Remove a prerequisite link between two plan items by UUID or P-00xx human-readable ID.',
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
    name: 'plan_sequence_list',
    title: 'List Plan Sequences',
    description: 'List sequence/shared-memory stores for a directory, or for a specific plan by UUID/P-id. Returned sharedMemory is the common memory for all member plans; use expectedUpdatedAt on writes to avoid concurrent overwrite.',
    inputSchema: {
      type: 'object',
      properties: {
        dirPath: { type: 'string' },
        planId: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'plan_sequence_create',
    title: 'Create Plan Sequence',
    description: 'Create a first-class sequence/shared-memory store in a directory. Plans can be assigned to it with plan_sequence_assign.',
    inputSchema: {
      type: 'object',
      properties: {
        dirPath: { type: 'string' },
        title: { type: 'string' },
        missionStatement: { type: 'string' },
        sharedMemory: { type: 'string' },
      },
      required: ['dirPath', 'title'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_sequence_update',
    title: 'Update Plan Sequence',
    description: 'Update sequence title, mission, sharedMemory, or order. Pass expectedUpdatedAt from plan_sequence_list/get-style responses for mutex-style protection against concurrent LLM writes.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        missionStatement: { type: 'string' },
        sharedMemory: { type: 'string' },
        order: { type: 'number' },
        expectedUpdatedAt: { type: 'number' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_sequence_memory_append',
    title: 'Append Sequence Memory',
    description: 'Append text to a sequence sharedMemory store. Pass expectedUpdatedAt from the last read to make the append mutexable and fail on concurrent changes.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        text: { type: 'string' },
        expectedUpdatedAt: { type: 'number' },
      },
      required: ['id', 'text'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_sequence_delete',
    title: 'Delete Plan Sequence',
    description: 'Delete a sequence/shared-memory store and clear sequence membership from its member plans.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_sequence_assign',
    title: 'Assign Plan Sequence',
    description: 'Assign a plan by UUID/P-id to a sequence in the same directory, or pass null sequenceId to unlink the plan from its sequence without deleting the sequence.',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        sequenceId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      },
      required: ['planId', 'sequenceId'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_attachment_list',
    title: 'List Plan Attachments',
    description: 'List files attached to a plan by UUID or P-00xx human-readable ID. Attachments are stored inside Helm config, not as fragile external references.',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
      },
      required: ['planId'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_attachment_add',
    title: 'Add Plan Attachment',
    description: 'Attach text, JSON, image, or arbitrary binary content up to 10MB to a plan by UUID or P-00xx human-readable ID. Provide exactly one of text or contentBase64. The file is copied into Helm config-managed storage.',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        filename: { type: 'string' },
        text: { type: 'string' },
        contentBase64: { type: 'string' },
        contentType: { type: 'string' },
      },
      required: ['planId', 'filename'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_attachment_delete',
    title: 'Delete Plan Attachment',
    description: 'Delete a stored attachment from a plan by UUID or P-00xx human-readable ID and attachmentId.',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        attachmentId: { type: 'string' },
      },
      required: ['planId', 'attachmentId'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_attachment_get',
    title: 'Get Plan Attachment Temp File',
    description: 'Copy a stored attachment to a Helm temp file and return the tempPath plus metadata. This avoids inline raw or base64 content in MCP responses.',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        attachmentId: { type: 'string' },
      },
      required: ['planId', 'attachmentId'],
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
    name: 'session_read_terminal',
    title: 'Read Session Terminal',
    description: 'Read the recent terminal tail for any known session by sessionId or exact name. lines must be 1..100; values over 100 are clamped and reported. mode controls raw ANSI output, ANSI-stripped output, or both.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        name: { type: 'string' },
        lines: { type: 'number', minimum: 1 },
        mode: { type: 'string', enum: ['raw', 'stripped', 'both'] },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'session_set_working_plan',
    title: 'Set Session Working Plan',
    description: 'Update which plan the session row should show as currently being worked on, assigning the plan to that session when allowed. planId accepts either the canonical UUID or P-00xx human-readable ID. Call this when the agent has moved on to a different plan item and you want the Helm session list to reflect that explicitly.',
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
  {
    name: 'session_close',
    title: 'Close Session',
    description: 'Kill the PTY process and remove a session from Helm. Use this when a task is complete and the session is no longer needed, or to recover from a stuck session. Accepts sessionId or session name.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        name: { type: 'string' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'telegram_status',
    title: 'Telegram Status',
    description: 'Report whether Telegram is enabled, configured, running, and available. Agents should use Telegram only for concise mobile-friendly urgent blockers or after the user has already engaged through Telegram. No bot token is returned.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'telegram_channel_list',
    title: 'List Telegram Channels',
    description: 'List MCP Telegram communication channels and their session/topic state without exposing Telegram secrets.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'telegram_channel_create',
    title: 'Create Telegram Channel',
    description: 'Create or reuse a Telegram communication channel for a session. Use only for mobile-friendly urgent blockers or after the user has already engaged through Telegram.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        name: { type: 'string' },
        expectsResponse: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'telegram_channel_close',
    title: 'Close Telegram Channel',
    description: 'Close one MCP Telegram communication channel without deleting unrelated session topics.',
    inputSchema: {
      type: 'object',
      properties: {
        channelId: { type: 'string' },
      },
      required: ['channelId'],
      additionalProperties: false,
    },
  },
  {
    name: 'telegram_send_to_user',
    title: 'Send Telegram Message To User',
    description: 'Send concise mobile-friendly text to the user via Telegram. Provide sessionId/name or an existing channelId. Lines must be short; do not send large wide logs, tables, or code blocks.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        name: { type: 'string' },
        channelId: { type: 'string' },
        text: { type: 'string' },
        expectsResponse: { type: 'boolean' },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'telegram_send',
    title: 'Send Message to Telegram User',
    description: 'Compatibility wrapper for sending a concise Telegram message from a session. Prefer telegram_send_to_user for new MCP clients.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        text: { type: 'string' },
        replyTo: { type: 'string' },
      },
      required: ['sessionId', 'text'],
      additionalProperties: false,
    },
  },
  {
    name: 'telegram_set_output_mode',
    title: 'Set Telegram Output Mode',
    description: 'Control whether Telegram output uses relay mode or diagnostic mirroring.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['relay', 'diagnostic'] },
      },
      required: ['mode'],
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
          const reminder = getToolReminder(name);
          const text = `${JSON.stringify(result, null, 2)}${reminder ? `\n\n${reminder}` : ''}`;
          this.writeJsonRpcResult(res, id, {
            content: [{ type: 'text', text }],
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
    logger.info(`[MCP] callTool: ${name} | session=${authContext.sessionId ?? 'anonymous'} (${authContext.sessionName ?? '-'})`);
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
            ...(Object.prototype.hasOwnProperty.call(args, 'type') ? { type: asPlanTypeOrNull(args.type) } : {}),
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
        return this.completePlanWithValidation(
          asString(args.id, 'id is required'),
          asString(args.documentation, 'documentation is required (minimum 10 characters)'),
        );
      case 'plan_reopen':
        return requireResult(
          this.service.reopenPlan(asString(args.id, 'id is required')),
          `Plan ${asString(args.id, 'id is required')} could not be reopened — it may not be in done state`,
        );
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
      case 'plan_sequence_list':
        return this.service.listPlanSequences({
          ...(typeof args.dirPath === 'string' ? { dirPath: args.dirPath } : {}),
          ...(typeof args.planId === 'string' ? { planRef: args.planId } : {}),
        });
      case 'plan_sequence_create':
        return this.service.createPlanSequence({
          dirPath: asString(args.dirPath, 'dirPath is required'),
          title: asString(args.title, 'title is required'),
          ...(typeof args.missionStatement === 'string' ? { missionStatement: args.missionStatement } : {}),
          ...(typeof args.sharedMemory === 'string' ? { sharedMemory: args.sharedMemory } : {}),
        });
      case 'plan_sequence_update':
        return this.service.updatePlanSequence(
          asString(args.id, 'id is required'),
          {
            ...(typeof args.title === 'string' ? { title: args.title } : {}),
            ...(typeof args.missionStatement === 'string' ? { missionStatement: args.missionStatement } : {}),
            ...(typeof args.sharedMemory === 'string' ? { sharedMemory: args.sharedMemory } : {}),
            ...(typeof args.order === 'number' ? { order: args.order } : {}),
            ...(typeof args.expectedUpdatedAt === 'number' ? { expectedUpdatedAt: args.expectedUpdatedAt } : {}),
          },
        );
      case 'plan_sequence_memory_append':
        return this.service.appendPlanSequenceMemory(
          asString(args.id, 'id is required'),
          asString(args.text, 'text is required'),
          typeof args.expectedUpdatedAt === 'number' ? args.expectedUpdatedAt : undefined,
        );
      case 'plan_sequence_delete':
        return {
          deleted: requireBooleanResult(
            this.service.deletePlanSequence(asString(args.id, 'id is required')),
            `Sequence not found: ${asString(args.id, 'id is required')}`,
          ),
        };
      case 'plan_sequence_assign':
        return this.service.assignPlanSequence(
          asString(args.planId, 'planId is required'),
          args.sequenceId === null ? null : asString(args.sequenceId, 'sequenceId is required or null'),
        );
      case 'plan_attachment_list':
        return this.service.listPlanAttachments(asString(args.planId, 'planId is required'));
      case 'plan_attachment_add':
        return this.service.addPlanAttachment(
          asString(args.planId, 'planId is required'),
          {
            filename: asString(args.filename, 'filename is required'),
            ...(typeof args.text === 'string' ? { text: args.text } : {}),
            ...(typeof args.contentBase64 === 'string' ? { contentBase64: args.contentBase64 } : {}),
            ...(typeof args.contentType === 'string' ? { contentType: args.contentType } : {}),
          },
        );
      case 'plan_attachment_delete':
        return {
          deleted: requireBooleanResult(
            this.service.deletePlanAttachment(
              asString(args.planId, 'planId is required'),
              asString(args.attachmentId, 'attachmentId is required'),
            ),
            `Attachment not found: ${asString(args.attachmentId, 'attachmentId is required')}`,
          ),
        };
      case 'plan_attachment_get':
        return this.service.getPlanAttachment(
          asString(args.planId, 'planId is required'),
          asString(args.attachmentId, 'attachmentId is required'),
        );
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
      case 'session_read_terminal':
        return this.service.readSessionTerminal(
          asString(args.sessionId ?? args.name, 'sessionId or name is required'),
          typeof args.lines === 'number' ? args.lines : undefined,
          asTerminalOutputMode(args.mode),
        );
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
      case 'session_close':
        return this.service.closeSession(asString(args.sessionId ?? args.name, 'sessionId or name is required'));
      case 'telegram_status':
        return this.service.getTelegramStatus();
      case 'telegram_channel_list':
        return this.service.listTelegramChannels();
      case 'telegram_channel_create':
        return this.service.createTelegramChannel(
          asString(args.sessionId ?? args.name, 'sessionId or name is required'),
          typeof args.expectsResponse === 'boolean' ? args.expectsResponse : false,
        );
      case 'telegram_channel_close':
        return this.service.closeTelegramChannel(asString(args.channelId, 'channelId is required'));
      case 'telegram_send_to_user':
        return this.service.sendTelegramToUser(
          typeof args.sessionId === 'string' || typeof args.name === 'string'
            ? asString(args.sessionId ?? args.name, 'sessionId or name is required')
            : undefined,
          asString(args.text, 'text is required'),
          {
            ...(typeof args.channelId === 'string' ? { channelId: args.channelId } : {}),
            ...(typeof args.expectsResponse === 'boolean' ? { expectsResponse: args.expectsResponse } : {}),
          },
        );
      case 'telegram_send': {
        const sessionId = asString(args.sessionId, 'sessionId is required');
        const text = asString(args.text, 'text is required');
        const replyTo = typeof args.replyTo === 'string' ? args.replyTo : undefined;
        return this.service.sendTelegramMessage(sessionId, text, { replyTo });
      }
      case 'telegram_set_output_mode':
        return this.service.setTelegramOutputMode(
          asString(args.mode, 'mode must be one of relay or diagnostic'),
        );
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private setPlanStateWithValidation(
    id: string,
    status: 'planning' | 'ready' | 'coding' | 'review' | 'blocked',
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

  private completePlanWithValidation(id: string, documentation: string): unknown {
    if (documentation.trim().length < 10) {
      throw new Error('documentation must be at least 10 characters');
    }
    requireResult(this.service.getPlan(id), `Plan not found: ${id}`);
    return requireResult(
      this.service.completePlan(id, documentation),
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

function asPlanStatus(value: unknown): 'planning' | 'ready' | 'coding' | 'review' | 'blocked' {
  if (value === 'planning' || value === 'ready' || value === 'coding' || value === 'review' || value === 'blocked') {
    return value;
  }
  throw new Error('status must be one of planning, ready, coding, review, or blocked');
}

function asPlanTypeOrNull(value: unknown): 'bug' | 'feature' | 'research' | null {
  if (value === null || value === 'bug' || value === 'feature' || value === 'research') {
    return value;
  }
  throw new Error('type must be one of bug, feature, research, or null');
}

function asAiagentState(value: unknown, errorMessage?: string): 'planning' | 'implementing' | 'completed' | 'idle' {
  if (value === 'planning' || value === 'implementing' || value === 'completed' || value === 'idle') {
    return value;
  }
  throw new Error(errorMessage ?? 'state must be one of planning, implementing, completed, or idle');
}

function asTerminalOutputMode(value: unknown): 'raw' | 'stripped' | 'both' {
  if (value === undefined) return 'both';
  if (value === 'raw' || value === 'stripped' || value === 'both') return value;
  throw new Error('mode must be one of raw, stripped, or both');
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

function getToolReminder(name: string): string {
  if (name === 'plan_create') {
    return `Reminder: creating a plan does not assign ownership. Plan descriptions should include: ${REQUIRED_PLAN_DESCRIPTION_SECTIONS.join(', ')}. For blocking questions, create a separate "QUESTION: ..." plan and link it to the original blocked plan with plan_nextplan_link. When you begin implementation, explicitly call plan_set_state with status "coding" and your sessionId, then call session_set_working_plan.`;
  }
  if (name === 'plan_set_state') {
    return 'Reminder: ownership is explicit. Use session_set_working_plan after claiming work so Helm shows the session as working on this plan.';
  }
  if (name === 'plan_get' || name.startsWith('plan_sequence_')) {
    return 'Reminder: sequence.sharedMemory is shared by every plan in that sequence. Re-read the sequence and pass expectedUpdatedAt when updating or appending to avoid overwriting another LLM.';
  }
  return '';
}
