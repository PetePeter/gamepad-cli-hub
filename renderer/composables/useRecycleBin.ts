/**
 * useRecycleBin — reactive state for the closed-session recycle bin.
 *
 * Owns the badge count + modal visibility and keeps the count live via the
 * recycle-bin:changed event. Restore reuses the normal spawn-with-resume flow
 * (doSpawn → pty:spawn with resumeSessionName), so recovering a session is
 * identical to how startup resume works.
 */
import { ref } from 'vue';
import { recycleBinClient, runtimeGroupClient, eventsClient, sessionsClient } from '../ipc/clients.js';
import { doSpawn } from '../screens/sessions-spawn.js';
import { getTerminalManager } from '../runtime/terminal-provider.js';
import type { RecycleBinEntry } from '../../src/types/recycle-bin.js';

const entries = ref<RecycleBinEntry[]>([]);
const count = ref(0);
const modalVisible = ref(false);
let subscribed = false;

async function refresh(): Promise<void> {
  try {
    const list = await recycleBinClient.recycleBinList();
    entries.value = list ?? [];
    count.value = entries.value.length;
  } catch {
    entries.value = [];
    count.value = 0;
  }
}

/** Subscribe once to keep the badge count live. Safe to call repeatedly. */
function ensureSubscribed(): void {
  if (subscribed) return;
  subscribed = true;
  eventsClient.onRecycleBinChanged?.(() => { void refresh(); });
  void refresh();
}

// Ids currently mid-restore, so a rapid double-click can't spawn the same session twice.
const restoring = new Set<string>();

async function restore(id: string): Promise<void> {
  if (restoring.has(id)) return;
  restoring.add(id);
  try {
    // PEEK the entry — it stays in the bin until the re-spawn actually succeeds, so a
    // failed restore is retryable and never orphans the preserved artifacts.
    const entry = await recycleBinClient.recycleBinRestore(id);
    if (!entry) return;
    // Reuse the ORIGINAL session id (freed on close), exactly as startup auto-resume
    // does. Keeping the same id means anything keyed by it — notably the session's
    // artifacts, preserved in the bin — comes back attached with no re-keying.
    const spawnedId = await doSpawn(entry.cliType, entry.workingDir, undefined, entry.cliSessionName, entry.sessionId);
    if (!spawnedId) return; // spawn failed → leave the entry in the bin for a retry

    // Commit: remove the bin entry now that the session is back (artifacts stay put).
    await recycleBinClient.recycleBinCommitRestore(id);
    // A restored session keeps the name it was closed under — pty:spawn names new
    // sessions after their cliType, so without this the user's name is lost. Same
    // shape as startup auto-resume (useAppBootstrap). Never fatal: the session is
    // already back, so a failed rename must not skip the group re-attach below.
    await restoreName(spawnedId, entry);
    // Re-attach to the original runtime group (recreated by id/name if it's gone).
    if (entry.runtimeGroupId) {
      await runtimeGroupClient.runtimeGroupReattach(
        { runtimeGroupId: entry.runtimeGroupId, runtimeGroupName: entry.runtimeGroupName },
        spawnedId,
      );
    }
    await refresh();
  } finally {
    restoring.delete(id);
  }
}

/** Re-apply the closed session's display name. No-op when it was never renamed. */
async function restoreName(sessionId: string, entry: RecycleBinEntry): Promise<void> {
  const name = entry.name?.trim();
  if (!name || name === entry.cliType) return;
  try {
    await sessionsClient.sessionRename?.(sessionId, name);
    getTerminalManager()?.renameSession(sessionId, name);
  } catch (err) {
    console.error('[RecycleBin] Failed to restore session name:', err);
  }
}

async function forget(id: string): Promise<void> {
  await recycleBinClient.recycleBinForget(id);
  await refresh();
}

async function empty(): Promise<void> {
  await recycleBinClient.recycleBinEmpty();
  await refresh();
}

export function useRecycleBin() {
  return { entries, count, modalVisible, ensureSubscribed, refresh, restore, forget, empty };
}
