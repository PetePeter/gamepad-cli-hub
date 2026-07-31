// @vitest-environment jsdom

/**
 * Recycle-bin restore must bring the session back under the name it had when it
 * was closed — the bin entry carries `name`, and dropping it on the way back
 * leaves the session labelled after its cliType (pty:spawn's default).
 *
 * doSpawn and the terminal manager are faked at their module boundaries; the IPC
 * clients are proxies over `window.helm`, so those are real objects here.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecycleBinEntry } from '../src/types/recycle-bin.js';

const mockDoSpawn = vi.fn();
const mockRenameTerminal = vi.fn();

vi.mock('../renderer/screens/sessions-spawn.js', () => ({
  doSpawn: (...args: unknown[]) => mockDoSpawn(...args),
}));

vi.mock('../renderer/runtime/terminal-provider.js', () => ({
  getTerminalManager: () => ({ renameSession: mockRenameTerminal }),
}));

function makeEntry(overrides: Partial<RecycleBinEntry> = {}): RecycleBinEntry {
  return {
    id: 'bin-1',
    sessionId: 'sess-1',
    name: 'My Session',
    cliType: 'claude-code',
    workingDir: 'X:/work',
    cliSessionName: 'uuid-abc',
    closedAt: 1700000000000,
    ...overrides,
  };
}

/** Records call order across the fakes so ordering assertions are possible. */
let callOrder: string[] = [];
let sessionRename: ReturnType<typeof vi.fn>;
let runtimeGroupReattach: ReturnType<typeof vi.fn>;
let recycleBinCommitRestore: ReturnType<typeof vi.fn>;

function installWindow(entry: RecycleBinEntry | null): void {
  sessionRename = vi.fn(async () => { callOrder.push('rename'); return { success: true }; });
  runtimeGroupReattach = vi.fn(async () => { callOrder.push('reattach'); });
  recycleBinCommitRestore = vi.fn(async () => { callOrder.push('commit'); return true; });

  (globalThis as typeof globalThis & { window: any }).window = {
    helm: {
      recycleBin: {
        recycleBinList: vi.fn(async () => []),
        recycleBinRestore: vi.fn(async () => entry),
        recycleBinCommitRestore,
        recycleBinForget: vi.fn(async () => true),
        recycleBinEmpty: vi.fn(async () => true),
      },
      runtimeGroups: { runtimeGroupReattach },
      sessions: { sessionRename },
      events: { onRecycleBinChanged: vi.fn() },
    },
  };
}

async function loadRestore() {
  const mod = await import('../renderer/composables/useRecycleBin.js');
  return mod.useRecycleBin().restore;
}

describe('recycle-bin restore — original name', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    callOrder = [];
    mockDoSpawn.mockResolvedValue('sess-1');
  });

  it('R1 restores the name the session had when it was closed', async () => {
    installWindow(makeEntry());
    const restore = await loadRestore();

    await restore('bin-1');

    expect(sessionRename).toHaveBeenCalledWith('sess-1', 'My Session');
    expect(mockRenameTerminal).toHaveBeenCalledWith('sess-1', 'My Session');
  });

  it('R2 skips the rename when the stored name is just the cliType', async () => {
    installWindow(makeEntry({ name: 'claude-code' }));
    const restore = await loadRestore();

    await restore('bin-1');

    expect(sessionRename).not.toHaveBeenCalled();
    expect(mockRenameTerminal).not.toHaveBeenCalled();
  });

  it('R3 skips the rename when the stored name is blank', async () => {
    installWindow(makeEntry({ name: '   ' }));
    const restore = await loadRestore();

    await restore('bin-1');

    expect(sessionRename).not.toHaveBeenCalled();
  });

  it('R4 does not rename when the re-spawn fails', async () => {
    installWindow(makeEntry());
    mockDoSpawn.mockResolvedValue(null);
    const restore = await loadRestore();

    await restore('bin-1');

    expect(sessionRename).not.toHaveBeenCalled();
    expect(recycleBinCommitRestore).not.toHaveBeenCalled();
  });

  it('R5 renames before re-attaching the runtime group', async () => {
    installWindow(makeEntry({ runtimeGroupId: 'grp-1', runtimeGroupName: 'Group One' }));
    const restore = await loadRestore();

    await restore('bin-1');

    expect(callOrder).toContain('rename');
    expect(callOrder.indexOf('rename')).toBeLessThan(callOrder.indexOf('reattach'));
  });

  it('R6 a failed rename does not abort the rest of the restore', async () => {
    installWindow(makeEntry({ runtimeGroupId: 'grp-1', runtimeGroupName: 'Group One' }));
    sessionRename.mockRejectedValue(new Error('rename exploded'));
    const restore = await loadRestore();

    await restore('bin-1');

    expect(recycleBinCommitRestore).toHaveBeenCalledWith('bin-1');
    expect(runtimeGroupReattach).toHaveBeenCalled();

    // The in-flight guard must be released, so a second restore still runs.
    await restore('bin-1');
    expect(mockDoSpawn).toHaveBeenCalledTimes(2);
  });
});
