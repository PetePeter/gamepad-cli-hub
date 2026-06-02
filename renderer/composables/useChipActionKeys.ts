import { onMounted, onUnmounted } from 'vue';
import { useChipBarStore } from '../stores/chip-bar.js';

/**
 * Registers Alt+1-9 keyboard shortcuts to fire the Nth chip bar action for the
 * active session. Mirrors useSessionJumpKeys (which uses Ctrl+number) but uses
 * Alt so the two accelerator schemes do not collide.
 *
 * Blocked when any modal overlay is visible to avoid conflicting with modal
 * keyboard handling.
 */
export function useChipActionKeys(): void {
  const chipBarStore = useChipBarStore();

  function onKeydown(e: KeyboardEvent): void {
    if (!e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return;

    // e.code stays digit-stable even when Alt remaps e.key (e.g. to a symbol).
    let index: number | null = null;
    if (e.code >= 'Digit1' && e.code <= 'Digit9') index = parseInt(e.code.slice(5), 10) - 1;
    else if (e.key >= '1' && e.key <= '9') index = parseInt(e.key, 10) - 1;
    if (index === null) return;

    if (document.querySelector('.modal-overlay.modal--visible')) return;

    const action = chipBarStore.actions[index];
    if (!action) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    void chipBarStore.triggerAction(action.sequence);
  }

  onMounted(() => window.addEventListener('keydown', onKeydown, true));
  onUnmounted(() => window.removeEventListener('keydown', onKeydown, true));
}
