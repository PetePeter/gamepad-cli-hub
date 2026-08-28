<script setup lang="ts">
/**
 * PlanDirectoriesPane — the `plan-directories` tool window.
 *
 * Directory navigation only: picking a directory activates the PlanScreen view
 * for it (via the sidebar controller's onShowPlans), it never renders a canvas
 * of its own.
 *
 * Content only — the dock tab titles it and the rail collapses it.
 */
import { computed } from 'vue';
import PlansGrid from '../sidebar/PlansGrid.vue';
import { sessionsState } from '../../screens/sessions-state.js';
import { useAppStore } from '../../stores/app.js';
import { buildPlannerDirectories } from '../../screens/planner-directories.js';
import { useHelmPaneContext } from '../../dock-pane-context.js';

const sidebar = useHelmPaneContext().sidebar;
const state = useAppStore().state;

const directories = computed(() => {
  const session = state.sessions.find(entry => entry.id === state.activeSessionId);
  if (!session?.workingDir) return [];
  const directory = buildPlannerDirectories([{ name: session.workingDir, path: session.workingDir }])[0];
  if (!directory) return [];
  return [{
    name: directory.name,
    path: directory.path,
    startableCount: state.planDirStartableCounts.get(directory.path) ?? 0,
    codingCount: state.planDirCodingCounts.get(directory.path) ?? 0,
    blockedCount: state.planDirBlockedCounts.get(directory.path) ?? 0,
    reviewCount: state.planDirReviewCounts.get(directory.path) ?? 0,
    planningCount: state.planDirPlanningCounts.get(directory.path) ?? 0,
  }];
});
</script>

<template>
  <div class="dock-pane-body">
    <PlansGrid
      :directories="directories"
      :focus-index="sessionsState.plansFocusIndex"
      :is-active="sessionsState.activeFocus === 'plans'"
      @show-plans="sidebar.onShowPlans"
    />
  </div>
</template>
