<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: string;
  placeholder?: string;
  ariaLabel?: string;
}>(), {
  placeholder: 'Search',
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
}>();

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value);
}
</script>

<template>
  <label class="search-field">
    <span class="search-field__icon" aria-hidden="true">⌕</span>
    <input
      type="search"
      :value="modelValue"
      :placeholder="props.placeholder"
      :aria-label="props.ariaLabel || props.placeholder"
      @input="onInput"
    />
  </label>
</template>

<style scoped>
.search-field {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-width: 0;
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.search-field:focus-within {
  border-color: var(--accent);
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent);
}

.search-field__icon {
  flex: 0 0 auto;
  color: var(--text-secondary);
}

.search-field input {
  min-width: 0;
  width: 100%;
  padding: 0;
  background: transparent;
  border: 0;
  color: var(--text-primary);
}

.search-field input:focus {
  outline: none;
}
</style>
