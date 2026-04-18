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

const props = defineProps<{
  bindings: BindingEntry[];
  sequenceGroups: SequenceGroup[];
  cliType: string;
  cliLabel: string;
  sortField: string;
  sortDirection: 'asc' | 'desc';
}>();

const emit = defineEmits<{
  addBinding: [];
  editBinding: [button: string];
  deleteBinding: [button: string];
  copyFrom: [sourceCli: string];
  sortChange: [field: string, direction: 'asc' | 'desc'];
}>();
</script>

<template>
  <div class="settings-bindings-panel">
    <h3>{{ cliLabel }} Bindings</h3>

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
