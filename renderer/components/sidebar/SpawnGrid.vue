<script setup lang="ts">
/**
 * SpawnGrid.vue — 2-column grid of CLI spawn buttons.
 *
 * Each button shows the CLI display name and emits a spawn event on click.
 */

export interface SpawnItem {
  cliType: string;
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
      class="spawn-btn focusable"
      :class="{ focused: isActive && focusIndex === i }"
      :data-focus-id="`spawn:${item.cliType}`"
      @click="emit('spawn', item.cliType)"
    >
      <span class="spawn-label">{{ item.displayName }}</span>
    </button>
  </div>
</template>
