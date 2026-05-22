<script setup lang="ts">
/**
 * PlanHelpModal — informational overlay shown on first visit to an empty plan.
 * Replaces plans/plan-help-modal.ts DOM manipulation.
 */
import { onMounted, onUnmounted } from 'vue';
import { useModalStack } from '../../composables/useModalStack.js';

const MODAL_ID = 'plan-help';

const emit = defineEmits<{ (e: 'dismiss'): void }>();

const modalStack = useModalStack();

function handleButton(button: string): boolean {
  if (button === 'B') { emit('dismiss'); return true; }
  return false;
}

onMounted(() => modalStack.push({ id: MODAL_ID, handler: handleButton, interceptKeys: [] }));
onUnmounted(() => modalStack.pop(MODAL_ID));
</script>

<template>
  <div class="plan-help-overlay" @click.self="emit('dismiss')">
    <div class="plan-help-modal" role="dialog" aria-modal="true" aria-label="How Plans Work">
      <h2 class="plan-help-title">How Plans Work</h2>
      <p class="plan-help-desc">A plan is a set of work items that can depend on each other — complete some before others can start.</p>
      <div class="plan-help-states">
        <div class="plan-help-state">
          <span class="plan-help-dot" style="background:#555555"></span>
          <span><strong>Pending</strong> — blocked by dependencies</span>
        </div>
        <div class="plan-help-state">
          <span class="plan-help-dot" style="background:#4488ff"></span>
          <span><strong>Startable</strong> — ready to work</span>
        </div>
        <div class="plan-help-state">
          <span class="plan-help-dot" style="background:#44cc44"></span>
          <span><strong>Doing</strong> — actively worked on</span>
        </div>
        <div class="plan-help-state">
          <span class="plan-help-dot" style="background:#44ccff"></span>
          <span><strong>Wait Tests</strong> — waiting for tests to pass</span>
        </div>
        <div class="plan-help-state">
          <span class="plan-help-dot" style="background:#555555; opacity:0.5"></span>
          <span><strong>Done</strong> — completed</span>
        </div>
      </div>
      <p class="plan-help-hint">Press <kbd>Y</kbd> or click <strong>+ Add Node</strong> to create your first work item. Use your mouse to drag between nodes to set up dependencies.</p>
      <p class="plan-help-hint plan-help-mouse-only">⚠️ This screen requires a mouse — it is not operable with the gamepad.</p>
      <p class="plan-help-dismiss">B button · Esc · click outside to dismiss</p>
    </div>
  </div>
</template>

<style scoped>
.plan-help-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
