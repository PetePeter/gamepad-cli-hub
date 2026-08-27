<script setup lang="ts">
/**
 * QuickSpawnPane — the `quick-spawn` tool window.
 *
 * Content only: the dock tab names the pane and the rail collapses it, so the
 * pane owns neither a header nor a collapse toggle. The keyboard hint lives on
 * the pane descriptor and surfaces as the tab's tooltip.
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
  <div class="dock-pane-body">
    <SpawnGrid
      :items="items"
      :focus-index="sessionsState.spawnFocusIndex"
      :is-active="sessionsState.activeFocus === 'spawn'"
      @spawn="sidebar.onSpawn"
    />
  </div>
</template>
