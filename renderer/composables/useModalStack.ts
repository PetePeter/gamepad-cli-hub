/**
 * Modal stack composable — replaces the 11-deep if-chain in navigation.ts.
 *
 * Modals push themselves onto the stack on open and pop on close.
 * Input routing checks the top of the stack: the topmost modal gets all
 * gamepad/keyboard events. When the stack is empty, events flow to the
 * active screen.
 *
 * Module-level singleton — shared across all components that call useModalStack().
 */

import { ref, computed, readonly, type Ref, type DeepReadonly } from 'vue';

export type InterceptKey = 'arrows' | 'tab' | 'enter' | 'escape' | 'space';

export const SELECTION_KEYS = new Set<InterceptKey>(['arrows', 'tab', 'enter', 'escape', 'space']);
export const FORM_KEYS = new Set<InterceptKey>(['escape']);

export interface ModalEntry {
  /** Unique identifier for this modal (e.g. 'close-confirm', 'context-menu') */
  id: string;
  /** Gamepad button handler — returns true if the button was consumed */
  handler: (button: string) => boolean;
  /** Keyboard bridge keys this modal wants App.vue to intercept */
  interceptKeys: Set<InterceptKey>;
}

const stack = ref<ModalEntry[]>([]);

export function useModalStack() {
  /** Push a modal onto the stack. Replaces existing entry with same id. */
  function push(entry: ModalEntry): void {
    stack.value = stack.value.filter(e => e.id !== entry.id);
    stack.value.push(entry);
  }

  /** Pop a modal. If id is given, remove that specific entry; otherwise pop the top. */
  function pop(id?: string): void {
    if (id) {
      stack.value = stack.value.filter(e => e.id !== id);
    } else {
      stack.value = stack.value.slice(0, -1);
    }
  }

  /** Route a button press to the topmost modal. Returns true if consumed. */
  function handleInput(button: string): boolean {
    if (stack.value.length === 0) return false;
    return stack.value[stack.value.length - 1].handler(button);
  }

  /** True when any modal is open */
  const isOpen = computed(() => stack.value.length > 0);

  /** Id of the topmost modal, or null */
  const topId = computed(() =>
    stack.value.length > 0 ? stack.value[stack.value.length - 1].id : null,
  );

  /** Keyboard bridge policy for the topmost modal */
  const topInterceptKeys = computed<Set<InterceptKey>>(() =>
    stack.value.length > 0 ? stack.value[stack.value.length - 1].interceptKeys : new Set(),
  );

  /** Number of modals on the stack */
  const depth = computed(() => stack.value.length);

  /** Check if a specific modal is on the stack */
  function has(id: string): boolean {
    return stack.value.some(e => e.id === id);
  }

  /** Reset the stack (for testing / cleanup) */
  function clear(): void {
    stack.value = [];
  }

  return {
    stack: readonly(stack) as DeepReadonly<Ref<ModalEntry[]>>,
    isOpen,
    topId,
    topInterceptKeys,
    depth,
    push,
    pop,
    has,
    handleInput,
    clear,
  };
}
