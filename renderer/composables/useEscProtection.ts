/**
 * ESC protection composable — prevents accidental terminal exit via Escape key.
 *
 * Provides reactive state:
 * - isProtecting: whether the protection modal is currently visible
 * - confirmingSessionId: the session ID that needs protection confirmation
 *
 * Public API:
 * - openProtection(sessionId): show protection modal
 * - dismissProtection(): close modal without further action (caller sends ESC if needed)
 *
 * No timeout, no side effects — pure reactive state management.
 */

import { ref, computed } from 'vue';

const isProtecting = ref(false);
const confirmingSessionId = ref<string | null>(null);

export function useEscProtection() {
  return {
    isProtecting: computed(() => isProtecting.value),
    confirmingSessionId: computed(() => confirmingSessionId.value),

    openProtection(sessionId: string): void {
      confirmingSessionId.value = sessionId;
      isProtecting.value = true;
    },

    dismissProtection(): void {
      isProtecting.value = false;
      confirmingSessionId.value = null;
    },
  };
}
