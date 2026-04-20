import { nextTick, type Ref } from 'vue';

type FocusSource = Ref<HTMLElement | null>;

export function useModalAutofocus(rootRef: FocusSource, preferredSelector?: string) {
  async function focusIntoModal(): Promise<void> {
    await nextTick();

    const root = rootRef.value;
    if (!root) return;

    const target = preferredSelector
      ? root.querySelector<HTMLElement>(preferredSelector)
      : null;

    (target ?? root).focus();
  }

  return { focusIntoModal };
}
