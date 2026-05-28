import { onMounted, onUnmounted } from 'vue';
import { useNavigationStore } from '../stores/navigation.js';
import { useSessionsScreenStore } from '../stores/sessions-screen.js';

/**
 * Registers Ctrl+1–9 and Ctrl+0 keyboard shortcuts to jump directly to
 * the Nth visible session in sidebar order.
 *
 * Blocked when any modal overlay is visible to avoid conflicting with
 * modal keyboard handling.
 */
export function useSessionJumpKeys(): void {
  const navStore = useNavigationStore();
  const screenStore = useSessionsScreenStore();

  function onKeydown(e: KeyboardEvent): void {
    if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;

    let displayKey: number | null = null;
    if (e.key >= '1' && e.key <= '9') displayKey = parseInt(e.key, 10);
    else if (e.key === '0') displayKey = 0;
    if (displayKey === null) return;

    if (document.querySelector('.modal-overlay.modal--visible')) return;

    for (const [sessionId, assignedKey] of screenStore.sessionShortcutMap) {
      if (assignedKey === displayKey) {
        e.preventDefault();
        void navStore.navigateToSession(sessionId);
        return;
      }
    }
  }

  onMounted(() => document.addEventListener('keydown', onKeydown));
  onUnmounted(() => document.removeEventListener('keydown', onKeydown));
}
