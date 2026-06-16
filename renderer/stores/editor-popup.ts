import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useEditorPopupStore = defineStore('editorPopup', () => {
  const visible = ref(false);
  const initialText = ref('');
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
  ): Promise<void> {
    if (visible.value) return Promise.resolve();
    initialText.value = nextInitialText;
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
    selectNodeId.value = null;
    onSend = null;
    const resolve = resolveOpen;
    resolveOpen = null;
    resolve?.();
  }

  return {
    visible,
    initialText,
    selectNodeId,
    setVisible,
    open,
    handleSend,
    handleClose,
  };
});
