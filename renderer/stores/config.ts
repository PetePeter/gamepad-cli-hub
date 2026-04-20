/**
 * Config store — caches for CLI bindings, sequences, tools, and profiles.
 *
 * Legacy code reads from `state.cliBindingsCache` etc. (via the reactive state).
 * Vue components use `useConfigStore()` for typed access + reload actions.
 */

import { defineStore } from 'pinia';
import { computed } from 'vue';
import { state } from '../state.js';

export const useConfigStore = defineStore('config', () => {
  // ── Getters ──────────────────────────────────────────────────────────
  const cliTypes = computed(() => state.cliTypes);

  const availableSpawnTypes = computed(() => state.availableSpawnTypes);

  const activeProfile = computed(() => state.activeProfile);

  // ── Actions ──────────────────────────────────────────────────────────

  /** Get bindings for a specific CLI type. */
  function getBindings(cliType: string): Record<string, any> {
    return state.cliBindingsCache[cliType] ?? {};
  }

  /** Get sequence lists for a specific CLI type. */
  function getSequences(cliType: string): Record<string, Array<{ label: string; sequence: string }>> {
    return state.cliSequencesCache[cliType] ?? {};
  }

  /** Get tool config for a specific CLI type. */
  function getToolConfig(cliType: string): { pasteMode?: 'pty' | 'ptyindividual' | 'sendkeys' | 'sendkeysindividual' | 'clippaste'; [k: string]: any } {
    return state.cliToolsCache[cliType] ?? {};
  }

  /** Update the full bindings cache (called by initConfigCache). */
  function setBindingsCache(cache: Record<string, Record<string, any>>) {
    state.cliBindingsCache = cache;
  }

  function setSequencesCache(cache: Record<string, Record<string, Array<{ label: string; sequence: string }>>>) {
    state.cliSequencesCache = cache;
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

  function setActiveProfile(profile: string) {
    state.activeProfile = profile;
  }

  return {
    cliTypes,
    availableSpawnTypes,
    activeProfile,
    getBindings,
    getSequences,
    getToolConfig,
    setBindingsCache,
    setSequencesCache,
    setToolsCache,
    setCliTypes,
    setAvailableSpawnTypes,
    setActiveProfile,
  };
});
