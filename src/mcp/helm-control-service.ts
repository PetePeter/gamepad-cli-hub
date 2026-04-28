import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { logger } from '../utils/logger.js';
import { type ConfigLoader } from '../config/loader.js';
import type { PlanManager } from '../session/plan-manager.js';
import type { SessionManager } from '../session/manager.js';
import type { PtyManager } from '../session/pty-manager.js';
import type { PlanItem, PlanStatus, PlanType } from '../types/plan.js';
import type { SessionInfo } from '../types/session.js';
import { mintSessionAuthToken } from './session-auth.js';

export interface SessionSummary {
  id: string;
  name: string;
  cliType: string;
  workingDir?: string;
  state?: string;
  questionPending?: boolean;
  cliSessionName?: string;
  currentPlanId?: string;
  windowId?: number;
}

export interface DirectorySummary {
  dirPath: string;
  name?: string;
  source: Array<'config' | 'plans' | 'sessions'>;
  planCount: number;
  sessionCount: number;
}

export interface CliSummary {
  cliType: string;
  name: string;
  command: string;
  supportsResume: boolean;
  supportedDirPaths: string[];
}

export interface McpToolSummary {
  name: string;
  title: string;
}

export interface DirectoryInfo {
  path: string;
  name?: string;
}

export interface SessionInfoResponse {
  sessionId?: string;
  sessionName?: string;
  cliType?: string;
  workingDir?: string;
  mcp_url: string;
  mcp_token: string;
  aiagent_states: string[];
  available_tools: McpToolSummary[];
  available_directories: DirectoryInfo[];
  aiagent_state_guide?: {
    validStates: string[];
    how_to_update: {
      description: string;
      mcp_call: string;
      usage_example: { sessionId: string; state: string };
      state_icons: Record<string, string>;
    };
    notes: string[];
  };
  session_send_text_guide?: {
    description: string;
    how_it_works: string;
    required_args: Record<string, string>;
    optional_args: Record<string, string>;
    examples: Array<{ scenario: string; payload: Record<string, unknown> }>;
    error_scenarios: string[];
    receiving_responses: string;
  };
}

export class HelmControlService extends EventEmitter {
  constructor(
    private readonly planManager: PlanManager,
    private readonly sessionManager: SessionManager,
    private readonly ptyManager: PtyManager,
    private readonly configLoader: ConfigLoader,
  ) {
    super();
  }

  listPlans(dirPath: string): PlanItem[] {
    return this.planManager.getForDirectory(dirPath);
  }

  plansSummary(dirPath: string) {
    const exported = this.planManager.exportDirectory(dirPath);
    if (!exported) return [];
    const { items, dependencies } = exported;
    const idToHumanId = new Map(items.map((i) => [i.id, i.humanId ?? i.id]));
    return items.map((item) => ({
      id: item.id,
      humanId: item.humanId ?? item.id,
      title: item.title,
      type: item.type,
      status: item.status,
      stateUpdatedAt: item.stateUpdatedAt,
      blockedBy: dependencies
        .filter((d) => d.toId === item.id)
        .map((d) => idToHumanId.get(d.fromId) ?? d.fromId),
      blocks: dependencies
        .filter((d) => d.fromId === item.id)
        .map((d) => idToHumanId.get(d.toId) ?? d.toId),
    }));
  }

  listClis(): CliSummary[] {
    const supportedDirPaths = this.configLoader.getWorkingDirectories().map((entry) => entry.path);
    return this.configLoader.getCliTypes().map((cliType) => {
      const entry = this.requireCliEntry(cliType);
      return {
        cliType,
        name: entry.name,
        command: entry.spawnCommand ?? '',
        supportsResume: Boolean(entry.spawnCommand || entry.resumeCommand || entry.continueCommand),
        supportedDirPaths,
      };
    });
  }

  getPlan(id: string): PlanItem | null {
    return this.planManager.getItem(id);
  }

  createPlan(dirPath: string, title: string, description: string, type?: PlanType): PlanItem {
    return this.planManager.createWithType(dirPath, title, description, type);
  }

  updatePlan(id: string, updates: { title?: string; description?: string; type?: PlanType | null }): PlanItem | null {
    const nextUpdates: { title?: string; description?: string; type?: PlanType } = {
      ...(updates.title !== undefined ? { title: updates.title } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
    };
    if (Object.prototype.hasOwnProperty.call(updates, 'type')) {
      nextUpdates.type = updates.type ?? undefined;
    }
    return this.planManager.updateWithType(id, nextUpdates);
  }

  deletePlan(id: string): boolean {
    return this.planManager.delete(id);
  }

  completePlan(id: string, completionNotes?: string): PlanItem | null {
    logger.info(`[MCP:Service] completePlan id=${id}`);
    return this.planManager.completeItem(id, completionNotes);
  }

  reopenPlan(id: string): PlanItem | null {
    logger.info(`[MCP:Service] reopenPlan id=${id}`);
    return this.planManager.reopenItem(id);
  }

  setPlanState(
    id: string,
    status: Exclude<PlanStatus, 'done'>,
    stateInfo?: string,
    sessionId?: string,
  ): PlanItem | null {
    logger.info(`[MCP:Service] setPlanState id=${id} status=${status} sessionId=${sessionId ?? '-'}`);
    return this.planManager.setState(id, status, stateInfo, sessionId);
  }

  linkPlans(fromId: string, toId: string): void {
    if (fromId === toId) {
      throw new Error('Cannot link a plan to itself');
    }
    const from = this.planManager.getItem(fromId);
    const to = this.planManager.getItem(toId);
    if (!from) {
      throw new Error(`Source plan not found: ${fromId}`);
    }
    if (!to) {
      throw new Error(`Target plan not found: ${toId}`);
    }
    if (from.dirPath !== to.dirPath) {
      throw new Error('Cannot link plans across different directories');
    }

    const exported = this.planManager.exportDirectory(from.dirPath);
    const existing = exported?.dependencies.some((d) => d.fromId === fromId && d.toId === toId);
    if (existing) {
      throw new Error('Link already exists between these plans');
    }

    // Check for cycle: adding fromId→toId would create a cycle if toId can already reach fromId
    const deps = exported?.dependencies ?? [];
    const visited = new Set<string>();
    const stack = [toId];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === fromId) {
        throw new Error('Link would create a cycle (circular ordering is not allowed)');
      }
      if (visited.has(current)) continue;
      visited.add(current);
      for (const dep of deps) {
        if (dep.fromId === current) {
          stack.push(dep.toId);
        }
      }
    }

    const success = this.planManager.addDependency(fromId, toId);
    if (!success) {
      throw new Error('Failed to link plans');
    }
  }

  unlinkPlans(fromId: string, toId: string): void {
    const success = this.planManager.removeDependency(fromId, toId);
    if (!success) {
      throw new Error('Link not found between these plans');
    }
  }

  exportDirectory(dirPath: string): { dirPath: string; items: PlanItem[]; dependencies: { fromId: string; toId: string }[] } | null {
    return this.planManager.exportDirectory(dirPath);
  }

  exportItem(id: string): { item: PlanItem; dependencies: { fromId: string; toId: string }[] } | null {
    return this.planManager.exportItem(id);
  }

  listDirectories(): DirectorySummary[] {
    const configured = this.configLoader.getWorkingDirectories();
    const sessions = this.sessionManager.getAllSessions();
    return configured
      .map((entry) => {
        const source: Array<'config' | 'plans' | 'sessions'> = ['config'];
        if (this.planManager.getForDirectory(entry.path).length > 0) source.push('plans');
        if (sessions.some((session) => session.workingDir === entry.path)) source.push('sessions');
        return {
          dirPath: entry.path,
          name: entry.name,
          source,
          planCount: this.planManager.getForDirectory(entry.path).length,
          sessionCount: sessions.filter((session) => session.workingDir === entry.path).length,
        };
      })
      .sort((a, b) => a.dirPath.localeCompare(b.dirPath));
  }

  listSessions(dirPath?: string): SessionSummary[] {
    return this.sessionManager
      .getAllSessions()
      .filter((session) => !dirPath || session.workingDir === dirPath)
      .map((session) => this.toSessionSummary(session));
  }

  getSession(sessionRef: string): SessionSummary | null {
    const session = this.findSession(sessionRef);
    return session ? this.toSessionSummary(session) : null;
  }

  spawnCli(cliType: string, dirPath: string, name: string, prompt?: string): SessionSummary {
    const workingDir = this.requireWorkingDirectory(dirPath);
    const cliEntry = this.requireCliEntry(cliType);
    const sessionId = randomUUID();
    const cliSessionName = randomUUID();
    const toolEnv = this.resolveToolEnv(cliType, {
      sessionId,
      sessionName: name.trim(),
    });
    let rawCommand: string | undefined;
    let command: string | undefined;
    let args: string[] | undefined;

    if (cliEntry.spawnCommand) {
      rawCommand = cliEntry.spawnCommand.replaceAll('{cliSessionName}', cliSessionName);
    } else {
      command = cliType;
      args = [];
    }

    const pty = this.ptyManager.spawn({
      sessionId,
      rawCommand,
      command,
      args,
      cwd: workingDir.path,
      ...(toolEnv ? { env: toolEnv } : {}),
    });

    this.sessionManager.addSession({
      id: sessionId,
      name: name.trim(),
      cliType,
      processId: pty.pid,
      workingDir: workingDir.path,
      cliSessionName,
    });

    if (prompt && prompt.trim()) {
      void this.ptyManager.deliverText(sessionId, prompt);
    }

    return this.toSessionSummary(requireResult(this.sessionManager.getSession(sessionId), `Session not found: ${sessionId}`));
  }

  async sendTextToSession(
    sessionRef: string,
    text: string,
    options?: { submit?: boolean; senderSessionId?: string; senderSessionName?: string; expectsResponse?: boolean },
  ): Promise<{ success: true; sessionId: string; name: string }> {
    const session = this.findSession(sessionRef);
    if (!session) {
      throw new Error(`Session not found: ${sessionRef}`);
    }
    if (!this.ptyManager.has(session.id)) {
      throw new Error(`Session PTY is not running: ${session.id}`);
    }
    if (!options?.senderSessionId || !options?.senderSessionName) {
      throw new Error('senderSessionId and senderSessionName are required — anonymous messages are not allowed');
    }
    if (session.id === options.senderSessionId) {
      throw new Error('Cannot send a message from a session to itself — sender and receiver must be different sessions');
    }

    const expectsResponse = options.expectsResponse ?? false;
    const envelope = JSON.stringify({
      type: 'inter_llm_message',
      fromSessionId: options.senderSessionId,
      fromSessionName: options.senderSessionName,
      expectsResponse,
      timestamp: new Date().toISOString(),
    });

    const tag = expectsResponse
      ? `[HELM_MSG: expectsResponse=true. To reply, call MCP tool mcp__helm__session_send_text with: sessionId="${options.senderSessionId}", senderSessionId=<your env $HELM_SESSION_ID>, text="<your reply>". Your HELM_SESSION_ID is injected by Helm at startup.]`
      : '[HELM_MSG]';
    const message = `${tag}${envelope}\n${text}`;

    await this.ptyManager.deliverText(session.id, message);

    // Submit as a separate send action so the destination CLI keeps its normal
    // paste mode for inserted text, then receives the same PTY-level "send"
    // behavior as sequence parser {Send}.
    if (options?.submit !== false) {
      // Delay to ensure the target CLI has consumed the bracketed-paste text
      // before sending Enter — without this the \r can race ahead and hit an
      // empty prompt.
      await new Promise((r) => setTimeout(r, 150));
      this.ptyManager.write(session.id, '\r');
    }

    return { success: true, sessionId: session.id, name: session.name };
  }

  setSessionWorkingPlan(
    sessionRef: string,
    planId: string,
  ): { sessionId: string; name: string; planId: string; planTitle: string; planStatus: PlanStatus } {
    logger.info(`[MCP:Service] setSessionWorkingPlan session=${sessionRef} plan=${planId}`);
    const session = this.findSession(sessionRef);
    if (!session) {
      throw new Error(`Session not found: ${sessionRef}`);
    }

    const plan = this.planManager.getItem(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }
    if (session.workingDir && plan.dirPath !== session.workingDir) {
      throw new Error(`Plan ${planId} does not belong to session directory ${session.workingDir}`);
    }
    if (plan.status === 'done' || plan.status === 'planning') {
      throw new Error(`Plan ${planId} is not active or ready`);
    }

    const planIsAlreadyOwnedBySession =
      plan.sessionId === session.id &&
      (plan.status === 'coding' || plan.status === 'review' || plan.status === 'blocked');

    const updatedPlan = planIsAlreadyOwnedBySession
      ? plan
      : (() => {
          if (plan.sessionId && plan.sessionId !== session.id) {
            throw new Error(`Plan ${planId} is already assigned to session ${plan.sessionId}`);
          }
          return this.planManager.setState(plan.id, 'coding', undefined, session.id)
            ?? (() => { throw new Error(`Plan ${planId} could not be assigned to session ${session.id}`); })();
        })();

    this.sessionManager.updateSession(session.id, { currentPlanId: updatedPlan.id });
    return {
      sessionId: session.id,
      name: session.name,
      planId: updatedPlan.id,
      planTitle: updatedPlan.title,
      planStatus: updatedPlan.status,
    };
  }

  setAiagentState(sessionRef: string, state: 'planning' | 'implementing' | 'completed' | 'idle'): { sessionId: string; name: string; state: string } {
    const session = this.findSession(sessionRef);
    if (!session) {
      throw new Error(`Session not found: ${sessionRef}`);
    }

    this.sessionManager.updateSession(session.id, { aiagentState: state });
    return { sessionId: session.id, name: session.name, state };
  }

  closeSession(sessionRef: string): { sessionId: string; name: string } {
    const session = this.findSession(sessionRef);
    if (!session) {
      throw new Error(`Session not found: ${sessionRef}`);
    }
    try {
      this.ptyManager.kill(session.id);
    } catch (killError) {
      logger.warn(`[HelmControlService] Failed to kill PTY for session ${session.id}: ${killError}`);
    }
    this.sessionManager.removeSession(session.id);
    return { sessionId: session.id, name: session.name };
  }

  /**
   * Get session info with MCP endpoint and AIAGENT state registry.
   * Called via session_info MCP tool — autocall endpoint provides context to AI agents.
   */
  getSessionInfo(authContext?: { sessionId?: string; sessionName?: string }): SessionInfoResponse {
    const mcpConfig = this.configLoader.getMcpConfig();
    const mcpPort = mcpConfig.port ?? 47373;
    const mcpUrl = `http://127.0.0.1:${mcpPort}/mcp`;

    // Extract sessionId from auth context (set-scoped token) or default to undefined
    const sessionId = authContext?.sessionId;
    const sessionName = authContext?.sessionName;

    // Get session info if authenticated with session token
    let sessionInfo: SessionInfo | undefined;
    if (sessionId) {
      sessionInfo = this.sessionManager.getSession(sessionId) ?? undefined;
    }

    return {
      sessionId,
      sessionName: sessionName ?? sessionInfo?.name,
      cliType: sessionInfo?.cliType,
      workingDir: sessionInfo?.workingDir,
      mcp_url: mcpUrl,
      mcp_token: mcpConfig.authToken ?? '',
      aiagent_states: this.getAiagentStates(),
      available_tools: this.getAvailableTools(),
      available_directories: this.getAvailableDirectories(),
      aiagent_state_guide: {
        validStates: ['planning', 'implementing', 'completed', 'idle'],
        how_to_update: {
          description: 'Update the session\'s AIAGENT state icon in Helm. This state persists across restarts and is controlled by external agents.',
          mcp_call: 'session:set_aiagent_state',
          usage_example: { sessionId: 'your-session-id', state: 'implementing' },
          state_icons: { planning: '⚙️', implementing: '🟢', completed: '✅', idle: '⚪' },
        },
        notes: [
          'State persists across restarts',
          'Updates trigger session:changed event',
          'Only external agents should set this state — activity dots (green/blue/grey) are based on PTY I/O timing and are managed automatically',
          'When LLM starts to make changes, mark it as implementing. When done, mark it as completed for the user to review. If questions arise, mark it as planning and make follow-up plans with the questions. Only the user should mark it as idle, or the LLM if explicitly requested.',
        ],
      },
      session_send_text_guide: {
        description: 'Send text to another session from your session. This enables inter-LLM communication via Helm\'s embedded PTY system.',
        how_it_works: 'Text is delivered to the target session\'s PTY via stdin. Helm wraps your message in a [HELM_MSG] envelope with metadata. When expectsResponse=true, replies are pasted back into your session as new chat turns — no polling needed.',
        required_args: { sessionId: '[DESTINATION] Target session ID — MUST be different from senderSessionId', text: 'The text to send', senderSessionId: '[SENDER] Your session ID — MUST equal the HELM_SESSION_ID environment variable injected by Helm at startup' },
        optional_args: { submit: 'Boolean, default true. If true, Helm issues a send/submit action (like pressing Enter) after inserting the text', expectsResponse: 'Boolean, default false. If true, Helm routes the target session\'s reply back to your session' },
        examples: [
          { scenario: 'Send prompt to session', payload: { sessionId: 'target-session-id', text: 'Analyze this file', senderSessionId: '$HELM_SESSION_ID', submit: true, expectsResponse: false } },
          { scenario: 'Send with auto-enter', payload: { sessionId: 'target-session-id', text: 'git status', senderSessionId: '$HELM_SESSION_ID', submit: true, expectsResponse: false } },
          { scenario: 'Send and await response', payload: { sessionId: 'target-session-id', text: 'What is the current git branch?', senderSessionId: '$HELM_SESSION_ID', submit: true, expectsResponse: true } },
        ],
        error_scenarios: [
          'senderSessionId must be from HELM_SESSION_ID env var',
          'senderSessionId must be different from the destination sessionId',
          'Unknown sender session — senderSessionId does not match any active Helm session',
          'Destination session not found or PTY not running',
        ],
        receiving_responses: 'When expectsResponse=true, Helm pastes [HELM_MSG] envelope as new chat turn in sender session. Reply using session_send_text with sessionId set to the original senderSessionId.',
      },
    };
  }

  /**
   * Send a message to a Telegram user from a CLI session.
   * Called via telegram_send MCP tool — allows CLI sessions to send deliberate replies to Telegram users.
   */
  async sendTelegramMessage(
    sessionRef: string,
    text: string,
    options?: { replyTo?: string },
  ): Promise<{ success: boolean; topicId?: number }> {
    const session = this.findSession(sessionRef);
    if (!session) {
      throw new Error(`Session not found: ${sessionRef}`);
    }

    // Emit event and let telegram layer handle it
    this.emit('telegram:send', {
      sessionId: session.id,
      text,
      replyTo: options?.replyTo,
      timestamp: Date.now(),
    });

    return { success: true };
  }

  /**
   * Set Telegram output mode (relay or diagnostic).
   * Called via telegram_set_output_mode MCP tool — allows CLI sessions to control how their output appears in Telegram.
   */
  setTelegramOutputMode(mode: 'relay' | 'diagnostic'): { mode: string } {
    this.emit('telegram:set_mode', { mode });
    logger.info(`[MCP] Telegram output mode set to: ${mode}`);
    return { mode };
  }

  /**
   * Get list of valid AIAGENT state tags for the state registry.
   * Registered states are: planning, implementing, completed, idle.
   */
  private getAiagentStates(): string[] {
    return ['planning', 'implementing', 'completed', 'idle'];
  }

  /**
   * Get list of available MCP tools with names and titles.
   */
  private getAvailableTools(): McpToolSummary[] {
    return [
      { name: 'tools_list', title: 'List CLI Types' },
      { name: 'plans_list', title: 'List Plans' },
      { name: 'plans_summary', title: 'Plans Summary' },
      { name: 'plan_get', title: 'Get Plan' },
      { name: 'plan_create', title: 'Create Plan' },
      { name: 'plan_update', title: 'Update Plan' },
      { name: 'plan_delete', title: 'Delete Plan' },
      { name: 'plan_set_state', title: 'Set Plan State' },
      { name: 'plan_complete', title: 'Complete Plan' },
      { name: 'plan_nextplan_link', title: 'Link Next Plan' },
      { name: 'plan_nextplan_unlink', title: 'Unlink Next Plan' },
      { name: 'directories_list', title: 'List Directories' },
      { name: 'session_create', title: 'Create Session' },
      { name: 'sessions_list', title: 'List Sessions' },
      { name: 'session_get', title: 'Get Session' },
      { name: 'session_send_text', title: 'Send Text To Session' },
      { name: 'session_set_working_plan', title: 'Set Session Working Plan' },
      { name: 'session_set_aiagent_state', title: 'Set Session AIAGENT State' },
      { name: 'session_close', title: 'Close Session' },
      { name: 'session_info', title: 'Get Session Info' },
      { name: 'telegram_send', title: 'Send Message to Telegram User' },
      { name: 'telegram_set_output_mode', title: 'Set Telegram Output Mode' },
    ];
  }

  /**
   * Get list of available working directories with names.
   */
  private getAvailableDirectories(): DirectoryInfo[] {
    return this.configLoader.getWorkingDirectories().map((entry) => ({
      path: entry.path,
      name: entry.name,
    }));
  }

  private toSessionSummary(session: SessionInfo): SessionSummary {
    return {
      id: session.id,
      name: session.name,
      cliType: session.cliType,
      workingDir: session.workingDir,
      state: session.state,
      questionPending: session.questionPending,
      cliSessionName: session.cliSessionName,
      currentPlanId: session.currentPlanId,
      windowId: session.windowId,
    };
  }

  private findSession(sessionRef: string): SessionInfo | null {
    const byId = this.sessionManager.getSession(sessionRef);
    if (byId) return byId;
    const matches = this.sessionManager.getAllSessions().filter((session) => session.name === sessionRef);
    if (matches.length > 1) {
      throw new Error(`Multiple sessions found with name: ${sessionRef}. Use sessionId instead.`);
    }
    return matches[0] ?? null;
  }

  private requireCliEntry(cliType: string) {
    const entry = this.configLoader.getCliTypeEntry(cliType);
    if (!entry) {
      throw new Error(`Unknown CLI type: ${cliType}`);
    }
    return entry;
  }

  private requireWorkingDirectory(dirPath: string) {
    const workingDir = this.configLoader.getWorkingDirectories().find((entry) => entry.path === dirPath);
    if (!workingDir) {
      throw new Error(`Working directory is not configured in Helm: ${dirPath}`);
    }
    return workingDir;
  }

  private resolveToolEnv(cliType: string, helmSession?: { sessionId: string; sessionName: string }): Record<string, string> | undefined {
    const envEntries = this.requireCliEntry(cliType).env;
    const env = Object.fromEntries(
      (envEntries ?? [])
        .filter((entry) => typeof entry?.name === 'string' && entry.name.trim().length > 0)
        .map((entry) => [entry.name.trim(), this.resolveEnvValue(typeof entry?.value === 'string' ? entry.value : '')]),
    );
    if (helmSession) {
      const mcpConfig = this.configLoader.getMcpConfig();
      const mcpPort = mcpConfig.port ?? 47373;
      env.HELM_MCP_TOKEN = mintSessionAuthToken(
        mcpConfig.authToken,
        helmSession.sessionId,
        helmSession.sessionName,
      );
      env.HELM_SESSION_ID = helmSession.sessionId;
      env.HELM_SESSION_NAME = helmSession.sessionName;
      env.HELM_MCP_URL = `http://127.0.0.1:${mcpPort}/mcp`;
    }
    return Object.keys(env).length > 0 ? env : undefined;
  }

  private resolveEnvValue(value: string): string {
    return value
      .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, envName: string) => process.env[envName] ?? '')
      .replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (_match, envName: string) => process.env[envName] ?? '');
  }
}

function requireResult<T>(value: T | null, message: string): T {
  if (value === null) {
    throw new Error(message);
  }
  return value;
}
