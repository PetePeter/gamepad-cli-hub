/**
 * Recycle-bin IPC handler tests — artifact lifecycle across Forget / Empty /
 * Restore. Real RecycleBinManager + real ArtifactManager (no mocks for the
 * managers); Electron and the bin's disk persistence are faked.
 *
 * Contract under test:
 *   - a recoverable session's artifacts are preserved while it sits in the bin,
 *   - Forget clears exactly that entry's artifacts,
 *   - Empty clears every binned entry's artifacts,
 *   - Restore does NOT clear (the session comes back with its artifacts).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RecycleBinEntry } from '../src/types/recycle-bin.js';

const handleCalls = new Map<string, Function>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => { handleCalls.set(channel, handler); }),
    removeHandler: vi.fn((channel: string) => { handleCalls.delete(channel); }),
  },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

let diskStore: RecycleBinEntry[] = [];
vi.mock('../src/session/recycle-bin-persistence.js', () => ({
  RECYCLE_BIN_WINDOW_MS: 30 * 24 * 60 * 60 * 1000,
  saveRecycleBin: (entries: RecycleBinEntry[]) => { diskStore = [...entries]; },
  loadRecycleBin: () => [...diskStore],
}));

vi.mock('../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { RecycleBinManager } = await import('../src/session/recycle-bin-manager.js');
const { ArtifactManager } = await import('../src/session/artifact-manager.js');
const { setupRecycleBinHandlers } = await import('../src/electron/ipc/recycle-bin-handlers.js');

function getHandler(channel: string): Function {
  const handler = handleCalls.get(channel);
  if (!handler) throw new Error(`No handler for "${channel}"`);
  return handler;
}

describe('recycle-bin handlers — artifact lifecycle', () => {
  let bin: InstanceType<typeof RecycleBinManager>;
  let artifacts: InstanceType<typeof ArtifactManager>;

  beforeEach(() => {
    diskStore = [];
    handleCalls.clear();
    bin = new RecycleBinManager();
    artifacts = new ArtifactManager();
    setupRecycleBinHandlers(bin, artifacts);
  });

  function binSession(sessionId: string): RecycleBinEntry {
    return bin.append({
      sessionId,
      name: 'claude',
      cliType: 'claude-code',
      workingDir: 'X:\\work',
      cliSessionName: 'uuid-' + sessionId,
      closedAt: Date.now(),
    });
  }

  it('Forget clears exactly that entry\'s artifacts, leaving others', async () => {
    artifacts.create('s1', 'A', 'markdown', 'body');
    artifacts.create('s2', 'B', 'markdown', 'body');
    const e1 = binSession('s1');
    binSession('s2');

    await getHandler('recycleBin:forget')(null, e1.id);

    expect(artifacts.count('s1')).toBe(0);
    expect(artifacts.count('s2')).toBe(1);
  });

  it('Empty clears every binned entry\'s artifacts', async () => {
    artifacts.create('s1', 'A', 'markdown', 'body');
    artifacts.create('s2', 'B', 'markdown', 'body');
    binSession('s1');
    binSession('s2');

    await getHandler('recycleBin:empty')(null);

    expect(artifacts.count('s1')).toBe(0);
    expect(artifacts.count('s2')).toBe(0);
  });

  it('Restore does NOT clear artifacts (session returns with them)', async () => {
    artifacts.create('s1', 'A', 'markdown', 'v1');
    const e1 = binSession('s1');

    const restored = await getHandler('recycleBin:restore')(null, e1.id);

    expect(restored?.sessionId).toBe('s1');   // original id preserved for reuse
    expect(artifacts.count('s1')).toBe(1);    // artifacts intact
    expect(bin.count()).toBe(0);              // entry removed from bin
  });
});
