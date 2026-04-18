<script setup lang="ts">
/**
 * PlansGrid.vue — 2-column grid of per-directory plan buttons with badge counts.
 *
 * Replaces renderPlansGrid() + createPlansButton() in sessions-plans.ts.
 */

export interface PlansDirItem {
  name: string;
  path: string;
  startableCount: number;
  doingCount: number;
}

const props = defineProps<{
  directories: PlansDirItem[];
  focusIndex: number;
  isActive: boolean;
}>();

const emit = defineEmits<{
  showPlans: [dirPath: string];
}>();
</script>

<template>
  <div class="plans-grid" id="plansGrid">
    <button
      v-for="(dir, i) in directories"
      :key="dir.path"
      class="spawn-btn plans-grid-btn"
      :class="{ focused: isActive && focusIndex === i }"
      :data-dir="dir.path"
      @click="emit('showPlans', dir.path)"
    >
      <span class="spawn-icon">📁</span>
      <span class="spawn-label">{{ dir.name }}</span>
      <span
        v-if="dir.startableCount > 0"
        class="plan-badge startable"
      >
        🔵{{ dir.startableCount }}
      </span>
      <span
        v-if="dir.doingCount > 0"
        class="plan-badge doing"
      >
        🟢{{ dir.doingCount }}
      </span>
    </button>
  </div>
</template>
