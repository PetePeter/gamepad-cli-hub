<script setup lang="ts">
/**
 * Sequence picker modal — shows named sequences for user selection.
 *
 * Gamepad D-pad up/down cycles items (wrapping), A selects, B cancels.
 */
import { ref, watch, nextTick } from 'vue';
import { SELECTION_KEYS, useModalStack } from '../../composables/useModalStack.js';
import { toDirection } from '../../utils.js';

interface SequenceItem {
  label: string;
  sequence: string;
}

const MODAL_ID = 'sequence-picker';

const props = defineProps<{
  visible: boolean;
  items: SequenceItem[];
}>();

const emit = defineEmits<{
  (e: 'select', sequence: string): void;
  (e: 'cancel'): void;
  (e: 'update:visible', value: boolean): void;
}>();

const selectedIndex = ref(0);
const listEl = ref<HTMLElement | null>(null);
const modalStack = useModalStack();

watch(() => props.visible, (v) => {
  if (v) {
    selectedIndex.value = 0;
    modalStack.push({ id: MODAL_ID, handler: handleButton, interceptKeys: SELECTION_KEYS });
  } else {
    modalStack.pop(MODAL_ID);
  }
}, { immediate: true });

watch(selectedIndex, () => {
  nextTick(scrollSelectedIntoView);
});

function scrollSelectedIntoView(): void {
  const list = listEl.value;
  if (!list) return;
  const selected = list.querySelector('.context-menu-item--selected');
  selected?.scrollIntoView({ block: 'nearest' });
}

function handleButton(button: string): boolean {
  const dir = toDirection(button);
  if (dir === 'up') {
    selectedIndex.value = (selectedIndex.value - 1 + props.items.length) % props.items.length;
    return true;
  }
  if (dir === 'down') {
    selectedIndex.value = (selectedIndex.value + 1) % props.items.length;
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
  const item = props.items[index];
  if (item) {
    emit('select', item.sequence);
    emit('update:visible', false);
  }
}

defineExpose({ handleButton });
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="modal-overlay modal--visible"
      role="menu"
      aria-label="Sequence picker"
    >
      <div ref="listEl" class="context-menu" id="sequencePicker">
        <div
          v-for="(item, i) in items"
          :key="i"
          class="context-menu-item sequence-picker-item"
          :class="{ 'context-menu-item--selected': i === selectedIndex }"
          @click="selectItem(i)"
        >
          {{ item.label }}
        </div>
      </div>
    </div>
  </Teleport>
</template>
