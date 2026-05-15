<script setup lang="ts">
/**
 * Plan delete confirmation modal.
 *
 * Confirms deletion of a plan item. Two buttons: Cancel / Delete.
 * Gamepad D-pad any direction toggles selection, A confirms, B cancels.
 */
import { computed, ref } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';

const MODAL_ID = 'plan-delete-confirm';

const props = defineProps<{
  visible: boolean;
  planTitle: string;
  itemKind?: string;
  title?: string;
  message?: string;
  confirmLabel?: string;
}>();

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
  (e: 'update:visible', value: boolean): void;
}>();

const selectedIndex = ref(0);
const dialog = ref<InstanceType<typeof ConfirmDialog> | null>(null);
const buttons = computed(() => [
  { id: 'cancel', label: 'Cancel' },
  { id: 'delete', label: props.confirmLabel ?? 'Delete', variant: 'danger' },
] as const);

function handleButton(button: string): boolean {
  dialog.value?.syncSelectedIndex(selectedIndex.value);
  return dialog.value?.handleButton(button) ?? true;
}

function onAction(action: string): void {
  if (action === 'delete') emit('confirm');
}

defineExpose({ handleButton, selectedIndex });
</script>

<template>
  <ConfirmDialog
    ref="dialog"
    :visible="visible"
    :modal-id="MODAL_ID"
    :title="title ?? 'Delete Plan Item'"
    :aria-label="`${title ?? 'Delete Plan Item'} confirmation`"
    :buttons="buttons"
    v-model:selected-index="selectedIndex"
    cancel-action-id="cancel"
    @action="onAction"
    @cancel="emit('cancel')"
    @update:visible="emit('update:visible', $event)"
  >
    <div id="planDeleteConfirmBody">
      <div v-if="message">{{ message }}</div>
      <div v-else>Delete {{ itemKind ?? 'plan item' }} <strong>{{ planTitle }}</strong>?</div>
    </div>
  </ConfirmDialog>
</template>
