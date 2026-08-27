<script setup lang="ts">
/**
 * TerminalChips — the chip bar that belongs to a terminal.
 *
 * Plan pills and action buttons are properties of the session at the prompt,
 * not of the window, so this mounts inside the terminal surface rather than as
 * a band spanning the whole shell. That is what lets it travel with the
 * terminal pane when the pane is moved, split or docked, and it is why the same
 * component serves both the docked pane and a snapped-out window.
 *
 * Purely an adapter: `ChipBar` owns the row's markup, this owns the wiring to
 * the chip-bar store singleton. Hosts therefore mount it with no props.
 */
import ChipBar from './ChipBar.vue';
import { useChipBarStore } from '../../stores/chip-bar.js';
import { copyPlanRef } from '../../composables/useCopyPlanRef.js';

const chipBarStore = useChipBarStore();
</script>

<template>
  <ChipBar
    :plan-chips="chipBarStore.plans"
    :actions="chipBarStore.actions"
    :visible="true"
    placement="bottom"
    @plan-chip-click="chipBarStore.openPlan($event)"
    @plan-chip-copy="copyPlanRef($event)"
    @action-click="chipBarStore.triggerAction($event)"
  />
</template>
