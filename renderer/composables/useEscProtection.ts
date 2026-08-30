/**
 * ESC protection composable — prevents accidental terminal exit via Escape key.
 *
 * Provides reactive state:
 * - isProtecting: whether the protection modal is currently visible
 * - confirmingSessionId: the session ID that needs protection confirmation
 *
 * Public API:
 * - openProtection(sessionId, onConfirm): show protection modal
 * - confirmProtection(): the user said yes — run onConfirm, then close
 * - dismissProtection(): close without confirming; onConfirm never runs
 *
 * The confirm action is stored here rather than re-derived by whoever handles
 * the second keypress. The dialog is a modal, so the keyboard router gates the
 * terminal handlers out (`router.ts`, `ctx.scope === 'modal'`) and the only
 * code that can still act is the modal's own stack handler. One owner, one
 * path — for both the keyboard Escape and the gamepad B button.
 */

import { ref, computed } from 'vue';

const isProtecting = ref(false);
const confirmingSessionId = ref<string | null>(null);
let onConfirm: (() => void) | null = null;

function close(): void {
  isProtecting.value = false;
  confirmingSessionId.value = null;
  onConfirm = null;
}

export function useEscProtection() {
  return {
    isProtecting: computed(() => isProtecting.value),
    confirmingSessionId: computed(() => confirmingSessionId.value),

    openProtection(sessionId: string, confirm: () => void): void {
      confirmingSessionId.value = sessionId;
      onConfirm = confirm;
      isProtecting.value = true;
    },

    /** Clearing before invoking keeps a re-entrant confirm from firing twice. */
    confirmProtection(): void {
      const confirm = onConfirm;
      close();
      confirm?.();
    },

    dismissProtection(): void {
      close();
    },
  };
}
