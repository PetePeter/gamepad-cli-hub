<script setup lang="ts">
/**
 * PendingHandoverModal.vue — terminal lock while a compaction handover waits.
 *
 * `session_compact` can carry a note across the compaction it triggers: the text
 * is held in the main process and pasted back on the session's first lull.
 * "First lull" means ten seconds of PTY silence — and user keystrokes are PTY
 * output. Typing into the session while it compacts resets that timer, so the
 * lock is mechanical, not cosmetic: without it the handover can be deferred
 * indefinitely by someone idly poking the terminal.
 *
 * The dialog only claims the keyboard while the pending session's terminal is
 * the focused pane. A background session compacting must not freeze the app.
 */
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { registerKeyHandler } from '../../keyboard/router.js';
import { useModalStack } from '../../composables/useModalStack.js';
import { useHandover } from '../../composables/useHandover.js';

const MODAL_ID = 'pending-handover-modal';

const props = defineProps<{
  /** Session whose terminal is on screen, or null. */
  sessionId: string | null;
  /** Whether that terminal is the focused pane. */
  terminalFocused: boolean;
}>();

const stack = useModalStack();
const handover = useHandover();

const visible = computed(() => props.terminalFocused && handover.isPending(props.sessionId));

async function cancel(): Promise<void> {
  if (!props.sessionId) return;
  await handover.cancel(props.sessionId);
}

/**
 * Owning the keyboard means declining is leaking. Everything is swallowed
 * except the one key that resolves the dialog.
 */
function handleKeyDown(event: KeyboardEvent): boolean {
  if (event.key === 'Escape') {
    void cancel();
  }
  return true;
}

watch(visible, (isVisible) => {
  // Joining the stack is what puts the router into modal scope; a modal-scope
  // handler alone leaves it in pane scope and keys reach the PTY regardless.
  if (isVisible) {
    stack.push({ id: MODAL_ID, handler: handleKeyDown, interceptKeys: new Set() });
  } else {
    stack.pop(MODAL_ID);
  }
}, { immediate: true });

let unregisterKeys: (() => void) | null = null;

onMounted(() => {
  unregisterKeys = registerKeyHandler({
    id: MODAL_ID,
    scope: 'modal',
    claims: () => visible.value,
    handle: ctx => handleKeyDown(ctx.event),
  });
});

onUnmounted(() => {
  stack.pop(MODAL_ID);
  unregisterKeys?.();
  unregisterKeys = null;
});
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay modal--visible">
      <div class="pending-handover-modal">
        <div class="modal-header">
          <h2>Handover pending</h2>
        </div>

        <div class="modal-body">
          <p>
            This session is compacting. Your handover note will be pasted back
            automatically as soon as it falls quiet.
          </p>
          <p class="pending-handover-note">
            The terminal is locked until then — typing would reset the silence
            the delivery is waiting for.
          </p>
        </div>

        <div class="modal-footer">
          <button class="btn" @click="cancel">Cancel handover</button>
          <span class="pending-handover-hint">Waiting… (Esc cancels)</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pending-handover-modal {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  max-width: 30rem;
  width: 100%;
  box-shadow: var(--shadow-lg);
}

.pending-handover-note {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.pending-handover-hint {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  margin-left: auto;
}
</style>
