import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { McpConfig } from '../config/loader.js';
import { logger } from '../utils/logger.js';
import { HelmControlService } from './helm-control-service.js';
import { parseSessionAuthToken } from './session-auth.js';
import { MCP_TOOLS } from './tools/definitions.js';
import { callMcpTool } from './tools/dispatcher.js';
import { getToolReminder } from './tools/reminders.js';
import type { AuthContext } from './tools/types.js';
import { asAiagentState, asPlanStatus, asRecord, asString, normalizeStructuredContent, requireResult } from './tools/validation.js';

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
}

const MCP_PROTOCOL_VERSION = '2025-06-18';
const DEFAULT_PORT = 47373;
const DEFAULT_HOST = '127.0.0.1';
const MCP_PATH = '/mcp';
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
          this.writeJsonRpcResult(res, id, { tools: MCP_TOOLS });
          return;
        case 'tools/call': {
          const params = payload.params ?? {};
          const name = asString(params.name, 'Tool name is required');
          const args = asRecord(params.arguments);
          const result = await callMcpTool({
            service: this.service,
            setPlanStateWithValidation: this.setPlanStateWithValidation.bind(this),
            completePlanWithValidation: this.completePlanWithValidation.bind(this),
          }, name, args, authContext);
          const structuredContent = normalizeStructuredContent(result);
          let suffix = getToolReminder(name);

          // Special handling for session_send_text when preambleUsed is false
          if (name === 'session_send_text' && result && typeof result === 'object' && 'preambleUsed' in result) {
            const sendResult = result as { success: boolean; sessionId: string; name: string; preambleUsed: boolean };
            if (!sendResult.preambleUsed) {
              suffix = `Message sent to [${sendResult.name}] without Helm preamble — recipient cannot reply via HELM_MSG. To check results, call: session_read_terminal with sessionId='${sendResult.sessionId}', lines=50, mode='stripped'`;
            }
          }

          const text = `${JSON.stringify(result, null, 2)}${suffix ? `\n\n${suffix}` : ''}`;
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
    const current = requireResult(this.service.getPlan(id), `Plan not found: ${id}`);
    const completed = requireResult(
      this.service.completePlan(id, documentation),
      `Plan ${id} could not be completed from its current state`,
    );
    const exported = this.service.exportDirectory(current.dirPath);
    const followUpPlans = (exported?.dependencies ?? [])
      .filter((dependency) => dependency.fromId === completed.id)
      .map((dependency) => exported?.items.find((item) => item.id === dependency.toId) ?? null)
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .map((item) => ({
        id: item.id,
        humanId: item.humanId ?? item.id,
        title: item.title,
        status: item.status,
        autoImplement: Boolean(item.autoImplement),
      }));
    const autoFollowUpPlans = followUpPlans.filter((item) => item.autoImplement && item.status === 'ready');
    const testingInstructionsReminder = 'Notify the user with concrete steps they can run to test this completed plan, and keep that notification visible in Helm until they dismiss it.';
    const notificationContent = `${documentation}\n\nTesting guidance: ${testingInstructionsReminder}`;

    // Emit a persistent in-app notification so the user sees completion guidance
    if (completed.sessionId) {
      try {
        this.service.notifyUser(
          completed.sessionId,
          `Plan completed — ${completed.title}`,
          notificationContent,
        );
      } catch {
        // Notification mode may not be 'llm'; ignore rather than fail the completion
      }
    }

    return {
      ...completed,
      testingInstructionsReminder,
      followUpPlans,
      autoFollowUpPlans,
      continueWithAutoFollowUps: autoFollowUpPlans.length > 0,
    };
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
