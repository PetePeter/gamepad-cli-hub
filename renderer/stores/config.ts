/**
 * Config store — caches for CLI bindings and tools.
 *
 * Legacy code reads from `state.cliBindingsCache` / `state.cliToolsCache` (via the reactive state).
 * Vue components use `useConfigStore()` for typed access + reload actions.
 */

import { defineStore } from 'pinia';
import { computed } from 'vue';
import { state } from '../state.js';
import { resolveCliTypeRecord } from '../utils.js';

export const useConfigStore = defineStore('config', () => {
  // ── Getters ──────────────────────────────────────────────────────────
  const cliTypes = computed(() => state.cliTypes);

  const availableSpawnTypes = computed(() => state.availableSpawnTypes);

  // ── Actions ──────────────────────────────────────────────────────────

  /** Get bindings for a specific CLI type. */
  function getBindings(cliType: string): Record<string, any> {
    return state.cliBindingsCache[cliType] ?? {};
  }

/** Get tool config for a specific CLI type. */
  function getToolConfig(cliType: string): { pasteMode?: 'pty' | 'ptyindividual' | 'sendkeys' | 'sendkeysindividual' | 'clippaste'; [k: string]: any } {
    // Route through the resolver so a legacy slug or a display name finds the
    // uuid-keyed record, exactly as the main-process choke point does.
    return resolveCliTypeRecord(cliType) ?? {};
  }

  /** Update the full bindings cache (called by initConfigCache). */
  function setBindingsCache(cache: Record<string, Record<string, any>>) {
    state.cliBindingsCache = cache;
  }

function setToolsCache(cache: Record<string, { pasteMode?: 'pty' | 'ptyindividual' | 'sendkeys' | 'sendkeysindividual' | 'clippaste'; [k: string]: any }>) {
    state.cliToolsCache = cache;
  }

  function setCliTypes(types: string[]) {
    state.cliTypes = types;
  }

  function setAvailableSpawnTypes(types: string[]) {
    state.availableSpawnTypes = types;
  }

  return {
    cliTypes,
    availableSpawnTypes,
    getBindings,
    getToolConfig,
    setBindingsCache,
    setToolsCache,
    setCliTypes,
    setAvailableSpawnTypes,
  };
});
