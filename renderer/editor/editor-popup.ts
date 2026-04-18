/**
 * Editor popup bridge — thin wrapper over the Vue modal.
 *
 * Legacy callers use showEditorPopup(onSend?, initialText?).
 * The Vue component (EditorPopup.vue) reads bridge state from modal-bridge.ts.
 */
import {
  editorPopup,
  setEditorPopupCallbacks,
  getEditorPopupResolve,
} from '../stores/modal-bridge.js';
export { addEditorHistoryEntry, getEditorHistoryPreview, loadEditorHistory } from './editor-history.js';

export function showEditorPopup(
  onSend?: (text: string) => void,
  initialText = '',
): Promise<void> {
  if (editorPopup.visible) return Promise.resolve();
  editorPopup.initialText = initialText;
  return new Promise<void>((resolve) => {
    setEditorPopupCallbacks(onSend ?? null, resolve);
    editorPopup.visible = true;
  });
}

export function hideEditorPopup(): void {
  if (!editorPopup.visible) return;
  editorPopup.visible = false;
  const resolve = getEditorPopupResolve();
  setEditorPopupCallbacks(null, null);
  resolve?.();
}

export function isEditorPopupVisible(): boolean {
  return editorPopup.visible;
}
