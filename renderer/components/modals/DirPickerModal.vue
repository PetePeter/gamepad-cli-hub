<script setup lang="ts">
/**
 * Directory picker modal — select a working directory to spawn a CLI in.
 *
 * Gamepad D-pad up/down navigates (clamped), A selects, B cancels.
 */
import { ref, watch, nextTick } from 'vue';
import { useModalStack } from '../../composables/useModalStack.js';
import { toDirection, getCliDisplayName } from '../../utils.js';

interface DirItem {
  name: string;
  path: string;
}

const MODAL_ID = 'dir-picker';

const props = defineProps<{
  visible: boolean;
  cliType: string;
  items: DirItem[];
  preselectedPath?: string;
}>();

const emit = defineEmits<{
  (e: 'select', path: string): void;
  (e: 'cancel'): void;
  (e: 'update:visible', value: boolean): void;
}>();

const selectedIndex = ref(0);
const modalStack = useModalStack();

watch(() => props.visible, (v) => {
  if (v) {
    const preIdx = props.preselectedPath
      ? props.items.findIndex(d => d.path === props.preselectedPath)
      : -1;
    selectedIndex.value = preIdx >= 0 ? preIdx : 0;
    modalStack.push({ id: MODAL_ID, handler: handleButton });
  } else {
    modalStack.pop(MODAL_ID);
  }
}, { immediate: true });

function handleButton(button: string): boolean {
  const dir = toDirection(button);
  if (dir === 'up') {
    selectedIndex.value = Math.max(0, selectedIndex.value - 1);
    return true;
  }
  if (dir === 'down') {
    selectedIndex.value = Math.min(props.items.length - 1, selectedIndex.value + 1);
    return true;
  }
  if (button === 'A') {
    selectDir(selectedIndex.value);
    return true;
  }
  if (button === 'B') {
    emit('cancel');
    emit('update:visible', false);
    return true;
  }
  return true;
}

function selectDir(index: number): void {
  const item = props.items[index];
  if (item) {
    emit('select', item.path);
    emit('update:visible', false);
  }
}

defineExpose({ handleButton });
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="modal-overlay modal--visible dir-picker-overlay"
      role="dialog"
      aria-label="Select working directory"
    >
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">{{ getCliDisplayName(cliType) }} — Select Directory</h3>
        </div>
        <div class="dir-picker-list" id="dirPickerList">
          <div
            v-for="(item, i) in items"
            :key="item.path"
            class="dir-picker-item focusable"
            :class="{ 'dir-picker-item--focused': i === selectedIndex }"
            tabindex="0"
            @click="selectDir(i)"
          >
            <span class="dir-picker-item__name">{{ item.name }}</span>
            <span class="dir-picker-item__path">{{ item.path }}</span>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" @click="emit('cancel'); emit('update:visible', false)">Cancel</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
