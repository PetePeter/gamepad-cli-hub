<script setup lang="ts">
/**
 * Clear done plans confirmation modal.
 *
 * Confirms bulk deletion of completed plan items for a directory.
 * Two buttons: Cancel / Clear. Gamepad D-pad toggles selection, A confirms, B cancels.
 */
import { ref } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';

const MODAL_ID = 'clear-done-plans-confirm';

const props = defineProps<{
  visible: boolean;
  count: number;
  dirName: string;
}>();

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
  (e: 'update:visible', value: boolean): void;
}>();

const selectedIndex = ref(0);
const dialog = ref<InstanceType<typeof ConfirmDialog> | null>(null);
const buttons = [
  { id: 'cancel', label: 'Cancel' },
  { id: 'clear', label: 'Clear', variant: 'danger' },
] as const;

function handleButton(button: string): boolean {
  dialog.value?.syncSelectedIndex(selectedIndex.value);
  return dialog.value?.handleButton(button) ?? true;
}

function onAction(action: string): void {
  if (action === 'clear') emit('confirm');
}

defineExpose({ handleButton, selectedIndex });
</script>

<template>
  <ConfirmDialog
    ref="dialog"
    :visible="visible"
    :modal-id="MODAL_ID"
    title="Clear Completed Plans"
    aria-label="Clear completed plans confirmation"
    :buttons="buttons"
    v-model:selected-index="selectedIndex"
    cancel-action-id="cancel"
    @action="onAction"
    @cancel="emit('cancel')"
    @update:visible="emit('update:visible', $event)"
  >
    <div id="clearDonePlansBody">
      <div>
        Clear <strong>{{ count }}</strong> completed plan{{ count === 1 ? '' : 's' }}
        in <strong>{{ dirName }}</strong>?
      </div>
      <div class="modal-warning">This cannot be undone.</div>
    </div>
  </ConfirmDialog>
</template>
