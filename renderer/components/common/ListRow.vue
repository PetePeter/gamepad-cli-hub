<script setup lang="ts">
defineProps<{
  selected: boolean;
  unread?: boolean;
}>();

const emit = defineEmits<{
  (event: 'click'): void;
}>();
</script>

<template>
  <button
    type="button"
    class="list-row"
    :class="{ 'list-row--selected': selected, 'list-row--unread': unread }"
    :aria-current="selected ? 'true' : undefined"
    @click="emit('click')"
  >
    <span class="list-row__content">
      <span class="list-row__title"><slot name="title" /></span>
      <span v-if="$slots.meta" class="list-row__meta"><slot name="meta" /></span>
    </span>
  </button>
</template>

<style scoped>
.list-row {
  position: relative;
  display: flex;
  width: 100%;
  min-width: 0;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--bg-secondary);
  border: 0;
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
}

.list-row::before {
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: transparent;
  content: '';
}

.list-row:hover {
  background: var(--bg-hover);
}

.list-row:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent);
}

.list-row--selected {
  background: color-mix(in srgb, var(--accent) 12%, var(--bg-secondary));
}

.list-row--selected::before {
  background: var(--accent);
}

.list-row--selected:hover {
  background: color-mix(in srgb, var(--accent) 20%, var(--bg-hover));
}

.list-row__content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  min-width: 0;
}

.list-row__title {
  overflow: hidden;
  font-size: var(--font-size-md);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-row__meta {
  overflow: hidden;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-row--unread .list-row__title {
  color: var(--accent);
}
</style>
