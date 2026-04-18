<script setup lang="ts">
/**
 * SortBar.vue — Sort field dropdown + direction toggle.
 *
 * Replaces the imperative createSortControl() in sort-control.ts with a
 * reactive Vue component. Dropdown opens on click, closes on outside click
 * or selection.
 */
import { ref, onMounted, onUnmounted } from 'vue';

export interface SortOption {
  value: string;
  label: string;
}

const props = defineProps<{
  options: SortOption[];
  field: string;
  direction: 'asc' | 'desc';
}>();

const emit = defineEmits<{
  change: [field: string, direction: 'asc' | 'desc'];
}>();

const dropdownOpen = ref(false);
const barRef = ref<HTMLElement | null>(null);

function getFieldLabel(field: string): string {
  return props.options.find(o => o.value === field)?.label ?? field;
}

function selectField(value: string): void {
  dropdownOpen.value = false;
  emit('change', value, props.direction);
}

function toggleDirection(): void {
  dropdownOpen.value = false;
  const next = props.direction === 'asc' ? 'desc' : 'asc';
  emit('change', props.field, next);
}

function onOutsideClick(e: MouseEvent): void {
  if (barRef.value && !barRef.value.contains(e.target as Node)) {
    dropdownOpen.value = false;
  }
}

onMounted(() => document.addEventListener('click', onOutsideClick));
onUnmounted(() => document.removeEventListener('click', onOutsideClick));
</script>

<template>
  <div ref="barRef" class="sort-control-bar">
    <span class="sort-control-label">Sort:</span>

    <button
      class="sort-field-btn focusable"
      :title="`Sort by: ${getFieldLabel(field)}`"
      @click.stop="dropdownOpen = !dropdownOpen"
    >
      ▼ {{ getFieldLabel(field) }}
    </button>

    <button
      class="sort-direction-btn focusable"
      :title="direction === 'asc' ? 'Ascending' : 'Descending'"
      @click.stop="toggleDirection"
    >
      {{ direction === 'asc' ? '↑' : '↓' }}
    </button>

    <div v-if="dropdownOpen" class="sort-dropdown">
      <button
        v-for="opt in options"
        :key="opt.value"
        class="sort-dropdown-option"
        :class="{ active: opt.value === field }"
        @click.stop="selectField(opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>
  </div>
</template>
