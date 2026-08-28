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

import { registerKeyHandler } from '../keyboard/router.js';

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

/** Live count of attached imperative modals — the router's "a modal owns the keyboard" signal. */
let attachedModals = 0;

/**
 * True while any imperative modal has keyboard handlers attached.
 *
 * Replaces `querySelector('.modal-overlay.modal--visible')` probes: the count
 * follows the modal's own lifecycle instead of guessing from the DOM.
 */
export function hasAttachedModal(): boolean {
  return attachedModals > 0;
}

/**
 * Attach keyboard handlers to a modal. Returns a cleanup function.
 *
 * Selection mode: claims ALL keys, Enter always accepts, arrows use callbacks.
 * Form mode: Enter accepts (unless in a modal-internal textarea), arrows cycle focus.
 *
 * Registered at `modal` scope, the top of the router's precedence chain, so an
 * open modal outranks every workspace, pane and terminal binding.
 */
export function attachModalKeyboard(handlers: ModalHandlers): () => void {
  attachedModals += 1;
  const unregister = registerKeyHandler({
    id: `modal:${handlers.mode ?? 'form'}`,
    scope: 'modal',
    handle: (ctx) => isSelectionMode(handlers)
      ? handleSelectionKey(ctx.event, handlers)
      : handleFormKey(ctx.event, handlers),
  });

  return () => {
    attachedModals = Math.max(0, attachedModals - 1);
    unregister();
  };
}

// ============================================================================
// Selection mode — all keys blocked, simple dispatch
// ============================================================================

function handleSelectionKey(e: KeyboardEvent, h: SelectionModalHandlers): boolean {
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

  // Selection modals swallow everything, mapped or not — a stray keystroke must
  // never leak past a picker into a pane or a PTY.
  return true;
}

// ============================================================================
// Form mode — textarea-aware, DOM focus cycling
// ============================================================================

function handleFormKey(e: KeyboardEvent, h: FormModalHandlers): boolean {
  if (e.key === 'Escape') {
    h.onCancel();
    return true;
  }

  if (e.key === 'Enter' && e.ctrlKey) {
    // Ctrl+Enter always accepts — even inside textareas
    h.onAccept();
    return true;
  }

  if (e.key === 'Enter') {
    const active = document.activeElement;
    const container = h.container || document.querySelector('.modal-overlay.modal--visible .modal');
    // Guard: let Enter create newlines inside modal-internal textareas
    if (active?.tagName === 'TEXTAREA' && container?.contains(active)) return false;
    h.onAccept();
    return true;
  }

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Tab') {
    const active = document.activeElement;
    // Arrows skip textarea/select; Tab always cycles (browser default Tab is suppressed)
    if (e.key !== 'Tab' && (active?.tagName === 'TEXTAREA' || active?.tagName === 'SELECT')) return false;

    const container = h.container || document.querySelector('.modal-overlay.modal--visible .modal');
    if (!container) return false;
    const focusables = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)) as HTMLElement[];
    if (focusables.length === 0) return false;

    const currentIndex = focusables.indexOf(active as HTMLElement);
    const forward = e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey);
    const nextIndex = forward
      ? (currentIndex < focusables.length - 1 ? currentIndex + 1 : 0)
      : (currentIndex > 0 ? currentIndex - 1 : focusables.length - 1);
    focusables[nextIndex]?.focus();
    return true;
  }

  return false;
}
