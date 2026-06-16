/**
 * Modal keyboard bridge — the shared key→modal-stack mapping.
 *
 * Translates raw keyboard events into modal-stack gamepad inputs so that
 * keyboard users can drive selection-mode modals (context menu, pickers,
 * confirm dialogs) exactly like the gamepad does. Used by both the main
 * window (via useInputRouter) and the snap-out popout window so behaviour
 * stays identical across windows.
 *
 * Register `handler` as a capture-phase `keydown` listener on `window`.
 */

import { useModalStack } from './useModalStack.js';
import { useEscProtection } from './useEscProtection.js';
import {
  getActiveInputContext,
  isEditableElement,
  isEditableElementInContainer,
  MODAL_NAVIGATION_SELECTOR,
} from '../input/input-ownership.js';

function isEditableElementInsideModal(element: Element | null): element is HTMLElement {
  return isEditableElement(element) && isEditableElementInContainer(
    element,
    '.modal-overlay.modal--visible, .scheduled-tasks-tab--popup',
  );
}

export function useModalKeyboardBridge() {
  /**
   * Capture-phase keydown handler. No-op unless a modal is open and the modal
   * declares interest in the pressed key via its interceptKeys policy.
   */
  function handler(e: KeyboardEvent): void {
    const stack = useModalStack();
    if (!stack.isOpen.value) return;

    const active = document.activeElement;
    const activeContext = getActiveInputContext({
      activeElement: active,
      modalNavigationSelectors: MODAL_NAVIGATION_SELECTOR,
    });
    const editableInModal = activeContext === 'editable-field' && isEditableElementInsideModal(active);
    const interceptKeys = stack.topInterceptKeys.value;
    const escProtection = useEscProtection();

    // While ESC protection is up, any non-Escape key dismisses it and is swallowed.
    if (escProtection.isProtecting.value && e.key !== 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      escProtection.dismissProtection();
      return;
    }

    if (e.key === 'ArrowUp') {
      if (!interceptKeys.has('arrows') || editableInModal) return;
      e.preventDefault();
      stack.handleInput('DPadUp');
    } else if (e.key === 'ArrowDown') {
      if (!interceptKeys.has('arrows') || editableInModal) return;
      e.preventDefault();
      stack.handleInput('DPadDown');
    } else if (e.key === 'ArrowLeft') {
      if (!interceptKeys.has('arrows') || editableInModal) return;
      e.preventDefault();
      stack.handleInput('DPadLeft');
    } else if (e.key === 'ArrowRight') {
      if (!interceptKeys.has('arrows') || editableInModal) return;
      e.preventDefault();
      stack.handleInput('DPadRight');
    } else if (e.key === 'Tab') {
      if (!interceptKeys.has('tab')) return;
      e.preventDefault();
      stack.handleInput(e.shiftKey ? 'ShiftTab' : 'Tab');
    } else if (e.key === 'Enter') {
      if (!interceptKeys.has('enter') || (editableInModal && document.activeElement?.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      stack.handleInput('A');
    } else if (e.key === ' ' || e.key === 'Spacebar') {
      if (!interceptKeys.has('space') || editableInModal) return;
      e.preventDefault();
      stack.handleInput('A');
    } else if (e.key === 'Escape') {
      if (!interceptKeys.has('escape')) return;
      e.preventDefault();
      stack.handleInput('B');
    } else if (e.key >= '0' && e.key <= '9' && e.key.length === 1) {
      // Jump numbers: bare digit selects the Nth row in a selection modal.
      if (!interceptKeys.has('digits') || editableInModal) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      e.preventDefault();
      stack.handleInput(`Digit${e.key}`);
    } else if (e.key.length === 1 && e.key >= 'a' && e.key <= 'z') {
      // Jump letters: bare letter selects the Nth row in a tree picker (positions 10-35).
      if (!interceptKeys.has('letters') || editableInModal) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      e.preventDefault();
      stack.handleInput(`Key${e.key.toUpperCase()}`);
    }
  }

  return { handler };
}
