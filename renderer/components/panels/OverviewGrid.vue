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

export interface OverviewGridSection {
  id: string;
  label: string;
  sessions: OverviewGridSession[];
}

const props = defineProps<{
  sections: OverviewGridSection[];
  focusIndex: number;
  collapsedIds: Set<string>;
  activeSessionId: string | null;
  groupLabel: string;
  showSectionMarks?: boolean;
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

const annotatedSections = computed(() => {
  let offset = 0;
  return props.sections.map((section) => {
    const sessions = section.sessions.map((session, index) => ({
      ...session,
      flatIndex: offset + index,
    }));
    offset += section.sessions.length;
    return {
      ...section,
      sessions,
    };
  });
});

const totalSessions = computed(() =>
  props.sections.reduce((sum, section) => sum + section.sessions.length, 0),
);
</script>

<template>
  <div class="overview-grid-container">
    <div class="overview-grid-header">
      <span class="overview-grid-title">{{ groupLabel }}</span>
      <span class="overview-grid-count">{{ totalSessions }} session{{ totalSessions !== 1 ? 's' : '' }}</span>
    </div>

    <div class="overview-grid">
      <template v-for="(section, sectionIndex) in annotatedSections" :key="section.id">
        <div v-if="showSectionMarks && sectionIndex > 0" class="overview-break-mark">
          {{ section.label }}
        </div>
        <OverviewCard
          v-for="session in section.sessions"
          :key="session.id"
          :session="session"
          :activityLevel="session.activityLevel"
          :sessionState="session.sessionState"
          :previewLines="session.previewLines"
          :isFocused="focusIndex === session.flatIndex"
          :isCollapsed="collapsedIds.has(session.id)"
          :isActive="session.id === activeSessionId"
          @select="emit('select', $event)"
          @toggleCollapse="emit('toggleCollapse', $event)"
        />
      </template>
    </div>
  </div>
</template>
