import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { logger } from '../utils/logger.js';
import { type ConfigLoader } from '../config/loader.js';
import type { PlanManager, PlanRefResolution } from '../session/plan-manager.js';
import type { SessionManager } from '../session/manager.js';
import type { PtyManager } from '../session/pty-manager.js';
import type { TerminalOutputMode } from '../session/terminal-output-buffer.js';
import type { PlanItem, PlanSequence, PlanStatus, PlanType } from '../types/plan.js';
import type { PlanAttachment, PlanAttachmentTempFile } from '../types/plan-attachment.js';
import type { SessionInfo } from '../types/session.js';
import type {
  TelegramBridge,
  TelegramChannel,
  TelegramSendToUserResult,
  TelegramStatus,
} from '../types/telegram-channel.js';
import { PlanAttachmentManager } from '../session/plan-attachment-manager.js';
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

export interface SessionTerminalTailResponse {
  sessionId: string;
  name: string;
  cliType: string;
  workingDir?: string;
  requestedLines: number;
  returnedLines: number;
  clamped: boolean;
  maxLines: number;
  mode: TerminalOutputMode;
  ptyRunning: boolean;
  lastOutputAt?: number;
  raw?: string[];
  stripped?: string[];
}

export interface McpToolSummary {
  name: string;
  title: string;
  description?: string;
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
  agent_plan_guide?: {
    plan_identifier_semantics: string[];
    when_to_create_plan: string[];
    required_description_sections: string[];
    question_plan_workflow: string[];
    completion_documentation: string[];
  };
}

const REQUIRED_PLAN_DESCRIPTION_SECTIONS = [
  'Problem Statement',
  'User POV',
  'Done Statement',
  'Files / Classes Affected',
  'TDD Suggestions',
  'Acceptance Criteria',
];

export class HelmControlService extends EventEmitter {
  private telegramBridge: TelegramBridge | null = null;

  constructor(
    private readonly planManager: PlanManager,
    private readonly sessionManager: SessionManager,
    private readonly ptyManager: PtyManager,
    private readonly configLoader: ConfigLoader,
    private readonly attachmentManager: PlanAttachmentManager = new PlanAttachmentManager(planManager),
  ) {
    super();
  }

  setTelegramBridge(bridge: TelegramBridge | null): void {
    this.telegramBridge = bridge;
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

  getPlan(id: string): (PlanItem & { sequence?: PlanSequence; sequenceMemoryGuide?: string }) | null {
    const plan = this.resolvePlanRef(id, 'Plan')?.item ?? null;
    if (!plan) return null;
    const sequence = plan.sequenceId ? this.planManager.getSequence(plan.sequenceId) ?? undefined : undefined;
    return {
      ...plan,
      ...(sequence ? { sequence } : {}),
      sequenceMemoryGuide: sequence
        ? 'This plan belongs to the returned sequence. The sequence.sharedMemory field is the shared memory store for all plans in that sequence. Use plan_sequence_update or plan_sequence_memory_append with expectedUpdatedAt to avoid overwriting concurrent LLM updates.'
        : 'This plan is not assigned to a sequence. Use plan_sequence_list for directory sequences or plan_sequence_assign to attach it to a shared memory sequence.',
    };
  }

  createPlan(dirPath: string, title: string, description: string, type?: PlanType): PlanItem {
    return this.planManager.createWithType(dirPath, title, description, type);
  }

  updatePlan(id: string, updates: { title?: string; description?: string; type?: PlanType | null }): PlanItem | null {
    const plan = this.resolvePlanRef(id, 'Plan');
    if (!plan) return null;
    const nextUpdates: { title?: string; description?: string; type?: PlanType } = {
      ...(updates.title !== undefined ? { title: updates.title } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
    };
    if (Object.prototype.hasOwnProperty.call(updates, 'type')) {
      nextUpdates.type = updates.type ?? undefined;
    }
    return this.planManager.updateWithType(plan.item.id, nextUpdates);
  }

  deletePlan(id: string): boolean {
    const plan = this.resolvePlanRef(id, 'Plan');
    if (!plan) return false;
    const deleted = this.planManager.delete(plan.item.id);
    if (deleted) {
      this.attachmentManager.deletePlanAttachments(plan.item.id);
    }
    return deleted;
  }

  completePlan(id: string, completionNotes?: string): PlanItem | null {
    logger.info(`[MCP:Service] completePlan id=${id}`);
    const plan = this.resolvePlanRef(id, 'Plan');
    return plan ? this.planManager.completeItem(plan.item.id, completionNotes) : null;
  }

  reopenPlan(id: string): PlanItem | null {
    logger.info(`[MCP:Service] reopenPlan id=${id}`);
    const plan = this.resolvePlanRef(id, 'Plan');
    return plan ? this.planManager.reopenItem(plan.item.id) : null;
  }

  setPlanState(
    id: string,
    status: Exclude<PlanStatus, 'done'>,
    stateInfo?: string,
    sessionId?: string,
  ): PlanItem | null {
    logger.info(`[MCP:Service] setPlanState id=${id} status=${status} sessionId=${sessionId ?? '-'}`);
    const plan = this.resolvePlanRef(id, 'Plan');
    return plan ? this.planManager.setState(plan.item.id, status, stateInfo, sessionId) : null;
  }

  linkPlans(fromId: string, toId: string): void {
    if (fromId === toId) {
      throw new Error('Cannot link a plan to itself');
    }
    const from = this.resolvePlanRef(fromId, 'Source plan');
    const to = this.resolvePlanRef(toId, 'Target plan');
    if (!from) {
      throw new Error(`Source plan not found: ${fromId}`);
    }
    if (!to) {
      throw new Error(`Target plan not found: ${toId}`);
    }
    if (from.item.id === to.item.id) {
      throw new Error('Cannot link a plan to itself');
    }
    if (from.item.dirPath !== to.item.dirPath) {
      throw new Error('Cannot link plans across different directories');
    }

    const exported = this.planManager.exportDirectory(from.item.dirPath);
    const existing = exported?.dependencies.some((d) => d.fromId === from.item.id && d.toId === to.item.id);
    if (existing) {
      throw new Error('Link already exists between these plans');
    }

    // Check for cycle: adding fromId→toId would create a cycle if toId can already reach fromId
    const deps = exported?.dependencies ?? [];
    const visited = new Set<string>();
    const stack = [to.item.id];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === from.item.id) {
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

    const success = this.planManager.addDependency(from.item.id, to.item.id);
    if (!success) {
      throw new Error('Failed to link plans');
    }
  }

  unlinkPlans(fromId: string, toId: string): void {
    const from = this.resolvePlanRef(fromId, 'Source plan');
    const to = this.resolvePlanRef(toId, 'Target plan');
    if (!from) {
      throw new Error(`Source plan not found: ${fromId}`);
    }
    if (!to) {
      throw new Error(`Target plan not found: ${toId}`);
    }
    const success = this.planManager.removeDependency(from.item.id, to.item.id);
    if (!success) {
      throw new Error('Link not found between these plans');
    }
  }

  exportDirectory(dirPath: string): { dirPath: string; items: PlanItem[]; dependencies: { fromId: string; toId: string }[] } | null {
    return this.planManager.exportDirectory(dirPath);
  }

  exportItem(id: string): { item: PlanItem; dependencies: { fromId: string; toId: string }[] } | null {
    const plan = this.resolvePlanRef(id, 'Plan');
    return plan ? this.planManager.exportItem(plan.item.id) : null;
  }

  listPlanSequences(input: { dirPath?: string; planRef?: string }): Array<PlanSequence & { memberPlanIds: string[]; memberHumanIds: string[]; selectedForPlan?: boolean }> {
    const plan = input.planRef ? this.resolvePlanRef(input.planRef, 'Plan')?.item ?? null : null;
    if (input.planRef && !plan) {
      throw new Error(`Plan not found: ${input.planRef}`);
    }
    const dirPath = input.dirPath ?? plan?.dirPath;
    if (!dirPath) {
      throw new Error('dirPath or planId is required');
    }
    const items = this.planManager.getForDirectory(dirPath);
    return this.planManager.getSequencesForDirectory(dirPath).map((sequence) => {
      const members = items.filter((item) => item.sequenceId === sequence.id);
      return {
        ...sequence,
        memberPlanIds: members.map((item) => item.id),
        memberHumanIds: members.map((item) => item.humanId ?? item.id),
        ...(plan ? { selectedForPlan: plan.sequenceId === sequence.id } : {}),
      };
    });
  }

  createPlanSequence(input: { dirPath: string; title: string; missionStatement?: string; sharedMemory?: string }): PlanSequence {
    return this.planManager.createSequence(input.dirPath, input.title, input.missionStatement ?? '', input.sharedMemory ?? '');
  }

  updatePlanSequence(
    id: string,
    updates: { title?: string; missionStatement?: string; sharedMemory?: string; order?: number; expectedUpdatedAt?: number },
  ): PlanSequence {
    const sequence = this.planManager.getSequence(id);
    if (!sequence) {
      throw new Error(`Sequence not found: ${id}`);
    }
    this.assertSequenceMutex(sequence, updates.expectedUpdatedAt);
    const updated = this.planManager.updateSequence(id, updates);
    if (!updated) {
      throw new Error(`Sequence not found: ${id}`);
    }
    return updated;
  }

  appendPlanSequenceMemory(id: string, text: string, expectedUpdatedAt?: number): PlanSequence {
    const sequence = this.planManager.getSequence(id);
    if (!sequence) {
      throw new Error(`Sequence not found: ${id}`);
    }
    this.assertSequenceMutex(sequence, expectedUpdatedAt);
    const separator = sequence.sharedMemory.trim().length > 0 ? '\n\n' : '';
    const updated = this.planManager.updateSequence(id, {
      sharedMemory: `${sequence.sharedMemory}${separator}${text}`,
    });
    if (!updated) {
      throw new Error(`Sequence not found: ${id}`);
    }
    return updated;
  }

  deletePlanSequence(id: string): boolean {
    return this.planManager.deleteSequence(id);
  }

  assignPlanSequence(planRef: string, sequenceId: string | null): PlanItem {
    const plan = this.resolvePlanRef(planRef, 'Plan')?.item ?? null;
    if (!plan) {
      throw new Error(`Plan not found: ${planRef}`);
    }
    const updated = this.planManager.assignSequence(plan.id, sequenceId);
    if (!updated) {
      throw new Error(sequenceId ? `Sequence not found or not in plan directory: ${sequenceId}` : `Plan not found: ${planRef}`);
    }
    return updated;
  }

  listPlanAttachments(planRef: string): PlanAttachment[] {
    const plan = this.resolvePlanRef(planRef, 'Plan');
    if (!plan) {
      throw new Error(`Plan not found: ${planRef}`);
    }
    return this.attachmentManager.list(plan.item.id);
  }

  addPlanAttachment(
    planRef: string,
    input: { filename: string; contentBase64?: string; text?: string; contentType?: string },
  ): PlanAttachment {
    const plan = this.resolvePlanRef(planRef, 'Plan');
    if (!plan) {
      throw new Error(`Plan not found: ${planRef}`);
    }
    const hasBase64 = typeof input.contentBase64 === 'string';
    const hasText = typeof input.text === 'string';
    if (hasBase64 === hasText) {
      throw new Error('Provide exactly one of contentBase64 or text');
    }
    const content = hasBase64
      ? decodeBase64Content(input.contentBase64!)
      : Buffer.from(input.text!, 'utf8');
    return this.attachmentManager.add(plan.item.id, {
      filename: input.filename,
      content,
      ...(input.contentType ? { contentType: input.contentType } : {}),
    });
  }

  deletePlanAttachment(planRef: string, attachmentId: string): boolean {
    const plan = this.resolvePlanRef(planRef, 'Plan');
    if (!plan) {
      throw new Error(`Plan not found: ${planRef}`);
    }
    return this.attachmentManager.delete(plan.item.id, attachmentId);
  }

  getPlanAttachment(planRef: string, attachmentId: string): PlanAttachmentTempFile {
    const plan = this.resolvePlanRef(planRef, 'Plan');
    if (!plan) {
      throw new Error(`Plan not found: ${planRef}`);
    }
    return this.attachmentManager.getToTempFile(plan.item.id, attachmentId);
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

    const plan = this.resolvePlanRef(planId, 'Plan')?.item;
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

  readSessionTerminal(
    sessionRef: string,
    requestedLines = 50,
    mode: TerminalOutputMode = 'both',
  ): SessionTerminalTailResponse {
    const session = this.findSession(sessionRef);
    if (!session) {
      throw new Error(`Session not found: ${sessionRef}`);
    }
    if (!Number.isInteger(requestedLines) || requestedLines < 1) {
      throw new Error('lines must be an integer from 1 to 100');
    }

    const maxLines = 100;
    const lines = Math.min(requestedLines, maxLines);
    const tail = this.ptyManager.getTerminalTail(session.id, lines, mode);
    const rawLength = tail.raw?.length ?? 0;
    const strippedLength = tail.stripped?.length ?? 0;

    return {
      sessionId: session.id,
      name: session.name,
      cliType: session.cliType,
      workingDir: session.workingDir,
      requestedLines,
      returnedLines: Math.max(rawLength, strippedLength),
      clamped: requestedLines > maxLines,
      maxLines,
      mode,
      ptyRunning: this.ptyManager.has(session.id),
      ...(tail.lastOutputAt !== undefined ? { lastOutputAt: tail.lastOutputAt } : {}),
      ...(tail.raw ? { raw: tail.raw } : {}),
      ...(tail.stripped ? { stripped: tail.stripped } : {}),
    };
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
      agent_plan_guide: {
        plan_identifier_semantics: [
          'Values like P-0035 are Helm human-readable plan IDs (PlanItem.humanId), not chat message IDs.',
          'MCP plan tools accept either the canonical UUID id or the P-00xx humanId wherever a plan id/ref is requested.',
          'Use plans_summary or plans_list when you need to map between a P-id, canonical UUID, title, status, and dependency context.',
        ],
        when_to_create_plan: [
          'Create a new Helm plan when you discover follow-up work that should survive the current session or be handled later.',
          'Create a new Helm plan for blockers that need user input, upstream investigation, or another agent, instead of burying them in chat only.',
          'Do not overwrite the original plan when a new question or follow-up appears; preserve the original context and create a separate linked plan.',
        ],
        required_description_sections: REQUIRED_PLAN_DESCRIPTION_SECTIONS,
        question_plan_workflow: [
          'Question plans should use a title that starts with QUESTION: and a description whose first lines contain the concrete question.',
          'After creating a question plan, call plan_nextplan_link from the question plan to the blocked/original plan so the question must be resolved first.',
          'Keep the rest of the original plan description unchanged unless the user explicitly asks for an edit.',
        ],
        completion_documentation: [
          'When calling plan_complete, document the implemented behavior, the important files changed, tests or review performed, and any remaining risk.',
          'Completion notes should be useful to the next agent or sleeping user without requiring chat history.',
        ],
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

  getTelegramStatus(): TelegramStatus {
    const config = this.configLoader.getTelegramConfig();
    const chatConfigured = typeof config.chatId === 'number';
    const allowedUsersConfigured = Array.isArray(config.allowedUserIds) && config.allowedUserIds.length > 0;
    const configured = Boolean(config.botToken && chatConfigured && allowedUsersConfigured);
    const running = this.telegramBridge?.isRunning() ?? false;
    return {
      enabled: config.enabled,
      configured,
      running,
      available: config.enabled && configured && running,
      chatConfigured,
      allowedUsersConfigured,
      openChannels: this.telegramBridge?.listChannels().filter((channel) => channel.status === 'open').length ?? 0,
      guidance: 'Use Telegram only for mobile-friendly urgent blockers or after the user has already engaged through Telegram.',
    };
  }

  listTelegramChannels(): TelegramChannel[] {
    return this.telegramBridge?.listChannels() ?? [];
  }

  async createTelegramChannel(sessionRef: string, expectsResponse = false): Promise<TelegramChannel> {
    this.requireTelegramAvailable();
    const session = this.findSession(sessionRef);
    if (!session) {
      throw new Error(`Session not found: ${sessionRef}`);
    }
    return this.telegramBridge!.createChannel({ sessionId: session.id, expectsResponse });
  }

  async closeTelegramChannel(channelId: string): Promise<TelegramChannel> {
    this.requireTelegramBridge();
    const closed = this.telegramBridge!.closeChannel(channelId);
    if (!closed) {
      throw new Error(`Telegram channel not found: ${channelId}`);
    }
    return closed;
  }

  async sendTelegramToUser(
    sessionRef: string | undefined,
    text: string,
    options?: { channelId?: string; expectsResponse?: boolean },
  ): Promise<TelegramSendToUserResult> {
    this.requireTelegramAvailable();
    validateMobileFriendlyTelegramText(text);
    const session = options?.channelId
      ? undefined
      : this.findSession(requireString(sessionRef, 'sessionId or channelId is required'));
    if (!options?.channelId && !session) {
      throw new Error(`Session not found: ${sessionRef}`);
    }
    return this.telegramBridge!.sendToUser({
      ...(session ? { sessionId: session.id } : {}),
      ...(options?.channelId ? { channelId: options.channelId } : {}),
      text,
      ...(typeof options?.expectsResponse === 'boolean' ? { expectsResponse: options.expectsResponse } : {}),
    });
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
      { name: 'tools_list', title: 'List CLI Types', description: 'List CLI types configured in Helm and the configured working directories they can be spawned into.' },
      { name: 'plans_list', title: 'List Plans', description: 'List all plan items for a directory before editing or assigning work. Returned humanId values such as P-0035 are Helm plan IDs.' },
      { name: 'plans_summary', title: 'Plans Summary', description: 'List compact plan status, canonical IDs, human-readable P-ids, and dependency relationships before claiming work.' },
      { name: 'plan_get', title: 'Get Plan', description: 'Get full plan details before changing state, editing content, or asking about a plan. The id argument accepts either UUID or P-00xx humanId.' },
      { name: 'plan_create', title: 'Create Plan', description: `Create durable follow-up or question plans. Descriptions should include: ${REQUIRED_PLAN_DESCRIPTION_SECTIONS.join(', ')}.` },
      { name: 'plan_update', title: 'Update Plan', description: 'Update a plan title, description, and/or type while preserving existing context unless the edit is intentional. The id argument accepts UUID or P-00xx humanId.' },
      { name: 'plan_delete', title: 'Delete Plan', description: 'Delete a plan item by UUID or P-00xx humanId.' },
      { name: 'plan_set_state', title: 'Set Plan State', description: 'Set plan lifecycle state by UUID or P-00xx humanId. Pass sessionId when claiming coding work and then call session_set_working_plan.' },
      { name: 'plan_complete', title: 'Complete Plan', description: 'Mark a coding or review plan as done by UUID or P-00xx humanId with documentation of behavior changed, files, tests/review, and remaining risk.' },
      { name: 'plan_nextplan_link', title: 'Link Next Plan', description: 'Link one plan as a prerequisite for another using UUIDs or P-00xx humanIds. For blocker questions, link the QUESTION plan to the original blocked plan.' },
      { name: 'plan_nextplan_unlink', title: 'Unlink Next Plan', description: 'Remove a prerequisite link between two plan items using UUIDs or P-00xx humanIds.' },
      { name: 'plan_sequence_list', title: 'List Plan Sequences', description: 'List sequence/shared-memory stores for a directory or plan, including member plan IDs and sharedMemory.' },
      { name: 'plan_sequence_create', title: 'Create Plan Sequence', description: 'Create a sequence/shared-memory store that plans can join.' },
      { name: 'plan_sequence_update', title: 'Update Plan Sequence', description: 'Update sequence title, mission, sharedMemory, or order. Pass expectedUpdatedAt for mutex-style write protection.' },
      { name: 'plan_sequence_memory_append', title: 'Append Sequence Memory', description: 'Append to a sequence sharedMemory store with optional expectedUpdatedAt concurrency protection.' },
      { name: 'plan_sequence_delete', title: 'Delete Plan Sequence', description: 'Delete a sequence and clear membership from member plans.' },
      { name: 'plan_sequence_assign', title: 'Assign Plan Sequence', description: 'Assign or unlink a plan from a sequence without deleting the sequence.' },
      { name: 'plan_attachment_list', title: 'List Plan Attachments', description: 'List files attached to a plan by UUID or P-00xx humanId.' },
      { name: 'plan_attachment_add', title: 'Add Plan Attachment', description: 'Attach text, JSON, image, or binary content up to 10MB to a plan. Binary content is supplied as base64 and stored inside Helm config.' },
      { name: 'plan_attachment_delete', title: 'Delete Plan Attachment', description: 'Delete one stored attachment from a plan by attachment ID.' },
      { name: 'plan_attachment_get', title: 'Get Plan Attachment Temp File', description: 'Copy an attachment to a Helm temp file and return the local temp path instead of inline content.' },
      { name: 'directories_list', title: 'List Directories', description: 'List known configured working directories before creating plans or sessions.' },
      { name: 'session_create', title: 'Create Session', description: 'Spawn a new CLI session in a configured working directory with a stable display name.' },
      { name: 'sessions_list', title: 'List Sessions', description: 'List currently known Helm sessions, optionally filtered to one working directory.' },
      { name: 'session_get', title: 'Get Session', description: 'Get a session by ID or exact display name.' },
      { name: 'session_send_text', title: 'Send Text To Session', description: 'Send text to a running session PTY, with optional reply routing through HELM_MSG metadata.' },
      { name: 'session_read_terminal', title: 'Read Session Terminal', description: 'Read the recent terminal tail for any known session by ID or exact display name, with raw, stripped, or both output modes.' },
      { name: 'session_set_working_plan', title: 'Set Session Working Plan', description: 'Update the session row to show the plan currently being worked on.' },
      { name: 'session_set_aiagent_state', title: 'Set Session AIAGENT State', description: 'Update the session AIAGENT state icon in Helm.' },
      { name: 'session_close', title: 'Close Session', description: 'Close a Helm session and stop its PTY.' },
      { name: 'session_info', title: 'Get Session Info', description: 'Retrieve MCP endpoint, AIAGENT state registry, available tools, directories, and agent planning guidance.' },
      { name: 'telegram_status', title: 'Telegram Status', description: 'Report whether Telegram is enabled, configured, running, and available for urgent mobile-friendly user communication.' },
      { name: 'telegram_channel_list', title: 'List Telegram Channels', description: 'List open and closed MCP Telegram communication channels without exposing Telegram secrets.' },
      { name: 'telegram_channel_create', title: 'Create Telegram Channel', description: 'Create or reuse a Telegram communication channel for a session when user clarification is urgent or Telegram engagement already exists.' },
      { name: 'telegram_channel_close', title: 'Close Telegram Channel', description: 'Close a Telegram communication channel without deleting unrelated session topics.' },
      { name: 'telegram_send_to_user', title: 'Send Telegram Message To User', description: 'Send concise mobile-friendly text to the user via Telegram and optionally wait for a reply routed back to the session.' },
      { name: 'telegram_send', title: 'Send Message to Telegram User', description: 'Send a deliberate Telegram reply from a CLI session.' },
      { name: 'telegram_set_output_mode', title: 'Set Telegram Output Mode', description: 'Control how session output appears in Telegram.' },
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

  private resolvePlanRef(ref: string, label: string): Extract<PlanRefResolution, { status: 'found' }> | null {
    const resolution = this.planManager.resolveItemRef(ref);
    if (resolution.status === 'found') return resolution;
    if (resolution.status === 'ambiguous') {
      const matches = resolution.matches
        .map((item) => `${item.humanId ?? item.id} (${item.id}) in ${item.dirPath}`)
        .join(', ');
      throw new Error(`${label} reference is ambiguous: ${ref}. Matching plans: ${matches}`);
    }
    return null;
  }

  private assertSequenceMutex(sequence: PlanSequence, expectedUpdatedAt?: number): void {
    if (expectedUpdatedAt === undefined) return;
    if (sequence.updatedAt !== expectedUpdatedAt) {
      throw new Error(`Sequence ${sequence.id} was updated concurrently. Expected updatedAt=${expectedUpdatedAt}, current updatedAt=${sequence.updatedAt}. Re-read it before writing sharedMemory.`);
    }
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

  private requireTelegramBridge(): void {
    if (!this.telegramBridge) {
      throw new Error('Telegram bridge is not available');
    }
  }

  private requireTelegramAvailable(): void {
    this.requireTelegramBridge();
    const status = this.getTelegramStatus();
    if (!status.available) {
      throw new Error('Telegram is not available: enable Telegram, configure chat and allowed users, and start the bot first');
    }
  }
}

function requireResult<T>(value: T | null, message: string): T {
  if (value === null) {
    throw new Error(message);
  }
  return value;
}

function decodeBase64Content(value: string): Buffer {
  const normalized = value.replace(/\s/g, '');
  if (normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error('contentBase64 must be valid base64');
  }
  return Buffer.from(normalized, 'base64');
}

function requireString(value: string | undefined, errorMessage: string): string {
  if (!value) {
    throw new Error(errorMessage);
  }
  return value;
}

function validateMobileFriendlyTelegramText(text: string): void {
  if (text.trim().length === 0) {
    throw new Error('Telegram message text is required');
  }
  if (text.length > 1600) {
    throw new Error('Telegram message must be 1600 characters or fewer');
  }
  const wideLine = text.split(/\r?\n/).find((line) => line.length > 140);
  if (wideLine) {
    throw new Error('Telegram message lines must be 140 characters or fewer for mobile readability');
  }
}
