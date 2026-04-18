/**
 * Drafts store — per-session draft prompt management.
 *
 * Wraps the IPC calls for draft CRUD and provides reactive state
 * for Vue components (badge counts, active draft, editor visibility).
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useDraftsStore = defineStore('drafts', () => {
  /** Draft count per session id — drives badge rendering. */
  const draftCounts = ref<Map<string, number>>(new Map());

  /** Whether the draft editor panel is currently visible. */
  const editorVisible = ref(false);

  /** Session id of the draft currently being edited. */
  const editingSessionId = ref<string | null>(null);

  // ── Actions ──────────────────────────────────────────────────────────

  function setDraftCount(sessionId: string, count: number) {
    if (count > 0) {
      draftCounts.value.set(sessionId, count);
    } else {
      draftCounts.value.delete(sessionId);
    }
  }

  function clearCounts() {
    draftCounts.value.clear();
  }

  function getDraftCount(sessionId: string): number {
    return draftCounts.value.get(sessionId) ?? 0;
  }

  function openEditor(sessionId: string) {
    editingSessionId.value = sessionId;
    editorVisible.value = true;
  }

  function closeEditor() {
    editingSessionId.value = null;
    editorVisible.value = false;
  }

  return {
    draftCounts,
    editorVisible,
    editingSessionId,
    setDraftCount,
    clearCounts,
    getDraftCount,
    openEditor,
    closeEditor,
  };
});
