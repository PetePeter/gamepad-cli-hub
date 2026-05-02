/**
 * ScheduledTaskManager Tests
 *
 * Tests use fakes (real implementations with in-memory state) rather than mocks.
 * Test real scheduling behavior with short timeouts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { ScheduledTaskManager } from './scheduled-task-manager.js';
import { saveScheduledTasks } from './persistence.js';
import type { ScheduledTask, CreateScheduledTaskParams } from '../types/scheduled-task.js';

// ─── Fakes for dependencies ─────────────────────────────────────────────────────

class FakeSessionManager {
  private sessions = new Map<string, { id: string; cliType: string; workingDir: string }>();
  private activeSessionId: string | null = null;

  spawn(cliType: string, workingDir: string, env?: Record<string, string>): string {
    const id = `session-${Date.now()}`;
    this.sessions.set(id, { id, cliType, workingDir });
    return id;
  }

  getSession(id: string) { return this.sessions.get(id); }
  getActiveSession() { return this.activeSessionId ? this.sessions.get(this.activeSessionId) ?? null : null; }
  addSession(session: { id: string; cliType: string; workingDir: string }) {
    this.sessions.set(session.id, session);
    if (!this.activeSessionId) this.activeSessionId = session.id;
  }
  setActiveSession(id: string) { this.activeSessionId = id; }
  removeSession(id: string) {
    this.sessions.delete(id);
    if (this.activeSessionId === id) this.activeSessionId = null;
  }
}

class FakePtyManager extends EventEmitter {
  private writes = new Map<string, string[]>();
  private activePids = new Set<string>();

  constructor() {
    super();
  }

  async spawnCommand(
    cliType: string,
    workingDir: string,
    _env?: Record<string, string>,
  ): Promise<{ pid: number; sessionId: string }> {
    const sessionId = `pty-${Date.now()}`;
    return { pid: 1234, sessionId };
  }

  spawn(options: { sessionId: string }): { pid: number } {
    this.activePids.add(options.sessionId);
    return { pid: 1234 + options.sessionId.length };
  }

  has(sessionId: string): boolean {
    return this.activePids.has(sessionId);
  }

  deliverText(sessionId: string, text: string): void {
    if (!this.writes.has(sessionId)) this.writes.set(sessionId, []);
    this.writes.get(sessionId)!.push(text);
  }

  getWrites(sessionId: string): string[] {
    return this.writes.get(sessionId) ?? [];
  }

  write(sessionId: string, data: string): void {
    if (!this.writes.has(sessionId)) this.writes.set(sessionId, []);
    this.writes.get(sessionId)!.push(data);
  }

  emitExit(sessionId: string): void {
    this.activePids.delete(sessionId);
    this.emit('exit', sessionId, 0);
  }

  kill = vi.fn();
}

class FakePlanManager {
  private plans = new Map<string, { id: string; title: string }>();

  getItem(id: string) { return this.plans.get(id); }
}

class FakeConfigLoader {
  submitSuffixByCli = new Map<string, string>();

  getCliTypeEntry(cliType: string) {
    return {
      cliType,
      displayName: cliType,
      icon: cliType,
      spawnCommand: `echo ${cliType}`,
      resumeCommand: '',
      continueCommand: '',
      command: '{rawCommand}',
      sessions: {},
      bindings: {},
      sequences: {},
      submitSuffix: this.submitSuffixByCli.get(cliType),
      stickConfig: { mode: 'cursor' },
      dpadConfig: { autoRepeat: true },
    };
  }

  getWorkingDirectories() { return [{ path: 'X:\\\\coding\\\\test', name: 'test' }]; }
  getMcpConfig() { return { authToken: 'test-token', port: 47373, enabled: true }; }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('ScheduledTaskManager', () => {
  let manager: ScheduledTaskManager;
  let sessionManager: FakeSessionManager;
  let ptyManager: FakePtyManager;
  let planManager: FakePlanManager;
  let configLoader: FakeConfigLoader;

  beforeEach(() => {
    vi.useFakeTimers();
    sessionManager = new FakeSessionManager();
    ptyManager = new FakePtyManager();
    planManager = new FakePlanManager();
    configLoader = new FakeConfigLoader();
    manager = new ScheduledTaskManager(
      sessionManager as any,
      ptyManager as any,
      planManager as any,
      configLoader as any,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    manager.stop();
    saveScheduledTasks([]);
  });

  describe('createTask()', () => {
    it('should generate UUID and set defaults for new task', () => {
      const params: CreateScheduledTaskParams = {
        title: 'Test Task',
        description: 'Test description',
        planIds: [],
        initialPrompt: 'Test prompt',
        cliType: 'claude-code',
        scheduledTime: new Date(Date.now() + 10000),
        dirPath: 'X:\\\\coding\\\\test',
      };

      const task = manager.createTask(params);

      expect(task.id).toMatch(/^[0-9a-f-]{36}$/); // UUID v4
      expect(task.title).toBe('Test Task');
      expect(task.status).toBe('pending');
      expect(task.createdAt).toBeGreaterThan(0);
      expect(task.sessionId).toBeUndefined();
      expect(task.completedAt).toBeUndefined();
    });

    it('should emit task:changed event after creation', () => {
      const listener = vi.fn();
      manager.on('task:changed', listener);

      const params: CreateScheduledTaskParams = {
        title: 'Test Task',
        planIds: [],
        initialPrompt: 'Test',
        cliType: 'claude-code',
        scheduledTime: new Date(Date.now() + 10000),
        dirPath: 'X:\\\\coding\\\\test',
      };

      manager.createTask(params);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateTask()', () => {
    it('should update and reschedule pending tasks', () => {
      const listener = vi.fn();
      manager.on('task:changed', listener);
      const task = manager.createTask({
        title: 'Original',
        planIds: [],
        initialPrompt: 'Test',
        cliType: 'claude-code',
        scheduledTime: new Date(Date.now() + 10000),
        dirPath: 'X:\\\\coding\\\\test',
      });

      const nextTime = new Date(Date.now() + 20000);
      const updated = manager.updateTask(task.id, {
        title: 'Updated',
        initialPrompt: 'Updated prompt',
        cliType: 'codex',
        scheduledTime: nextTime,
      });

      expect(updated).toMatchObject({
        id: task.id,
        title: 'Updated',
        initialPrompt: 'Updated prompt',
        cliType: 'codex',
        scheduledTime: nextTime,
        status: 'pending',
      });
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('should reject updates for non-pending tasks', () => {
      const task = manager.createTask({
        title: 'Original',
        planIds: [],
        initialPrompt: 'Test',
        cliType: 'claude-code',
        scheduledTime: new Date(Date.now() + 10000),
        dirPath: 'X:\\\\coding\\\\test',
      });
      manager.cancelTask(task.id);

      expect(manager.updateTask(task.id, { title: 'Nope' })).toBeNull();
      expect(manager.getTask(task.id)?.title).toBe('Original');
    });
  });

  describe('scheduleTask()', () => {
    it('should set timeout that fires at scheduledTime', async () => {
      const params: CreateScheduledTaskParams = {
        title: 'Future Task',
        planIds: [],
        initialPrompt: 'Test',
        cliType: 'claude-code',
        scheduledTime: new Date(Date.now() + 5000),
        dirPath: 'X:\\\\coding\\\\test',
      };

      const task = manager.createTask(params);
      manager.start();

      // Fast-forward to just before scheduled time - task should still be pending
      vi.advanceTimersByTime(4000);
      // No timers run yet - status should still be pending
      expect(manager.getTask(task.id)?.status).toBe('pending');

      // Fast-forward past scheduled time
      vi.advanceTimersByTime(2000);
      await vi.runOnlyPendingTimersAsync();
      const executing = manager.getTask(task.id);
      expect(executing?.status).toBe('executing');
      ptyManager.emitExit(executing!.sessionId!);
      expect(manager.getTask(task.id)?.status).toBe('completed');
    });

    it('should clear timer if task is cancelled before firing', () => {
      const params: CreateScheduledTaskParams = {
        title: 'Future Task',
        planIds: [],
        initialPrompt: 'Test',
        cliType: 'claude-code',
        scheduledTime: new Date(Date.now() + 10000),
        dirPath: 'X:\\\\coding\\\\test',
      };

      const task = manager.createTask(params);
      manager.start();

      const cancelled = manager.cancelTask(task.id);
      expect(cancelled).toBe(true);

      // Fast-forward past scheduled time
      vi.advanceTimersByTime(15000);
      expect(manager.getTask(task.id)?.status).toBe('cancelled');
    });
  });

  describe('cancelTask()', () => {
    it('should return false after a one-shot task has already executed', async () => {
      const params: CreateScheduledTaskParams = {
        title: 'Test',
        planIds: [],
        initialPrompt: 'Test',
        cliType: 'claude-code',
        scheduledTime: new Date(Date.now() - 1000), // Past
        dirPath: 'X:\\\\coding\\\\test',
      };

      const task = manager.createTask(params);
      manager.start();
      vi.advanceTimersByTime(2000); // Trigger execution
      await vi.runOnlyPendingTimersAsync();

      const executing = manager.getTask(task.id);
      expect(executing?.status).toBe('executing');
      ptyManager.emitExit(executing!.sessionId!);
      expect(manager.getTask(task.id)?.status).toBe('completed');
      expect(manager.cancelTask(task.id)).toBe(false);
    });

    it('should emit task:changed event', () => {
      const listener = vi.fn();
      manager.on('task:changed', listener);

      const params: CreateScheduledTaskParams = {
        title: 'Test',
        planIds: [],
        initialPrompt: 'Test',
        cliType: 'claude-code',
        scheduledTime: new Date(Date.now() + 10000),
        dirPath: 'X:\\\\coding\\\\test',
      };

      const task = manager.createTask(params);
      manager.cancelTask(task.id);

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('start()', () => {
    it('should load pending tasks from persistence', () => {
      // Create task, stop manager (which persists), then restart
      const params: CreateScheduledTaskParams = {
        title: 'Persisted Task',
        planIds: [],
        initialPrompt: 'Test',
        cliType: 'claude-code',
        scheduledTime: new Date(Date.now() + 10000),
        dirPath: 'X:\\\\coding\\\\test',
      };

      manager.createTask(params);
      manager.stop();

      const newManager = new ScheduledTaskManager(
        sessionManager as any,
        ptyManager as any,
        planManager as any,
        configLoader as any,
      );
      newManager.start();

      expect(newManager.listTasks()).toHaveLength(1);
      expect(newManager.listTasks()[0].title).toBe('Persisted Task');

      newManager.stop();
    });

    it('should execute tasks with past scheduledTime immediately', async () => {
      const params: CreateScheduledTaskParams = {
        title: 'Past Task',
        planIds: [],
        initialPrompt: 'Test',
        cliType: 'claude-code',
        scheduledTime: new Date(Date.now() - 5000),
        dirPath: 'X:\\\\coding\\\\test',
      };

      manager.createTask(params);
      manager.start();
      await vi.runOnlyPendingTimersAsync();

      const executing = manager.getTask(manager.listTasks()[0].id);
      expect(executing?.status).toBe('executing');
      ptyManager.emitExit(executing!.sessionId!);
      expect(manager.getTask(executing!.id)?.status).toBe('completed');
    });
  });

  describe('stop()', () => {
    it('should cancel all pending timers', () => {
      const params: CreateScheduledTaskParams = {
        title: 'Future Task',
        planIds: [],
        initialPrompt: 'Test',
        cliType: 'claude-code',
        scheduledTime: new Date(Date.now() + 10000),
        dirPath: 'X:\\\\coding\\\\test',
      };

      manager.createTask(params);
      manager.start();
      manager.stop();

      // Fast-forward - task should NOT execute since stop was called
      vi.advanceTimersByTime(15000);
      expect(manager.getTask(manager.listTasks()[0].id)?.status).toBe('pending');
    });
  });

  describe('executeTask()', () => {
    it('should spawn CLI session with correct cwd and cliType', async () => {
      const spawnSpy = vi.spyOn(ptyManager, 'spawn');

      const params: CreateScheduledTaskParams = {
        title: 'Test',
        planIds: [],
        initialPrompt: 'Test prompt',
        cliType: 'claude-code',
        scheduledTime: new Date(Date.now() - 1000),
        dirPath: 'X:\\\\coding\\\\test',
      };

      manager.createTask(params);
      manager.start();

      await vi.runOnlyPendingTimersAsync();

      expect(spawnSpy).toHaveBeenCalledWith(expect.objectContaining({
        rawCommand: 'echo claude-code',
        cwd: 'X:\\\\coding\\\\test',
      }));
    });

    it('appends cliParams to rawCommand when spawnCommand is set', async () => {
      const spawnSpy = vi.spyOn(ptyManager, 'spawn');

      manager.createTask({
        title: 'Resume Test',
        planIds: [],
        initialPrompt: 'Test',
        cliType: 'claude-code',
        scheduledTime: new Date(Date.now() - 1000),
        dirPath: 'X:\\\\coding\\\\test',
        cliParams: '--resume',
      });
      manager.start();
      await vi.runOnlyPendingTimersAsync();

      expect(spawnSpy).toHaveBeenCalledWith(expect.objectContaining({
        rawCommand: expect.stringContaining('--resume'),
      }));
    });

    it('does not append empty cliParams to rawCommand', async () => {
      const spawnSpy = vi.spyOn(ptyManager, 'spawn');

      manager.createTask({
        title: 'No Params',
        planIds: [],
        initialPrompt: 'Test',
        cliType: 'claude-code',
        scheduledTime: new Date(Date.now() - 1000),
        dirPath: 'X:\\\\coding\\\\test',
        cliParams: '',
      });
      manager.start();
      await vi.runOnlyPendingTimersAsync();

      const rawCmd = (spawnSpy.mock.calls[0][0] as { rawCommand?: string }).rawCommand;
      expect(rawCmd).toBe('echo claude-code');
    });

    it('sets HELM_SESSION_ID to actual sessionId, not a random UUID', async () => {
      const spawned: Array<{ sessionId?: string; env?: Record<string, string> }> = [];
      const origSpawn = ptyManager.spawn.bind(ptyManager);
      vi.spyOn(ptyManager, 'spawn').mockImplementation((opts) => {
        spawned.push(opts as typeof spawned[0]);
        return origSpawn(opts);
      });

      manager.createTask({
        title: 'Env Test',
        planIds: [],
        initialPrompt: 'Test',
        cliType: 'claude-code',
        scheduledTime: new Date(Date.now() - 1000),
        dirPath: 'X:\\\\coding\\\\test',
      });
      manager.start();
      await vi.runOnlyPendingTimersAsync();

      const sessionId = manager.listTasks().find(t => t.status === 'executing')?.sessionId;
      expect(spawned[0].env?.HELM_SESSION_ID).toBe(sessionId);
    });

    it('delivers task prompt as onComplete callback after CLI init sequences', async () => {
      const delivered: string[] = [];
      const origDeliver = ptyManager.deliverText.bind(ptyManager);
      vi.spyOn(ptyManager, 'deliverText').mockImplementation(async (sid, text) => {
        delivered.push(text);
        return origDeliver(sid, text);
      });

      manager.createTask({
        title: 'Prompt Test',
        planIds: [],
        initialPrompt: 'do the thing',
        cliType: 'claude-code',
        scheduledTime: new Date(Date.now() - 1000),
        dirPath: 'X:\\\\coding\\\\test',
      });
      manager.start();
      await vi.runOnlyPendingTimersAsync();

      expect(delivered.some(t => t.includes('do the thing'))).toBe(true);
    });

    it('should complete one-shot tasks and close the background session', async () => {
      const params: CreateScheduledTaskParams = {
        title: 'Test',
        planIds: [],
        initialPrompt: 'Test',
        cliType: 'claude-code',
        scheduledTime: new Date(Date.now() - 1000),
        dirPath: 'X:\\\\coding\\\\test',
      };

      const task = manager.createTask(params);
      manager.start();

      await vi.runOnlyPendingTimersAsync();

      const updated = manager.getTask(task.id);
      expect(updated?.status).toBe('executing');
      expect(updated?.sessionId).toBeTruthy();
      ptyManager.emitExit(updated!.sessionId!);
      expect(manager.getTask(task.id)?.status).toBe('completed');
      expect(sessionManager.getSession(updated!.sessionId!)).toBeUndefined();
      expect(ptyManager.kill).not.toHaveBeenCalled();
    });

    it('should reschedule interval tasks after execution', async () => {
      const task = manager.createTask({
        title: 'Recurring',
        planIds: [],
        initialPrompt: 'Test',
        cliType: 'claude-code',
        scheduledTime: new Date(Date.now() - 1000),
        scheduleKind: 'interval',
        intervalMs: 60000,
        dirPath: 'X:\\\\coding\\\\test',
      });

      manager.start();
      await vi.runOnlyPendingTimersAsync();

      const running = manager.getTask(task.id);
      expect(running?.status).toBe('executing');
      ptyManager.emitExit(running!.sessionId!);
      const updated = manager.getTask(task.id);
      expect(updated?.status).toBe('pending');
      expect(updated?.nextRunAt?.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('direct mode', () => {
    it('should fail with clear error when targetSessionId is missing', async () => {
      manager.createTask({
        title: 'Orphan Direct',
        planIds: [],
        initialPrompt: 'hello',
        cliType: '',
        scheduledTime: new Date(Date.now() - 1000),
        dirPath: 'X:\\\\coding\\\\test',
        mode: 'direct',
      });

      manager.start();
      await vi.runOnlyPendingTimersAsync();

      const failed = manager.listTasks()[0];
      expect(failed.status).toBe('failed');
      expect(failed.error).toContain('Target session ID is missing');
    });

    it('should fail when target session has been removed', async () => {
      const deadSessionId = 'session-dead-gone';

      manager.createTask({
        title: 'Ghost Direct',
        planIds: [],
        initialPrompt: 'hello',
        cliType: 'claude-code',
        scheduledTime: new Date(Date.now() - 1000),
        dirPath: 'X:\\\\coding\\\\test',
        mode: 'direct',
        targetSessionId: deadSessionId,
      });

      manager.start();
      await vi.runOnlyPendingTimersAsync();

      const failed = manager.listTasks()[0];
      expect(failed.status).toBe('failed');
      expect(failed.error).toContain('not found');
    });

    it('should deliver prompt to existing session and complete', async () => {
      const targetId = 'session-direct-target';
      sessionManager.addSession({ id: targetId, cliType: 'claude-code', workingDir: 'X:\\\\coding\\\\test' });
      ptyManager.spawn({ sessionId: targetId });

      manager.createTask({
        title: 'Direct Hit',
        planIds: [],
        initialPrompt: 'do the thing',
        cliType: 'claude-code',
        scheduledTime: new Date(Date.now() - 1000),
        dirPath: 'X:\\\\coding\\\\test',
        mode: 'direct',
        targetSessionId: targetId,
      });

      manager.start();
      await vi.runOnlyPendingTimersAsync();

      const completed = manager.listTasks()[0];
      expect(completed.status).toBe('completed');
      expect(ptyManager.getWrites(targetId)).toEqual(
        expect.arrayContaining([expect.stringContaining('do the thing')]),
      );
    });

    it('preserves scheduled prompt spaces and uses the target CLI submit suffix', async () => {
      const targetId = 'session-direct-spaces';
      sessionManager.addSession({ id: targetId, cliType: 'claude-code', workingDir: 'X:\\\\coding\\\\test' });
      ptyManager.spawn({ sessionId: targetId });
      configLoader.submitSuffixByCli.set('claude-code', '\\n');

      manager.createTask({
        title: 'Space Prompt',
        planIds: [],
        initialPrompt: '  keep spaces  ',
        cliType: 'claude-code',
        scheduledTime: new Date(Date.now() - 1000),
        dirPath: 'X:\\\\coding\\\\test',
        mode: 'direct',
        targetSessionId: targetId,
      });

      manager.start();
      await vi.runOnlyPendingTimersAsync();

      expect(ptyManager.getWrites(targetId)).toEqual(['  keep spaces  ', '\n']);
    });

    it('parses scheduler sequence tokens before applying the target CLI submit suffix', async () => {
      const targetId = 'session-direct-sequence';
      sessionManager.addSession({ id: targetId, cliType: 'claude-code', workingDir: 'X:\\\\coding\\\\test' });
      ptyManager.spawn({ sessionId: targetId });
      configLoader.submitSuffixByCli.set('claude-code', '\\r\\n');

      manager.createTask({
        title: 'Sequence Prompt',
        planIds: [],
        initialPrompt: 'hello{Enter}there{Space}',
        cliType: 'claude-code',
        scheduledTime: new Date(Date.now() - 1000),
        dirPath: 'X:\\\\coding\\\\test',
        mode: 'direct',
        targetSessionId: targetId,
      });

      manager.start();
      await vi.runOnlyPendingTimersAsync();

      expect(ptyManager.getWrites(targetId)).toEqual(['hello', '\r\n', 'there', ' ']);
    });
  });
});
