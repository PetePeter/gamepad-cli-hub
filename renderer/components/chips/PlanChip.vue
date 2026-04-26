<script setup lang="ts">
import { computed } from 'vue';
import { getDisplayTitle } from '../../types.js';

const props = defineProps<{
  title: string;
  type?: 'bug' | 'feature' | 'research';
  status: 'startable' | 'doing' | 'wait-tests' | 'blocked' | 'question';
}>();

const emit = defineEmits<{
  click: [];
}>();

const STATUS_ICONS: Record<typeof props.status, string> = {
  startable: '🔵',
  doing: '🟢',
  'wait-tests': '⏳',
  blocked: '⛔',
  question: '❓',
};

const displayTitle = computed(() => {
  const titleWithPrefix = getDisplayTitle(props.title, props.type);
  return truncateTitle(titleWithPrefix);
});

function truncateTitle(title: string): string {
  return title.length > 20 ? `${title.slice(0, 20)}…` : title;
}
</script>

<template>
  <button
    type="button"
    class="plan-chip"
    :class="`plan-chip--${status}`"
    :title="title"
    @click="emit('click')"
  >
    <span>{{ STATUS_ICONS[status] }}</span>
    <span>{{ displayTitle }}</span>
  </button>
</template>
