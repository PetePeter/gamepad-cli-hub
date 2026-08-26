<script setup lang="ts">
import type { PaneId } from '../../dock-types.js';

export interface DockViewMenuItem {
  id: PaneId;
  title: string;
  closed: boolean;
}

defineProps<{
  open: boolean;
  items: readonly DockViewMenuItem[];
}>();

const emit = defineEmits<{
  open: [];
  toggle: [paneId: PaneId];
  reset: [];
  close: [];
}>();
</script>

<template>
  <div class="dock-view-menu">
    <button
      class="sidebar-btn dock-view-menu__trigger"
      type="button"
      title="Show or hide workspace panes"
      aria-haspopup="menu"
      :aria-expanded="open"
      @keydown.esc="emit('close')"
      @click="emit(open ? 'close' : 'open')"
    >
      View
    </button>

    <div v-if="open" class="dock-view-menu__popover" role="menu" @keydown.esc="emit('close')">
      <div class="dock-view-menu__heading">Workspace panes</div>
      <button
        v-for="item in items"
        :key="item.id"
        class="dock-view-menu__item"
        type="button"
        role="menuitemcheckbox"
        :aria-checked="!item.closed"
        @click="emit('toggle', item.id)"
      >
        <span class="dock-view-menu__check" aria-hidden="true">{{ item.closed ? '' : '✓' }}</span>
        <span>{{ item.title }}</span>
      </button>
      <div class="dock-view-menu__separator" role="separator"></div>
      <button class="dock-view-menu__item dock-view-menu__reset" type="button" role="menuitem" @click="emit('reset')">
        Reset Layout
      </button>
    </div>
  </div>
</template>
