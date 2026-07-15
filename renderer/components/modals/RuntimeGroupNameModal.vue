<script setup lang="ts">
/**
 * RuntimeGroupNameModal — single text-input dialog for creating or renaming a
 * runtime session group.
 *
 * Keyboard: typing goes to the input naturally; Enter submits, Escape cancels
 * (handled both by the input keydown and the modal-stack gamepad bridge so the
 * gamepad A/B buttons work too).
 */
import { nextTick, ref, watch, computed } from 'vue';
import { FORM_KEYS, useModalStack } from '../../composables/useModalStack.js';

const MODAL_ID = 'runtime-group-name';

const props = defineProps<{
  visible: boolean;
  mode: 'create' | 'rename';
  initialName?: string;
}>();

const emit = defineEmits<{
  (e: 'submit', name: string): void;
  (e: 'cancel'): void;
  (e: 'update:visible', value: boolean): void;
}>();

const name = ref('');
const inputRef = ref<HTMLInputElement | null>(null);
const modalStack = useModalStack();

const title = computed(() => (props.mode === 'rename' ? 'Rename runtime group' : 'New runtime group'));
const okLabel = computed(() => (props.mode === 'rename' ? 'Save' : 'Create'));

watch(() => props.visible, async (v) => {
  if (v) {
    name.value = props.initialName ?? '';
    modalStack.push({ id: MODAL_ID, handler: handleButton, interceptKeys: new Set([...FORM_KEYS, 'enter']) });
    await nextTick();
    inputRef.value?.focus();
    inputRef.value?.select();
  } else {
    modalStack.pop(MODAL_ID);
  }
}, { immediate: true });

function handleButton(button: string): boolean {
  if (button === 'B') {
    onCancel();
    return true;
  }
  if (button === 'A') {
    onSubmit();
    return true;
  }
  return true; // swallow other input while open
}

function onSubmit(): void {
  const trimmed = name.value.trim();
  if (!trimmed) return;
  emit('submit', trimmed);
  emit('update:visible', false);
}

function onCancel(): void {
  emit('cancel');
  emit('update:visible', false);
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    onSubmit();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    onCancel();
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
      aria-label="Runtime group name"
    >
      <div class="modal runtime-group-name-modal">
        <div class="modal-header">
          <h3 class="modal-title">{{ title }}</h3>
        </div>
        <div class="modal-body">
          <input
            ref="inputRef"
            v-model="name"
            type="text"
            class="form-input"
            maxlength="60"
            placeholder="e.g. Auth refactor sweep"
            @keydown="onKeydown"
          />
        </div>
        <div class="modal-footer">
          <button class="btn" @click="onCancel">Cancel</button>
          <button class="btn btn--primary" :disabled="!name.trim()" @click="onSubmit">{{ okLabel }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.runtime-group-name-modal {
  width: 420px;
  max-width: 92vw;
}
.runtime-group-name-modal .form-input {
  width: 100%;
}
</style>
