<script setup lang="ts">
withDefaults(defineProps<{
  label: string;
  tone?: 'neutral' | 'accent' | 'info' | 'danger' | 'warning';
  selected?: boolean;
  disabled?: boolean;
}>(), {
  tone: 'neutral',
  selected: false,
  disabled: false,
});
</script>

<template>
  <span
    class="chip"
    :class="[
      `chip--${tone}`,
      { 'chip--selected': selected, 'chip--disabled': disabled },
    ]"
  >{{ label }}</span>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px var(--spacing-sm);
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.2;
  white-space: nowrap;
}

.chip--accent {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  color: var(--accent);
}

.chip--info {
  border-color: color-mix(in srgb, var(--info) 55%, var(--border));
  color: var(--info);
}

.chip--danger {
  border-color: color-mix(in srgb, var(--danger) 55%, var(--border));
  color: var(--danger);
}

.chip--warning {
  border-color: color-mix(in srgb, var(--status-blocked) 55%, var(--border));
  color: var(--status-blocked);
}

.chip--selected {
  background: color-mix(in srgb, var(--accent) 16%, var(--bg-secondary));
}

.chip--disabled {
  opacity: 0.55;
}
</style>
