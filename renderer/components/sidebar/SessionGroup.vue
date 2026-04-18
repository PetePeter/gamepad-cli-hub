<script setup lang="ts">
/**
 * SessionGroup.vue — Collapsible directory group header.
 *
 * Replaces createGroupHeader() in sessions-render.ts. Clicking the header
 * toggles collapse; sub-buttons trigger move/plan actions.
 */

export interface SessionGroupData {
  dirPath: string;
  displayName: string;
  collapsed: boolean;
  sessionCount: number;
  planBadgeCount: number;
}

const props = defineProps<{
  group: SessionGroupData;
  isFocused: boolean;
  cardColumn: number;
}>();

const emit = defineEmits<{
  toggleCollapse: [dirPath: string];
  showPlans: [dirPath: string];
  showOverview: [dirPath: string];
}>();

function colClass(col: number): string {
  return props.isFocused && props.cardColumn === col ? 'card-col-focused' : '';
}
</script>

<template>
  <div
    class="group-header"
    :class="{ focused: isFocused }"
    :data-dir-path="group.dirPath"
    @click="emit('toggleCollapse', group.dirPath)"
  >
    <span class="group-chevron">{{ group.collapsed ? '▲' : '▼' }}</span>

    <span
      class="group-name"
      style="cursor: pointer"
      title="Open group overview"
      @click.stop="emit('showOverview', group.dirPath)"
    >
      {{ group.dirName }} ({{ group.sessionCount }})
    </span>

    <button
      class="group-plans-btn"
      :class="colClass(1)"
      title="Open plans for this directory"
      @click.stop="emit('showPlans', group.dirPath)"
    >
      🗺️
      <span v-if="group.planBadgeCount > 0" class="plans-btn-badge">
        {{ group.planBadgeCount }}
      </span>
    </button>
  </div>
</template>
