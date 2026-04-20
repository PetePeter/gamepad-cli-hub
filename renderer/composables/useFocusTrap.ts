import type { Ref } from 'vue';

const FOCUSABLE_SELECTOR = 'input, select, textarea, button, [tabindex]:not([tabindex="-1"])';

type ContainerSource = Ref<HTMLElement | null> | string;

function resolveContainer(container: ContainerSource): HTMLElement | null {
  if (typeof container === 'string') {
    return document.querySelector(container);
  }
  return container.value;
}

export function useFocusTrap(container: ContainerSource) {
  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;

    const root = resolveContainer(container);
    if (!root) return;

    const focusable = Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)) as HTMLElement[];
    if (focusable.length === 0) return;

    event.preventDefault();
    event.stopPropagation();

    const active = document.activeElement as HTMLElement | null;
    const index = active ? focusable.indexOf(active) : -1;
    const nextIndex = event.shiftKey
      ? (index <= 0 ? focusable.length - 1 : index - 1)
      : (index >= focusable.length - 1 ? 0 : index + 1);

    focusable[nextIndex]?.focus();
  }

  return { onKeydown };
}
