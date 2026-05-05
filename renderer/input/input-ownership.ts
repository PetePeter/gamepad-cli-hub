export type InputOwnershipContext = 'editable-field' | 'terminal' | 'modal-navigation' | 'app-navigation';

export const EDITABLE_ELEMENT_SELECTOR = 'input, textarea, select, [contenteditable], [contenteditable=""], [contenteditable="true"]';
export const TERMINAL_ELEMENT_SELECTOR = '.xterm';

function asElement(value: EventTarget | Element | null | undefined): Element | null {
  return value instanceof Element ? value : null;
}

export function getEditableOwner(element: EventTarget | Element | null | undefined): HTMLElement | null {
  const target = asElement(element);
  if (!target) return null;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return target;
  }
  const contentEditableAttr = target.getAttribute('contenteditable');
  if (
    target instanceof HTMLElement &&
    (target.isContentEditable || (contentEditableAttr !== null && contentEditableAttr.toLowerCase() !== 'false'))
  ) {
    return target;
  }
  const closest = target.closest(EDITABLE_ELEMENT_SELECTOR);
  return closest instanceof HTMLElement ? closest : null;
}

export function isEditableElement(element: EventTarget | Element | null | undefined): element is HTMLElement {
  return getEditableOwner(element) !== null;
}

export function isEditableElementInContainer(
  element: EventTarget | Element | null | undefined,
  containerSelectors: string,
): boolean {
  const editable = getEditableOwner(element);
  return !!editable?.closest(containerSelectors);
}

export function getTerminalOwner(element: EventTarget | Element | null | undefined): HTMLElement | null {
  const target = asElement(element);
  if (!target) return null;
  const closest = target.closest(TERMINAL_ELEMENT_SELECTOR);
  return closest instanceof HTMLElement ? closest : null;
}

export function isTerminalElement(element: EventTarget | Element | null | undefined): element is HTMLElement {
  return getTerminalOwner(element) !== null;
}

export function isEditableTargetFromEvent(event: Event): boolean {
  return isEditableElement(event.target);
}

export function isTerminalTargetFromEvent(event: Event): boolean {
  return isTerminalElement(event.target);
}

export function isElementWithinSelectors(
  element: EventTarget | Element | null | undefined,
  selectors: string,
): boolean {
  const target = asElement(element);
  return !!target?.closest(selectors);
}

export function getActiveInputContext(options?: {
  activeElement?: EventTarget | Element | null;
  modalNavigationSelectors?: string;
}): InputOwnershipContext {
  const active = asElement(options?.activeElement ?? document.activeElement);
  if (isEditableElement(active)) return 'editable-field';
  if (isTerminalElement(active)) return 'terminal';
  if (options?.modalNavigationSelectors && isElementWithinSelectors(active, options.modalNavigationSelectors)) {
    return 'modal-navigation';
  }
  return 'app-navigation';
}
