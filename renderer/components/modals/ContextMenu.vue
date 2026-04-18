<script setup lang="ts">
/**
 * Context menu overlay — Copy/Paste/Editor/New Session/etc.
 *
 * Items are conditionally enabled based on selection state and session state.
 * Gamepad D-pad up/down navigates (skipping disabled items), A executes, B cancels.
 */
import { ref, watch, computed } from 'vue';
import { useModalStack } from '../../composables/useModalStack.js';
import { toDirection } from '../../utils.js';

interface MenuItem {
  id: string;
  label: string;
  enabled: boolean;
}

const MODAL_ID = 'context-menu';

const props = defineProps<{
  visible: boolean;
  hasSelection: boolean;
  hasActiveSession: boolean;
  hasSequences: boolean;
  hasDrafts: boolean;
  mode: 'mouse' | 'gamepad';
  mouseX?: number;
  mouseY?: number;
}>();

const emit = defineEmits<{
  (e: 'action', action: string): void;
  (e: 'cancel'): void;
  (e: 'update:visible', value: boolean): void;
}>();

const selectedIndex = ref(0);
const modalStack = useModalStack();

const menuItems = computed<MenuItem[]>(() => [
  { id: 'copy', label: '📋 Copy', enabled: props.hasSelection },
  { id: 'paste', label: '📎 Paste', enabled: props.hasActiveSession },
  { id: 'editor', label: '📝 Compose in Editor', enabled: props.hasActiveSession },
  { id: 'new-session', label: '🆕 New Session', enabled: true },
  { id: 'new-session-with-selection', label: '📌 New Session with Selection', enabled: props.hasSelection },
  { id: 'sequences', label: '⚡ Sequences…', enabled: props.hasSequences },
  { id: 'drafts', label: '📝 Drafts…', enabled: props.hasDrafts },
  { id: 'cancel', label: '✖ Cancel', enabled: true },
]);

const enabledIndices = computed(() =>
  menuItems.value.map((item, i) => item.enabled ? i : -1).filter(i => i >= 0),
);

watch(() => props.visible, (v) => {
  if (v) {
    // Select first enabled item
    selectedIndex.value = enabledIndices.value[0] ?? 0;
    modalStack.push({ id: MODAL_ID, handler: handleButton });
  } else {
    modalStack.pop(MODAL_ID);
  }
}, { immediate: true });

function findNextEnabled(fromIndex: number, direction: 1 | -1): number {
  const indices = enabledIndices.value;
  if (indices.length === 0) return fromIndex;
  const currentPos = indices.indexOf(fromIndex);
  if (currentPos < 0) return indices[0];
  const nextPos = (currentPos + direction + indices.length) % indices.length;
  return indices[nextPos];
}

function handleButton(button: string): boolean {
  const dir = toDirection(button);
  if (dir === 'up') {
    selectedIndex.value = findNextEnabled(selectedIndex.value, -1);
    return true;
  }
  if (dir === 'down') {
    selectedIndex.value = findNextEnabled(selectedIndex.value, 1);
    return true;
  }
  if (button === 'A') {
    executeItem(selectedIndex.value);
    return true;
  }
  if (button === 'B') {
    emit('cancel');
    emit('update:visible', false);
    return true;
  }
  return true;
}

function executeItem(index: number): void {
  const item = menuItems.value[index];
  if (!item || !item.enabled) return;
  if (item.id === 'cancel') {
    emit('cancel');
  } else {
    emit('action', item.id);
  }
  emit('update:visible', false);
}

const menuStyle = computed(() => {
  if (props.mode === 'mouse' && props.mouseX !== undefined && props.mouseY !== undefined) {
    return { left: `${props.mouseX}px`, top: `${props.mouseY}px`, position: 'fixed' as const };
  }
  return {};
});

defineExpose({ handleButton });
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="modal-overlay modal--visible"
      role="menu"
      aria-label="Terminal context menu"
    >
      <div class="context-menu" :style="menuStyle">
        <div
          v-for="(item, i) in menuItems"
          :key="item.id"
          class="context-menu-item"
          :class="{
            'context-menu-item--selected': i === selectedIndex,
            'context-menu-item--disabled': !item.enabled,
          }"
          :data-action="item.id"
          @click="item.enabled && executeItem(i)"
        >
          {{ item.label }}
        </div>
      </div>
    </div>
  </Teleport>
</template>
