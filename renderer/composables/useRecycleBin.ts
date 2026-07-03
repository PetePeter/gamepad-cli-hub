/**
 * useRecycleBin — reactive state for the closed-session recycle bin.
 *
 * Owns the badge count + modal visibility and keeps the count live via the
 * recycle-bin:changed event. Restore reuses the normal spawn-with-resume flow
 * (doSpawn → pty:spawn with resumeSessionName), so recovering a session is
 * identical to how startup resume works.
 */
import { ref } from 'vue';
import { recycleBinClient, eventsClient } from '../ipc/clients.js';
import { doSpawn } from '../screens/sessions-spawn.js';
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

async function restore(id: string): Promise<void> {
  const entry = await recycleBinClient.recycleBinRestore(id);
  if (!entry) return;
  // Reuse the standard resume path: new session id, resume the CLI-internal UUID.
  await doSpawn(entry.cliType, entry.workingDir, undefined, entry.cliSessionName);
  await refresh();
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
