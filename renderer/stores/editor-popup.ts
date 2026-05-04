import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useEditorPopupStore = defineStore('editorPopup', () => {
  const visible = ref(false);
  const initialText = ref('');

  let onSend: ((text: string) => void | Promise<void>) | null = null;
  let resolveOpen: (() => void) | null = null;

  function setVisible(nextVisible: boolean): void {
    visible.value = nextVisible;
  }

  function open(nextOnSend?: (text: string) => void | Promise<void>, nextInitialText = ''): Promise<void> {
    if (visible.value) return Promise.resolve();
    initialText.value = nextInitialText;
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
    onSend = null;
    const resolve = resolveOpen;
    resolveOpen = null;
    resolve?.();
  }

  return {
    visible,
    initialText,
    setVisible,
    open,
    handleSend,
    handleClose,
  };
});
