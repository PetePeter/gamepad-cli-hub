<script setup lang="ts">
/**
 * Plan delete confirmation modal.
 *
 * Confirms deletion of a plan item. Two buttons: Cancel / Delete.
 * Gamepad D-pad any direction toggles selection, A confirms, B cancels.
 */
import { ref, watch } from 'vue';
import { SELECTION_KEYS, useModalStack } from '../../composables/useModalStack.js';
import { toDirection } from '../../utils.js';

const MODAL_ID = 'plan-delete-confirm';

const props = defineProps<{
  visible: boolean;
  planTitle: string;
}>();

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
  (e: 'update:visible', value: boolean): void;
}>();

const selectedIndex = ref(0); // 0 = Cancel, 1 = Delete
const modalStack = useModalStack();

watch(() => props.visible, (v) => {
  if (v) {
    selectedIndex.value = 0;
    modalStack.push({ id: MODAL_ID, handler: handleButton, interceptKeys: SELECTION_KEYS });
  } else {
    modalStack.pop(MODAL_ID);
  }
}, { immediate: true });

function handleButton(button: string): boolean {
  const dir = toDirection(button);
  if (dir) {
    selectedIndex.value = selectedIndex.value === 0 ? 1 : 0;
    return true;
  }
  if (button === 'Tab' || button === 'ShiftTab') {
    selectedIndex.value = selectedIndex.value === 0 ? 1 : 0;
    return true;
  }
  if (button === 'A') {
    if (selectedIndex.value === 1) {
      emit('confirm');
    } else {
      emit('cancel');
    }
    emit('update:visible', false);
    return true;
  }
  if (button === 'B') {
    emit('cancel');
    emit('update:visible', false);
    return true;
  }
  return true;
}

function onCancel(): void {
  emit('cancel');
  emit('update:visible', false);
}

function onDelete(): void {
  emit('confirm');
  emit('update:visible', false);
}

function suppressActivationKey(e: KeyboardEvent): void {
  if (e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();
  }
}

defineExpose({ handleButton });
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="modal-overlay modal--visible"
      role="dialog"
      aria-label="Delete plan confirmation"
    >
      <div class="modal close-confirm-modal">
        <div class="modal-header">
          <h3 class="modal-title">Delete Plan Item</h3>
        </div>
        <div id="planDeleteConfirmBody">
          <div>Delete plan item <strong>{{ planTitle }}</strong>?</div>
        </div>
        <div class="modal-footer">
          <button
            class="btn"
            :class="{ 'btn--focused': selectedIndex === 0 }"
            tabindex="-1"
            @keydown="suppressActivationKey"
            @click="onCancel"
          >Cancel</button>
          <button
            class="btn btn--danger"
            :class="{ 'btn--focused': selectedIndex === 1 }"
            tabindex="-1"
            @keydown="suppressActivationKey"
            @click="onDelete"
          >Delete</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
