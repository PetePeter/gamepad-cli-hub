<script setup lang="ts">
/**
 * SchedulerPane — the `scheduler` tool window.
 *
 * Owns the scheduler list plus the run-history modal it raises. The task editor
 * popup stays in the app modal host: it is raised from several places, not just
 * this pane.
 */
import SchedulerSection from '../sidebar/SchedulerSection.vue';
import ScheduledTaskHistoryModal from '../sidebar/ScheduledTaskHistoryModal.vue';
import { useHelmPaneContext } from '../../dock-pane-context.js';

const sidebar = useHelmPaneContext().sidebar;
</script>

<template>
  <div
    id="schedulerSection"
    class="spawn-section"
    :class="{ 'spawn-section--collapsed': sidebar.schedulerCollapsed.value }"
  >
    <div class="section-label" @click="sidebar.toggleSchedulerCollapse">
      <button class="section-toggle">{{ sidebar.schedulerCollapsed.value ? '▲' : '▼' }}</button>
      <span>Scheduler</span>
    </div>
    <SchedulerSection
      :collapsed="sidebar.schedulerCollapsed.value"
      @open="sidebar.openSchedulerPopup"
      @delete="sidebar.deleteScheduledTask"
      @history="sidebar.openSchedulerHistory"
    />
    <ScheduledTaskHistoryModal
      v-model:visible="sidebar.historyModalVisible.value"
      @recreate="sidebar.recreateFromHistory"
    />
  </div>
</template>
