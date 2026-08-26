<script setup lang="ts">
import { nextTick, type Component } from 'vue';
import type { PaneId } from '../../dock-types.js';
import { getPaneDescriptor } from '../../dock-types.js';
import DockPane from './DockPane.vue';

const props = defineProps<{
  tabs: readonly PaneId[];
  activeTab: PaneId;
  focusedPaneId: PaneId | null;
  paneComponents: Readonly<Record<PaneId, Component>>;
}>();

const emit = defineEmits<{
  focus: [paneId: PaneId, focusedItemId?: string];
  activate: [paneId: PaneId];
  close: [paneId: PaneId];
}>();

const tabRefs = new Map<PaneId, HTMLElement>();

function titleFor(paneId: PaneId): string {
  return getPaneDescriptor(paneId)?.title ?? paneId;
}

function setTabRef(paneId: PaneId, element: Element | null): void {
  if (element instanceof HTMLElement) tabRefs.set(paneId, element);
  else tabRefs.delete(paneId);
}

function focusTab(paneId: PaneId): void {
  nextTick(() => tabRefs.get(paneId)?.focus());
}

function selectTab(paneId: PaneId): void {
  emit('activate', paneId);
  emit('focus', paneId, `tab:${paneId}`);
}

function onTabKey(event: KeyboardEvent, paneId: PaneId): void {
  const index = props.tabs.indexOf(paneId);
  let nextIndex = -1;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % props.tabs.length;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + props.tabs.length) % props.tabs.length;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = props.tabs.length - 1;
  if (nextIndex >= 0) {
    event.preventDefault();
    const next = props.tabs[nextIndex];
    selectTab(next);
    focusTab(next);
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    selectTab(paneId);
  }
}

function onPaneFocus(paneId: PaneId, focusedItemId?: string): void {
  emit('focus', paneId, focusedItemId);
}
</script>

<template>
  <section class="dock-tab-group" :data-dock-group-active="activeTab">
    <div class="dock-tabs" role="tablist" :aria-label="`${activeTab} tab group`">
      <div v-for="paneId in tabs" :key="paneId" class="dock-tab-entry">
        <button
          :ref="(element) => setTabRef(paneId, element)"
          class="dock-tab"
          :class="{ 'dock-tab--active': paneId === activeTab, 'dock-tab--focused': paneId === focusedPaneId }"
          type="button"
          role="tab"
          :id="`dock-tab-${paneId}`"
          :aria-controls="`dock-pane-${paneId}`"
          :aria-selected="paneId === activeTab"
          :tabindex="paneId === activeTab ? 0 : -1"
          @click="selectTab(paneId)"
          @keydown="onTabKey($event, paneId)"
        >
          {{ titleFor(paneId) }}
        </button>
        <button
          class="dock-tab-close"
          type="button"
          :aria-label="`Close ${titleFor(paneId)} pane`"
          @click="emit('close', paneId)"
        >
          ×
        </button>
      </div>
    </div>
    <DockPane
      v-for="paneId in tabs"
      :key="`pane-${paneId}`"
      :pane-id="paneId"
      :active="paneId === activeTab"
      :focused="paneId === focusedPaneId"
      :component="paneComponents[paneId]"
      @focus="onPaneFocus"
    />
  </section>
</template>
