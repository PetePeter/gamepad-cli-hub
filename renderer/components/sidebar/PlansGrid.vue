<script setup lang="ts">
/**
 * PlansGrid.vue — 2-column grid of per-directory plan buttons with status dot counts.
 *
 * Shows up to 5 status dots (startable, doing, blocked, question, pending),
 * skipping any with a zero count. Replaces renderPlansGrid() + createPlansButton().
 */

export interface PlansDirItem {
  name: string;
  path: string;
  startableCount: number;
  doingCount: number;
  blockedCount: number;
  questionCount: number;
  pendingCount: number;
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
        v-if="dir.startableCount > 0 || dir.doingCount > 0 || dir.blockedCount > 0 || dir.questionCount > 0 || dir.pendingCount > 0"
        class="plans-btn-dots"
      >
        <span v-if="dir.startableCount > 0" class="plan-dot plan-dot--startable">🔵{{ dir.startableCount }}</span>
        <span v-if="dir.doingCount > 0" class="plan-dot plan-dot--doing">🟢{{ dir.doingCount }}</span>
        <span v-if="dir.blockedCount > 0" class="plan-dot plan-dot--blocked">🟠{{ dir.blockedCount }}</span>
        <span v-if="dir.questionCount > 0" class="plan-dot plan-dot--question">🟣{{ dir.questionCount }}</span>
        <span v-if="dir.pendingCount > 0" class="plan-dot plan-dot--pending">⚪{{ dir.pendingCount }}</span>
      </div>
    </button>
  </div>
</template>
