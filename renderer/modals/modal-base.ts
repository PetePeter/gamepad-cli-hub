/**
 * Modal base utilities — shared keyboard/gamepad handling for all modals.
 *
 * Two modes:
 *  - **selection** — list/button pickers (context menu, close-confirm, sequence
 *    picker, quick-spawn, dir-picker, draft-submenu). ALL keys blocked; Enter
 *    always accepts; arrow keys dispatch to callbacks.
 *  - **form** (default) — input forms (binding editor, showFormModal). Only
 *    handled keys are prevented; Enter skips accept when focused inside a
 *    modal-internal textarea; arrows cycle DOM focus.
 */

/** Selection mode — list/button pickers that track selectedIndex internally. */
export interface SelectionModalHandlers {
  mode: 'selection';
  onAccept: () => void;
  onCancel: () => void;
  onArrowUp?: () => void;
  onArrowDown?: () => void;
  onArrowLeft?: () => void;
  onArrowRight?: () => void;
}

/** Form mode — input forms with focusable fields (default). */
export interface FormModalHandlers {
  mode?: 'form';
  onAccept: () => void;
  onCancel: () => void;
  /** Container to search for focusable elements. Defaults to the active modal. */
  container?: HTMLElement;
}

export type ModalHandlers = SelectionModalHandlers | FormModalHandlers;

function isSelectionMode(h: ModalHandlers): h is SelectionModalHandlers {
  return h.mode === 'selection';
}

const FOCUSABLE_SELECTOR = 'input, select, textarea, button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Attach keyboard handlers to a modal. Returns a cleanup function.
 *
 * Selection mode: blocks ALL keys, Enter always accepts, arrows use callbacks.
 * Form mode: Enter accepts (unless in a modal-internal textarea), arrows cycle focus.
 */
export function attachModalKeyboard(handlers: ModalHandlers): () => void {
  function onKeyDown(e: KeyboardEvent): void {
    if (isSelectionMode(handlers)) {
      handleSelectionKey(e, handlers);
    } else {
      handleFormKey(e, handlers);
    }
  }
  document.addEventListener('keydown', onKeyDown, true);
  return () => document.removeEventListener('keydown', onKeyDown, true);
}

// ============================================================================
// Selection mode — all keys blocked, simple dispatch
// ============================================================================

function handleSelectionKey(e: KeyboardEvent, h: SelectionModalHandlers): void {
  e.preventDefault();
  e.stopPropagation();

  switch (e.key) {
    case 'Escape':  h.onCancel(); break;
    case 'Enter':
    case ' ':       h.onAccept(); break;
    case 'ArrowUp': h.onArrowUp?.(); break;
    case 'ArrowDown': h.onArrowDown?.(); break;
    case 'ArrowLeft': h.onArrowLeft?.(); break;
    case 'ArrowRight': h.onArrowRight?.(); break;
    case 'Tab':
      if (e.shiftKey) {
        h.onArrowUp?.();
      } else {
        h.onArrowDown?.();
      }
      break;
  }
}

// ============================================================================
// Form mode — textarea-aware, DOM focus cycling
// ============================================================================

function handleFormKey(e: KeyboardEvent, h: FormModalHandlers): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    h.onCancel();
  } else if (e.key === 'Enter' && e.ctrlKey) {
    // Ctrl+Enter always accepts — even inside textareas
    e.preventDefault();
    e.stopPropagation();
    h.onAccept();
  } else if (e.key === 'Enter') {
    const active = document.activeElement;
    const container = h.container || document.querySelector('.modal-overlay.modal--visible .modal');
    // Guard: let Enter create newlines inside modal-internal textareas
    if (active?.tagName === 'TEXTAREA' && container?.contains(active)) return;
    e.preventDefault();
    e.stopPropagation();
    h.onAccept();
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const active = document.activeElement;
    if (active?.tagName === 'TEXTAREA' || active?.tagName === 'SELECT') return;

    const container = h.container || document.querySelector('.modal-overlay.modal--visible .modal');
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
