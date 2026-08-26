<script setup lang="ts">
/**
 * OverviewPane — the `overview` view (group preview grid).
 *
 * Preview lines are read straight from the TerminalManager on each evaluation:
 * scrollback is owned by xterm, never mirrored into the shell.
 */
import { computed } from 'vue';
import OverviewGrid from '../panels/OverviewGrid.vue';
import { sessionsState } from '../../screens/sessions-state.js';
import { useAppStore } from '../../stores/app.js';
import { useNavigationStore } from '../../stores/navigation.js';
import { getTerminalManager } from '../../runtime/terminal-provider.js';
import { getVisibleSessions, resolveGroupDisplayName } from '../../session-groups.js';
import { getOverviewSessions } from '../../screens/group-overview.js';
import { useHelmPaneContext } from '../../dock-pane-context.js';

const PREVIEW_LINES = 10;

const pane = useHelmPaneContext();
const sidebar = pane.sidebar;
const state = useAppStore().state;
const navStore = useNavigationStore();

const sections = computed(() => {
  const tm = getTerminalManager();
  const mapSession = (session: typeof state.sessions[number]) => {
    const lines = tm?.getTerminalLines(session.id, PREVIEW_LINES) ?? [];
    // Trim leading blank lines
    let start = 0;
    while (start < lines.length && (lines[start] ?? '').trim() === '') start++;
    const trimmedLines = lines.slice(start);
    // Pad to bottom-align
    const padCount = PREVIEW_LINES - trimmedLines.length;
    const previewLines = [
      ...Array(padCount).fill(' '),
      ...trimmedLines.map(l => l || ' '),
    ];
    return {
      id: session.id,
      name: session.name,
      cliType: session.cliType,
      title: session.title,
      activityLevel: state.sessionActivityLevels.get(session.id) ?? 'idle',
      sessionState: state.sessionStates.get(session.id) ?? 'idle',
      previewLines,
    };
  };

  if (sessionsState.overviewIsGlobal) {
    return sessionsState.groups
      .map((group) => ({
        id: group.dirPath,
        label: resolveGroupDisplayName(group.dirPath, sessionsState.directories, state.projects),
        sessions: getVisibleSessions([group], sessionsState.groupPrefs).map(mapSession),
      }))
      .filter((section) => section.sessions.length > 0);
  }

  return [{
    id: sessionsState.overviewGroup ?? 'current',
    label: sidebar.overviewGroupLabel.value || 'Sessions',
    sessions: getOverviewSessions().map(mapSession),
  }];
});
</script>

<template>
  <OverviewGrid
    :sections="sections"
    :focus-index="sessionsState.overviewFocusIndex"
    :collapsed-ids="sidebar.overviewCollapsedIds.value"
    :active-session-id="state.activeSessionId"
    :group-label="sidebar.overviewGroupLabel.value"
    :show-section-marks="sessionsState.overviewIsGlobal"
    @select="sidebar.onOverviewSelect"
    @toggle-collapse="sidebar.onOverviewToggleCollapse"
    @close="navStore.closeOverview()"
  />
</template>
