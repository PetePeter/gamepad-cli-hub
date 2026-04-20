<script setup lang="ts">
/**
 * Draft submenu — two-level: main menu (New Draft + existing drafts) and
 * action picker (Apply/Edit/Delete/Cancel) for a selected draft.
 *
 * Gamepad D-pad up/down navigates, A selects, B goes back or closes.
 */
import { ref, watch, computed } from 'vue';
import { SELECTION_KEYS, useModalStack } from '../../composables/useModalStack.js';
import { toDirection } from '../../utils.js';

interface DraftItem {
  id: string;
  label: string;
  text: string;
}

const MODAL_ID = 'draft-submenu';
const ACTION_MODAL_ID = 'draft-action';

const props = defineProps<{
  visible: boolean;
  drafts: DraftItem[];
}>();

const emit = defineEmits<{
  (e: 'new-draft'): void;
  (e: 'apply', draft: DraftItem): void;
  (e: 'edit', draft: DraftItem): void;
  (e: 'delete', draft: DraftItem): void;
  (e: 'cancel'): void;
  (e: 'update:visible', value: boolean): void;
}>();

const selectedIndex = ref(0);
const actionIndex = ref(0);
const showActions = ref(false);
const activeDraft = ref<DraftItem | null>(null);
const modalStack = useModalStack();

const DRAFT_ACTIONS = ['Apply', 'Edit', 'Delete', 'Cancel'] as const;

// Main menu: "New Draft" + separator + existing drafts
const itemCount = computed(() => 1 + props.drafts.length);

watch(() => props.visible, (v) => {
  if (v) {
    selectedIndex.value = 0;
    showActions.value = false;
    activeDraft.value = null;
    modalStack.push({ id: MODAL_ID, handler: handleSubmenuButton, interceptKeys: SELECTION_KEYS });
  } else {
    modalStack.pop(MODAL_ID);
    modalStack.pop(ACTION_MODAL_ID);
    showActions.value = false;
  }
}, { immediate: true });

function handleSubmenuButton(button: string): boolean {
  const dir = toDirection(button);
  if (dir === 'up') {
    selectedIndex.value = (selectedIndex.value - 1 + itemCount.value) % itemCount.value;
    return true;
  }
  if (dir === 'down') {
    selectedIndex.value = (selectedIndex.value + 1) % itemCount.value;
    return true;
  }
  if (button === 'A') {
    if (selectedIndex.value === 0) {
      emit('new-draft');
      emit('update:visible', false);
    } else {
      const draft = props.drafts[selectedIndex.value - 1];
      if (draft) {
        activeDraft.value = draft;
        actionIndex.value = 0;
        showActions.value = true;
        modalStack.push({ id: ACTION_MODAL_ID, handler: handleActionButton, interceptKeys: SELECTION_KEYS });
      }
    }
    return true;
  }
  if (button === 'B') {
    emit('cancel');
    emit('update:visible', false);
    return true;
  }
  return true;
}

function handleActionButton(button: string): boolean {
  const dir = toDirection(button);
  if (dir === 'up') {
    actionIndex.value = (actionIndex.value - 1 + DRAFT_ACTIONS.length) % DRAFT_ACTIONS.length;
    return true;
  }
  if (dir === 'down') {
    actionIndex.value = (actionIndex.value + 1) % DRAFT_ACTIONS.length;
    return true;
  }
  if (button === 'A') {
    executeDraftAction();
    return true;
  }
  if (button === 'B') {
    showActions.value = false;
    modalStack.pop(ACTION_MODAL_ID);
    return true;
  }
  return true;
}

function executeDraftAction(): void {
  const draft = activeDraft.value;
  if (!draft) return;
  const action = DRAFT_ACTIONS[actionIndex.value];
  switch (action) {
    case 'Apply': emit('apply', draft); break;
    case 'Edit': emit('edit', draft); break;
    case 'Delete': emit('delete', draft); break;
    case 'Cancel': break;
  }
  showActions.value = false;
  modalStack.pop(ACTION_MODAL_ID);
  emit('update:visible', false);
}

function onItemClick(index: number): void {
  selectedIndex.value = index;
  handleSubmenuButton('A');
}

function onActionClick(index: number): void {
  actionIndex.value = index;
  executeDraftAction();
}

defineExpose({ handleSubmenuButton, handleActionButton });
</script>

<template>
  <Teleport to="body">
    <!-- Main submenu -->
    <div
      v-if="visible && !showActions"
      class="modal-overlay modal--visible"
      role="menu"
      aria-label="Draft prompts submenu"
    >
      <div class="context-menu">
        <div
          class="context-menu-item"
          :class="{ 'context-menu-item--selected': selectedIndex === 0 }"
          @click="onItemClick(0)"
        >📝 New Draft</div>
        <div v-if="drafts.length" class="context-menu-separator"></div>
        <div
          v-for="(draft, i) in drafts"
          :key="draft.id"
          class="context-menu-item"
          :class="{ 'context-menu-item--selected': selectedIndex === i + 1 }"
          @click="onItemClick(i + 1)"
        >{{ draft.label || `Draft ${i + 1}` }}</div>
      </div>
    </div>

    <!-- Action picker for selected draft -->
    <div
      v-if="visible && showActions && activeDraft"
      class="modal-overlay modal--visible"
      role="menu"
      aria-label="Draft action picker"
    >
      <div class="context-menu">
        <div class="context-menu-header">{{ activeDraft.label }}</div>
        <div
          v-for="(action, i) in DRAFT_ACTIONS"
          :key="action"
          class="context-menu-item"
          :class="{ 'context-menu-item--selected': actionIndex === i }"
          @click="onActionClick(i)"
        >{{ action }}</div>
      </div>
    </div>
  </Teleport>
</template>
