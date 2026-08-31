import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessManager } from '../src/session/mess-manager.js';
import { MessPersistence } from '../src/session/mess-persistence.js';
import { MessNotifier } from '../src/session/mess-notifier.js';
import { SessionManager } from '../src/session/manager.js';
import type { ProjectRecord } from '../src/types/project.js';

const project: ProjectRecord = {
  id: 'notifier-project',
  name: 'Notifier Project',
  canonicalPath: 'C:/notifier-project',
  createdAt: 1,
  updatedAt: 1,
  messPokeCooldownMinutes: 1,
};

const directories: string[] = [];

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'helm-mess-notifier-'));
  directories.push(directory);
  const projects = {
    getById: (id: string) => id === project.id ? project : undefined,
    findByPath: (path: string) => path === project.canonicalPath ? project : undefined,
    list: () => [project],
    save: () => {},
  };
  const sessions = new SessionManager(projects as any);
  const manager = new MessManager(sessions, projects as any, {
    now: () => Date.now(),
    persistenceFactory: projectId => new MessPersistence(projectId, { directory }),
  });
  const stateDetector = new EventEmitter();
  const deliveries: string[] = [];
  const sendSystemReminder = vi.fn(async (_sessionId: string, text: string) => {
    deliveries.push(text);
  });
  const notifier = new MessNotifier(
    manager,
    sessions,
    stateDetector as any,
    projects as any,
    { sendSystemReminder },
    () => true,
  );
  const sender = { id: 'sender', name: 'planner', cliType: 'test', processId: 1, workingDir: project.canonicalPath };
  const receiver = { id: 'receiver', name: 'memories', cliType: 'test', processId: 2, workingDir: project.canonicalPath, activityLevel: 'idle' as const };
  sessions.addSession(sender);
  sessions.addSession(receiver);
  return { manager, sessions, stateDetector, notifier, deliveries, sendSystemReminder, receiver };
}

describe('MessNotifier', () => {
  afterEach(() => {
    vi.useRealTimers();
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it('pokes a session that is already idle when a post arrives', async () => {
    vi.useFakeTimers();
    const { manager, notifier, deliveries } = setup();
    manager.post('sender', 'hello');
    await flush();

    expect(deliveries).toEqual(['[HELM_MESS] 1 new — call mess_check']);
    notifier.dispose();
  });

  it('does not poke the session that authored the post', async () => {
    vi.useFakeTimers();
    const { manager, sessions, notifier, deliveries } = setup();
    const sender = sessions.getSession('sender')!;
    sender.activityLevel = 'idle';
    manager.post('sender', 'my own post');
    await flush();

    expect(deliveries).toEqual(['[HELM_MESS] 1 new — call mess_check']);
    notifier.dispose();
  });

  it('pokes on an idle transition when unread mail already exists', async () => {
    vi.useFakeTimers();
    const { manager, stateDetector, notifier, deliveries } = setup();
    manager.post('sender', 'hello');
    stateDetector.emit('activity-change', { sessionId: 'receiver', level: 'idle' });
    await flush();

    expect(deliveries).toHaveLength(1);
    notifier.dispose();
  });

  it('batches posts inside the cooldown into one reminder and retries at expiry', async () => {
    vi.useFakeTimers();
    const { manager, notifier, deliveries } = setup();
    manager.post('sender', 'one');
    manager.post('sender', 'two');
    manager.post('sender', 'three');
    await flush();
    expect(deliveries).toEqual(['[HELM_MESS] 1 new — call mess_check']);

    vi.advanceTimersByTime(60_000);
    await flush();
    expect(deliveries).toEqual([
      '[HELM_MESS] 1 new — call mess_check',
      '[HELM_MESS] 3 new — call mess_check',
    ]);
    notifier.dispose();
  });

  it('does not retry after the mail is read or while the session is busy', async () => {
    vi.useFakeTimers();
    const first = setup();
    first.manager.post('sender', 'read me');
    await flush();
    first.manager.check('receiver');
    vi.advanceTimersByTime(60_000);
    await flush();
    expect(first.deliveries).toHaveLength(1);
    first.notifier.dispose();

    const second = setup();
    second.manager.post('sender', 'busy');
    await flush();
    second.receiver.activityLevel = 'active';
    vi.advanceTimersByTime(60_000);
    await flush();
    expect(second.deliveries).toHaveLength(1);
    second.notifier.dispose();
  });

  it('leaves a failed delivery retryable and clears timers on dispose', async () => {
    vi.useFakeTimers();
    const { manager, notifier, sendSystemReminder, deliveries } = setup();
    sendSystemReminder.mockRejectedValueOnce(new Error('pty exited'));
    manager.post('sender', 'retry me');
    await flush();
    expect(deliveries).toEqual([]);

    vi.advanceTimersByTime(60_000);
    await flush();
    expect(deliveries).toEqual(['[HELM_MESS] 1 new — call mess_check']);

    notifier.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
