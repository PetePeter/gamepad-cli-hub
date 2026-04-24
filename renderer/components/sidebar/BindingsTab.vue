<script setup lang="ts">
import { ref } from 'vue';

export interface BindingEntry {
  button: string;
  action: string;
  label: string;
  detail: string;
}

export interface SequenceGroup {
  name: string;
  items: Array<{ label: string; sequence: string }>;
}

export interface BindingSourceOption {
  id: string;
  label: string;
}

const props = defineProps<{
  bindings: BindingEntry[];
  sequenceGroups: SequenceGroup[];
  cliType: string;
  cliLabel: string;
  addableButtons: string[];
  copySourceOptions: BindingSourceOption[];
  sortField: string;
  sortDirection: 'asc' | 'desc';
}>();

const emit = defineEmits<{
  addBinding: [button: string];
  editBinding: [button: string];
  deleteBinding: [button: string];
  copyFrom: [sourceCli: string];
  sortChange: [field: string, direction: 'asc' | 'desc'];
}>();

const pendingDelete = ref<string | null>(null);
const deleteTimers = new Map<string, ReturnType<typeof setTimeout>>();

function onAddBinding(event: Event): void {
  const target = event.target as HTMLSelectElement;
  if (!target.value) return;
  emit('addBinding', target.value);
  target.value = '';
}

function onCopyFrom(event: Event): void {
  const target = event.target as HTMLSelectElement;
  if (!target.value) return;
  emit('copyFrom', target.value);
  target.value = '';
}

function onSortFieldChange(event: Event): void {
  const target = event.target as HTMLSelectElement;
  emit('sortChange', target.value, props.sortDirection);
}

function onToggleDirection(): void {
  emit('sortChange', props.sortField, props.sortDirection === 'asc' ? 'desc' : 'asc');
}

function onDeleteClick(button: string): void {
  if (pendingDelete.value === button) {
    clearTimer(button);
    pendingDelete.value = null;
    emit('deleteBinding', button);
    return;
  }
  if (pendingDelete.value) clearTimer(pendingDelete.value);
  pendingDelete.value = button;
  const timer = setTimeout(() => {
    pendingDelete.value = null;
    deleteTimers.delete(button);
  }, 3000);
  deleteTimers.set(button, timer);
}

function clearTimer(button: string): void {
  const t = deleteTimers.get(button);
  if (t) { clearTimeout(t); deleteTimers.delete(button); }
}
</script>

<template>
  <div class="settings-bindings-panel">
    <div class="settings-panel__header">
      <span class="settings-panel__title">{{ cliLabel }} Bindings</span>
      <div class="bindings-toolbar">
        <select
          class="btn btn--primary btn--sm focusable"
          :disabled="addableButtons.length === 0"
          @change="onAddBinding"
        >
          <option value="">{{ addableButtons.length > 0 ? '+ Add Binding' : 'All buttons mapped' }}</option>
          <option v-for="button in addableButtons" :key="button" :value="button">{{ button }}</option>
        </select>
        <select
          v-if="copySourceOptions.length > 0"
          class="btn btn--secondary btn--sm focusable"
          @change="onCopyFrom"
        >
          <option value="">Copy from…</option>
          <option v-for="option in copySourceOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
        </select>
        <select
          class="btn btn--secondary btn--sm focusable"
          :value="sortField"
          @change="onSortFieldChange"
        >
          <option value="button">Sort: Button</option>
          <option value="action">Sort: Action</option>
        </select>
        <button class="btn btn--secondary btn--sm focusable" @click="onToggleDirection">
          {{ sortDirection === 'asc' ? '↑' : '↓' }}
        </button>
      </div>
    </div>

    <div v-if="bindings.length === 0" class="settings-empty">
      No bindings configured for {{ cliLabel }}.
    </div>

    <div class="bindings-display">
      <div
        v-for="binding in bindings"
        :key="binding.button"
        class="binding-card focusable"
        style="cursor: pointer"
        tabindex="0"
        @click="emit('editBinding', binding.button)"
        @keydown.enter="emit('editBinding', binding.button)"
      >
        <div class="binding-card__header">
          <span class="binding-card__button">{{ binding.button }}</span>
          <span class="binding-card__action-badge">{{ binding.action }}</span>
          <button
            class="binding-card__delete btn btn--danger btn--sm focusable"
            :title="pendingDelete === binding.button ? 'Click again to confirm' : `Remove ${binding.button}`"
            @click.stop="onDeleteClick(binding.button)"
          >{{ pendingDelete === binding.button ? '?' : '✕' }}</button>
        </div>
        <div v-if="binding.detail" class="binding-card__details">{{ binding.detail }}</div>
      </div>
    </div>

    <template v-if="sequenceGroups.length > 0">
      <div class="settings-panel__header" style="margin-top: 16px">
        <span class="settings-panel__title">Sequence Groups</span>
      </div>
      <div class="bindings-display">
        <div
          v-for="group in sequenceGroups"
          :key="group.name"
          class="binding-card focusable"
          tabindex="0"
        >
          <div class="binding-card__header">
            <span class="binding-card__button">📋 {{ group.name }}</span>
            <span class="binding-card__action-badge">{{ group.items.length }} item{{ group.items.length !== 1 ? 's' : '' }}</span>
          </div>
          <div v-if="group.items.length > 0" class="binding-card__details">
            <div v-for="item in group.items" :key="item.label">• {{ item.label }}</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
