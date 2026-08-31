import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import type { MessEntry } from '../../src/types/mess.js';
import type { Session } from '../state.js';
import { messClient } from '../ipc/clients.js';
import { useAppStore } from '../stores/app.js';

export type MessFilterState = 'either' | 'yes' | 'no';

export interface MessFilters {
  senderId: string;
  broadcast: MessFilterState;
  unread: MessFilterState;
}

export function resolveMessLabel(sessionId: string | undefined, snapshot: string | undefined, sessions: readonly Session[]): string {
  if (!sessionId) return 'all';
  return sessions.find(session => session.id === sessionId)?.name ?? snapshot ?? sessionId;
}

export function isMessTargetUnread(entry: MessEntry, sessions: readonly Session[], activityLevels: ReadonlyMap<string, string>): boolean {
  if (!entry.toSessionId) return false;
  const target = sessions.find(session => session.id === entry.toSessionId);
  if (!target) return true;
  const activity = activityLevels.get(target.id) ?? target.state;
  return activity !== 'idle' || target.aiagentState === 'planning' || target.aiagentState === 'implementing';
}

function matchesFilter(value: boolean, filter: MessFilterState): boolean {
  return filter === 'either' || value === (filter === 'yes');
}

export function filterMessEntries(
  entries: readonly MessEntry[],
  filters: MessFilters,
  sessions: readonly Session[],
  activityLevels: ReadonlyMap<string, string>,
): MessEntry[] {
  return entries.filter(entry => {
    const senderMatches = !filters.senderId || entry.fromSessionId === filters.senderId;
    return senderMatches
      && matchesFilter(!entry.toSessionId, filters.broadcast)
      && matchesFilter(isMessTargetUnread(entry, sessions, activityLevels), filters.unread);
  });
}

export function useMessPane() {
  const appStore = useAppStore();
  const entries = ref<MessEntry[]>([]);
  const loading = ref(false);
  const historyHours = ref(24);
  const scroller = ref<HTMLElement | null>(null);
  const filters = reactive<MessFilters>({ senderId: '', broadcast: 'either', unread: 'either' });
  let loadGeneration = 0;
  let stopAppend: (() => void) | undefined;

  const projectId = computed(() => {
    const id = appStore.activeSession?.projectId;
    return id && appStore.state.projects.some(project => project.id === id) ? id : null;
  });
  const projectName = computed(() => {
    const id = projectId.value;
    return id ? appStore.state.projects.find(project => project.id === id)?.name ?? id : null;
  });
  const senderOptions = computed(() => {
    const seen = new Set<string>();
    return entries.value
      .map(entry => ({ id: entry.fromSessionId, label: resolveMessLabel(entry.fromSessionId, entry.fromLabelSnapshot, appStore.state.sessions) }))
      .filter(option => !seen.has(option.id) && seen.add(option.id));
  });
  const visibleEntries = computed(() => filterMessEntries(
    entries.value,
    filters,
    appStore.state.sessions,
    appStore.state.sessionActivityLevels,
  ));
  const hasMore = ref(false);

  function atBottom(): boolean {
    const element = scroller.value;
    return !element || element.scrollHeight - element.scrollTop - element.clientHeight < 24;
  }

  async function scrollToBottomIfNeeded(shouldScroll: boolean): Promise<void> {
    if (!shouldScroll) return;
    await nextTick();
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
  }

  async function loadHistory(nextProjectId: string | null, preserveBottom = true): Promise<void> {
    const generation = ++loadGeneration;
    const shouldScroll = atBottom() || preserveBottom;
    if (!nextProjectId) {
      entries.value = [];
      hasMore.value = false;
      return;
    }
    loading.value = true;
    try {
      const result = await messClient.messHistory(nextProjectId, { sinceHours: historyHours.value });
      if (generation !== loadGeneration || projectId.value !== nextProjectId) return;
      entries.value = result.entries;
      hasMore.value = result.hasMore;
      await scrollToBottomIfNeeded(shouldScroll);
    } catch (error) {
      if (generation === loadGeneration) {
        entries.value = [];
        hasMore.value = false;
        console.error('[MessPane] Failed to load history:', error);
      }
    } finally {
      if (generation === loadGeneration) loading.value = false;
    }
  }

  async function loadOlder(): Promise<void> {
    const id = projectId.value;
    if (!id || !hasMore.value) return;
    historyHours.value = Math.min(historyHours.value + 24, 24 * 30);
    await loadHistory(id, false);
  }

  function onAppended(event: { projectId: string; entry: MessEntry }): void {
    if (event.projectId !== projectId.value || entries.value.some(entry => entry.id === event.entry.id)) return;
    const shouldScroll = atBottom();
    entries.value = [...entries.value, event.entry].sort((a, b) => a.seq - b.seq);
    void scrollToBottomIfNeeded(shouldScroll);
  }

  watch(projectId, (id, previousId) => {
    if (id === previousId) return;
    historyHours.value = 24;
    void loadHistory(id);
  }, { immediate: true });

  onMounted(() => {
    stopAppend = messClient.onMessAppended(onAppended);
  });
  onUnmounted(() => {
    stopAppend?.();
    stopAppend = undefined;
    loadGeneration += 1;
  });

  return {
    appState: appStore.state,
    entries,
    filters,
    hasMore,
    loading,
    loadOlder,
    projectId,
    projectName,
    resolveLabel: (sessionId: string | undefined, snapshot: string | undefined) =>
      resolveMessLabel(sessionId, snapshot, appStore.state.sessions),
    isTargetUnread: (entry: MessEntry) => isMessTargetUnread(entry, appStore.state.sessions, appStore.state.sessionActivityLevels),
    scroller,
    senderOptions,
    visibleEntries,
  };
}
