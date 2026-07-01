<script setup lang="ts">
import { computed } from 'vue';
import { getDisplayTitle } from '../../types.js';

const props = defineProps<{
  humanId?: string;
  title: string;
  type?: 'bug' | 'feature' | 'research';
  status: 'planning' | 'ready' | 'coding' | 'review' | 'blocked' | 'done';
}>();

const emit = defineEmits<{
  click: [];
  copy: [];
}>();

const STATUS_ICONS: Record<typeof props.status, string> = {
  planning: '⚪',
  ready: '🔵',
  coding: '🟢',
  review: '⏳',
  blocked: '⛔',
  done: '✅',
};

const displayTitle = computed(() => {
  const titleWithPrefix = getDisplayTitle(props.title, props.type);
  const withHumanId = props.humanId ? `${props.humanId} ${titleWithPrefix}` : titleWithPrefix;
  return truncateTitle(withHumanId);
});

function truncateTitle(title: string): string {
  return title.length > 20 ? `${title.slice(0, 20)}…` : title;
}

function onKeyActivate(): void {
  emit('click');
}
</script>

<template>
  <div
    class="plan-chip"
    :class="`plan-chip--${status}`"
    role="button"
    tabindex="0"
    :title="humanId ? `${humanId} ${title}` : title"
    @click="emit('click')"
    @keydown.enter.prevent="onKeyActivate"
    @keydown.space.prevent="onKeyActivate"
  >
    <span>{{ STATUS_ICONS[status] }}</span>
    <span class="plan-chip__label">{{ displayTitle }}</span>
    <button
      v-if="humanId"
      type="button"
      class="plan-chip__copy"
      :title="`Copy reference ${humanId}`"
      :aria-label="`Copy reference ${humanId}`"
      @click.stop="emit('copy')"
    >⧉</button>
  </div>
</template>

<style scoped>
.plan-chip__label { overflow: hidden; text-overflow: ellipsis; }
.plan-chip__copy {
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  padding: 0 0 0 2px;
  opacity: 0.55;
  transition: opacity 0.15s;
}
.plan-chip__copy:hover { opacity: 1; }
</style>
