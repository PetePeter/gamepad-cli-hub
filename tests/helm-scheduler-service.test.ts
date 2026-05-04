import { describe, expect, it, vi } from 'vitest';
import { HelmSchedulerService } from '../src/mcp/services/helm-scheduler-service.js';
import type { ScheduledTask, CreateScheduledTaskParams, UpdateScheduledTaskParams } from '../src/types/scheduled-task.js';

function makeMockScheduler() {
  const tasks = new Map<string, ScheduledTask>();
  const scheduler = {
    createTask: vi.fn((params: CreateScheduledTaskParams): ScheduledTask => {
      const task: ScheduledTask = {
        id: 'task-1',
        title: params.title,
        description: params.description,
        planIds: params.planIds,
        initialPrompt: params.initialPrompt,
        cliType: params.cliType,
        scheduledTime: params.scheduledTime,
        dirPath: params.dirPath,
        scheduleKind: params.scheduleKind,
        intervalMs: params.intervalMs,
        cronExpression: params.cronExpression,
        endDate: params.endDate,
        mode: params.mode,
        targetSessionId: params.targetSessionId,
        status: 'pending',
        createdAt: Date.now(),
      };
      tasks.set(task.id, task);
      return task;
    }),
    listTasks: vi.fn(() => [...tasks.values()]),
    getTask: vi.fn((id: string) => tasks.get(id) ?? null),
    updateTask: vi.fn((id: string, updates: UpdateScheduledTaskParams) => {
      const task = tasks.get(id);
      if (!task || task.status !== 'pending') return null;
      const updated = { ...task, ...updates };
      tasks.set(id, updated);
      return updated;
    }),
    cancelTask: vi.fn((id: string) => {
      const task = tasks.get(id);
      if (!task || task.status !== 'pending') return false;
      task.status = 'cancelled';
      return true;
    }),
    deleteTask: vi.fn((id: string) => tasks.delete(id)),
  };

  return scheduler;
}

describe('HelmSchedulerService', () => {
  it('createTask converts ISO string to Date', () => {
    const scheduler = makeMockScheduler();
    const service = new HelmSchedulerService(scheduler as any);

    service.createTask({
      title: 'Test',
      initialPrompt: 'hello',
      cliType: 'claude-code',
      dirPath: '/tmp',
      scheduledTime: '2026-05-04T10:00:00Z',
    });

    expect(scheduler.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduledTime: expect.any(Date),
      }),
    );
    const passedDate = scheduler.createTask.mock.calls[0][0].scheduledTime;
    expect(passedDate.toISOString()).toBe('2026-05-04T10:00:00.000Z');
  });

  it('listTasks delegates', () => {
    const scheduler = makeMockScheduler();
    const service = new HelmSchedulerService(scheduler as any);
    service.listTasks();
    expect(scheduler.listTasks).toHaveBeenCalled();
  });

  it('getTask delegates with id', () => {
    const scheduler = makeMockScheduler();
    const service = new HelmSchedulerService(scheduler as any);
    service.getTask('task-1');
    expect(scheduler.getTask).toHaveBeenCalledWith('task-1');
  });

  it('updateTask converts ISO string to Date and delegates', () => {
    const scheduler = makeMockScheduler();
    const service = new HelmSchedulerService(scheduler as any);

    service.updateTask('task-1', {
      title: 'Updated',
      scheduledTime: '2026-05-05T12:00:00Z',
    });

    expect(scheduler.updateTask).toHaveBeenCalledWith('task-1', expect.objectContaining({
      scheduledTime: expect.any(Date),
    }));
    const passedDate = scheduler.updateTask.mock.calls[0][1].scheduledTime;
    expect(passedDate.toISOString()).toBe('2026-05-05T12:00:00.000Z');
  });

  it('cancelTask delegates with id', () => {
    const scheduler = makeMockScheduler();
    const service = new HelmSchedulerService(scheduler as any);
    service.cancelTask('task-1');
    expect(scheduler.cancelTask).toHaveBeenCalledWith('task-1');
  });

  it('deleteTask delegates with id', () => {
    const scheduler = makeMockScheduler();
    const service = new HelmSchedulerService(scheduler as any);
    service.deleteTask('task-1');
    expect(scheduler.deleteTask).toHaveBeenCalledWith('task-1');
  });

  it('createTask passes all params including interval mode', () => {
    const scheduler = makeMockScheduler();
    const service = new HelmSchedulerService(scheduler as any);

    service.createTask({
      title: 'Recurring',
      initialPrompt: 'check status',
      cliType: 'claude-code',
      dirPath: '/tmp',
      scheduledTime: '2026-05-04T10:00:00Z',
      scheduleKind: 'interval',
      intervalMs: 300000,
      planIds: ['p1'],
      mode: 'direct',
      targetSessionId: 'sess-1',
    });

    expect(scheduler.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleKind: 'interval',
        intervalMs: 300000,
        planIds: ['p1'],
        mode: 'direct',
        targetSessionId: 'sess-1',
      }),
    );
  });

  it('passes cron fields and converts endDate', () => {
    const scheduler = makeMockScheduler();
    const service = new HelmSchedulerService(scheduler as any);

    service.createTask({
      title: 'Weekday report',
      initialPrompt: 'report',
      cliType: 'claude-code',
      dirPath: '/tmp',
      scheduledTime: '2026-05-04T08:00:00Z',
      scheduleKind: 'cron',
      cronExpression: '0 9 * * 1-5',
      endDate: '2026-12-31T23:59:59Z',
    });

    expect(scheduler.createTask).toHaveBeenCalledWith(expect.objectContaining({
      scheduleKind: 'cron',
      cronExpression: '0 9 * * 1-5',
      endDate: expect.any(Date),
    }));
    expect(scheduler.createTask.mock.calls[0][0].endDate?.toISOString()).toBe('2026-12-31T23:59:59.000Z');
  });
});
