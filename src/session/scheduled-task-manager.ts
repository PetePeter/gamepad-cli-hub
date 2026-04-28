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
import type { ScheduledTask, ScheduledTaskStatus, CreateScheduledTaskParams } from '../types/scheduled-task.js';
import type { SessionManager } from './manager.js';
import type { PtyManager } from './pty-manager.js';
import type { PlanManager } from './plan-manager.js';
import type { ConfigLoader } from '../config/loader.js';

const PENDING_STATUSES = new Set<ScheduledTaskStatus>(['pending', 'executing']);

export class ScheduledTaskManager extends EventEmitter {
  private tasks = new Map<string, ScheduledTask>();
  private timers = new Map<string, NodeJS.Timeout>();

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
        if (task.scheduledTime.getTime() <= now) {
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
    const delay = Math.max(0, task.scheduledTime.getTime() - now);

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

    try {
      // Spawn CLI session
      const env = {
        HELM_SESSION_ID: randomUUID(),
      };

      const cliConfig = this.configLoader.getCliTypeEntry(task.cliType);
      if (!cliConfig) {
        throw new Error(`Unknown CLI type: ${task.cliType}`);
      }

      const spawnResult = await this.ptyManager.spawnCommand(
        task.cliType,
        task.dirPath,
        env,
      );

      // Set working plan if planIds provided
      if (task.planIds.length > 0 && this.planManager) {
        const firstPlanId = task.planIds[0];
        const plan = this.planManager.getItem(firstPlanId);
        if (plan) {
          this.planManager.setState(firstPlanId, 'coding', '', spawnResult.sessionId);
          logger.info(`[ScheduledTaskManager] Set working plan ${firstPlanId} for session ${spawnResult.sessionId}`);
        }
      }

      // Construct and deliver prompt
      let prompt = task.initialPrompt;
      if (task.planIds.length > 0) {
        const planRefs = task.planIds.map(id => `- ${id}`).join('\n');
        prompt = `${task.initialPrompt}\n\nPlan references:\n${planRefs}`;
      }

      this.ptyManager.deliverText(spawnResult.sessionId, prompt);

      // Update task status
      task.status = 'executing';
      task.sessionId = spawnResult.sessionId;

      this.saveTasks();
      this.emit('task:changed', task);
      logger.info(`[ScheduledTaskManager] Task "${task.title}" now executing in session ${spawnResult.sessionId}`);

      // TODO: Track completion via session state changes
      // For now, tasks stay in 'executing' state until manual completion

    } catch (err) {
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
}
