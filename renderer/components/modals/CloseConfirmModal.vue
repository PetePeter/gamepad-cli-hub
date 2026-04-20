<script setup lang="ts">
/**
 * Close session confirmation modal.
 *
 * Shows session name + optional draft warning. Two buttons: Cancel / Close.
 * Gamepad D-pad left/right toggles selection, A confirms, B cancels.
 */
import { ref, watch, computed } from 'vue';
import { useModalStack } from '../../composables/useModalStack.js';
import { toDirection } from '../../utils.js';

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

const selectedIndex = ref(0); // 0 = Cancel, 1 = Close
const modalStack = useModalStack();

const hasDrafts = computed(() => (props.draftCount ?? 0) > 0);

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
  if (dir === 'left' || dir === 'right') {
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
  return true; // swallow all input while visible
}

function onCancel(): void {
  emit('cancel');
  emit('update:visible', false);
}

function onClose(): void {
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
      aria-label="Close session confirmation"
    >
      <div class="modal close-confirm-modal">
        <div class="modal-header">
          <h3 class="modal-title">Close Session</h3>
        </div>
        <div id="closeConfirmBody">
          <div>Close session <strong>{{ sessionName }}</strong>?</div>
          <div v-if="hasDrafts" class="draft-warning">
            ⚠ {{ draftCount }} unsent draft{{ draftCount === 1 ? '' : 's' }} will be deleted
          </div>
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
            @click="onClose"
          >Close</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
