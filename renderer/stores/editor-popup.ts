import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useEditorPopupStore = defineStore('editorPopup', () => {
  const visible = ref(false);
  const initialText = ref('');
  /**
   * Whether `initialText` is an explicit prefill (apply flow). When true the
   * editor uses it even if empty, overriding any saved ctrl-g draft.
   */
  const hasPrefill = ref(false);
  /** Template id to pre-select in the editor's management tree (null = none). */
  const selectNodeId = ref<string | null>(null);

  let onSend: ((text: string) => void | Promise<void>) | null = null;
  let resolveOpen: (() => void) | null = null;

  function setVisible(nextVisible: boolean): void {
    visible.value = nextVisible;
  }

  function open(
    nextOnSend?: (text: string) => void | Promise<void>,
    nextInitialText = '',
    nextSelectNodeId: string | null = null,
    nextHasPrefill = false,
  ): Promise<void> {
    if (visible.value) return Promise.resolve();
    initialText.value = nextInitialText;
    hasPrefill.value = nextHasPrefill;
    selectNodeId.value = nextSelectNodeId;
    onSend = nextOnSend ?? null;
    visible.value = true;
    return new Promise<void>((resolve) => {
      resolveOpen = resolve;
    });
  }

  function handleSend(text: string): void {
    void onSend?.(text);
  }

  function handleClose(): void {
    visible.value = false;
    initialText.value = '';
    hasPrefill.value = false;
    selectNodeId.value = null;
    onSend = null;
    const resolve = resolveOpen;
    resolveOpen = null;
    resolve?.();
  }

  return {
    visible,
    initialText,
    hasPrefill,
    selectNodeId,
    setVisible,
    open,
    handleSend,
    handleClose,
  };
});
