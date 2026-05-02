import { EventEmitter } from 'node:events';
import type { ConfigLoader } from '../config/loader.js';
import type { PlanManager } from '../session/plan-manager.js';
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
import type { NotificationManager } from '../session/notification-manager.js';
import { HelmSessionDeliveryService } from './services/helm-session-delivery-service.js';
import { HelmSessionService } from './services/helm-session-service.js';
import { HelmPlanService } from './services/helm-plan-service.js';
import { HelmPlanSequenceService } from './services/helm-plan-sequence-service.js';
import { HelmPlanAttachmentService } from './services/helm-plan-attachment-service.js';
import { HelmDirectoryService } from './services/helm-directory-service.js';
import { HelmTelegramService } from './services/helm-telegram-service.js';
import { getSessionInfo, getAvailableTools } from './guides/session-info-guide.js';
export { parseSubmitSuffix } from './submit-suffix.js';

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
  mandatory_rules: string[];
  sessionId?: string;
  sessionName?: string;
  cliType?: string;
  workingDir?: string;
  mcp_url: string;
  mcp_token: string;
  aiagent_states: string[];
  available_directories: DirectoryInfo[];
  aiagent_state_guide?: {
    validStates: string[];
    how_to_update: {
      description: string;
      mcp_call: string;
      usage_example: { sessionId: string; state: string };
      state_icons: Record<string, string>;
    };
    state_systems: Array<{
      name: string;
      purpose: string;
      owner: string;
      tools_or_fields: string[];
    }>;
    state_transitions: Array<{
      from: string;
      to: string;
      when: string;
    }>;
    integration_patterns: Array<{
      scenario: string;
      steps: string[];
    }>;
    error_scenarios: string[];
    notes: string[];
  };
  session_send_text_guide?: {
    description: string;
    how_it_works: string;
    sequence_tokens?: string[];
    submit_suffix_behavior?: string;
    inter_llm_handoff_protocol: string[];
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
    plan_attachment_guide: string[];
    sequence_memory_guide: string[];
  };
  notification_guide?: {
    description: string;
    preferred_tool: string;
    pre_flight: string[];
    when_to_notify: string[];
    when_not_to_notify: string[];
    routing_outcomes: Record<string, string>;
    telegram_usage: string[];
    examples: Array<{ scenario: string; tool: string; rationale: string }>;
  };
}

/**
 * Thin facade that delegates all MCP tool operations to domain-focused service classes.
 * The constructor signature and public method names are preserved for backward compatibility.
 */
export class HelmControlService extends EventEmitter {
  // Composed services
  private readonly sessionDelivery: HelmSessionDeliveryService;
  private readonly sessionService: HelmSessionService;
  private readonly planService: HelmPlanService;
  private readonly planSequenceService: HelmPlanSequenceService;
  private readonly planAttachmentService: HelmPlanAttachmentService;
  private readonly directoryService: HelmDirectoryService;
  private readonly telegramService: HelmTelegramService;

  constructor(
    private readonly planManager: PlanManager,
    private readonly sessionManager: SessionManager,
    private readonly ptyManager: PtyManager,
    private readonly configLoader: ConfigLoader,
    private readonly attachmentManager: PlanAttachmentManager = new PlanAttachmentManager(planManager),
  ) {
    super();
    this.sessionDelivery = new HelmSessionDeliveryService(sessionManager, ptyManager, configLoader);
    this.sessionService = new HelmSessionService(sessionManager, ptyManager, configLoader, planManager);
    this.planService = new HelmPlanService(planManager, configLoader, attachmentManager);
    this.planSequenceService = new HelmPlanSequenceService(planManager, configLoader);
    this.planAttachmentService = new HelmPlanAttachmentService(planManager, attachmentManager);
    this.directoryService = new HelmDirectoryService(configLoader, sessionManager, planManager);
    this.telegramService = new HelmTelegramService(configLoader, sessionManager);
  }

  // ---------------------------------------------------------------------------
  // Telegram bridge / notification manager injection (mutates telegramService)
  // ---------------------------------------------------------------------------

  setTelegramBridge(bridge: TelegramBridge | null): void {
    this.telegramService.setTelegramBridge(bridge);
  }

  setNotificationManager(nm: NotificationManager): void {
    this.telegramService.setNotificationManager(nm);
  }

  // ---------------------------------------------------------------------------
  // Plan CRUD
  // ---------------------------------------------------------------------------

  listPlans(dirPath: string): PlanItem[] {
    return this.planService.listPlans(dirPath);
  }

  plansSummary(dirPath: string) {
    return this.planService.plansSummary(dirPath);
  }

  getPlan(id: string): (Omit<PlanItem, 'sequenceId'> & { hasAttachments: boolean; sequenceId?: string }) | null {
    return this.planService.getPlan(id);
  }

  createPlan(dirPath: string, title: string, description: string, type?: PlanType): PlanItem {
    return this.planService.createPlan(dirPath, title, description, type);
  }

  updatePlan(id: string, updates: { title?: string; description?: string; type?: PlanType | null }): PlanItem | null {
    return this.planService.updatePlan(id, updates);
  }

  deletePlan(id: string): boolean {
    return this.planService.deletePlan(id);
  }

  completePlan(id: string, completionNotes?: string): PlanItem | null {
    return this.planService.completePlan(id, completionNotes);
  }

  reopenPlan(id: string): PlanItem | null {
    return this.planService.reopenPlan(id);
  }

  setPlanState(
    id: string,
    status: Exclude<PlanStatus, 'done'>,
    stateInfo?: string,
    sessionId?: string,
  ): PlanItem | null {
    return this.planService.setPlanState(id, status, stateInfo, sessionId);
  }

  linkPlans(fromId: string, toId: string): void {
    return this.planService.linkPlans(fromId, toId);
  }

  unlinkPlans(fromId: string, toId: string): void {
    return this.planService.unlinkPlans(fromId, toId);
  }

  exportDirectory(dirPath: string): { dirPath: string; items: PlanItem[]; dependencies: { fromId: string; toId: string }[] } | null {
    return this.planService.exportDirectory(dirPath);
  }

  exportItem(id: string): { item: PlanItem; dependencies: { fromId: string; toId: string }[] } | null {
    return this.planService.exportItem(id);
  }

  // ---------------------------------------------------------------------------
  // Plan sequences
  // ---------------------------------------------------------------------------

  listPlanSequences(input: { dirPath?: string; planRef?: string }): Array<PlanSequence & { memberPlanIds: string[]; memberHumanIds: string[]; selectedForPlan?: boolean }> {
    return this.planSequenceService.listPlanSequences(input);
  }

  createPlanSequence(input: { dirPath: string; title: string; missionStatement?: string; sharedMemory?: string }): PlanSequence {
    return this.planSequenceService.createPlanSequence(input);
  }

  updatePlanSequence(
    id: string,
    updates: { title?: string; missionStatement?: string; sharedMemory?: string; order?: number; expectedUpdatedAt?: number },
  ): PlanSequence {
    return this.planSequenceService.updatePlanSequence(id, updates);
  }

  appendPlanSequenceMemory(id: string, text: string, expectedUpdatedAt?: number): PlanSequence {
    return this.planSequenceService.appendPlanSequenceMemory(id, text, expectedUpdatedAt);
  }

  deletePlanSequence(id: string): boolean {
    return this.planSequenceService.deletePlanSequence(id);
  }

  assignPlanSequence(planRef: string, sequenceId: string | null): PlanItem {
    return this.planSequenceService.assignPlanSequence(planRef, sequenceId);
  }

  // ---------------------------------------------------------------------------
  // Plan attachments
  // ---------------------------------------------------------------------------

  listPlanAttachments(planRef: string): PlanAttachment[] {
    return this.planAttachmentService.listPlanAttachments(planRef);
  }

  addPlanAttachment(
    planRef: string,
    input: { filename: string; contentBase64?: string; text?: string; contentType?: string },
  ): PlanAttachment {
    return this.planAttachmentService.addPlanAttachment(planRef, input);
  }

  deletePlanAttachment(planRef: string, attachmentId: string): boolean {
    return this.planAttachmentService.deletePlanAttachment(planRef, attachmentId);
  }

  getPlanAttachment(planRef: string, attachmentId: string): PlanAttachmentTempFile {
    return this.planAttachmentService.getPlanAttachment(planRef, attachmentId);
  }

  // ---------------------------------------------------------------------------
  // Directory & CLI listing
  // ---------------------------------------------------------------------------

  listDirectories() {
    return this.directoryService.listDirectories();
  }

  listClis() {
    return this.directoryService.listClis();
  }

  // ---------------------------------------------------------------------------
  // Session lifecycle
  // ---------------------------------------------------------------------------

  listSessions(dirPath?: string) {
    return this.sessionService.listSessions(dirPath);
  }

  getSession(sessionRef: string) {
    return this.sessionService.getSession(sessionRef);
  }

  spawnCli(cliType: string, dirPath: string, name: string, prompt?: string) {
    return this.sessionService.spawnCli(cliType, dirPath, name, prompt);
  }

  closeSession(sessionRef: string) {
    return this.sessionService.closeSession(sessionRef);
  }

  setAiagentState(sessionRef: string, state: 'planning' | 'implementing' | 'completed' | 'idle') {
    return this.sessionService.setAiagentState(sessionRef, state);
  }

  readSessionTerminal(sessionRef: string, requestedLines?: number, mode?: TerminalOutputMode) {
    return this.sessionService.readSessionTerminal(sessionRef, requestedLines, mode);
  }

  setSessionWorkingPlan(sessionRef: string, planId: string) {
    return this.sessionService.setSessionWorkingPlan(sessionRef, planId);
  }

  // ---------------------------------------------------------------------------
  // Session text delivery
  // ---------------------------------------------------------------------------

  async sendTextToSession(
    sessionRef: string,
    text: string,
    options?: { senderSessionId?: string; senderSessionName?: string; expectsResponse?: boolean },
  ) {
    return this.sessionDelivery.sendTextToSession(sessionRef, text, options);
  }

  // ---------------------------------------------------------------------------
  // Session info guide
  // ---------------------------------------------------------------------------

  /**
   * Get session info with MCP endpoint and AIAGENT state registry.
   * Called via session_info MCP tool — autocall endpoint provides context to AI agents.
   */
  getSessionInfo(authContext?: { sessionId?: string; sessionName?: string }): SessionInfoResponse {
    return getSessionInfo(this.configLoader, this.sessionManager, authContext);
  }

  /**
   * Get list of available MCP tools with names and titles.
   */
  private getAvailableTools(): McpToolSummary[] {
    return getAvailableTools();
  }

  // ---------------------------------------------------------------------------
  // Telegram & notifications
  // ---------------------------------------------------------------------------

  getTelegramStatus(): TelegramStatus {
    return this.telegramService.getTelegramStatus();
  }

  async closeTelegramChannel(channelId: string): Promise<TelegramChannel> {
    return this.telegramService.closeTelegramChannel(channelId);
  }

  async sendTelegramChat(
    sessionRef: string,
    message: string,
    attachment?: { name: string; data: string; mime: string },
  ): Promise<{ sent: boolean; reason?: string }> {
    return this.telegramService.sendTelegramChat(sessionRef, message, attachment);
  }

  notifyUser(sessionRef: string, title: string, content: string): { delivered: 'toast' | 'bubble' | 'telegram' | 'none' } {
    return this.telegramService.notifyUser(sessionRef, title, content);
  }

  getAppVisibility(): {
    visibility: 'visible-focused' | 'visible-background' | 'hidden';
    screenLocked: boolean;
    activeSessionId: string | null;
  } {
    return this.telegramService.getAppVisibility();
  }
}
