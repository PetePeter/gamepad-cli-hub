<script setup lang="ts">
/**
 * Dynamic form modal — renders form fields from a descriptor array.
 *
 * Supports text, select, textarea, and checkbox field types.
 * Browse button integration for directory fields.
 * Gamepad: Escape/B cancels, Enter/Ctrl+Enter saves.
 */
import { ref, watch, computed, nextTick, onUnmounted } from 'vue';
import { useModalStack } from '../../composables/useModalStack.js';

export interface FormField {
  key: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  type?: 'text' | 'select' | 'textarea' | 'checkbox';
  options?: Array<{ label: string; value: string }>;
  browse?: boolean;
}

const MODAL_ID = 'form-modal';

const props = defineProps<{
  visible: boolean;
  title: string;
  fields: FormField[];
}>();

const emit = defineEmits<{
  (e: 'save', values: Record<string, string>): void;
  (e: 'cancel'): void;
  (e: 'update:visible', value: boolean): void;
}>();

const formValues = ref<Record<string, string>>({});
const modalStack = useModalStack();

watch(() => props.visible, (v) => {
  if (v) {
    // Initialize form values from defaults
    const vals: Record<string, string> = {};
    for (const field of props.fields) {
      vals[field.key] = field.defaultValue ?? '';
    }
    formValues.value = vals;
    modalStack.push({ id: MODAL_ID, handler: handleButton });
  } else {
    modalStack.pop(MODAL_ID);
  }
}, { immediate: true });

function handleButton(button: string): boolean {
  if (button === 'B') {
    emit('cancel');
    emit('update:visible', false);
    return true;
  }
  return true; // swallow
}

function onSave(): void {
  emit('save', { ...formValues.value });
  emit('update:visible', false);
}

function onCancel(): void {
  emit('cancel');
  emit('update:visible', false);
}

async function onBrowse(fieldKey: string): Promise<void> {
  const path = await window.gamepadCli?.dialogOpenFolder?.();
  if (path) {
    formValues.value[fieldKey] = path;
    // Also set name field if it exists and is empty
    if (formValues.value['name'] === '' || formValues.value['name'] === undefined) {
      const parts = path.replace(/\\/g, '/').split('/');
      formValues.value['name'] = parts[parts.length - 1] || '';
    }
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
      aria-label="Form"
    >
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">{{ title }}</h3>
        </div>
        <div class="modal-body" id="formModalFields">
          <div v-for="field in fields" :key="field.key" class="binding-editor-field">
            <label :for="`form-${field.key}`">{{ field.label }}</label>

            <!-- Text input -->
            <div v-if="!field.type || field.type === 'text'" class="form-field-row">
              <input
                :id="`form-${field.key}`"
                v-model="formValues[field.key]"
                type="text"
                :placeholder="field.placeholder"
                class="form-input"
              />
              <button v-if="field.browse" class="btn btn--small" @click="onBrowse(field.key)">📁</button>
            </div>

            <!-- Select -->
            <select
              v-else-if="field.type === 'select'"
              :id="`form-${field.key}`"
              v-model="formValues[field.key]"
              class="form-select"
            >
              <option v-for="opt in field.options" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>

            <!-- Textarea -->
            <textarea
              v-else-if="field.type === 'textarea'"
              :id="`form-${field.key}`"
              v-model="formValues[field.key]"
              :placeholder="field.placeholder"
              class="form-textarea"
              rows="4"
            />

            <!-- Checkbox -->
            <label v-else-if="field.type === 'checkbox'" class="form-checkbox">
              <input
                :id="`form-${field.key}`"
                type="checkbox"
                :checked="formValues[field.key] === 'true'"
                @change="formValues[field.key] = ($event.target as HTMLInputElement).checked ? 'true' : 'false'"
              />
              {{ field.label }}
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" @click="onCancel">Cancel</button>
          <button class="btn btn--primary" @click="onSave">Save</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
