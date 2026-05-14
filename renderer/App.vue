<script setup lang="ts">
/**
 * App.vue -- minimal runtime shell router.
 *
 * Keep this file free of main-window controller imports so planner pop-out and
 * snap-out windows do not evaluate main-window-only settings/sidebar code.
 */

import { computed, defineAsyncComponent } from 'vue';

const MainWindowApp = defineAsyncComponent(() => import('./MainWindowApp.vue'));
const PlannerPopOutWindow = defineAsyncComponent(() => import('./components/PlannerPopOutWindow.vue'));
const SnapOutWindow = defineAsyncComponent(() => import('./components/SnapOutWindow.vue'));

const query = computed(() => new URLSearchParams(window.location.search));
const isSessionSnapOut = computed(() => query.value.get('snapOut') === '1');
const isPlannerPopOut = computed(() => query.value.get('plannerPopOut') === '1');
const snapOutSessionId = computed(() => query.value.get('sessionId') || '');
const plannerPopOutDirPath = computed(() => query.value.get('dirPath') || '');
</script>

<template>
  <SnapOutWindow
    v-if="isSessionSnapOut"
    :session-id="snapOutSessionId"
  />
  <PlannerPopOutWindow
    v-else-if="isPlannerPopOut"
    :dir-path="plannerPopOutDirPath"
  />
  <MainWindowApp v-else />
</template>
