<script setup lang="ts">
/**
 * Confirmation dialog for dismissing the Ctrl+G editor with unsent content.
 */
import { ref } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';

const MODAL_ID = 'editor-popup-confirm';

defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'keep-editing'): void;
  (e: 'save-discard'): void;
  (e: 'discard'): void;
  (e: 'update:visible', value: boolean): void;
}>();

const selectedIndex = ref(0);
const dialog = ref<InstanceType<typeof ConfirmDialog> | null>(null);
const buttons = [
  { id: 'keep-editing', label: 'Keep Editing', variant: 'primary' },
  { id: 'save-discard', label: 'Save Draft + Discard', variant: 'secondary' },
  { id: 'discard', label: 'Discard', variant: 'ghost' },
] as const;

function handleButton(button: string): boolean {
  dialog.value?.syncSelectedIndex(selectedIndex.value);
  return dialog.value?.handleButton(button) ?? true;
}

function onAction(action: string): void {
  if (action === 'save-discard') emit('save-discard');
  else if (action === 'discard') emit('discard');
}

defineExpose({ handleButton, selectedIndex });
</script>

<template>
  <ConfirmDialog
    ref="dialog"
    :visible="visible"
    :modal-id="MODAL_ID"
    title="Discard unsent content?"
    aria-label="Discard unsent editor content"
    modal-class="editor-popup-confirm-dialog"
    :buttons="buttons"
    v-model:selected-index="selectedIndex"
    cancel-action-id="keep-editing"
    @action="onAction"
    @cancel="emit('keep-editing')"
    @update:visible="emit('update:visible', $event)"
  >
    <p class="editor-popup-confirm-message">You have unsent changes. What would you like to do?</p>
  </ConfirmDialog>
</template>
