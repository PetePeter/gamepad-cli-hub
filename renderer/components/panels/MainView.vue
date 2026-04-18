<script setup lang="ts">
/**
 * MainView.vue — Right panel manager for terminal / overview / plan views.
 *
 * Replaces main-view-manager.ts with a reactive component that switches
 * between three mutually exclusive views using v-show (terminal) and v-if
 * (overview/plan) for appropriate lifecycle management.
 */
import { computed } from 'vue';

export type ViewMode = 'terminal' | 'overview' | 'plan';

const props = defineProps<{
  activeView: ViewMode;
}>();

const emit = defineEmits<{
  'update:activeView': [view: ViewMode];
}>();

const isTerminal = computed(() => props.activeView === 'terminal');
const isOverview = computed(() => props.activeView === 'overview');
const isPlan = computed(() => props.activeView === 'plan');

function showTerminal(): void {
  emit('update:activeView', 'terminal');
}

function showOverview(): void {
  emit('update:activeView', 'overview');
}

function showPlan(): void {
  emit('update:activeView', 'plan');
}

defineExpose({ showTerminal, showOverview, showPlan });
</script>

<template>
  <div class="main-view" id="mainArea">
    <div v-show="isTerminal" class="main-view-terminal" id="terminalContainer">
      <slot name="terminal" />
    </div>

    <div v-if="isOverview" class="main-view-overview">
      <slot name="overview" />
    </div>

    <div v-if="isPlan" class="main-view-plan">
      <slot name="plan" />
    </div>
  </div>
</template>
