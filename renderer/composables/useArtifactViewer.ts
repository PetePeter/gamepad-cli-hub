/**
 * useArtifactViewer — module-singleton reactive state for the Artifact panel.
 *
 * Mirrors the useRecycleBin / useRuntimeGroups pattern: refs live at module
 * scope, the use*() accessor returns them, and we subscribe to the artifact
 * IPC events exactly once.
 *
 * Session-awareness: the host component owns "which session is active" and
 * tells this composable via setActiveSession()/refresh(). The change/reveal
 * events carry a sessionId, so we only react when it matches the session the
 * panel is currently bound to. This keeps a single shared panel correct as the
 * user switches sessions, and lets a snap-out window bind to its own session.
 */
import { ref, computed } from 'vue';
import { artifactsClient, eventsClient } from '../ipc/clients.js';
import type { Artifact } from '../../src/types/artifact.js';

const PANEL_VISIBLE_KEY = 'helm:artifact-panel-visible';
const RAIL_COLLAPSED_KEY = 'helm:artifact-rail-collapsed';

const artifacts = ref<Artifact[]>([]);
const selectedId = ref<string | null>(null);
/** null = follow the latest version; otherwise a pinned 1-based version number. */
const selectedVersion = ref<number | null>(null);
const panelVisible = ref<boolean>(loadBool(PANEL_VISIBLE_KEY, false));
const railCollapsed = ref<boolean>(loadBool(RAIL_COLLAPSED_KEY, false));
const unread = ref<Set<string>>(new Set());

/** The session the panel is currently bound to (host-driven). */
let activeSessionId: string | null = null;
let subscribed = false;

function loadBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function persistBool(key: string, value: boolean): void {
  try { localStorage.setItem(key, value ? '1' : '0'); } catch { /* ignore */ }
}

/** The currently-selected artifact, or null. */
const selected = computed<Artifact | null>(() =>
  artifacts.value.find(a => a.id === selectedId.value) ?? null,
);

/** Count of unread artifacts for the badge/pulse. */
const unreadCount = computed(() => unread.value.size);

/**
 * Reload the artifact list for a session and keep the selection stable.
 * Auto-selects the newest artifact when nothing valid is selected.
 */
async function refresh(sessionId: string | null = activeSessionId): Promise<void> {
  activeSessionId = sessionId;
  if (!sessionId) {
    artifacts.value = [];
    selectedId.value = null;
    return;
  }
  let list: Artifact[] = [];
  try {
    list = (await artifactsClient.artifactList(sessionId)) ?? [];
  } catch {
    list = [];
  }
  artifacts.value = list;

  // Drop unread markers + stale selection for artifacts that no longer exist.
  const live = new Set(list.map(a => a.id));
  pruneUnread(live);
  if (selectedId.value && !live.has(selectedId.value)) selectedId.value = null;

  // Auto-select the newest (list is newest-updated first) when nothing is selected.
  if (!selectedId.value && list.length > 0) {
    selectedId.value = list[0].id;
    selectedVersion.value = null;
    unread.value.delete(list[0].id);
  }
}

function pruneUnread(liveIds: Set<string>): void {
  let changed = false;
  for (const id of unread.value) {
    if (!liveIds.has(id)) { unread.value.delete(id); changed = true; }
  }
  if (changed) unread.value = new Set(unread.value);
}

/** Point the panel at a session; clears selection state and reloads. */
async function setActiveSession(sessionId: string | null): Promise<void> {
  if (sessionId === activeSessionId) return;
  activeSessionId = sessionId;
  selectedId.value = null;
  selectedVersion.value = null;
  unread.value = new Set();
  await refresh(sessionId);
}

/** Select an artifact; resets to the latest version and clears its unread dot. */
function select(id: string): void {
  selectedId.value = id;
  selectedVersion.value = null;
  if (unread.value.delete(id)) unread.value = new Set(unread.value);
}

/** Pin a specific version (1-based) in the detail pane. */
function setVersion(n: number | null): void {
  selectedVersion.value = n;
}

/** Return to following the latest version. */
function jumpToLatest(): void {
  selectedVersion.value = null;
}

function togglePanel(): void {
  panelVisible.value = !panelVisible.value;
  persistBool(PANEL_VISIBLE_KEY, panelVisible.value);
}

function showPanel(): void {
  panelVisible.value = true;
  persistBool(PANEL_VISIBLE_KEY, true);
}

function hidePanel(): void {
  panelVisible.value = false;
  persistBool(PANEL_VISIBLE_KEY, false);
}

function toggleRail(): void {
  railCollapsed.value = !railCollapsed.value;
  persistBool(RAIL_COLLAPSED_KEY, railCollapsed.value);
}

/** Delete a single artifact, then reload. */
async function remove(id: string): Promise<void> {
  try { await artifactsClient.artifactDelete(id); } catch { /* ignore */ }
  if (selectedId.value === id) selectedId.value = null;
  if (unread.value.delete(id)) unread.value = new Set(unread.value);
  await refresh();
}

/** Delete every artifact in a session, then reload. */
async function clearAll(sessionId: string | null = activeSessionId): Promise<void> {
  if (!sessionId) return;
  try { await artifactsClient.artifactDeleteAll(sessionId); } catch { /* ignore */ }
  selectedId.value = null;
  unread.value = new Set();
  await refresh(sessionId);
}

/** Export an artifact via the native save dialog; returns the path or null. */
async function exportArtifact(id: string): Promise<string | null> {
  try { return await artifactsClient.artifactExport(id); } catch { return null; }
}

/**
 * Subscribe once to artifact IPC events. Safe to call repeatedly.
 *
 * - onArtifactChanged: reload only when it targets the bound session.
 * - onArtifactReveal:  focus that artifact, show the panel, and mark it unread
 *   (green dot). The dot stays until the user explicitly selects/interacts with
 *   it. Other artifacts' unread state is preserved.
 */
function ensureSubscribed(): void {
  if (subscribed) return;
  subscribed = true;

  eventsClient.onArtifactChanged?.(({ sessionId }) => {
    if (sessionId === activeSessionId) void refresh(sessionId);
  });

  eventsClient.onArtifactReveal?.(async ({ sessionId, artifactId }) => {
    if (sessionId !== activeSessionId) return;
    await refresh(sessionId);
    // Mark only the revealed artifact as unread (it has new/updated content).
    // Preserve existing unread state for all other artifacts.
    const next = new Set(unread.value);
    next.add(artifactId);
    unread.value = next;
    selectedId.value = artifactId;
    selectedVersion.value = null;
    showPanel();
  });
}

export function useArtifactViewer() {
  return {
    // state
    artifacts,
    selectedId,
    selected,
    selectedVersion,
    panelVisible,
    railCollapsed,
    unread,
    unreadCount,
    // lifecycle
    ensureSubscribed,
    setActiveSession,
    refresh,
    // selection / version
    select,
    setVersion,
    jumpToLatest,
    // panel / rail
    togglePanel,
    showPanel,
    hidePanel,
    toggleRail,
    // mutations
    remove,
    clearAll,
    export: exportArtifact,
  };
}
