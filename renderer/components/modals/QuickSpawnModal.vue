<script setup lang="ts">
/**
 * Quick spawn CLI type picker modal.
 *
 * Shows a list of available CLI types. Gamepad D-pad up/down navigates
 * (clamped, not wrapping), A selects, B cancels.
 * Keyboard routed via App.vue bridge → useModalStack → handleButton.
 */
import { ref, watch } from 'vue';
import { useModalStack } from '../../composables/useModalStack.js';
import { toDirection, getCliDisplayName } from '../../utils.js';

const MODAL_ID = 'quick-spawn';

const props = defineProps<{
  visible: boolean;
  cliTypes: string[];
  preselectedCliType?: string;
}>();

const emit = defineEmits<{
  (e: 'select', cliType: string): void;
  (e: 'cancel'): void;
  (e: 'update:visible', value: boolean): void;
}>();

const selectedIndex = ref(0);
const modalStack = useModalStack();

watch(() => props.visible, (v) => {
  if (v) {
    // Pre-select matching CLI type if given
    const preIdx = props.preselectedCliType
      ? props.cliTypes.indexOf(props.preselectedCliType)
      : -1;
    selectedIndex.value = preIdx >= 0 ? preIdx : 0;
    modalStack.push({ id: MODAL_ID, handler: handleButton });
  } else {
    modalStack.pop(MODAL_ID);
  }
}, { immediate: true });

function handleButton(button: string): boolean {
  const dir = toDirection(button);
  if (dir === 'up' || button === 'ShiftTab') {
    selectedIndex.value = Math.max(0, selectedIndex.value - 1);
    return true;
  }
  if (dir === 'down' || button === 'Tab') {
    selectedIndex.value = Math.min(props.cliTypes.length - 1, selectedIndex.value + 1);
    return true;
  }
  if (button === 'A') {
    selectItem(selectedIndex.value);
    return true;
  }
  if (button === 'B') {
    emit('cancel');
    emit('update:visible', false);
    return true;
  }
  return true;
}

function selectItem(index: number): void {
  const cliType = props.cliTypes[index];
  if (cliType) {
    emit('select', cliType);
    emit('update:visible', false);
  }
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
      aria-label="Quick spawn CLI type picker"
    >
      <div class="modal">
        <div class="modal-title">Select CLI type</div>
        <div class="dir-picker-list" id="quickSpawnList">
          <div
            v-for="(cliType, i) in cliTypes"
            :key="cliType"
            class="dir-picker-item focusable"
            :class="{ 'dir-picker-item--focused': i === selectedIndex }"
            tabindex="-1"
            @keydown="suppressActivationKey"
            @click="selectItem(i)"
          >
            <span class="dir-picker-item__name">{{ getCliDisplayName(cliType) }}</span>
            <span class="dir-picker-item__path">{{ cliType }}</span>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" tabindex="-1" @keydown="suppressActivationKey" @click="emit('cancel'); emit('update:visible', false)">Cancel</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
