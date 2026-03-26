/**
 * Modal base utilities — shared keyboard/gamepad handling for all modals.
 *
 * Provides ESC/Enter keyboard shortcuts and A/B gamepad button support.
 */

export interface ModalHandlers {
  onAccept: () => void;
  onCancel: () => void;
}

/**
 * Attach ESC (cancel) and Enter (accept) keyboard handlers to a modal.
 * Enter is only triggered when the active element is NOT a textarea (so multi-line
 * textareas can use Enter for newlines).
 * Returns a cleanup function that removes the listeners.
 */
export function attachModalKeyboard(handlers: ModalHandlers): () => void {
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handlers.onCancel();
    } else if (e.key === 'Enter') {
      // Don't intercept Enter in textareas (they need newlines)
      const active = document.activeElement;
      if (active?.tagName === 'TEXTAREA') return;
      e.preventDefault();
      e.stopPropagation();
      handlers.onAccept();
    }
  }
  // Use capture phase so it fires before other handlers
  document.addEventListener('keydown', onKeyDown, true);
  return () => document.removeEventListener('keydown', onKeyDown, true);
}
