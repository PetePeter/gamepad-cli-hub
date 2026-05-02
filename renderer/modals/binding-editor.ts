/**
 * Binding editor bridge.
 *
 * The actual editor is the Vue-owned BindingEditorModal in App.vue. This
 * module remains as the legacy launcher used by settings-bindings.ts.
 */

import { useModalStack } from '../composables/useModalStack.js';
import { logEvent } from '../utils.js';

export interface BindingEditorState {
  visible: boolean;
  editingBinding: { button: string; cliType: string; binding: any } | null;
  focusIndex: number;
}

export const bindingEditorState: BindingEditorState = {
  visible: false,
  editingBinding: null,
  focusIndex: 0,
};

export function openBindingEditor(button: string, cliType: string, binding: any): void {
  const opener = (window as any).openLegacyBindingEditor;
  if (typeof opener !== 'function') {
    logEvent('Binding editor is not available yet');
    return;
  }

  bindingEditorState.visible = false;
  bindingEditorState.editingBinding = null;
  bindingEditorState.focusIndex = 0;
  opener(button, cliType, binding);
  logEvent(`Editing binding: ${button}`);
}

export function closeBindingEditor(): void {
  bindingEditorState.visible = false;
  bindingEditorState.editingBinding = null;
  bindingEditorState.focusIndex = 0;
}

export function handleBindingEditorButton(button: string): void {
  useModalStack().handleInput(button);
}
