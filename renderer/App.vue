<script setup lang="ts">
/**
 * App.vue -- minimal runtime shell router.
 *
 * Keep this file free of main-window controller imports so planner pop-out and
 * snap-out windows do not evaluate main-window-only settings/sidebar code.
 */

import { computed, defineAsyncComponent } from 'vue';
import { currentWindowIdentity } from './window-identity.js';

const MainWindowApp = defineAsyncComponent(() => import('./MainWindowApp.vue'));
const PlannerPopOutWindow = defineAsyncComponent(() => import('./components/PlannerPopOutWindow.vue'));
const SnapOutWindow = defineAsyncComponent(() => import('./components/SnapOutWindow.vue'));

// One parser for the whole renderer, so the shell and every window-keyed
// registry can never disagree about which window this is.
const identity = computed(() => currentWindowIdentity());
const isSessionSnapOut = computed(() => identity.value.kind === 'session');
const isPlannerPopOut = computed(() => identity.value.kind === 'planner');
const snapOutSessionId = computed(() => identity.value.kind === 'session' ? identity.value.sessionId : '');
const plannerPopOutDirPath = computed(() => identity.value.kind === 'planner' ? identity.value.dirPath : '');
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
