import { computed, reactive } from 'vue';
import { useAppStore } from '../stores/app.js';
import { dialogClient, eventsClient, incomingClient, memoryClient } from '../ipc/clients.js';
import type {
  MemoryForest,
  MemoryRecord,
  MemorySearchResult,
  MemorySummary,
  MemoryTraversal,
} from '../../src/types/memory.js';

export const memoryScreenState = reactive({
  /**
   * Internal index only — never rendered as a list. The canvas is the visible
   * surface; this exists so search and callers can resolve an id whose node is
   * filtered out or off-screen.
   */
  summaries: [] as MemorySummary[],
  forest: null as MemoryForest | null,
  matchedIds: [] as string[],
  detail: null as MemoryRecord | null,
  searchResults: [] as MemoryTraversal[],
  searchQuery: '',
  regex: false,
  graphDepth: 1,
  selectedId: null as string | null,
  detailVisible: false,
  deleteTargetId: null as string | null,
  loading: false,
  notice: '',
});

let requestGeneration = 0;
let stopMemoryChanged: (() => void) | undefined;

function activeSessionId(): string | null {
  return useAppStore().state.activeSessionId ?? null;
}

function requestIsCurrent(generation: number, sessionId: string | null): boolean {
  return generation === requestGeneration && sessionId === activeSessionId();
}

function setNotice(message: string): void {
  memoryScreenState.notice = message;
  window.setTimeout(() => {
    if (memoryScreenState.notice === message) memoryScreenState.notice = '';
  }, 3500);
}

export async function refreshMemories(): Promise<void> {
  const generation = ++requestGeneration;
  const sessionId = activeSessionId();
  if (!sessionId) {
    memoryScreenState.summaries = [];
    memoryScreenState.forest = null;
    memoryScreenState.matchedIds = [];
    memoryScreenState.searchResults = [];
    memoryScreenState.selectedId = null;
    memoryScreenState.detail = null;
    memoryScreenState.detailVisible = false;
    memoryScreenState.loading = false;
    return;
  }
  memoryScreenState.loading = true;
  try {
    const [summaries, forest] = await Promise.all([
      memoryClient.memoryList(),
      memoryClient.memoryGraphAll(),
    ]);
    if (!requestIsCurrent(generation, sessionId)) return;
    memoryScreenState.summaries = [...summaries].sort((a, b) => a.id.localeCompare(b.id));
    memoryScreenState.forest = forest;
    const selectedStillExists = memoryScreenState.selectedId
      && memoryScreenState.summaries.some((item) => item.id === memoryScreenState.selectedId);
    if (selectedStillExists) await selectMemory(memoryScreenState.selectedId!, generation, sessionId);
    else {
      memoryScreenState.selectedId = null;
      memoryScreenState.detail = null;
        memoryScreenState.detailVisible = false;
    }
  } catch (error) {
    if (requestIsCurrent(generation, sessionId)) setNotice(`Could not load memories: ${String(error)}`);
  } finally {
    if (requestIsCurrent(generation, sessionId)) memoryScreenState.loading = false;
  }
}

export async function selectMemory(
  id: string,
  parentGeneration = ++requestGeneration,
  sessionId = activeSessionId(),
): Promise<void> {
  memoryScreenState.selectedId = id;
  memoryScreenState.loading = true;
  try {
    const detail = await memoryClient.memoryGet(id);
    if (!requestIsCurrent(parentGeneration, sessionId)) return;
    memoryScreenState.detail = detail;
  } catch (error) {
    if (requestIsCurrent(parentGeneration, sessionId)) setNotice(`Could not open memory: ${String(error)}`);
  } finally {
    if (requestIsCurrent(parentGeneration, sessionId)) memoryScreenState.loading = false;
  }
}

export async function searchMemories(): Promise<void> {
  const generation = ++requestGeneration;
  const sessionId = activeSessionId();
  memoryScreenState.loading = true;
  try {
    const result = await memoryClient.memorySearch(memoryScreenState.searchQuery, {
      regex: memoryScreenState.regex,
      graphDepth: memoryScreenState.graphDepth,
    }) as MemorySearchResult;
    if (!requestIsCurrent(generation, sessionId)) return;
    memoryScreenState.searchResults = result.results;
    memoryScreenState.matchedIds = result.results.map((traversal) => traversal.rootId);
  } catch (error) {
    if (requestIsCurrent(generation, sessionId)) setNotice(`Search failed: ${String(error)}`);
  } finally {
    if (requestIsCurrent(generation, sessionId)) memoryScreenState.loading = false;
  }
}

/**
 * Depth used when exporting and when expanding search results. The canvas no
 * longer depends on it — it draws the whole forest — so changing it must not
 * re-fetch the selection.
 */
export function setGraphDepth(value: number): void {
  memoryScreenState.graphDepth = Number.isSafeInteger(value) ? Math.min(100, Math.max(0, value)) : 0;
}

export function openDetail(): void {
  if (memoryScreenState.detail) memoryScreenState.detailVisible = true;
}

export function requestDelete(id = memoryScreenState.selectedId): void {
  memoryScreenState.deleteTargetId = id;
}

export async function confirmDelete(): Promise<void> {
  const id = memoryScreenState.deleteTargetId;
  memoryScreenState.deleteTargetId = null;
  if (!id) return;
  const generation = ++requestGeneration;
  const sessionId = activeSessionId();
  try {
    const deleted = await memoryClient.memoryDelete(id);
    if (!requestIsCurrent(generation, sessionId)) return;
    if (deleted) {
      memoryScreenState.detailVisible = false;
      setNotice('Memory deleted');
      await refreshMemories();
    }
  } catch (error) {
    if (requestIsCurrent(generation, sessionId)) setNotice(`Delete failed: ${String(error)}`);
  }
}

export async function openAttachment(attachmentId: string): Promise<void> {
  if (!memoryScreenState.selectedId) return;
  const result = await memoryClient.memoryAttachmentOpen(memoryScreenState.selectedId, attachmentId);
  if (!result.success) setNotice(result.error ?? 'Could not open attachment');
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  if (!memoryScreenState.selectedId) return;
  try {
    const deleted = await memoryClient.memoryAttachmentDelete(memoryScreenState.selectedId, attachmentId);
    if (deleted) await selectMemory(memoryScreenState.selectedId);
  } catch (error) {
    setNotice(`Attachment delete failed: ${String(error)}`);
  }
}

export async function exportMemories(format: 'markdown' | 'json', rootId?: string | null): Promise<void> {
  const generation = ++requestGeneration;
  const sessionId = activeSessionId();
  try {
    const exportRoot = rootId === undefined ? memoryScreenState.selectedId ?? undefined : rootId ?? undefined;
    const result = await memoryClient.memoryExport(format, exportRoot, memoryScreenState.graphDepth);
    if (!requestIsCurrent(generation, sessionId)) return;
    const extension = format === 'markdown' ? 'md' : 'json';
    const savePath = await dialogClient.dialogShowSaveFile(`memories.${extension}`, [{ name: format === 'markdown' ? 'Markdown' : 'JSON', extensions: [extension] }]);
    if (!savePath || !requestIsCurrent(generation, sessionId)) return;
    const ok = await incomingClient.planWriteFile(savePath, result.content);
    if (ok) setNotice('Memories exported');
    else setNotice('Could not write export file');
  } catch (error) {
    if (requestIsCurrent(generation, sessionId)) setNotice(`Export failed: ${String(error)}`);
  }
}

export function ensureMemoryChangedSubscription(): void {
  if (stopMemoryChanged) return;
  stopMemoryChanged = eventsClient.onMemoryChanged((event) => {
    if (event.sessionId && event.sessionId !== activeSessionId()) return;
    void refreshMemories();
  });
}

export function disposeMemoryChangedSubscription(): void {
  stopMemoryChanged?.();
  stopMemoryChanged = undefined;
}

export const memoryHasResults = computed(() => memoryScreenState.summaries.length > 0);
