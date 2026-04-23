/**
 * Keyboard relay composable — wraps setupKeyboardRelay / teardownKeyboardRelay
 * with Vue lifecycle hooks (auto-setup on mount, auto-teardown on unmount).
 *
 * Routes keyboard input to the active terminal's PTY:
 * - Ctrl+V paste (clipboard → PTY)
 * - Ctrl+G external editor
 * - Single printable chars and named keys → PTY escape codes
 */

import { onMounted, onUnmounted } from 'vue';
import { setupKeyboardRelay, teardownKeyboardRelay } from '../paste-handler.js';

export interface KeyboardRelayOptions {
  /** Returns the active session ID, or null if none */
  getActiveSessionId: () => string | null;
  /** Returns true if the session has a pending question */
  hasPendingQuestion?: (sessionId: string) => boolean;
  /** Returns true if ESC protection is enabled (async) */
  getEscProtectionEnabled?: () => Promise<boolean>;
}

export function useKeyboardRelay(options: KeyboardRelayOptions) {
  onMounted(() => {
    setupKeyboardRelay(
      options.getActiveSessionId,
      options.hasPendingQuestion ?? (() => false),
      options.getEscProtectionEnabled ?? (async () => true),
    );
  });

  onUnmounted(() => {
    teardownKeyboardRelay();
  });
}
