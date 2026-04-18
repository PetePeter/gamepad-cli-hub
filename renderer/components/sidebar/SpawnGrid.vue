<script setup lang="ts">
/**
 * SpawnGrid.vue — 2-column grid of CLI spawn buttons.
 *
 * Replaces renderSpawnGrid() in sessions-spawn.ts. Each button shows the CLI
 * icon + display name and emits a spawn event on click.
 */

export interface SpawnItem {
  cliType: string;
  icon: string;
  displayName: string;
}

const props = defineProps<{
  items: SpawnItem[];
  focusIndex: number;
  isActive: boolean;
}>();

const emit = defineEmits<{
  spawn: [cliType: string];
}>();
</script>

<template>
  <div class="spawn-grid">
    <button
      v-for="(item, i) in items"
      :key="item.cliType"
      class="spawn-btn"
      :class="{ focused: isActive && focusIndex === i }"
      @click="emit('spawn', item.cliType)"
    >
      <span class="spawn-icon">{{ item.icon }}</span>
      <span class="spawn-label">{{ item.displayName }}</span>
    </button>
  </div>
</template>
