import type { ScheduledTaskManager } from '../../session/scheduled-task-manager.js';
import type { CreateScheduledTaskParams, ScheduledTask, UpdateScheduledTaskParams } from '../../types/scheduled-task.js';

/**
 * Scheduler facade for MCP tool operations.
 * Thin wrapper around ScheduledTaskManager with ISO date string conversion.
 */
export class HelmSchedulerService {
  constructor(private readonly scheduler: ScheduledTaskManager) {}

  createTask(params: Omit<CreateScheduledTaskParams, 'scheduledTime'> & { scheduledTime: string }): ScheduledTask {
    return this.scheduler.createTask({
      ...params,
      scheduledTime: new Date(params.scheduledTime),
    });
  }

  listTasks(): ScheduledTask[] {
    return this.scheduler.listTasks();
  }

  getTask(id: string): ScheduledTask | null {
    return this.scheduler.getTask(id);
  }

  updateTask(id: string, updates: Omit<UpdateScheduledTaskParams, 'scheduledTime'> & { scheduledTime?: string }): ScheduledTask | null {
    return this.scheduler.updateTask(id, {
      ...updates,
      scheduledTime: updates.scheduledTime ? new Date(updates.scheduledTime) : undefined,
    });
  }

  cancelTask(id: string): boolean {
    return this.scheduler.cancelTask(id);
  }

  deleteTask(id: string): boolean {
    return this.scheduler.deleteTask(id);
  }
}
