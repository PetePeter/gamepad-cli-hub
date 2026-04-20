<script setup lang="ts">
/**
 * Clear done plans confirmation modal.
 *
 * Confirms bulk deletion of completed plan items for a directory.
 * Two buttons: Cancel / Clear. Gamepad D-pad toggles selection, A confirms, B cancels.
 */
import { ref, watch } from 'vue';
import { useModalStack } from '../../composables/useModalStack.js';
import { toDirection } from '../../utils.js';

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

const selectedIndex = ref(0); // 0 = Cancel, 1 = Clear
const modalStack = useModalStack();

watch(() => props.visible, (v) => {
  if (v) {
    selectedIndex.value = 0;
    modalStack.push({ id: MODAL_ID, handler: handleButton });
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

function onClear(): void {
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
      aria-label="Clear completed plans confirmation"
    >
      <div class="modal close-confirm-modal">
        <div class="modal-header">
          <h3 class="modal-title">Clear Completed Plans</h3>
        </div>
        <div id="clearDonePlansBody">
          <div>
            Clear <strong>{{ count }}</strong> completed plan{{ count === 1 ? '' : 's' }}
            in <strong>{{ dirName }}</strong>?
          </div>
          <div class="modal-warning">This cannot be undone.</div>
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
            @click="onClear"
          >Clear</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
