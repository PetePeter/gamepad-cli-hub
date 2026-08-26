<script setup lang="ts">
/**
 * QuickSpawnPane — the `quick-spawn` tool window.
 */
import { computed } from 'vue';
import SpawnGrid from '../sidebar/SpawnGrid.vue';
import { sessionsState } from '../../screens/sessions-state.js';
import { getCliDisplayName } from '../../utils.js';
import { useHelmPaneContext } from '../../dock-pane-context.js';

const sidebar = useHelmPaneContext().sidebar;

const items = computed(() =>
  sessionsState.cliTypes.map(cliType => ({
    cliType,
    displayName: getCliDisplayName(cliType),
  })),
);
</script>

<template>
  <div
    id="quickSpawnSection"
    class="spawn-section"
    :class="{ 'spawn-section--collapsed': sidebar.spawnCollapsed.value }"
  >
    <div class="section-label" @click="sidebar.toggleSpawnCollapse">
      <button class="section-toggle">{{ sidebar.spawnCollapsed.value ? '▲' : '▼' }}</button>
      <span>Quick Spawn</span>
      <span class="section-hint">Ctrl+Shift+N / Ctrl+Shift+W</span>
    </div>
    <SpawnGrid
      v-show="!sidebar.spawnCollapsed.value"
      :items="items"
      :focus-index="sessionsState.spawnFocusIndex"
      :is-active="sessionsState.activeFocus === 'spawn'"
      @spawn="sidebar.onSpawn"
    />
  </div>
</template>
