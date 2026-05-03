/**
 * ScheduledTaskManager — Task scheduling system for CLI sessions with plan references.
 *
 * Manages scheduled tasks that spawn CLI sessions at specific times with
 * initial prompts and plan references. Supports persistence, timer management,
 * and execution tracking.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';
import { saveScheduledTasks, loadScheduledTasks } from './persistence.js';
import type { ScheduledTask, ScheduledTaskStatus, CreateScheduledTaskParams, UpdateScheduledTaskParams } from '../types/scheduled-task.js';
import type { SessionManager } from './manager.js';
import type { PtyManager } from './pty-manager.js';
import type { PlanManager } from './plan-manager.js';
import type { ConfigLoader } from '../config/loader.js';
import { scheduleInitialPrompt } from './initial-prompt.js';
import { executeSequenceString } from '../input/sequence-executor.js';
import { mintSessionAuthToken } from '../mcp/session-auth.js';

const PENDING_STATUSES = new Set<ScheduledTaskStatus>(['pending', 'executing']);
const MIN_INTERVAL_MS = 60_000;

export class ScheduledTaskManager extends EventEmitter {
  private tasks = new Map<string, ScheduledTask>();
  private timers = new Map<string, NodeJS.Timeout>();
  private promptCancellers = new Map<string, () => void>();

  constructor(
    private sessionManager: SessionManager,
    private ptyManager: PtyManager,
    private planManager: PlanManager,
    private configLoader: ConfigLoader,
  ) {
    super();
  }

  /** Create a new scheduled task. */
  createTask(params: CreateScheduledTaskParams): ScheduledTask {
    const now = Date.now();
    const task: ScheduledTask = {
      id: randomUUID(),
      title: params.title,
      description: params.description,
      planIds: params.planIds,
      initialPrompt: params.initialPrompt,
      cliType: params.cliType,
      cliParams: params.cliParams,
      scheduledTime: params.scheduledTime,
      scheduleKind: params.scheduleKind ?? 'once',
      ...(params.intervalMs !== undefined ? { intervalMs: params.intervalMs } : {}),
      nextRunAt: params.scheduledTime,
      dirPath: params.dirPath,
      mode: params.mode,
      targetSessionId: params.targetSessionId,
      status: 'pending',
      createdAt: now,
    };

    this.tasks.set(task.id, task);
    this.saveTasks();
    this.scheduleTask(task);
    this.emit('task:changed', task);
    logger.info(`[ScheduledTaskManager] Created task "${task.title}" (${task.id}) for ${task.scheduledTime.toISOString()}`);
    return task;
  }

  /** Get all tasks. */
  listTasks(): ScheduledTask[] {
    return [...this.tasks.values()];
  }

  /** Get a task by ID. */
  getTask(id: string): ScheduledTask | null {
    return this.tasks.get(id) ?? null;
  }

  /** Update a pending scheduled task and reschedule its timer. */
  updateTask(id: string, updates: UpdateScheduledTaskParams): ScheduledTask | null {
    const task = this.tasks.get(id);
    if (!task || task.status !== 'pending') return null;

    if (updates.title !== undefined) task.title = updates.title;
    if (Object.prototype.hasOwnProperty.call(updates, 'description')) task.description = updates.description;
    if (updates.planIds !== undefined) task.planIds = updates.planIds;
    if (updates.initialPrompt !== undefined) task.initialPrompt = updates.initialPrompt;
    if (updates.cliType !== undefined) task.cliType = updates.cliType;
    if (Object.prototype.hasOwnProperty.call(updates, 'cliParams')) task.cliParams = updates.cliParams;
    if (updates.scheduledTime !== undefined) task.scheduledTime = updates.scheduledTime;
    if (updates.scheduleKind !== undefined) task.scheduleKind = updates.scheduleKind;
    if (Object.prototype.hasOwnProperty.call(updates, 'intervalMs')) task.intervalMs = updates.intervalMs;
    if (updates.dirPath !== undefined) task.dirPath = updates.dirPath;
    task.nextRunAt = task.scheduledTime;

    this.saveTasks();
    this.scheduleTask(task);
    this.emit('task:changed', task);
    logger.info(`[ScheduledTaskManager] Updated task "${task.title}" (${id})`);
    return task;
  }

  /** Cancel a pending task. Returns false if task already executing. */
  cancelTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;
    if (task.status !== 'pending') return false;

    this.clearTimer(id);
    task.status = 'cancelled';
    task.completedAt = Date.now();

    this.saveTasks();
    this.emit('task:changed', task);
    logger.info(`[ScheduledTaskManager] Cancelled task "${task.title}" (${id})`);
    return true;
  }

  /** Delete a task and cancel any pending timer. Returns false if already executing. */
  deleteTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;
    if (task.status === 'executing') return false;

    this.clearTimer(id);
    this.tasks.delete(id);
    this.saveTasks();
    this.emit('task:deleted', id);
    logger.info(`[ScheduledTaskManager] Deleted task "${task.title}" (${id})`);
    return true;
  }

  /** Start the manager: load pending tasks and restore timers. */
  start(): void {
    const loaded = loadScheduledTasks();
    this.tasks.clear();

    for (const task of loaded) {
      // Only restore tasks that were still pending
      if (PENDING_STATUSES.has(task.status)) {
        task.scheduleKind ??= 'once';
        task.nextRunAt ??= task.scheduledTime;
        this.tasks.set(task.id, task);
      }
    }

    logger.info(`[ScheduledTaskManager] Loaded ${this.tasks.size} task(s) from disk`);

    // Reset any crashed executing tasks back to pending for retry
    for (const task of this.tasks.values()) {
      if (task.status === 'executing') {
        task.status = 'pending';
        logger.info(`[ScheduledTaskManager] Reset crashed task "${task.title}" (${task.id}) from executing to pending`);
      }
    }

    // Schedule all pending tasks
    const now = Date.now();
    for (const task of this.tasks.values()) {
      if (task.status === 'pending') {
        if (this.getNextRunTime(task).getTime() <= now) {
          // Past scheduled time - execute immediately
          void this.executeTask(task);
        } else {
          this.scheduleTask(task);
        }
      }
    }
  }

  /** Stop the manager: cancel all timers and save state. */
  stop(): void {
    for (const id of this.timers.keys()) {
      this.clearTimer(id);
    }
    this.saveTasks();
    logger.info('[ScheduledTaskManager] Stopped');
  }

  /** Schedule a task by setting a timeout. */
  private scheduleTask(task: ScheduledTask): void {
    if (task.status !== 'pending') return;

    this.clearTimer(task.id);

    const now = Date.now();
    const delay = Math.max(0, this.getNextRunTime(task).getTime() - now);

    const timer = setTimeout(() => {
      void this.executeTask(task);
    }, delay);

    this.timers.set(task.id, timer);
    logger.debug(`[ScheduledTaskManager] Scheduled task "${task.title}" (${task.id}) in ${delay}ms`);
  }

  /** Execute a scheduled task: spawn CLI or send to existing session, set working plan, deliver prompt. */
  private async executeTask(task: ScheduledTask): Promise<void> {
    this.clearTimer(task.id);

    if (task.status !== 'pending') {
      logger.warn(`[ScheduledTaskManager] Skipping execution of task ${task.id} - status is ${task.status}`);
      return;
    }

    logger.info(`[ScheduledTaskManager] Executing task "${task.title}" (${task.id}) mode=${task.mode ?? 'spawn'}`);

    if (task.mode === 'direct') {
      if (!task.targetSessionId) {
        const err = new Error('Target session ID is missing');
        task.status = 'failed';
        task.error = err.message;
        task.completedAt = Date.now();
        this.saveTasks();
        this.emit('task:changed', task);
        return;
      }
      await this.executeDirectTask(task);
    } else {
      await this.executeSpawnTask(task);
    }
  }

  /** Direct mode: send prompt to an existing session. */
  private async executeDirectTask(task: ScheduledTask): Promise<void> {
    try {
      const targetId = task.targetSessionId!;
      const session = this.sessionManager.getSession(targetId);
      if (!session) {
        throw new Error(`Target session ${targetId} not found`);
      }
      if (!this.ptyManager.has(targetId)) {
        throw new Error(`Target session ${targetId} PTY is not running`);
      }

      task.status = 'executing';
      task.sessionId = targetId;
      this.saveTasks();
      this.emit('task:changed', task);

      if (task.planIds.length > 0 && this.planManager) {
        const firstPlanId = task.planIds[0];
        const plan = this.planManager.getItem(firstPlanId);
        if (plan) {
          this.planManager.setState(firstPlanId, 'coding', '', targetId);
        }
      }

      let prompt = task.initialPrompt;
      if (task.planIds.length > 0) {
        const planRefs = task.planIds.map(id => `- ${id}`).join('\n');
        prompt = `${task.initialPrompt}\n\nPlan references:\n${planRefs}`;
      }

      if (prompt.length > 0) {
        const recipientConfig = this.configLoader.getCliTypeEntry(session.cliType ?? task.cliType);
        await this.deliverScheduledPrompt(targetId, prompt, recipientConfig?.submitSuffix);
      }

      task.lastRunAt = Date.now();
      this.completeOrReschedule(task);
      logger.info(`[ScheduledTaskManager] Direct task "${task.title}" sent to session ${targetId}`);

    } catch (err) {
      logger.error(`[ScheduledTaskManager] Failed to execute direct task "${task.title}": ${err}`);
      task.status = 'failed';
      task.error = err instanceof Error ? err.message : String(err);
      task.completedAt = Date.now();
      this.saveTasks();
      this.emit('task:changed', task);
    }
  }

  /** Spawn mode: create a new PTY session and deliver prompt. */
  private async executeSpawnTask(task: ScheduledTask): Promise<void> {
    let exitListener: ((sessionId: string) => void) | null = null;
    try {
      const previousActiveSessionId = this.sessionManager.getActiveSession()?.id ?? null;
      const sessionId = randomUUID();
      const cliSessionName = randomUUID();
      const mcpConfig = this.configLoader.getMcpConfig?.() ?? { authToken: '', port: 47373 };
      const mcpToken = mintSessionAuthToken(mcpConfig.authToken, sessionId, `[scheduled] ${task.title}`);
      const env: Record<string, string> = {
        HELM_SESSION_ID: sessionId,
        HELM_SESSION_NAME: `[scheduled] ${task.title}`,
        HELM_MCP_TOKEN: mcpToken,
        HELM_MCP_URL: `http://127.0.0.1:${mcpConfig.port}/mcp`,
      };

      const cliConfig = this.configLoader.getCliTypeEntry(task.cliType);
      if (!cliConfig) {
        throw new Error(`Unknown CLI type: ${task.cliType}`);
      }

      let rawCommand = cliConfig.spawnCommand?.replaceAll('{cliSessionName}', cliSessionName);
      if (rawCommand && task.cliParams?.trim()) {
        rawCommand = `${rawCommand} ${task.cliParams.trim()}`;
      }
      const pty = this.ptyManager.spawn({
        sessionId,
        ...(rawCommand ? { rawCommand } : { command: task.cliType, args: task.cliParams ? splitCliParams(task.cliParams) : [] }),
        cwd: task.dirPath,
        env,
      });
      exitListener = (exitedSessionId: string) => {
        if (exitedSessionId !== sessionId) return;
        this.ptyManager.off('exit', exitListener!);
        this.finishScheduledRun(task, sessionId);
      };
      this.ptyManager.on('exit', exitListener);

      this.sessionManager.addSession({
        id: sessionId,
        name: `[scheduled] ${task.title}`,
        cliType: task.cliType,
        processId: pty.pid,
        workingDir: task.dirPath,
        cliSessionName,
      });
      if (previousActiveSessionId && this.sessionManager.getSession(previousActiveSessionId)) {
        this.sessionManager.setActiveSession(previousActiveSessionId);
      }
      task.status = 'executing';
      task.sessionId = sessionId;
      this.saveTasks();
      this.emit('task:changed', task);

      // Set working plan if planIds provided
      if (task.planIds.length > 0 && this.planManager) {
        const firstPlanId = task.planIds[0];
        const plan = this.planManager.getItem(firstPlanId);
        if (plan) {
          this.planManager.setState(firstPlanId, 'coding', '', sessionId);
          logger.info(`[ScheduledTaskManager] Set working plan ${firstPlanId} for session ${sessionId}`);
        }
      }

      // Build task prompt (with optional plan references)
      let prompt = task.initialPrompt;
      if (task.planIds.length > 0) {
        const planRefs = task.planIds.map(id => `- ${id}`).join('\n');
        prompt = `${task.initialPrompt}\n\nPlan references:\n${planRefs}`;
      }

      // CLI init sequences (helmInitialPrompt + profile initialPrompt + rename) fire first.
      // Task user prompt fires as onComplete callback — after CLI is ready.
      const renameCommand = cliConfig.renameCommand
        ? cliConfig.renameCommand.replaceAll('{cliSessionName}', cliSessionName)
        : undefined;

      const deliverTaskPrompt = prompt.length > 0
        ? () => {
          void this.deliverScheduledPrompt(sessionId, prompt, cliConfig.submitSuffix);
        }
        : undefined;

      const cancel = scheduleInitialPrompt(
        sessionId,
        {
          initialPrompt: cliConfig.initialPrompt,
          initialPromptDelay: cliConfig.initialPromptDelay,
          helmInitialPrompt: cliConfig.helmInitialPrompt,
          renameCommand,
        },
        (sid, data) => this.ptyManager.write(sid, data),
        (sid, text) => this.ptyManager.deliverText(sid, text),
        deliverTaskPrompt,
      );
      if (cancel) {
        this.promptCancellers.set(sessionId, cancel);
      } else if (deliverTaskPrompt) {
        // No CLI init sequences — deliver task prompt directly after delay
        const fallbackTimer = setTimeout(deliverTaskPrompt, cliConfig.initialPromptDelay ?? 2000);
        this.promptCancellers.set(sessionId, () => clearTimeout(fallbackTimer));
      }

      task.lastRunAt = Date.now();
      this.saveTasks();
      this.emit('task:changed', task);
      logger.info(`[ScheduledTaskManager] Task "${task.title}" running in background session ${sessionId}`);

    } catch (err) {
      if (exitListener) {
        this.ptyManager.off('exit', exitListener);
      }
      logger.error(`[ScheduledTaskManager] Failed to execute task "${task.title}" (${task.id}): ${err}`);
      task.status = 'failed';
      task.error = err instanceof Error ? err.message : String(err);
      task.completedAt = Date.now();

      this.saveTasks();
      this.emit('task:changed', task);
    }
  }

  /** Clear the timer for a task if it exists. */
  private clearTimer(taskId: string): void {
    const timer = this.timers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(taskId);
    }
  }

  /** Save all tasks to disk. */
  private saveTasks(): void {
    const tasksToSave = this.listTasks().filter(t => PENDING_STATUSES.has(t.status) || t.status === 'cancelled');
    saveScheduledTasks(tasksToSave);
  }

  private getNextRunTime(task: ScheduledTask): Date {
    return task.nextRunAt ?? task.scheduledTime;
  }

  private completeOrReschedule(task: ScheduledTask): void {
    if (task.scheduleKind === 'interval') {
      const intervalMs = task.intervalMs ?? 0;
      if (!Number.isFinite(intervalMs) || intervalMs < MIN_INTERVAL_MS) {
        task.status = 'failed';
        task.error = 'Interval schedules must be at least 1 minute';
        task.completedAt = Date.now();
        return;
      }
      const nextRunAt = new Date(Date.now() + intervalMs);
      task.status = 'pending';
      task.scheduledTime = nextRunAt;
      task.nextRunAt = nextRunAt;
      task.sessionId = undefined;
      task.error = undefined;
      this.scheduleTask(task);
      return;
    }
    task.status = 'completed';
    task.completedAt = Date.now();
  }

  private finishScheduledRun(task: ScheduledTask, sessionId: string): void {
    const cancel = this.promptCancellers.get(sessionId);
    if (cancel) { cancel(); this.promptCancellers.delete(sessionId); }
    this.completeOrReschedule(task);
    if (task.sessionId === sessionId && task.status !== 'pending') {
      task.sessionId = undefined;
    }
    try {
      if (this.sessionManager.getSession(sessionId)) {
        this.sessionManager.removeSession(sessionId);
      }
    } catch (error) {
      logger.warn(`[ScheduledTaskManager] Failed to remove scheduled session ${sessionId}: ${error}`);
    }
    this.saveTasks();
    this.emit('task:changed', task);
    logger.info(`[ScheduledTaskManager] Task "${task.title}" finished in background session ${sessionId}`);
  }

  private async deliverScheduledPrompt(sessionId: string, prompt: string, submitSuffix?: string): Promise<void> {
    const resolvedSubmitSuffix = parseSubmitSuffix(submitSuffix);
    await executeSequenceString({
      sessionId,
      input: prompt,
      write: (sid, data) => this.ptyManager.write(sid, data),
      deliverText: (sid, text) => this.ptyManager.deliverText(sid, text),
      submit: (sid) => this.ptyManager.write(sid, resolvedSubmitSuffix),
    });
  }
}

function splitCliParams(params: string): string[] {
  return params.trim().length > 0 ? params.trim().split(/\s+/) : [];
}

function parseSubmitSuffix(suffix?: string): string {
  if (!suffix) return '\r';
  if (suffix === '\\r') return '\r';
  if (suffix === '\\n') return '\n';
  if (suffix === '\\t') return '\t';
  if (suffix === '\\r\\n') return '\r\n';
  return suffix;
}
