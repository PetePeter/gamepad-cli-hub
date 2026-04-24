<script setup lang="ts">
/**
 * BindingsTab.vue — Per-CLI binding list + sort control + CRUD actions.
 *
 * Replaces renderBindingsDisplay() + renderSequenceGroups() in settings-bindings.ts.
 * Binding data is passed as props; mutations emitted as events.
 */

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
</script>

<template>
  <div class="settings-bindings-panel">
    <div class="settings-panel__header">
      <span class="settings-panel__title">{{ cliLabel }} Bindings</span>
      <div class="settings-bindings-toolbar">
        <select
          class="btn btn--primary btn--sm focusable"
          :disabled="addableButtons.length === 0"
          @change="onAddBinding"
        >
          <option value="">
            {{ addableButtons.length > 0 ? '+ Add Binding' : 'All buttons mapped' }}
          </option>
          <option v-for="button in addableButtons" :key="button" :value="button">
            {{ button }}
          </option>
        </select>
        <select
          v-if="copySourceOptions.length > 0"
          class="btn btn--secondary btn--sm focusable"
          @change="onCopyFrom"
        >
          <option value="">Copy from…</option>
          <option v-for="option in copySourceOptions" :key="option.id" :value="option.id">
            {{ option.label }}
          </option>
        </select>
      </div>
    </div>

    <div class="settings-bindings-sort">
      <label class="settings-bindings-sort__label" for="bindingsSortField">Sort</label>
      <select
        id="bindingsSortField"
        class="btn btn--secondary btn--sm focusable"
        :value="sortField"
        @change="onSortFieldChange"
      >
        <option value="button">Button</option>
        <option value="action">Action</option>
      </select>
      <button class="btn btn--secondary btn--sm focusable" @click="onToggleDirection">
        {{ sortDirection === 'asc' ? 'Ascending ↑' : 'Descending ↓' }}
      </button>
    </div>

    <div class="bindings-list">
      <div
        v-for="binding in bindings"
        :key="binding.button"
        class="binding-card"
      >
        <div class="binding-header">
          <span class="binding-button">{{ binding.button }}</span>
          <span class="binding-action">{{ binding.action }}</span>
        </div>
        <div class="binding-label">{{ binding.label }}</div>
        <div class="binding-detail">{{ binding.detail }}</div>
        <div class="binding-actions">
          <button class="focusable" @click="emit('editBinding', binding.button)">Edit</button>
          <button class="focusable danger" @click="emit('deleteBinding', binding.button)">Delete</button>
        </div>
      </div>
    </div>

    <div v-if="bindings.length === 0" class="bindings-empty">
      No bindings configured for {{ cliLabel }}.
    </div>

    <!-- Sequence groups -->
    <div v-for="group in sequenceGroups" :key="group.name" class="sequence-group">
      <h4>{{ group.name }}</h4>
      <div v-for="item in group.items" :key="item.label" class="sequence-item">
        <span class="sequence-label">{{ item.label }}</span>
        <code class="sequence-value">{{ item.sequence }}</code>
      </div>
    </div>
  </div>
</template>
