<script setup lang="ts">
import { computed, ref, type Component } from 'vue';
import type { PaneId } from '../../dock-types.js';

const props = defineProps<{
  paneId: PaneId;
  active: boolean;
  focused: boolean;
  component: Component | undefined;
}>();

const emit = defineEmits<{
  focus: [paneId: PaneId, focusedItemId?: string];
}>();

const paneRef = ref<HTMLElement | null>(null);

function focusedItemId(target: EventTarget | null): string | undefined {
  if (!(target instanceof Element)) return undefined;
  const item = target.closest<HTMLElement>('[data-focus-id], .focusable, button, input, select, textarea, [contenteditable]');
  if (!item || !paneRef.value?.contains(item)) return undefined;
  return item.dataset.focusId
    ?? item.id
    ?? item.getAttribute('name')
    ?? item.getAttribute('aria-label')
    ?? (item.dataset.navIndex ? `nav:${item.dataset.navIndex}` : undefined);
}

function onFocusIn(event: FocusEvent): void {
  emit('focus', props.paneId, focusedItemId(event.target));
}
</script>

<template>
  <section
    :id="`dock-pane-${paneId}`"
    ref="paneRef"
    class="dock-pane"
    :class="{ 'dock-pane--active': active, 'dock-pane--focused': focused }"
    :data-dock-pane-id="paneId"
    :data-focus-id="paneId"
    :data-pane-content="paneId"
    :aria-label="`${paneId} pane`"
    :aria-hidden="!active"
    tabindex="-1"
    v-show="active"
    @focusin="onFocusIn"
  >
    <component :is="component" v-if="component" :pane-id="paneId" />
    <div v-else class="dock-pane__missing">Pane unavailable: {{ paneId }}</div>
  </section>
</template>
