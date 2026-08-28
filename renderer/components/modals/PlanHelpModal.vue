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
          <span class="plan-help-dot plan-help-dot--planning"></span>
          <span><strong>Pending</strong> — blocked by dependencies</span>
        </div>
        <div class="plan-help-state">
          <span class="plan-help-dot plan-help-dot--ready"></span>
          <span><strong>Startable</strong> — ready to work</span>
        </div>
        <div class="plan-help-state">
          <span class="plan-help-dot plan-help-dot--coding"></span>
          <span><strong>Doing</strong> — actively worked on</span>
        </div>
        <div class="plan-help-state">
          <span class="plan-help-dot plan-help-dot--review"></span>
          <span><strong>Wait Tests</strong> — waiting for tests to pass</span>
        </div>
        <div class="plan-help-state">
          <span class="plan-help-dot plan-help-dot--done"></span>
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

.plan-help-modal {
  background: var(--bg-secondary);
  border: 2px solid var(--accent);
  border-radius: var(--radius-lg);
  padding: 28px 32px;
  max-width: 420px;
  width: calc(100% - 48px);
  color: var(--text-primary);
}

.plan-help-title {
  margin: 0 0 12px;
  font-size: var(--font-size-lg);
  font-weight: 600;
}

.plan-help-desc {
  margin: 0 0 16px;
  color: var(--text-secondary);
  font-size: 14px;
}

.plan-help-states {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 18px;
}

.plan-help-state {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}

.plan-help-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.plan-help-dot--planning { background: var(--status-planning); }
.plan-help-dot--ready { background: var(--status-ready); }
.plan-help-dot--coding { background: var(--status-coding); }
.plan-help-dot--review { background: var(--status-review); }
.plan-help-dot--done { background: var(--status-done); opacity: 0.5; }

.plan-help-hint {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.plan-help-hint kbd {
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 12px;
}

.plan-help-dismiss {
  margin: 0;
  font-size: 12px;
  color: var(--text-dim);
  text-align: center;
}

.plan-help-mouse-only {
  color: var(--status-blocked);
  margin-top: 0;
}
</style>
