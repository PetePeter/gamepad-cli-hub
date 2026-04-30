<script setup lang="ts">
/**
 * SessionList.vue — Owns the full sidebar session list surface.
 *
 * Renders the entire scrollable session-list region. App.vue keeps the lower
 * Quick Spawn and Folder Planner sections outside this component so they stay
 * pinned below the scrolling list.
 */
import SessionGroup from './SessionGroup.vue';
import SessionCard from './SessionCard.vue';

interface SessionListDirectory {
  name: string;
  path: string;
}

interface SessionListGroupSession {
  id: string;
  name: string;
  cliType: string;
  title?: string;
  cliSessionName?: string;
}

type SessionListFocusColumn = 0 | 1 | 2 | 3 | 4;

interface SessionListGroup {
  dirPath: string;
  collapsed: boolean;
  sessions: SessionListGroupSession[];
}

const props = defineProps<{
  hasSessions: boolean;
  groups: SessionListGroup[];
  directories: SessionListDirectory[];
  navIndexMap: Map<string, number>;
  activeFocus: string;
  sessionsFocusIndex: number;
  navList: Array<{ type: string; id: string }>;
  focusColumn: SessionListFocusColumn;
  activeSessionId: string | null;
  editingSessionId: string | null;
  sessionStates: Map<string, string>;
  sessionActivityLevels: Map<string, string>;
  draftCounts: Map<string, number>;
  workingPlanLabels: Map<string, string>;
  workingPlanTooltips: Map<string, string>;
  pendingSchedules: Map<string, string>;
  snappedOutSessions: Set<string>;
  llmNotifications: Map<string, { title: string; content: string }>;
  getCliDisplayName: (cliType: string) => string;
  resolveGroupDisplayName: (dirPath: string, directories: SessionListDirectory[]) => string;
  isSessionHiddenFromOverview: (session: SessionListGroupSession) => boolean;
  sessionElapsedText: (sessionId: string) => string;
}>();

const emit = defineEmits<{
  showGlobalOverview: [];
  toggleGroupCollapse: [dirPath: string];
  showOverview: [dirPath: string];
  sessionClick: [sessionId: string];
  sessionRename: [sessionId: string];
  commitRename: [sessionId: string, newName: string];
  cancelRename: [];
  requestClose: [sessionId: string, displayName: string];
  sessionStateChange: [sessionId: string, newState: string];
  toggleOverview: [sessionId: string];
  cancelSchedule: [sessionId: string];
  dismissNotification: [sessionId: string];
}>();

function onCommitRename(sessionId: string, newName: string): void {
  emit('commitRename', sessionId, newName);
}

function onRequestClose(sessionId: string, displayName: string): void {
  emit('requestClose', sessionId, displayName);
}

function onSessionStateChange(sessionId: string, newState: string): void {
  emit('sessionStateChange', sessionId, newState);
}
</script>

<template>
  <div class="sessions-list-shell">
    <button
      v-if="hasSessions"
      class="overview-nav-button"
      :class="{ focused: activeFocus === 'sessions' && navList[sessionsFocusIndex]?.type === 'overview-button' }"
      title="Overview — all sessions"
      @click="emit('showGlobalOverview')"
    >
      Overview
    </button>

    <div class="sessions-list" id="sessionsList">
      <template v-for="group in groups" :key="group.dirPath">
        <template v-if="group.sessions.length > 0">
          <SessionGroup
            :group="{
              dirPath: group.dirPath,
              displayName: resolveGroupDisplayName(group.dirPath, directories),
              collapsed: group.collapsed,
              sessionCount: group.sessions.length,
            }"
            :nav-index="navIndexMap.get(group.dirPath) ?? -1"
            :is-focused="activeFocus === 'sessions'
              && navList[sessionsFocusIndex]?.type === 'group-header'
              && navList[sessionsFocusIndex]?.id === group.dirPath"
            @toggle-collapse="emit('toggleGroupCollapse', $event)"
            @show-overview="emit('showOverview', $event)"
          />

          <template v-if="!group.collapsed">
            <SessionCard
              v-for="session in group.sessions"
              :key="session.id"
              :session="{ id: session.id, name: session.name, cliType: session.cliType, title: session.title, cliSessionName: session.cliSessionName }"
              :nav-index="navIndexMap.get(session.id) ?? -1"
              :session-state="sessionStates.get(session.id) || 'idle'"
              :activity-level="sessionActivityLevels.get(session.id) || 'idle'"
              :display-name="session.name !== session.cliType ? session.name : getCliDisplayName(session.cliType)"
              :draft-count="draftCounts.get(session.id) ?? 0"
              :elapsed-text="sessionElapsedText(session.id)"
              :working-plan-label="workingPlanLabels.get(session.id) || ''"
              :working-plan-tooltip="workingPlanTooltips.get(session.id) || ''"
              :is-active="activeSessionId === session.id"
              :is-focused="activeFocus === 'sessions'
                && navList[sessionsFocusIndex]?.type === 'session-card'
                && navList[sessionsFocusIndex]?.id === session.id"
              :focus-column="focusColumn"
              :is-editing="editingSessionId === session.id"
              :is-hidden-from-overview="isSessionHiddenFromOverview(session)"
              :scheduled-at="pendingSchedules.get(session.id) ?? null"
              :is-snapped-out="snappedOutSessions.has(session.id)"
              :llm-notification="llmNotifications.get(session.id) ?? null"
              @click="emit('sessionClick', $event)"
              @rename="emit('sessionRename', $event)"
              @commit-rename="onCommitRename"
              @cancel-rename="emit('cancelRename')"
              @close="onRequestClose"
              @state-change="onSessionStateChange"
              @toggle-overview="emit('toggleOverview', $event)"
              @cancel-schedule="emit('cancelSchedule', $event)"
              @dismiss-notification="emit('dismissNotification', $event)"
            />
          </template>
        </template>
      </template>

      <div v-if="!hasSessions" class="sessions-empty">
        No active sessions
      </div>
    </div>
  </div>
</template>
