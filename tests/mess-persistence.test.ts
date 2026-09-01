import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MessPersistence } from '../src/session/mess-persistence.js';
import { getMessCursorPath, getMessLogPath } from '../src/session/persistence-paths.js';
import { getMessProjectSettings, type ProjectRecord } from '../src/types/project.js';

const projectId = 'project-0717';
const sessionId = 'session-a';
const createdAt = 1_700_000_000_000;
const tempDirs: string[] = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function makeStore(options: ConstructorParameters<typeof MessPersistence>[1] = {}): MessPersistence {
  const directory = options.directory ?? mkdtempSync(join(tmpdir(), 'helm-mess-'));
  if (!tempDirs.includes(directory)) tempDirs.push(directory);
  return new MessPersistence(projectId, { ...options, directory });
}

function post(store: MessPersistence, text: string, at = createdAt) {
  return store.append({
    projectId,
    fromSessionId: sessionId,
    fromLabelSnapshot: 'planner',
    text,
    createdAt: at,
  });
}

describe('MessPersistence', () => {
  it('round-trips entries in ordered sequence order', () => {
    const store = makeStore();
    const first = post(store, 'first');
    const second = post(store, 'second');

    expect([first.seq, second.seq]).toEqual([1, 2]);
    expect(store.load().entries.map(entry => entry.text)).toEqual(['first', 'second']);
  });

  it('continues the sequence after a reload and ignores same-millisecond timestamps', () => {
    const store = makeStore();
    post(store, 'first', createdAt);
    const reloaded = new MessPersistence(projectId, { directory: store.logPath.replace(/\\[^\\]+$/, '') });
    const second = post(reloaded, 'second', createdAt);

    expect(second.seq).toBe(2);
    expect(reloaded.load().entries).toHaveLength(2);
  });

  it('prunes by age, compacts the log, and reports the new oldest sequence', () => {
    const store = makeStore();
    post(store, 'old', createdAt);
    post(store, 'new', createdAt + 2 * 24 * 60 * 60 * 1000);

    const result = store.prune(1, createdAt + 2 * 24 * 60 * 60 * 1000);

    expect(result).toMatchObject({ removed: 1, oldestSeq: 2 });
    expect(store.load().entries.map(entry => entry.text)).toEqual(['new']);
  });

  it('keeps sequence allocation and the retention floor after pruning the whole log', () => {
    const store = makeStore();
    post(store, 'expired');
    store.prune(1, createdAt + 2 * 24 * 60 * 60 * 1000);

    const next = post(store, 'after prune', createdAt + 2 * 24 * 60 * 60 * 1000);

    expect(next.seq).toBe(2);
    expect(store.load()).toMatchObject({ oldestSeq: 2, prunedThroughSeq: 1 });
  });

  it('recovers a completed compaction temp when the primary rename did not happen', () => {
    const store = makeStore();
    post(store, 'recover me');
    const original = readFileSync(store.logPath, 'utf8');
    renameSync(store.logPath, `${store.logPath}.backup`);
    writeFileSync(`${store.logPath}.compacting`, original, 'utf8');

    expect(store.load().entries.map(entry => entry.text)).toEqual(['recover me']);
    expect(readFileSync(store.logPath, 'utf8')).toBe(original);
  });

  it('keeps the primary and removes a stale compaction temp when both exist', () => {
    const store = makeStore();
    post(store, 'primary');
    writeFileSync(`${store.logPath}.compacting`, '{not-json\n', 'utf8');

    expect(store.load().entries.map(entry => entry.text)).toEqual(['primary']);
    expect(() => readFileSync(`${store.logPath}.compacting`, 'utf8')).toThrow();
  });

  it('reports a malformed final line while preserving earlier entries', () => {
    const store = makeStore();
    post(store, 'good');
    writeFileSync(store.logPath, `${readFileSync(store.logPath, 'utf8')}{"seq":`, 'utf8');

    const loaded = store.load();

    expect(loaded.entries).toHaveLength(1);
    expect(loaded.diagnostics[0]?.message).toContain('Malformed final');
  });

  it('reports a malformed middle line without silently hiding it', () => {
    const store = makeStore();
    const first = post(store, 'first');
    const second = post(store, 'second');
    const lines = readFileSync(store.logPath, 'utf8').trimEnd().split('\n');
    lines.splice(1, 0, '{not-json');
    writeFileSync(store.logPath, `${lines.join('\n')}\n`, 'utf8');

    const loaded = store.load();

    expect(loaded.entries.map(entry => entry.seq)).toEqual([first.seq, second.seq]);
    expect(loaded.diagnostics.some(diagnostic => diagnostic.line === 2)).toBe(true);
  });

  it('writes cursors separately and keeps the previous cursor if a replacement fails', () => {
    const directory = mkdtempSync(join(tmpdir(), 'helm-mess-cursor-'));
    tempDirs.push(directory);
    const store = new MessPersistence(projectId, { directory });
    store.saveCursor({ projectId, sessionId, lastSeq: 1, joinedAt: createdAt });
    const previous = readFileSync(getMessCursorPath(projectId, directory), 'utf8');
    const failing = new MessPersistence(projectId, {
      directory,
      atomicWrite: () => { throw new Error('simulated crash before rename'); },
    });

    expect(() => failing.saveCursor({ projectId, sessionId, lastSeq: 2, joinedAt: createdAt })).toThrow('simulated crash');
    expect(readFileSync(getMessCursorPath(projectId, directory), 'utf8')).toBe(previous);
    expect(getMessLogPath(projectId, directory)).toContain(`${projectId}.jsonl`);
  });

  it('refuses to replace a corrupt cursor envelope', () => {
    const store = makeStore();
    store.saveCursor({ projectId, sessionId, lastSeq: 1, joinedAt: createdAt });
    writeFileSync(store.cursorPath, '{not-json', 'utf8');

    expect(() => store.saveCursor({ projectId, sessionId: 'session-b', lastSeq: 2, joinedAt: createdAt })).toThrow('corrupt Mess metadata');
    expect(store.loadCursors().diagnostic).toBeDefined();
  });

  it('migrates cursor-only metadata from the pre-counter envelope', () => {
    const store = makeStore();
    post(store, 'existing');
    writeFileSync(store.cursorPath, JSON.stringify({
      version: 1,
      cursors: [{ projectId, sessionId, lastSeq: 1, joinedAt: createdAt }],
    }), 'utf8');

    const next = post(store, 'after migration');

    expect(next.seq).toBe(2);
    expect(store.getCursor(sessionId)).toMatchObject({ lastSeq: 1 });
    expect(JSON.parse(readFileSync(store.cursorPath, 'utf8'))).toMatchObject({ nextSeq: 3, prunedThroughSeq: 0 });
  });

  it('keeps the same UUID-owned files when the project display name changes', () => {
    const store = makeStore();
    post(store, 'still here');
    const project: ProjectRecord = {
      id: projectId,
      name: 'renamed',
      canonicalPath: 'C:/renamed',
      createdAt,
      updatedAt: createdAt + 1,
    };

    expect(new MessPersistence(project.id, { directory: store.logPath.replace(/\\[^\\]+$/, '') }).load().entries).toHaveLength(1);
  });

  it('resolves documented defaults and rejects nonsense overrides', () => {
    expect(getMessProjectSettings({})).toEqual({
      messRetentionDays: 30,
      messPokeCooldownMinutes: 15,
    });
    expect(getMessProjectSettings({ messRetentionDays: 2, messPokeCooldownMinutes: 1 })).toEqual({
      messRetentionDays: 2,
      messPokeCooldownMinutes: 1,
    });
    expect(getMessProjectSettings({ messRetentionDays: -5, messPokeCooldownMinutes: 0 })).toEqual({
      messRetentionDays: 30,
      messPokeCooldownMinutes: 15,
    });
  });
});
