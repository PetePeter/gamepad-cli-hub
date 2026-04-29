<script setup lang="ts">
/**
 * Quick spawn CLI type picker modal.
 *
 * Shows a list of available CLI types. Gamepad D-pad up/down navigates
 * (clamped, not wrapping), A selects, B cancels.
 * Keyboard routed via App.vue bridge → useModalStack → handleButton.
 */
import { ref, watch, nextTick } from 'vue';
import { SELECTION_KEYS, useModalStack } from '../../composables/useModalStack.js';
import { useModalAutofocus } from '../../composables/useModalAutofocus.js';
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
const overlayRef = ref<HTMLElement | null>(null);
const { focusIntoModal } = useModalAutofocus(overlayRef, '.dir-picker-item--focused');

async function focusCurrentItem(): Promise<void> {
  await nextTick();
  const target = overlayRef.value?.querySelector<HTMLElement>(`#quick-spawn-option-${selectedIndex.value}`);
  target?.focus();
}

watch(() => props.visible, (v) => {
  if (v) {
    // Pre-select matching CLI type if given
    const preIdx = props.preselectedCliType
      ? props.cliTypes.indexOf(props.preselectedCliType)
      : -1;
    selectedIndex.value = preIdx >= 0 ? preIdx : 0;
    modalStack.push({ id: MODAL_ID, handler: handleButton, interceptKeys: SELECTION_KEYS });
    void focusIntoModal();
    void focusCurrentItem();
  } else {
    modalStack.pop(MODAL_ID);
  }
}, { immediate: true });

function handleButton(button: string): boolean {
  const dir = toDirection(button);
  if (dir === 'up' || button === 'ShiftTab') {
    selectedIndex.value = Math.max(0, selectedIndex.value - 1);
    void focusCurrentItem();
    return true;
  }
  if (dir === 'down' || button === 'Tab') {
    selectedIndex.value = Math.min(props.cliTypes.length - 1, selectedIndex.value + 1);
    void focusCurrentItem();
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
      ref="overlayRef"
      class="modal-overlay modal--visible"
      role="dialog"
      aria-label="Quick spawn CLI type picker"
      tabindex="-1"
    >
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">Select CLI type</div>
        </div>
        <div
          class="dir-picker-list"
          id="quickSpawnList"
          role="listbox"
          aria-label="CLI types"
          :aria-activedescendant="cliTypes[selectedIndex] ? `quick-spawn-option-${selectedIndex}` : undefined"
        >
          <div
            v-for="(cliType, i) in cliTypes"
            :id="`quick-spawn-option-${i}`"
            :key="cliType"
            class="dir-picker-item focusable"
            :class="{ 'dir-picker-item--focused': i === selectedIndex }"
            tabindex="-1"
            role="option"
            :aria-selected="i === selectedIndex"
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
