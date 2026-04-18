<script setup lang="ts">
/**
 * OverviewGrid.vue — Scrollable grid of session preview cards.
 *
 * Replaces group-overview.ts with a reactive template. Shows all sessions
 * in a directory group (or all visible sessions) as preview cards with
 * live PTY output.
 */
import { computed } from 'vue';
import OverviewCard from './OverviewCard.vue';
import type { OverviewSession } from './OverviewCard.vue';

export interface OverviewGridSession extends OverviewSession {
  activityLevel: string;
  sessionState: string;
  previewLines: string[];
}

const props = defineProps<{
  sessions: OverviewGridSession[];
  focusIndex: number;
  collapsedIds: Set<string>;
  activeSessionId: string | null;
  groupLabel: string;
}>();

const emit = defineEmits<{
  select: [sessionId: string];
  toggleCollapse: [sessionId: string];
  close: [];
}>();

function handleButton(button: string): boolean {
  switch (button) {
    case 'B':
      emit('close');
      return true;
    default:
      return false;
  }
}

defineExpose({ handleButton });
</script>

<template>
  <div class="overview-grid-container">
    <div class="overview-grid-header">
      <span class="overview-grid-title">{{ groupLabel }}</span>
      <span class="overview-grid-count">{{ sessions.length }} session{{ sessions.length !== 1 ? 's' : '' }}</span>
    </div>

    <div class="overview-grid">
      <OverviewCard
        v-for="(session, i) in sessions"
        :key="session.id"
        :session="session"
        :activityLevel="session.activityLevel"
        :sessionState="session.sessionState"
        :previewLines="session.previewLines"
        :isFocused="focusIndex === i"
        :isCollapsed="collapsedIds.has(session.id)"
        :isActive="session.id === activeSessionId"
        @select="emit('select', $event)"
        @toggleCollapse="emit('toggleCollapse', $event)"
      />
    </div>
  </div>
</template>
