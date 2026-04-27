<script setup lang="ts">
/**
 * PlansGrid.vue — 2-column grid of per-directory plan buttons with status dot counts.
 *
 * Shows status dots (startable, coding, review, blocked, planning),
 * skipping any with a zero count. Replaces renderPlansGrid() + createPlansButton().
 */

export interface PlansDirItem {
  name: string;
  path: string;
  startableCount: number;
  codingCount: number;
  blockedCount: number;
  reviewCount: number;
  planningCount: number;
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
      <div class="plans-btn-top">
        <span class="spawn-icon">📁</span>
        <span class="spawn-label">{{ dir.name }}</span>
      </div>
      <div
        v-if="dir.planningCount > 0 || dir.startableCount > 0 || dir.codingCount > 0 || dir.reviewCount > 0 || dir.blockedCount > 0"
        class="plans-btn-dots"
      >
        <span v-if="dir.planningCount > 0" class="plan-dot plan-dot--planning">⚪{{ dir.planningCount }}</span>
        <span v-if="dir.startableCount > 0" class="plan-dot plan-dot--startable">🔵{{ dir.startableCount }}</span>
        <span v-if="dir.codingCount > 0" class="plan-dot plan-dot--coding">🟢{{ dir.codingCount }}</span>
        <span v-if="dir.reviewCount > 0" class="plan-dot plan-dot--review">⏳{{ dir.reviewCount }}</span>
        <span v-if="dir.blockedCount > 0" class="plan-dot plan-dot--blocked">⛔{{ dir.blockedCount }}</span>
      </div>
    </button>
  </div>
</template>
