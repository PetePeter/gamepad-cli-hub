/**
 * Plans store — per-directory plan item state for Vue components.
 *
 * Provides reactive access to plan "doing" and "startable" counts
 * per session and per directory. Wraps plan IPC calls.
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';

export const usePlansStore = defineStore('plans', () => {
  /** Count of "doing" plan items per session id — drives badge rendering. */
  const doingCounts = ref<Map<string, number>>(new Map());

  /** Count of "startable" plan items per session id. */
  const startableCounts = ref<Map<string, number>>(new Map());

  // ── Actions ──────────────────────────────────────────────────────────

  function setDoingCount(sessionId: string, count: number) {
    if (count > 0) {
      doingCounts.value.set(sessionId, count);
    } else {
      doingCounts.value.delete(sessionId);
    }
  }

  function setStartableCount(sessionId: string, count: number) {
    if (count > 0) {
      startableCounts.value.set(sessionId, count);
    } else {
      startableCounts.value.delete(sessionId);
    }
  }

  function getDoingCount(sessionId: string): number {
    return doingCounts.value.get(sessionId) ?? 0;
  }

  function getStartableCount(sessionId: string): number {
    return startableCounts.value.get(sessionId) ?? 0;
  }

  function clearCounts() {
    doingCounts.value.clear();
    startableCounts.value.clear();
  }

  return {
    doingCounts,
    startableCounts,
    setDoingCount,
    setStartableCount,
    getDoingCount,
    getStartableCount,
    clearCounts,
  };
});
