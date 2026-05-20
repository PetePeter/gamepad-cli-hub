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
import { HelmContextService } from './services/helm-context-service.js';
import { HelmTelegramService } from './services/helm-telegram-service.js';
import { HelmSchedulerService } from './services/helm-scheduler-service.js';
import { HelmProjectService } from './services/helm-project-service.js';
import { HelmDirectoryService } from './services/helm-directory-service.js';
import { logger } from '../utils/logger.js';
import type { ScheduledTaskManager } from '../session/scheduled-task-manager.js';
import type { CreateScheduledTaskParams, ScheduledTask, UpdateScheduledTaskParams } from '../types/scheduled-task.js';
import type { ContextBindingTargetType, ContextNode, ContextPermission, PlanContextRef } from '../types/context.js';
import type { Skill, SkillCreateInput, SkillReview, SkillSummary, SkillUpdateInput } from '../types/skill.js';
import { ContextManager } from '../session/context-manager.js';
import { SkillManager } from '../session/skill-manager.js';
import { SkillAnalyticsManager } from '../session/skill-analytics-manager.js';
import { getSessionInfo } from './guides/session-info-guide.js';
import { buildSessionSendTextGuide } from './guides/session-send-text-guide.js';
import { buildAgentPlanGuide } from './guides/agent-plan-guide.js';
import { buildNotificationGuide } from './guides/notification-guide.js';
import { buildTelegramGuide } from './guides/telegram-guide.js';
import type { ProjectStore } from '../session/project-store.js';
import { CapabilityDetector } from '../session/capability-detector.js';
export { parseSubmitSuffix } from './submit-suffix.js';

const SKILL_FEEDBACK_FOOTER = '---\nSkill applied. Call skill_submit_feedback("{skillId}", stars, summary, improvement?) to rate it.';

export interface SessionSummary {
  id: string;
  name: string;
  cliType: string;
  workingDir?: string;
  projectId?: string;
  projectPath?: string;
  state?: string;
  questionPending?: boolean;
  cliSessionName?: string;
  currentPlanId?: string;
  windowId?: number;
}

export interface ProjectInfo {
  id: string;
  name: string;
  canonicalPath: string;
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

export interface SessionInfoResponse {
  mandatory_rules: string[];
  your_session_id: string;
  your_working_dir: string;
  mcp_url: string;
  mcp_token: string;
  available_projects: ProjectInfo[];
  skills: Array<{ id: string; name: string; triggerWhen: string }>;
  telegramCapabilities: {
    available: boolean;
    openwhisper: boolean;
    openwhisperPath?: string;
    piper: boolean;
    piperPath?: string;
    ffmpeg: boolean;
    ffmpegPath?: string;
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
  private readonly contextService: HelmContextService;
  private readonly planAttachmentService: HelmPlanAttachmentService;
  private readonly telegramService: HelmTelegramService;
  private readonly schedulerService: HelmSchedulerService | null;
  private readonly projectService: HelmProjectService | null;
  private readonly directoryService: HelmDirectoryService;
  private readonly skillManager: SkillManager;
  private readonly skillAnalyticsManager: SkillAnalyticsManager;
  private readonly capabilityDetector: CapabilityDetector;

  constructor(
    private readonly planManager: PlanManager,
    private readonly sessionManager: SessionManager,
    private readonly ptyManager: PtyManager,
    private readonly configLoader: ConfigLoader,
    private readonly attachmentManager: PlanAttachmentManager = new PlanAttachmentManager(planManager),
    private readonly contextManager: ContextManager = new ContextManager(planManager),
    schedulerManager?: ScheduledTaskManager,
    private readonly projectStore?: ProjectStore,
    skillManager?: SkillManager,
    skillAnalyticsManager?: SkillAnalyticsManager,
  ) {
    super();
    const getSkillsPath = (configLoader as ConfigLoader & { getSkillsPath?: () => string }).getSkillsPath;
    const getSkillAnalyticsPath = (configLoader as ConfigLoader & { getSkillAnalyticsPath?: () => string }).getSkillAnalyticsPath;
    this.skillManager = skillManager ?? new SkillManager(getSkillsPath ? getSkillsPath.call(configLoader) : 'src/config/skills.yaml');
    this.skillAnalyticsManager = skillAnalyticsManager ?? new SkillAnalyticsManager(getSkillAnalyticsPath ? getSkillAnalyticsPath.call(configLoader) : 'src/config/skill-analytics.json');

    // Register built-in system skills (detailed guidance fetched just-in-time via skill_get)
    this.skillManager.registerSystemSkill({
      id: 'sys-session-send-text',
      name: 'Session Send Text Guide',
      description: 'Inter-LLM handoff protocol via session_send_text. Fetch with skill_get(type: "session-send-text").',
      body: JSON.stringify(buildSessionSendTextGuide(), null, 2),
      aiAmendable: false,
      allProjects: true,
      projectIds: [],
      type: 'session-send-text',
      source: 'system',
    });
    this.skillManager.registerSystemSkill({
      id: 'sys-agent-plan',
      name: 'Agent Plan Guide',
      description: 'Plan management workflow guidance. Fetch with skill_get(type: "agent-plan").',
      body: JSON.stringify(buildAgentPlanGuide(), null, 2),
      aiAmendable: false,
      allProjects: true,
      projectIds: [],
      type: 'agent-plan',
      source: 'system',
    });
    this.skillManager.registerSystemSkill({
      id: 'sys-notification',
      name: 'Notification Guide',
      description: 'Notification routing guidance. Fetch with skill_get(type: "notification").',
      body: JSON.stringify(buildNotificationGuide(), null, 2),
      aiAmendable: false,
      allProjects: true,
      projectIds: [],
      type: 'notification',
      source: 'system',
    });
    this.skillManager.registerSystemSkill({
      id: 'sys-telegram',
      name: 'Telegram Voice & Attachment Guide',
      description: 'Telegram capabilities, voice memo workflows (openwhisper/piper/ffmpeg), and attachment format guide. Fetch with skill_get(type: "telegram").',
      body: JSON.stringify(buildTelegramGuide(), null, 2),
      aiAmendable: false,
      allProjects: true,
      projectIds: [],
      type: 'telegram',
      source: 'system',
    });

    this.sessionDelivery = new HelmSessionDeliveryService(sessionManager, ptyManager, configLoader);
    this.sessionService = new HelmSessionService(sessionManager, ptyManager, configLoader, planManager);
    this.planService = new HelmPlanService(planManager, configLoader, attachmentManager, this.contextManager);
    this.planSequenceService = new HelmPlanSequenceService(planManager, configLoader);
    this.contextService = new HelmContextService(this.contextManager, planManager, configLoader);
    this.planAttachmentService = new HelmPlanAttachmentService(planManager, attachmentManager);
    this.telegramService = new HelmTelegramService(configLoader, sessionManager);
    this.schedulerService = schedulerManager ? new HelmSchedulerService(schedulerManager) : null;
    this.projectService = projectStore ? new HelmProjectService(projectStore) : null;
    this.directoryService = new HelmDirectoryService(configLoader, sessionManager, planManager, projectStore);
    this.capabilityDetector = new CapabilityDetector(configLoader);
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

  invalidateCapabilityCache(): void {
    this.capabilityDetector.invalidateCache();
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

  getPlan(id: string): (Omit<PlanItem, 'sequenceId'> & {
    hasAttachments: boolean;
    sequenceId?: string;
    sequenceContextMetadata?: Array<{
      id: string;
      title: string;
      type: string;
      permission: ContextPermission;
    }>;
  }) | null {
    return this.planService.getPlan(id);
  }

  getPlanIdMapping(humanId: string): { uuid: string; humanId: string } {
    return this.planService.getPlanIdMapping(humanId);
  }

  createPlan(dirPath: string, title: string, description: string, type?: PlanType, autoImplement?: boolean): PlanItem {
    return this.planService.createPlan(dirPath, title, description, type, autoImplement);
  }

  updatePlan(id: string, updates: { title?: string; description?: string; type?: PlanType | null; autoImplement?: boolean }): PlanItem | null {
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

  getPlanSequence(id: string): (PlanSequence & { memberPlanIds: string[]; memberHumanIds: string[] }) | null {
    return this.planSequenceService.getPlanSequence(id);
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
  // Context nodes
  // ---------------------------------------------------------------------------

  listContexts(projectId: string): Array<ContextNode & { sequenceIds: string[]; planIds: string[] }> {
    return this.contextService.listContexts(projectId);
  }

  getContext(id: string): (ContextNode & { sequenceIds: string[]; planIds: string[] }) | null {
    return this.contextService.getContext(id);
  }

  createContext(input: {
    projectId: string;
    title: string;
    type?: string;
    permission?: ContextPermission;
    content?: string;
    x?: number | null;
    y?: number | null;
  }): ContextNode {
    return this.contextService.createContext(input);
  }

  getProjectIdForDirectory(dirPath: string): string {
    return this.contextService.getProjectIdForDirectory(dirPath);
  }

  updateContext(
    id: string,
    updates: {
      title?: string;
      type?: string;
      permission?: ContextPermission;
      content?: string;
      x?: number | null;
      y?: number | null;
    },
  ): ContextNode {
    return this.contextService.updateContext(id, updates);
  }

  deleteContext(id: string): boolean {
    return this.contextService.deleteContext(id);
  }

  appendContext(id: string, text: string, expectedUpdatedAt?: number): ContextNode {
    return this.contextService.appendContext(id, text, expectedUpdatedAt);
  }

  setContextPosition(id: string, x: number | null, y: number | null): ContextNode {
    return this.contextService.setContextPosition(id, x, y);
  }

  bindContext(id: string, targetType: ContextBindingTargetType, targetId: string): boolean {
    return this.contextService.bindContext(id, targetType, targetId);
  }

  unbindContext(id: string, targetType: ContextBindingTargetType, targetId: string): boolean {
    return this.contextService.unbindContext(id, targetType, targetId);
  }

  listPlanContexts(planRef: string): PlanContextRef[] {
    return this.contextService.listPlanContexts(planRef);
  }

  // ---------------------------------------------------------------------------
  // Plan attachments
  // ---------------------------------------------------------------------------

  listPlanAttachments(planRef: string): PlanAttachment[] {
    return this.planAttachmentService.listPlanAttachments(planRef);
  }

  addPlanAttachment(
    planRef: string,
    input: { filePath: string; contentType?: string; text?: unknown; contentBase64?: unknown },
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
  // CLI listing
  // ---------------------------------------------------------------------------

  listDirectories() {
    return this.directoryService.listDirectories();
  }

  listClis() {
    const supportedDirPaths = this.configLoader.getWorkingDirectories().map(e => e.path);
    return this.configLoader.getCliTypes().map(cliType => {
      const entry = this.configLoader.getCliTypeEntry(cliType)!;
      return {
        cliType,
        name: entry.name,
        command: entry.spawnCommand ?? '',
        supportsResume: Boolean(entry.spawnCommand || entry.resumeCommand || entry.continueCommand),
        supportedDirPaths,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Project management
  // ---------------------------------------------------------------------------

  listProjects() {
    return this.requireProjectService().listProjects();
  }

  listProjectDirs(projectId: string) {
    return this.requireProjectService().listProjectDirs(projectId);
  }

  addProjectDir(projectId: string, dirPath: string) {
    return this.requireProjectService().addProjectDir(projectId, dirPath);
  }

  removeProjectDir(projectId: string, dirPath: string) {
    return this.requireProjectService().removeProjectDir(projectId, dirPath);
  }

  // ---------------------------------------------------------------------------
  // Session lifecycle
  // ---------------------------------------------------------------------------

  listSessions(dirPath?: string, projectId?: string) {
    return this.sessionService.listSessions(dirPath, projectId);
  }

  getSession(sessionRef: string) {
    return this.sessionService.getSession(sessionRef);
  }

  spawnCli(cliType: string, dirPath: string, name: string) {
    return this.sessionService.spawnCli(cliType, dirPath, name);
  }

  closeSession(sessionRef: string) {
    return this.sessionService.closeSession(sessionRef);
  }

  // ---------------------------------------------------------------------------
  // User-managed skills
  // ---------------------------------------------------------------------------

  listSkills(filter?: { projectId?: string; dirPath?: string }): SkillSummary[] {
    if (!filter?.projectId && !filter?.dirPath) return this.withSkillStats(this.skillManager.list());
    const projectId = filter.projectId ?? this.resolveProjectIdForDirectory(filter.dirPath);
    return this.withSkillStats(this.skillManager.listForProject(projectId));
  }

  getSkill(id: string): Skill | null {
    return this.prepareSkillForUse(this.skillManager.get(id));
  }

  createSkill(input: SkillCreateInput): Skill {
    return this.skillManager.create(input);
  }

  updateSkill(id: string, updates: SkillUpdateInput): Skill {
    return this.skillManager.update(id, updates, { requireAiAmendable: true });
  }

  resolveSkill(type: string, filter?: { projectId?: string; dirPath?: string }): Skill | null {
    const projectId = filter?.projectId ?? this.resolveProjectIdForDirectory(filter?.dirPath);
    return this.prepareSkillForUse(this.skillManager.resolveEffective(type, projectId ?? undefined));
  }

  deleteSkill(id: string): boolean {
    return this.skillManager.delete(id);
  }

  getSkillStats(id: string) {
    return this.skillAnalyticsManager.getStats(id);
  }

  clearSkillReviews(id: string) {
    return this.skillAnalyticsManager.clearReviews(id);
  }

  resetSkillUseCount(id: string) {
    return this.skillAnalyticsManager.resetUseCount(id);
  }

  resetAllSkillUseCounts(): void {
    this.skillAnalyticsManager.resetAllCounts();
  }

  submitSkillFeedback(
    id: string,
    stars: number,
    summary: string,
    improvement: string | undefined,
    authContext?: { sessionId?: string; sessionName?: string },
  ) {
    const skill = this.skillManager.get(id);
    if (!skill) throw new Error(`Skill not found: ${id}`);
    if (!authContext?.sessionId) {
      throw new Error('skill_submit_feedback requires a session-scoped MCP caller');
    }
    const session = this.sessionManager.getSession(authContext.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${authContext.sessionId}`);
    }
    return this.skillAnalyticsManager.addReview(id, {
      stars,
      summary,
      ...(improvement ? { improvement } : {}),
      cliName: session.name,
      cliType: session.cliType,
      timestamp: new Date().toISOString(),
    } satisfies SkillReview);
  }

  private withSkillStats(skills: SkillSummary[]): SkillSummary[] {
    return skills.map((skill) => {
      const stats = this.skillAnalyticsManager.getStats(skill.id);
      return {
        ...skill,
        useCount: stats.useCount,
        avgRating: stats.avgRating,
        reviewCount: stats.reviewCount,
      };
    });
  }

  private prepareSkillForUse(skill: Skill | null): Skill | null {
    if (!skill) return skill;
    this.skillAnalyticsManager.incrementUseCount(skill.id);
    if (skill.source === 'system') return skill;
    return {
      ...skill,
      body: appendSkillFeedbackFooter(skill.body, skill.id),
    };
  }

  restartHelm(): { sessionsClosed: number } {
    const sessions = this.sessionService.listSessions();
    for (const session of sessions) {
      try {
        this.sessionService.closeSession(session.id);
      } catch (error) {
        logger.warn(`[HelmControl] Failed to close session ${session.id} during restart: ${error}`);
      }
    }
    this.emit('restart-requested');
    return { sessionsClosed: sessions.length };
  }

  setAiagentState(sessionRef: string, state: 'planning' | 'implementing' | 'completed' | 'idle') {
    return this.sessionService.setAiagentState(sessionRef, state);
  }

  readSessionTerminal(sessionRef: string, requestedLines?: number, mode?: TerminalOutputMode, stripBlankLines?: boolean) {
    return this.sessionService.readSessionTerminal(sessionRef, requestedLines, mode, stripBlankLines);
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

  async sendInputToSession(
    sessionRef: string,
    sequence: string,
    options?: { senderSessionId?: string; senderSessionName?: string; impliedSubmit?: boolean; verify?: boolean },
  ) {
    return this.sessionDelivery.sendInputToSession(sessionRef, sequence, options);
  }

  // ---------------------------------------------------------------------------
  // Session info guide
  // ---------------------------------------------------------------------------

  /**
   * Get session info with MCP endpoint and AIAGENT state registry.
   * Called via session_info MCP tool — autocall endpoint provides context to AI agents.
   */
  getSessionInfo(authContext?: { sessionId?: string; sessionName?: string }): SessionInfoResponse {
    const projectId = this.resolveProjectIdForSession(authContext);
    return getSessionInfo(this.configLoader, this.sessionManager, authContext, this.projectStore, this.skillManager.listForProject(projectId), this.capabilityDetector);
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
    filePath?: string,
  ): Promise<{ sent: boolean; reason?: string }> {
    return this.telegramService.sendTelegramChat(sessionRef, message, filePath);
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

  // ---------------------------------------------------------------------------
  // Scheduler CRUD
  // ---------------------------------------------------------------------------

  createScheduledTask(params: Omit<CreateScheduledTaskParams, 'scheduledTime'> & { scheduledTime: string }): ScheduledTask {
    return this.requireScheduler().createTask(params);
  }

  listScheduledTasks(): ScheduledTask[] {
    return this.requireScheduler().listTasks();
  }

  getScheduledTask(id: string): ScheduledTask | null {
    return this.requireScheduler().getTask(id);
  }

  updateScheduledTask(id: string, updates: Omit<UpdateScheduledTaskParams, 'scheduledTime'> & { scheduledTime?: string }): ScheduledTask | null {
    return this.requireScheduler().updateTask(id, updates);
  }

  cancelScheduledTask(id: string): boolean {
    return this.requireScheduler().cancelTask(id);
  }

  deleteScheduledTask(id: string): boolean {
    return this.requireScheduler().deleteTask(id);
  }

  private requireScheduler(): HelmSchedulerService {
    if (!this.schedulerService) throw new Error('Scheduler is not available');
    return this.schedulerService;
  }

  private requireProjectService(): HelmProjectService {
    if (!this.projectService) throw new Error('Project service is not available');
    return this.projectService;
  }

  private resolveProjectIdForSession(authContext?: { sessionId?: string; sessionName?: string }): string | null {
    const sessionId = authContext?.sessionId;
    if (!sessionId) return null;
    const session = this.sessionManager.getSession(sessionId);
    return this.resolveProjectIdForDirectory(session?.workingDir);
  }

  private resolveProjectIdForDirectory(dirPath?: string): string | null {
    if (!dirPath || !this.projectStore) return null;
    const match = this.projectStore.findByPath(dirPath);
    return match?.id ?? null;
  }
}

function appendSkillFeedbackFooter(body: string, skillId: string): string {
  const footer = SKILL_FEEDBACK_FOOTER.replace('{skillId}', skillId);
  return `${body.trimEnd()}\n\n${footer}`;
}
