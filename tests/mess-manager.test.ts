import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MessManager } from '../src/session/mess-manager.js';
import { MessPersistence } from '../src/session/mess-persistence.js';
import { ProjectStore } from '../src/session/project-store.js';
import { SessionManager } from '../src/session/manager.js';
import type { ProjectRecord } from '../src/types/project.js';
import type { SessionInfo } from '../src/types/session.js';

const project: ProjectRecord = { id: 'project-manager', name: 'Project', canonicalPath: 'C:/project', createdAt: 1, updatedAt: 1 };
const otherProject: ProjectRecord = { id: 'project-other', name: 'Other', canonicalPath: 'C:/other', createdAt: 1, updatedAt: 1 };
const dirs: string[] = [];

afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function setup(now = 2_000_000_000_000) {
  const directory = mkdtempSync(join(tmpdir(), 'helm-mess-manager-'));
  dirs.push(directory);
  const projects = { getById: (id: string) => [project, otherProject].find(item => item.id === id), findByPath: (path: string) => [project, otherProject].find(item => item.canonicalPath === path), list: () => [project, otherProject], save: () => {}, resolveForPath: () => { throw new Error('resolveForPath must not be called'); } };
  const sessions = new SessionManager(projects as any);
  const manager = new MessManager(sessions, projects as any, {
    now: () => now,
    persistenceFactory: (projectId) => new MessPersistence(projectId, { directory, now: () => now }),
    maxDeltaEntries: 2,
    maxDeltaBytes: 1_000_000,
  });
  return { directory, projects, sessions, manager };
}

function add(sessions: SessionManager, id: string, name: string, path = 'C:/project'): SessionInfo {
  const session: SessionInfo = { id, name, cliType: 'test', processId: 1, workingDir: path };
  sessions.addSession(session);
  return session;
}

describe('MessManager', () => {
  it('appends project broadcasts and emits their project identity', () => {
    const { sessions, manager } = setup();
    add(sessions, 'sender', 'planner');
    let emitted: any;
    manager.once('mess:appended', entry => { emitted = entry; });

    const entry = manager.post('sender', 'hello');

    expect(entry.projectId).toBe(project.id);
    expect(emitted).toMatchObject({ projectId: project.id, text: 'hello' });
  });

  it('initialises a new member at the join horizon and a returning member at its cursor', () => {
    const { sessions, manager, directory } = setup();
    add(sessions, 'sender', 'planner');
    new MessPersistence(project.id, { directory }).append({
      projectId: project.id,
      fromSessionId: 'sender',
      fromLabelSnapshot: 'planner',
      text: 'old',
      createdAt: 2_000_000_000_000 - 25 * 60 * 60 * 1000,
    });
    const receiver = add(sessions, 'receiver', 'memories');
    expect(manager.check(receiver.id).entries).toEqual([]);
    manager.post('sender', 'new');
    expect(manager.check(receiver.id).entries.map(entry => entry.text)).toEqual(['new']);
    expect(manager.check(receiver.id).entries).toEqual([]);
  });

  it('delivers a broadcast posted before a future session only after that session joins its horizon', () => {
    const { sessions, manager, directory } = setup();
    add(sessions, 'sender', 'planner');
    new MessPersistence(project.id, { directory }).append({
      projectId: project.id,
      fromSessionId: 'sender',
      fromLabelSnapshot: 'planner',
      text: 'before',
      createdAt: 2_000_000_000_000 - 25 * 60 * 60 * 1000,
    });
    const receiver = add(sessions, 'receiver', 'future');

    expect(manager.check(receiver.id).entries).toEqual([]);
  });

  it('bounds by count, advances only through returned entries, and reports more', () => {
    const { sessions, manager } = setup();
    add(sessions, 'sender', 'planner');
    const receiver = add(sessions, 'receiver', 'memories');
    manager.check(receiver.id);
    manager.post('sender', 'one');
    manager.post('sender', 'two');
    manager.post('sender', 'three');

    const first = manager.check(receiver.id);
    const second = manager.check(receiver.id);

    expect(first.entries.map(entry => entry.text)).toEqual(['one', 'two']);
    expect(first).toMatchObject({ new: 2, hasMore: true });
    expect(second.entries.map(entry => entry.text)).toEqual(['three']);
    expect(manager.check(receiver.id).entries).toEqual([]);
  });

  it('advances past directed entries addressed to other sessions without hiding later mail', () => {
    const { sessions, manager } = setup();
    add(sessions, 'sender', 'planner');
    const receiver = add(sessions, 'receiver', 'memories');
    const other = add(sessions, 'other', 'other');
    manager.check(receiver.id);
    manager.post('sender', 'for other', other.id);
    manager.post('sender', 'for receiver', receiver.id);

    const result = manager.check(receiver.id);

    expect(result.entries.map(entry => entry.text)).toEqual(['for receiver']);
    expect(manager.check(receiver.id).entries).toEqual([]);
  });

  it('does not acknowledge an invisible direct entry when it is the only unread entry', () => {
    const { sessions, manager, directory } = setup();
    add(sessions, 'sender', 'planner');
    const receiver = add(sessions, 'receiver', 'memories');
    const other = add(sessions, 'other', 'other');
    manager.check(receiver.id);
    manager.post('sender', 'for other', other.id);

    expect(manager.check(receiver.id)).toMatchObject({ new: 0, hasMore: false });
    expect(new MessPersistence(project.id, { directory }).getCursor(receiver.id)).toMatchObject({ lastSeq: 0 });
  });

  it('uses sequence order when a clock rollback makes a later entry look old', () => {
    const { sessions, manager, directory } = setup();
    add(sessions, 'sender', 'planner');
    new MessPersistence(project.id, { directory }).append({ projectId: project.id, fromSessionId: 'sender', fromLabelSnapshot: 'planner', text: 'recent seq 1', createdAt: 2_000_000_000_000 });
    new MessPersistence(project.id, { directory }).append({ projectId: project.id, fromSessionId: 'sender', fromLabelSnapshot: 'planner', text: 'rolled back seq 2', createdAt: 2_000_000_000_000 - 25 * 60 * 60 * 1000 });
    const receiver = add(sessions, 'receiver', 'memories');

    expect(manager.check(receiver.id).entries.map(entry => entry.text)).toEqual(['recent seq 1', 'rolled back seq 2']);
  });

  it('includes one oversized entry to guarantee progress and then stops at the byte bound', () => {
    const { sessions, manager } = setup();
    add(sessions, 'sender', 'planner');
    const receiver = add(sessions, 'receiver', 'memories');
    manager.post('sender', 'this is larger than the configured byte budget');

    const result = manager.check(receiver.id, { maxBytes: 1 });

    expect(result.entries).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });

  it('rejects directed posts across projects without creating membership', () => {
    const { sessions, manager } = setup();
    add(sessions, 'sender', 'planner');
    add(sessions, 'other', 'other', 'C:/other');

    expect(() => manager.post('sender', 'nope', 'other')).toThrow('same project');
  });

  it('preserves recoverable cursors and removes ephemeral cursors', () => {
    const { sessions, manager, directory } = setup();
    add(sessions, 'sender', 'planner');
    const receiver = add(sessions, 'receiver', 'memories');
    manager.post('sender', 'one');
    manager.check(receiver.id);
    manager.onSessionClosed(receiver.id, 'recoverable');
    expect(new MessPersistence(project.id, { directory }).getCursor(receiver.id)).toBeDefined();
    manager.onSessionClosed(receiver.id, 'ephemeral');

    expect(new MessPersistence(project.id, { directory }).getCursor(receiver.id)).toBeUndefined();
  });

  it('reports a retention gap instead of returning a clean empty delta', () => {
    const { sessions, manager, directory } = setup();
    add(sessions, 'sender', 'planner');
    const receiver = add(sessions, 'receiver', 'memories');
    manager.check(receiver.id);
    manager.post('sender', 'one');
    const persistence = new MessPersistence(project.id, { directory });
    const cursor = persistence.getCursor(receiver.id)!;
    persistence.saveCursor({ ...cursor, lastSeq: 0 });
    persistence.prune(0, 2_000_000_000_000 + 1);

    expect(manager.check(receiver.id)).toMatchObject({ gap: true, oldestSeq: 2 });
  });

  it('returns bounded history without advancing the check cursor', () => {
    const { sessions, manager } = setup();
    add(sessions, 'sender', 'planner');
    const receiver = add(sessions, 'receiver', 'memories');
    manager.post('sender', 'historical');

    expect(manager.history(receiver.id, { sinceHours: 1 }).map(entry => entry.text)).toEqual(['historical']);
    expect(manager.check(receiver.id).entries.map(entry => entry.text)).toEqual(['historical']);
  });

  it('returns all project entries for the human observer without advancing a session cursor', () => {
    const { sessions, manager } = setup();
    add(sessions, 'sender', 'planner');
    const receiver = add(sessions, 'receiver', 'memories');
    const other = add(sessions, 'other', 'other');
    manager.post('sender', 'for receiver', receiver.id);
    manager.post('sender', 'for other', other.id);

    expect(manager.historyForProject(project.id, { sinceHours: 1 }).entries.map(entry => entry.text))
      .toEqual(['for receiver', 'for other']);
    expect(manager.check(receiver.id).entries.map(entry => entry.text)).toEqual(['for receiver']);
  });
});
