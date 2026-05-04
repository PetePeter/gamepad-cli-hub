<script setup lang="ts">
/**
 * Close session confirmation modal.
 *
 * Shows session name + optional draft warning. Two buttons: Cancel / Close.
 * Gamepad D-pad left/right toggles selection, A confirms, B cancels.
 */
import { ref, computed } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';

const MODAL_ID = 'close-confirm';

const props = defineProps<{
  visible: boolean;
  sessionName: string;
  draftCount?: number;
}>();

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
  (e: 'update:visible', value: boolean): void;
}>();

const hasDrafts = computed(() => (props.draftCount ?? 0) > 0);
const selectedIndex = ref(0);
const buttons = [
  { id: 'cancel', label: 'Cancel' },
  { id: 'close', label: 'Close', variant: 'danger' },
] as const;

function handleButton(button: string): boolean {
  dialog.value?.syncSelectedIndex(selectedIndex.value);
  return dialog.value?.handleButton(button) ?? true;
}

const dialog = ref<InstanceType<typeof ConfirmDialog> | null>(null);

function onAction(action: string): void {
  if (action === 'close') emit('confirm');
}

defineExpose({ handleButton, selectedIndex });
</script>

<template>
  <ConfirmDialog
    ref="dialog"
    :visible="visible"
    :modal-id="MODAL_ID"
    title="Close Session"
    aria-label="Close session confirmation"
    :buttons="buttons"
    v-model:selected-index="selectedIndex"
    cancel-action-id="cancel"
    direction-mode="horizontal"
    @action="onAction"
    @cancel="emit('cancel')"
    @update:visible="emit('update:visible', $event)"
  >
    <div id="closeConfirmBody">
      <div>Close session <strong>{{ sessionName }}</strong>?</div>
      <div v-if="hasDrafts" class="draft-warning">
        ⚠ {{ draftCount }} unsent draft{{ draftCount === 1 ? '' : 's' }} will be deleted
      </div>
    </div>
  </ConfirmDialog>
</template>
