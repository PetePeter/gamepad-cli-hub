import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { McpConfig } from '../config/loader.js';
import type { ContextBindingTargetType } from '../types/context.js';
import { logger } from '../utils/logger.js';
import { HelmControlService } from './helm-control-service.js';
import { parseSessionAuthToken } from './session-auth.js';
import { MCP_TOOLS, REQUIRED_PLAN_DESCRIPTION_SECTIONS } from './tools/definitions.js';
import type { McpTool } from './tools/types.js';
import { callMcpTool } from './tools/dispatcher.js';
import {
  asString,
  asRecord,
  asPlanStatus,
  asPlanTypeOrNull,
  asContextBindingTargetType,
  asAiagentState,
  asTerminalOutputMode,
  requireResult,
  requireBooleanResult,
  normalizeStructuredContent,
} from './tools/validation.js';
import { PlanReadTracker } from '../session/plan-read-tracker.js';
import type { PtyManager } from '../session/pty-manager.js';

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
}


interface AuthContext {
  sessionId?: string;
  sessionName?: string;
}

const MCP_PROTOCOL_VERSION = '2025-06-18';
const DEFAULT_PORT = 47373;
const DEFAULT_HOST = '127.0.0.1';
const MCP_PATH = '/mcp';


const TOOLS = MCP_TOOLS;

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
  private readonly planReadTracker = new PlanReadTracker();
  private ptyManager?: PtyManager;

  constructor(
    private readonly service: HelmControlService,
    options: LocalhostMcpServerOptions = {},
    ptyManager?: PtyManager,
  ) {
    this.ptyManager = ptyManager;
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
          const deps = {
            service: this.service,
            setPlanStateWithValidation: this.setPlanStateWithValidation.bind(this),
            completePlanWithValidation: this.completePlanWithValidation.bind(this, authContext),
            onPlanRead: (planId: string) => {
              if (authContext.sessionId) {
                this.planReadTracker.recordRead(planId, authContext.sessionId);
              }
            },
          };
          const result = await callMcpTool(deps, name, args, authContext);
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

  private completePlanWithValidation(authContext: AuthContext, id: string, documentation: string): unknown {
    if (documentation.trim().length < 10) {
      throw new Error('documentation must be at least 10 characters');
    }
    const current = requireResult(this.service.getPlan(id), `Plan not found: ${id}`);

    // Completion recap gate — runs when plan has completionRecap: true
    if (current.completionRecap) {
      const codingSessionId = current.sessionId ?? authContext.sessionId;
      if (codingSessionId) {
        const readRecord = this.planReadTracker.getRead(id, codingSessionId);
        const now = Date.now();
        const humanId = current.humanId ?? id;

        if (!readRecord) {
          throw new Error(`Plan completion blocked — ${humanId}: call plan_get to read the plan, verify criteria, then call plan_complete again.`);
        }

        if (this.planReadTracker.isStale(readRecord, now)) {
          const minutesAgo = Math.floor((now - readRecord.readAt) / 60_000);
          throw new Error(`Plan completion blocked — ${humanId}: read is ${minutesAgo} min old (limit 3 min). Re-read with plan_get, verify criteria, then call plan_complete again.`);
        }
      }
    }

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

    if (completed.sessionId) {
      try {
        this.service.notifyUser(completed.sessionId, `Plan completed — ${completed.title}`, documentation);
      } catch {
        // Notification mode may not be 'llm'; ignore rather than fail the completion
      }
    }

    return {
      followUpPlans,
      autoFollowUpPlans,
      continueWithAutoFollowUps: autoFollowUpPlans.length > 0,
      testingInstructions: 'Use notify_user to send the user concrete test steps to validate this plan. The notification stays visible in Helm until dismissed.',
    };
  }

  private getAuthContext(req: IncomingMessage): AuthContext | null {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    const token = header.slice(7);
    const provided = Buffer.from(token, 'utf8');
    const expected = Buffer.from(this.token, 'utf8');
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) {
      const sessionId = this.getSingleHeader(req, 'x-helm-session-id')?.trim();
      if (!sessionId) {
        // Anonymous access: shared bearer grants read access to plan/directory/query
        // tools. Tools requiring sender identity (session_send_text etc.) will reject
        // later when senderSessionId is missing.
        return {};
      }
      const session = this.service.getSession(sessionId);
      if (!session) return null;
      return {
        sessionId: session.id,
        sessionName: session.name,
      };
    }
    return parseSessionAuthToken(this.token, token);
  }

  private getSingleHeader(req: IncomingMessage, name: string): string | undefined {
    const value = req.headers[name];
    if (Array.isArray(value)) return value[0];
    return value;
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








function requireResult<T>(value: T | null, message: string): T {
  if (value === null) {
    throw new Error(message);
  }
  return value;
}



function getToolReminder(name: string): string {
  if (name === 'session_send_text') {
    return 'Reminder: for inter-LLM handoffs, submit must stay true/default. Now call session_read_terminal on the recipient and verify the tail shows the first words of the sent text, a new prompt, or a response starting; warn the user if no receipt evidence is visible.';
  }
  if (name === 'session_read_terminal') {
    return 'Reminder: after a handoff, inspect this terminal tail for receipt evidence. If the sent text or new recipient activity is not visible, report that uncertainty to the user.';
  }
  if (name === 'session_info') {
    return 'Reminder: now call session_set_aiagent_state for your current phase. If a Helm plan is assigned and you are implementing it, claim it with plan_set_state status=coding and sessionId, then call session_set_working_plan.';
  }
  if (name === 'plans_list') {
    return '💡 Skills: the user has defined custom skills for this project. Call skill_list before starting work — there may be one directly applicable to this task.';
  }
  if (name === 'plan_get') {
    return '💡 Before implementing: call skill_list to check for user-defined skills applicable to this task.';
  }
  if (name === 'skill_get') {
    return 'Reminder: after applying this skill, call skill_submit_feedback with stars (1–5), value_summary, and an optional improvement_suggestion.';
  }
  if (name === 'plan_create') {
    return `Reminder: creating a plan does not assign ownership. Plan descriptions should include: ${REQUIRED_PLAN_DESCRIPTION_SECTIONS.join(', ')}. For blocking questions, create a separate "QUESTION: ..." plan and link it to the original blocked plan with plan_nextplan_link. When you begin implementation, explicitly call plan_set_state with status "coding" and your sessionId, then call session_set_working_plan.`;
  }
  if (name === 'plan_set_state') {
    return 'Reminder: ownership is explicit. Use session_set_working_plan after claiming work so Helm shows the session as working on this plan.';
  }
  if (name === 'plan_complete') {
    return 'Reminder: tell the user exactly what to test, then inspect followUpPlans and continue with any ready autoFollowUpPlans.';
  }
  if (name === 'sequence_list' || name === 'sequence_update' || name === 'sequence_memory_append') {
    return 'Reminder: sequence.sharedMemory is shared by every plan in that sequence. Re-read the sequence and pass expectedUpdatedAt when updating or appending to avoid overwriting another LLM.';
  }
  return '';
}
