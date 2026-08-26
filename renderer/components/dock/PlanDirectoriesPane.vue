<script setup lang="ts">
/**
 * PlanDirectoriesPane — the `plan-directories` tool window.
 *
 * Directory navigation only: picking a directory activates the PlanScreen view
 * for it (via the sidebar controller's onShowPlans), it never renders a canvas
 * of its own.
 */
import { computed } from 'vue';
import PlansGrid from '../sidebar/PlansGrid.vue';
import { sessionsState } from '../../screens/sessions-state.js';
import { useAppStore } from '../../stores/app.js';
import { buildPlannerDirectories } from '../../screens/planner-directories.js';
import { useHelmPaneContext } from '../../dock-pane-context.js';

const sidebar = useHelmPaneContext().sidebar;
const state = useAppStore().state;

const directories = computed(() =>
  buildPlannerDirectories(sessionsState.directories).map(d => ({
    name: d.name,
    path: d.path,
    startableCount: state.planDirStartableCounts.get(d.path) ?? 0,
    codingCount: state.planDirCodingCounts.get(d.path) ?? 0,
    blockedCount: state.planDirBlockedCounts.get(d.path) ?? 0,
    reviewCount: state.planDirReviewCounts.get(d.path) ?? 0,
    planningCount: state.planDirPlanningCounts.get(d.path) ?? 0,
  })),
);
</script>

<template>
  <div
    id="plannerSection"
    class="spawn-section"
    :class="{ 'spawn-section--collapsed': sidebar.plannerCollapsed.value }"
  >
    <div class="section-label" @click="sidebar.togglePlannerCollapse">
      <button class="section-toggle">{{ sidebar.plannerCollapsed.value ? '▲' : '▼' }}</button>
      <span>Project Planner</span>
    </div>
    <PlansGrid
      v-show="!sidebar.plannerCollapsed.value"
      :directories="directories"
      :focus-index="sessionsState.plansFocusIndex"
      :is-active="sessionsState.activeFocus === 'plans'"
      @show-plans="sidebar.onShowPlans"
    />
  </div>
</template>
