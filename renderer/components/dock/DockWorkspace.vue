<script setup lang="ts">
import { computed, markRaw, toRaw, type Component } from 'vue';
import type { DockNodePath, DockWorkspaceLayout, PaneId } from '../../dock-types.js';
import { DOCK_PANE_COMPONENTS } from '../../dock-pane-registry.js';
import DockNode from './DockNode.vue';

const props = defineProps<{
  layout: DockWorkspaceLayout;
  focusedPaneId: PaneId | null;
  paneComponents?: Readonly<Partial<Record<PaneId, Component>>>;
  revealedPaneIds?: readonly PaneId[];
}>();

const emit = defineEmits<{
  'focus-pane': [paneId: PaneId, focusedItemId?: string];
  'activate-pane': [paneId: PaneId];
  'close-pane': [paneId: PaneId];
  'resize-split': [path: DockNodePath, sizes: number[]];
  'reveal-pane': [paneId: PaneId];
  'autohide-close': [paneId: PaneId];
}>();

const resolvedPaneComponents = computed(() => ({
  ...Object.fromEntries(Object.entries({
    ...DOCK_PANE_COMPONENTS,
    ...(props.paneComponents ?? {}),
  }).map(([paneId, component]) => [paneId, markRaw(toRaw(component))])),
}));
</script>

<template>
  <div class="dock-workspace" data-dock-workspace>
    <DockNode
      :node="layout.root"
      :path="[]"
      :focused-pane-id="focusedPaneId"
      :pane-components="resolvedPaneComponents"
      :revealed-pane-ids="revealedPaneIds ?? []"
      @focus-pane="(...args) => emit('focus-pane', ...args)"
      @activate-pane="(paneId) => emit('activate-pane', paneId)"
      @close-pane="(paneId) => emit('close-pane', paneId)"
      @resize-split="(...args) => emit('resize-split', ...args)"
      @reveal-pane="(paneId) => emit('reveal-pane', paneId)"
      @autohide-close="(paneId) => emit('autohide-close', paneId)"
    />
  </div>
</template>
