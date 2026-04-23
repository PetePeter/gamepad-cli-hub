<script setup lang="ts">
/**
 * SessionGroup.vue — Collapsible directory group header.
 *
 * Replaces createGroupHeader() in sessions-render.ts. Clicking the header
 * toggles collapse; clicking the name drills into the group overview.
 */

export interface SessionGroupData {
  dirPath: string;
  displayName: string;
  collapsed: boolean;
  sessionCount: number;
}

const props = defineProps<{
  group: SessionGroupData;
  navIndex: number;
  isFocused: boolean;
}>();

const emit = defineEmits<{
  toggleCollapse: [dirPath: string];
  showOverview: [dirPath: string];
}>();
</script>

<template>
  <div
    class="group-header"
    :class="{ focused: isFocused }"
    :data-dir-path="group.dirPath"
    :data-nav-index="navIndex"
    @click="emit('toggleCollapse', group.dirPath)"
  >
    <span class="group-chevron">{{ group.collapsed ? '▲' : '▼' }}</span>

    <span
      class="group-name"
      style="cursor: pointer"
      title="Open group overview"
      @click.stop="emit('showOverview', group.dirPath)"
    >
      {{ group.displayName }} ({{ group.sessionCount }})
    </span>
  </div>
</template>
