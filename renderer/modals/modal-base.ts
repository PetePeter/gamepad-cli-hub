/**
 * Modal base utilities — shared keyboard/gamepad handling for all modals.
 *
 * Provides ESC/Enter keyboard shortcuts, Up/Down field navigation,
 * and A/B gamepad button support.
 */

export interface ModalHandlers {
  onAccept: () => void;
  onCancel: () => void;
  /** Container to search for focusable elements. Defaults to the active modal. */
  container?: HTMLElement;
  /** When true, ALL unhandled keys are blocked (preventDefault + stopPropagation).
   *  Use for non-input modals (context menu, close-confirm, sequence-picker). */
  blockAllKeys?: boolean;
}

const FOCUSABLE_SELECTOR = 'input, select, textarea, button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Attach ESC (cancel), Enter (accept), and Up/Down arrow (field navigation)
 * keyboard handlers to a modal.
 * Enter is only triggered when the active element is NOT a textarea.
 * Returns a cleanup function that removes the listeners.
 */
export function attachModalKeyboard(handlers: ModalHandlers): () => void {
  function onKeyDown(e: KeyboardEvent): void {
    // When blockAllKeys is set, unconditionally block the event first.
    // Modal navigation callbacks below still execute — stopPropagation only
    // prevents the event from reaching child elements (e.g. xterm.js).
    if (handlers.blockAllKeys) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handlers.onCancel();
    } else if (e.key === 'Enter' && e.ctrlKey) {
      // Ctrl+Enter always accepts — even inside textareas
      e.preventDefault();
      e.stopPropagation();
      handlers.onAccept();
    } else if (e.key === 'Enter') {
      const active = document.activeElement;
      if (active?.tagName === 'TEXTAREA') return;
      e.preventDefault();
      e.stopPropagation();
      handlers.onAccept();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      // Don't intercept arrows in textareas or select elements
      const active = document.activeElement;
      if (active?.tagName === 'TEXTAREA' || active?.tagName === 'SELECT') return;

      const container = handlers.container || document.querySelector('.modal-overlay.modal--visible .modal');
      if (!container) return;
      const focusables = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)) as HTMLElement[];
      if (focusables.length === 0) return;

      const currentIndex = focusables.indexOf(active as HTMLElement);
      let nextIndex: number;
      if (e.key === 'ArrowDown') {
        nextIndex = currentIndex < focusables.length - 1 ? currentIndex + 1 : 0;
      } else {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : focusables.length - 1;
      }
      e.preventDefault();
      focusables[nextIndex]?.focus();
    }
  }
  document.addEventListener('keydown', onKeyDown, true);
  return () => document.removeEventListener('keydown', onKeyDown, true);
}
