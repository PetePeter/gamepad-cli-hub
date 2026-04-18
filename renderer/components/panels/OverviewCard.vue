<script setup lang="ts">
/**
 * OverviewCard.vue — Single preview card in the group overview grid.
 *
 * Shows session name, activity dot, state label, and last N lines of
 * ANSI-stripped PTY output in a fixed-height preview area.
 */
import { computed } from 'vue';
import { getActivityColor } from '../../state-colors.js';

export interface OverviewSession {
  id: string;
  name: string;
  cliType: string;
  title?: string;
}

const props = defineProps<{
  session: OverviewSession;
  activityLevel: string;
  sessionState: string;
  previewLines: string[];
  isFocused: boolean;
  isCollapsed: boolean;
  isActive: boolean;
}>();

const emit = defineEmits<{
  select: [sessionId: string];
  toggleCollapse: [sessionId: string];
}>();

const dotColor = computed(() => getActivityColor(props.activityLevel));

const STATE_LABELS: Record<string, string> = {
  implementing: '🔨',
  waiting: '⏳',
  planning: '🧠',
  completed: '🎉',
  idle: '💤',
};

const stateIcon = computed(() => STATE_LABELS[props.sessionState] || '💤');

const subtitle = computed(() => {
  if (props.session.title && props.session.title !== props.session.name) {
    return props.session.title;
  }
  return '';
});
</script>

<template>
  <div
    class="overview-card"
    :class="{
      focused: isFocused,
      'overview-card--collapsed': isCollapsed,
      'overview-card--active': isActive,
    }"
    :data-session-id="session.id"
    @click="emit('select', session.id)"
  >
    <div class="overview-card-header">
      <span class="session-activity-dot" :style="{ background: dotColor }" />
      <span class="overview-card-state">{{ stateIcon }}</span>
      <span class="overview-card-name">{{ session.name }}</span>
      <button
        class="overview-card-collapse"
        @click.stop="emit('toggleCollapse', session.id)"
      >
        {{ isCollapsed ? '▸' : '▾' }}
      </button>
    </div>

    <span v-if="subtitle" class="overview-card-subtitle">{{ subtitle }}</span>

    <div v-if="!isCollapsed" class="overview-card-preview">
      <div
        v-for="(line, i) in previewLines"
        :key="i"
        class="overview-preview-line"
      >
        {{ line }}
      </div>
      <div v-if="previewLines.length === 0" class="overview-preview-empty">
        No output yet
      </div>
    </div>
  </div>
</template>
