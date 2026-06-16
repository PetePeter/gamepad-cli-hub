/**
 * Editor popup API — backwards-compatible entrypoints backed by the Vue store.
 */
import { useEditorPopupStore } from '../stores/editor-popup.js';
export { addEditorHistoryEntry, getEditorHistoryPreview, loadEditorHistory } from './editor-history.js';

export function showEditorPopup(
  onSend?: (text: string) => void,
  initialText = '',
  selectNodeId: string | null = null,
  hasPrefill = false,
): Promise<void> {
  return useEditorPopupStore().open(onSend, initialText, selectNodeId, hasPrefill);
}

export function hideEditorPopup(): void {
  const store = useEditorPopupStore();
  if (!store.visible) return;
  store.handleClose();
}

export function isEditorPopupVisible(): boolean {
  return useEditorPopupStore().visible;
}
