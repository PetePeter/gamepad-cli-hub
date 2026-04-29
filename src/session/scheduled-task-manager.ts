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

  /** Execute a scheduled task: spawn CLI, set working plan, deliver prompt. */
  private async executeTask(task: ScheduledTask): Promise<void> {
    this.clearTimer(task.id);

    if (task.status !== 'pending') {
      logger.warn(`[ScheduledTaskManager] Skipping execution of task ${task.id} - status is ${task.status}`);
      return;
    }

    logger.info(`[ScheduledTaskManager] Executing task "${task.title}" (${task.id})`);

    let exitListener: ((sessionId: string) => void) | null = null;
    try {
      const previousActiveSessionId = this.sessionManager.getActiveSession()?.id ?? null;
      const sessionId = randomUUID();
      const cliSessionName = randomUUID();
      const env = {
        HELM_SESSION_ID: randomUUID(),
      };

      const cliConfig = this.configLoader.getCliTypeEntry(task.cliType);
      if (!cliConfig) {
        throw new Error(`Unknown CLI type: ${task.cliType}`);
      }

      const rawCommand = cliConfig.spawnCommand?.replaceAll('{cliSessionName}', cliSessionName);
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

      // Construct and deliver prompt via scheduleInitialPrompt for delay + sequence support
      let prompt = task.initialPrompt;
      if (task.planIds.length > 0) {
        const planRefs = task.planIds.map(id => `- ${id}`).join('\n');
        prompt = `${task.initialPrompt}\n\nPlan references:\n${planRefs}`;
      }

      const trimmed = prompt.trim();
      if (trimmed.length > 0) {
        const seq = !/[{] *(?:send|enter) *[]}$/i.test(trimmed)
          ? `${trimmed} {Send}`
          : trimmed;
        const cancel = scheduleInitialPrompt(
          sessionId,
          {
            initialPrompt: [{ label: 'scheduled-prompt', sequence: seq }],
            initialPromptDelay: cliConfig.initialPromptDelay,
          },
          (sid, data) => this.ptyManager.write(sid, data),
          (sid, text) => this.ptyManager.deliverText(sid, text),
        );
        if (cancel) this.promptCancellers.set(sessionId, cancel);
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
}

function splitCliParams(params: string): string[] {
  return params.trim().length > 0 ? params.trim().split(/\s+/) : [];
}
