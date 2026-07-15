<script setup lang="ts">
/**
 * SessionGroup.vue — Collapsible directory group header.
 *
 * Clicking the header toggles collapse; clicking the name drills into the
 * group overview.
 */

export interface SessionGroupData {
  dirPath: string;
  displayName: string;
  collapsed: boolean;
  sessionCount: number;
}

import { computed } from 'vue';

const props = defineProps<{
  group: SessionGroupData;
  navIndex: number;
  isFocused: boolean;
  /** When the group is collapsed and a member session is flashing, drives the header flash. */
  flashEntry?: { accentColor: string | null; textColor: string | null; phase: 'pulse' | 'solid' } | null;
}>();

const emit = defineEmits<{
  toggleCollapse: [dirPath: string];
  showOverview: [dirPath: string];
}>();

const flashClass = computed(() => {
  if (!props.flashEntry) return '';
  return props.flashEntry.phase === 'solid' ? 'flash-solid' : 'flash-pulse';
});
const flashStyle = computed<Record<string, string>>(() => {
  const entry = props.flashEntry;
  if (!entry) return {};
  return {
    '--flash-accent': entry.accentColor ?? 'var(--accent)',
    '--flash-text': entry.textColor ?? 'var(--accent-contrast)',
  };
});
</script>

<template>
  <div
    class="group-header"
    :class="[{ focused: isFocused }, flashClass]"
    :style="flashStyle"
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
