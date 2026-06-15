import type { ScheduledTaskManager } from '../../session/scheduled-task-manager.js';
import type { CreateScheduledTaskParams, ScheduledTask, UpdateScheduledTaskParams } from '../../types/scheduled-task.js';
import type { ConfigLoader } from '../../config/loader.js';
import type { ProjectStore } from '../../session/project-store.js';
import { resolveWorkingDirectory } from './working-dir-gate.js';

/**
 * Scheduler facade for MCP tool operations.
 * Thin wrapper around ScheduledTaskManager with ISO date string conversion
 * and working-directory validation.
 */
export class HelmSchedulerService {
  constructor(
    private readonly scheduler: ScheduledTaskManager,
    private readonly configLoader?: ConfigLoader,
    private readonly projectStore?: ProjectStore,
  ) {}

  createTask(params: Omit<CreateScheduledTaskParams, 'scheduledTime' | 'endDate'> & { scheduledTime: string; endDate?: string }): { id: string } {
    this.validateWorkingDir(params.dirPath);
    const task = this.scheduler.createTask({
      ...params,
      scheduledTime: new Date(params.scheduledTime),
      endDate: params.endDate ? new Date(params.endDate) : undefined,
    });
    return { id: task.id };
  }

  listTasks(): ScheduledTask[] {
    return this.scheduler.listTasks();
  }

  getTask(id: string): ScheduledTask | null {
    return this.scheduler.getTask(id);
  }

  updateTask(id: string, updates: Omit<UpdateScheduledTaskParams, 'scheduledTime' | 'endDate'> & { scheduledTime?: string; endDate?: string }): { ok: true } {
    if (updates.dirPath) this.validateWorkingDir(updates.dirPath);
    const converted: UpdateScheduledTaskParams = {
      ...updates,
      scheduledTime: updates.scheduledTime ? new Date(updates.scheduledTime) : undefined,
    };
    if (Object.prototype.hasOwnProperty.call(updates, 'endDate')) {
      converted.endDate = updates.endDate ? new Date(updates.endDate) : undefined;
    }
    const result = this.scheduler.updateTask(id, converted);
    if (!result) throw new Error(`Scheduled task not found: ${id}`);
    return { ok: true };
  }

  cancelTask(id: string): { ok: true } {
    const cancelled = this.scheduler.cancelTask(id);
    if (!cancelled) throw new Error(`Scheduled task not found: ${id}`);
    return { ok: true };
  }

  deleteTask(id: string): boolean {
    return this.scheduler.deleteTask(id);
  }

  private validateWorkingDir(dirPath: string): void {
    if (!this.configLoader) return; // no gate available → allow (shouldn't happen in production)
    resolveWorkingDirectory(this.configLoader, this.projectStore, dirPath);
  }
}
