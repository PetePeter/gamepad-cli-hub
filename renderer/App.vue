<script setup lang="ts">
/**
 * App.vue — Root Vue component for Helm.
 *
 * Owns the full layout: sidebar (left) + main area (right) + modals.
 * Composables handle bootstrap, navigation, and gamepad input.
 * Components are presentational — they receive props and emit events.
 */
import { ref, computed, onMounted, onUnmounted, watch, nextTick, reactive } from 'vue';
import { state } from './state.js';
import { sessionsState } from './screens/sessions-state.js';
import { getTerminalManager } from './runtime/terminal-provider.js';
import { getActivityColor } from './state-colors.js';
import { getCliDisplayName, getCliIcon } from './utils.js';
import { processConfigBinding, processConfigRelease, initConfigCache } from './bindings.js';
import { formatElapsed, refreshSessions, doSpawn, switchToSession, doCloseSession,
  bootstrap, teardown, startTimerRefresh, stopTimerRefresh,
  getSortField, getSortDirection, setSortField, setSortDirection,
  setPendingContextText,
} from './composables/useAppBootstrap.js';
import type { SessionSortField, SortDirection } from './sort-logic.js';
import { findNavIndexBySessionId, moveGroupUp, moveGroupDown, toggleCollapse } from './session-groups.js';
import { showOverview } from './screens/group-overview.js';
import { showPlanScreen } from './plans/plan-screen.js';
import { onViewChange, type MainView as ViewName } from './main-view/main-view-manager.js';

// Sidebar components
import StatusStrip from './components/sidebar/StatusStrip.vue';
import SortBar from './components/sidebar/SortBar.vue';
import SessionGroup from './components/sidebar/SessionGroup.vue';
import SessionCard from './components/sidebar/SessionCard.vue';
import SpawnGrid from './components/sidebar/SpawnGrid.vue';
import PlansGrid from './components/sidebar/PlansGrid.vue';
import SettingsPanel from './components/sidebar/SettingsPanel.vue';

// Panel components
import MainView from './components/panels/MainView.vue';

// Modal components
import CloseConfirmModal from './components/modals/CloseConfirmModal.vue';
import PlanDeleteConfirmModal from './components/modals/PlanDeleteConfirmModal.vue';
import SequencePickerModal from './components/modals/SequencePickerModal.vue';
import QuickSpawnModal from './components/modals/QuickSpawnModal.vue';
import ContextMenu from './components/modals/ContextMenu.vue';
import DraftSubmenu from './components/modals/DraftSubmenu.vue';
import DirPickerModal from './components/modals/DirPickerModal.vue';
import FormModal from './components/modals/FormModal.vue';
import BindingEditorModal from './components/modals/BindingEditorModal.vue';

// ============================================================================
// Reactive view state
// ============================================================================

const activeView = ref<'terminal' | 'overview' | 'plan'>('terminal');
const settingsVisible = ref(false);
const settingsTab = ref('profiles');
const terminalContainerRef = ref<HTMLElement | null>(null);

// Modal visibility
const closeConfirmVisible = ref(false);
const closeConfirmSessionName = ref('');
const closeConfirmDraftCount = ref(0);
const closeConfirmSessionId = ref('');

const dirPickerVisible = ref(false);
const dirPickerCliType = ref('');
const dirPickerItems = ref<Array<{ name: string; path: string }>>([]);
const dirPickerPreselected = ref<string | undefined>();

const contextMenuVisible = ref(false);
const contextMenuMode = ref<'mouse' | 'gamepad'>('gamepad');
const contextMenuX = ref(0);
const contextMenuY = ref(0);

const sequencePickerVisible = ref(false);
const sequencePickerItems = ref<Array<{ label: string; sequence: string }>>([]);

const quickSpawnVisible = ref(false);
const quickSpawnPreselected = ref<string | undefined>();

const draftSubmenuVisible = ref(false);
const draftSubmenuItems = ref<Array<{ id: string; label: string; text: string }>>([]);

const formModalVisible = ref(false);
const formModalTitle = ref('');
const formModalFields = ref<any[]>([]);
let formModalResolve: ((values: Record<string, string> | null) => void) | null = null;

const bindingEditorVisible = ref(false);
const bindingEditorButton = ref('');
const bindingEditorCliType = ref('');
const bindingEditorBinding = ref<any>(null);

const planDeleteVisible = ref(false);
const planDeleteTitle = ref('');

// Section collapse
const spawnCollapsed = ref(false);
const plannerCollapsed = ref(false);

// Rename state
const editingSessionId = ref<string | null>(null);

// ============================================================================
// Computed props for components
// ============================================================================

const sortOptions = [
  { value: 'name', label: 'Name' },
  { value: 'cliType', label: 'CLI Type' },
  { value: 'state', label: 'State' },
  { value: 'activity', label: 'Activity' },
];

const settingsTabs = [
  { id: 'profiles', label: 'Profiles' },
  { id: 'bindings', label: 'Bindings' },
  { id: 'tools', label: 'Tools' },
  { id: 'telegram', label: 'Telegram' },
];

const spawnItems = computed(() =>
  sessionsState.cliTypes.map(ct => ({
    cliType: ct,
    icon: getCliIcon(ct),
    displayName: getCliDisplayName(ct),
  })),
);

const plansDirItems = computed(() =>
  sessionsState.directories.map(d => ({
    name: d.name,
    path: d.path,
    startableCount: 0,
    doingCount: 0,
  })),
);

const hasActiveSession = computed(() => {
  const tm = getTerminalManager();
  return !!tm?.getActiveSessionId();
});

const hasSelection = computed(() => {
  const tm = getTerminalManager();
  const view = tm?.getActiveView?.();
  return !!view?.hasSelection();
});

const hasSequences = computed(() => {
  if (!state.activeSessionId) return false;
  const session = state.sessions.find(s => s.id === state.activeSessionId);
  if (!session) return false;
  const seqs = state.cliSequencesCache[session.cliType];
  return !!seqs && Object.keys(seqs).length > 0;
});

const hasDrafts = computed(() => {
  if (!state.activeSessionId) return false;
  return (state.draftCounts.get(state.activeSessionId) ?? 0) > 0;
});

// Per-session computed helpers
function sessionElapsedText(sessionId: string): string {
  // Touch the __tick__ sentinel to re-evaluate reactively
  state.lastOutputTimes.get('__tick__');
  const ts = state.lastOutputTimes.get(sessionId);
  if (ts === undefined) return '';
  return formatElapsed(Date.now() - ts);
}

// ============================================================================
// Navigation & gamepad
// ============================================================================

function handleButton(button: string): void {
  // Sandwich / Guide button — always bring to sessions
  if (button === 'Sandwich' || button === 'Guide') {
    settingsVisible.value = false;
    activeView.value = 'terminal';
    state.currentScreen = 'sessions';
    return;
  }

  // Modal stack — top modal gets input
  if (closeConfirmVisible.value) { /* handled by component */ return; }
  if (planDeleteVisible.value) return;
  if (sequencePickerVisible.value) return;
  if (quickSpawnVisible.value) return;
  if (contextMenuVisible.value) return;
  if (draftSubmenuVisible.value) return;
  if (dirPickerVisible.value) return;
  if (formModalVisible.value) return;
  if (bindingEditorVisible.value) return;

  // Settings screen
  if (settingsVisible.value) {
    if (button === 'B') settingsVisible.value = false;
    return;
  }

  // Config binding fallback
  const tm = getTerminalManager();
  const activeSession = tm?.getActiveSessionId();
  const session = state.sessions.find(s => s.id === activeSession);
  const cliType = session?.cliType;
  if (cliType) {
    processConfigBinding(button, cliType);
  }
}

function handleRelease(button: string): void {
  const tm = getTerminalManager();
  const activeSession = tm?.getActiveSessionId();
  const session = state.sessions.find(s => s.id === activeSession);
  if (session?.cliType) {
    processConfigRelease(button, session.cliType);
  }
}

// ============================================================================
// Session actions
// ============================================================================

function onSessionClick(sessionId: string): void {
  switchToSession(sessionId);
  activeView.value = 'terminal';
}

function onSessionRename(sessionId: string): void {
  editingSessionId.value = sessionId;
}

function onCommitRename(sessionId: string, newName: string): void {
  editingSessionId.value = null;
  const tm = getTerminalManager();
  if (tm) tm.renameSession(sessionId, newName);
  window.gamepadCli?.sessionRename(sessionId, newName);
  void refreshSessions();
}

function onCancelRename(): void {
  editingSessionId.value = null;
}

function onRequestClose(sessionId: string, displayName: string): void {
  closeConfirmSessionId.value = sessionId;
  closeConfirmSessionName.value = displayName;
  closeConfirmDraftCount.value = state.draftCounts.get(sessionId) ?? 0;
  closeConfirmVisible.value = true;
}

function onConfirmClose(): void {
  closeConfirmVisible.value = false;
  doCloseSession(closeConfirmSessionId.value);
}

function onSessionStateChange(sessionId: string, newState: string): void {
  window.gamepadCli?.ptySetState(sessionId, newState);
  state.sessionStates.set(sessionId, newState);
}

// Group actions
function onGroupToggleCollapse(dirPath: string): void {
  sessionsState.groupPrefs.collapsed = toggleCollapse(sessionsState.groupPrefs.collapsed, dirPath);
  void refreshSessions();
  void saveGroupPrefsToBackend();
}

function onGroupMoveUp(dirPath: string): void {
  sessionsState.groupPrefs.order = moveGroupUp(sessionsState.groupPrefs.order, dirPath);
  void refreshSessions();
  void saveGroupPrefsToBackend();
}

function onGroupMoveDown(dirPath: string): void {
  sessionsState.groupPrefs.order = moveGroupDown(sessionsState.groupPrefs.order, dirPath);
  void refreshSessions();
  void saveGroupPrefsToBackend();
}

async function saveGroupPrefsToBackend(): Promise<void> {
  try {
    await window.gamepadCli?.configSetSessionGroupPrefs(sessionsState.groupPrefs);
  } catch { /* ignore */ }
}

function onShowPlans(dirPath: string): void {
  void showPlanScreen(dirPath);
}

function onShowOverview(dirPath: string): void {
  showOverview(dirPath, state.activeSessionId ?? undefined);
}

// Section collapse
async function loadCollapsePrefs(): Promise<void> {
  try {
    const prefs = await window.gamepadCli.configGetCollapsePrefs();
    if (prefs) {
      spawnCollapsed.value = prefs.spawnCollapsed ?? false;
      plannerCollapsed.value = prefs.plannerCollapsed ?? false;
    }
  } catch { /* first run — defaults are fine */ }
}

function toggleSpawnCollapse(): void {
  spawnCollapsed.value = !spawnCollapsed.value;
  window.gamepadCli.configSetCollapsePrefs({
    spawnCollapsed: spawnCollapsed.value,
    plannerCollapsed: plannerCollapsed.value,
  });
}

function togglePlannerCollapse(): void {
  plannerCollapsed.value = !plannerCollapsed.value;
  window.gamepadCli.configSetCollapsePrefs({
    spawnCollapsed: spawnCollapsed.value,
    plannerCollapsed: plannerCollapsed.value,
  });
}

// Spawn
function onSpawn(cliType: string): void {
  const dirs = sessionsState.directories;
  if (dirs && dirs.length > 0) {
    dirPickerCliType.value = cliType;
    dirPickerItems.value = dirs.map(d => ({ name: d.name, path: d.path }));
    dirPickerPreselected.value = undefined;
    dirPickerVisible.value = true;
  } else {
    doSpawn(cliType);
  }
}

function onDirPickerSelect(path: string): void {
  dirPickerVisible.value = false;
  doSpawn(dirPickerCliType.value, path);
}

// Sort
function onSortChange(field: string, direction: 'asc' | 'desc'): void {
  setSortField(field as SessionSortField);
  setSortDirection(direction as SortDirection);
  void refreshSessions();
}

// Context menu
function onContextMenuAction(action: string): void {
  contextMenuVisible.value = false;
  const tm = getTerminalManager();
  switch (action) {
    case 'copy': {
      const view = tm?.getActiveView?.();
      const text = view?.getSelection();
      if (text) navigator.clipboard.writeText(text);
      break;
    }
    case 'paste':
      navigator.clipboard.readText().then(text => {
        if (text && tm) tm.writeToActive(text);
      });
      break;
    case 'new-session':
      onSpawn(state.cliTypes[0] || 'generic-terminal');
      break;
    case 'cancel':
      break;
  }
}

// Settings
function onOpenSettings(): void {
  settingsVisible.value = true;
  state.currentScreen = 'settings';
}

function onCloseSettings(): void {
  settingsVisible.value = false;
  state.currentScreen = 'sessions';
}

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(async () => {
  if (!terminalContainerRef.value) return;

  await bootstrap({
    terminalContainer: terminalContainerRef.value,
    handleButton,
    handleRelease,
    onTerminalSwitch(sessionId) {
      if (sessionId) {
        state.activeSessionId = sessionId;
        activeView.value = 'terminal';
      }
    },
    onTerminalEmpty() {
      state.activeSessionId = null;
    },
    onTerminalTitleChange(sessionId, title) {
      const s = state.sessions.find(s => s.id === sessionId);
      if (s) s.title = title;
    },
  });

  // Wire view-change listener so activeView stays in sync with legacy MainViewManager
  onViewChange((view: ViewName) => {
    activeView.value = view;
  });

  await loadCollapsePrefs();

  // Dismiss splash
  const splash = document.getElementById('splashScreen');
  if (splash) splash.style.display = 'none';
});

onUnmounted(() => {
  teardown();
});
</script>

<template>
    <!-- Left panel: sessions/settings -->
    <div class="panel-left" id="sidePanel">
      <header class="sidebar-header">
        <span class="sidebar-logo">
          <img src="./assets/helm-paper-boat.svg" alt="Helm logo" width="28" height="28">
        </span>
        <span class="sidebar-brand">
          <span class="sidebar-title">Helm</span>
          <span class="sidebar-tagline">steer your fleet of agents</span>
        </span>
        <div class="sidebar-actions">
          <button class="sidebar-btn" title="Open Logs Folder" @click="window.gamepadCli?.openLogsFolder()">🐛</button>
          <button class="sidebar-btn" title="Settings" @click="onOpenSettings">⚙</button>
        </div>
      </header>

      <StatusStrip
        :gamepad-count="state.gamepadCount"
        :active-profile="state.activeProfile"
        :total-sessions="state.sessions.length"
        :active-sessions="state.sessions.filter(s => (state.sessionActivityLevels.get(s.id) ?? 'idle') === 'active').length"
      />

      <!-- Sessions screen -->
      <main class="sidebar-content">
        <section v-show="!settingsVisible" class="screen screen--active">
          <SortBar
            :options="sortOptions"
            :field="getSortField()"
            :direction="getSortDirection()"
            @change="onSortChange"
          />
          <div class="sessions-list" id="sessionsList">
            <template v-for="(group, gi) in sessionsState.groups" :key="group.dirPath">
              <template v-if="group.sessions.length > 0 || (sessionsState.groupPrefs.bookmarked ?? []).includes(group.dirPath)">
              <SessionGroup
                :group="{
                  dirPath: group.dirPath,
                  dirName: group.dirName,
                  collapsed: group.collapsed,
                  sessionCount: group.sessions.length,
                  planBadgeCount: 0,
                }"
                :is-focused="sessionsState.navList[sessionsState.sessionsFocusIndex]?.type === 'group-header'
                  && sessionsState.navList[sessionsState.sessionsFocusIndex]?.id === group.dirPath"
                :card-column="sessionsState.cardColumn"
                @toggle-collapse="onGroupToggleCollapse"
                @move-up="onGroupMoveUp"
                @move-down="onGroupMoveDown"
                @show-plans="onShowPlans"
                @show-overview="onShowOverview"
              />
              <template v-if="!group.collapsed">
                <SessionCard
                  v-for="session in group.sessions"
                  :key="session.id"
                  :session="{ id: session.id, name: session.name, cliType: session.cliType, title: session.title }"
                  :session-state="state.sessionStates.get(session.id) || 'idle'"
                  :activity-level="state.sessionActivityLevels.get(session.id) || 'idle'"
                  :display-name="getCliDisplayName(session.cliType)"
                  :draft-count="state.draftCounts.get(session.id) ?? 0"
                  :last-output-time="state.lastOutputTimes.get(session.id) ?? null"
                  :elapsed-text="sessionElapsedText(session.id)"
                  working-plan-label=""
                  working-plan-tooltip=""
                  :is-active="state.activeSessionId === session.id"
                  :is-focused="sessionsState.navList[sessionsState.sessionsFocusIndex]?.type === 'session-card'
                    && sessionsState.navList[sessionsState.sessionsFocusIndex]?.id === session.id"
                  :card-column="sessionsState.cardColumn"
                  :is-editing="editingSessionId === session.id"
                  :is-hidden-from-overview="false"
                  @click="onSessionClick"
                  @rename="onSessionRename"
                  @commit-rename="onCommitRename"
                  @cancel-rename="onCancelRename"
                  @close="onRequestClose"
                  @state-change="onSessionStateChange"
                />
              </template>
              </template>
            </template>
            <div v-if="state.sessions.length === 0" class="sessions-empty">
              No active sessions
            </div>
          </div>

          <div class="spawn-section" :class="{ 'spawn-section--collapsed': spawnCollapsed }">
            <div class="section-label" @click="toggleSpawnCollapse">
              <span>Quick Spawn</span>
              <button class="section-toggle">{{ spawnCollapsed ? '˄' : '˅' }}</button>
            </div>
            <SpawnGrid
              v-show="!spawnCollapsed"
              :items="spawnItems"
              :focus-index="sessionsState.spawnFocusIndex"
              :is-active="sessionsState.activeFocus === 'spawn'"
              @spawn="onSpawn"
            />
          </div>

          <div class="spawn-section" :class="{ 'spawn-section--collapsed': plannerCollapsed }">
            <div class="section-label" @click="togglePlannerCollapse">
              <span>Folder Planner</span>
              <button class="section-toggle">{{ plannerCollapsed ? '˄' : '˅' }}</button>
            </div>
            <PlansGrid
              v-show="!plannerCollapsed"
              :directories="plansDirItems"
              :focus-index="0"
              :is-active="false"
              @show-plans="onShowPlans"
            />
          </div>
        </section>

        <SettingsPanel
          :visible="settingsVisible"
          :tabs="settingsTabs"
          :active-tab="settingsTab"
          @update:active-tab="settingsTab = $event"
          @close="onCloseSettings"
        />
      </main>
    </div>

    <!-- Resize handle -->
    <div class="panel-splitter" id="panelSplitter"></div>

    <!-- Right panel: terminal / overview / plan -->
    <div class="panel-right" id="mainArea">
      <div class="terminal-container" id="terminalContainer" ref="terminalContainerRef">
        <!-- xterm.js terminals rendered by TerminalManager -->
      </div>
    </div>

    <!-- Modals (teleported to body by each component) -->
    <CloseConfirmModal
      v-model:visible="closeConfirmVisible"
      :session-name="closeConfirmSessionName"
      :draft-count="closeConfirmDraftCount"
      @confirm="onConfirmClose"
      @cancel="closeConfirmVisible = false"
    />

    <PlanDeleteConfirmModal
      v-model:visible="planDeleteVisible"
      :plan-title="planDeleteTitle"
      @confirm="planDeleteVisible = false"
      @cancel="planDeleteVisible = false"
    />

    <SequencePickerModal
      v-model:visible="sequencePickerVisible"
      :items="sequencePickerItems"
      @select="(seq: string) => { sequencePickerVisible = false; getTerminalManager()?.writeToActive(seq); }"
      @cancel="sequencePickerVisible = false"
    />

    <QuickSpawnModal
      v-model:visible="quickSpawnVisible"
      :cli-types="state.cliTypes"
      :preselected-cli-type="quickSpawnPreselected"
      @select="(ct: string) => { quickSpawnVisible = false; onSpawn(ct); }"
      @cancel="quickSpawnVisible = false"
    />

    <ContextMenu
      v-model:visible="contextMenuVisible"
      :has-selection="hasSelection"
      :has-active-session="hasActiveSession"
      :has-sequences="hasSequences"
      :has-drafts="hasDrafts"
      :mode="contextMenuMode"
      :mouse-x="contextMenuX"
      :mouse-y="contextMenuY"
      @action="onContextMenuAction"
      @cancel="contextMenuVisible = false"
    />

    <DraftSubmenu
      v-model:visible="draftSubmenuVisible"
      :drafts="draftSubmenuItems"
      @cancel="draftSubmenuVisible = false"
    />

    <DirPickerModal
      v-model:visible="dirPickerVisible"
      :cli-type="dirPickerCliType"
      :items="dirPickerItems"
      :preselected-path="dirPickerPreselected"
      @select="onDirPickerSelect"
      @cancel="dirPickerVisible = false"
    />

    <FormModal
      v-model:visible="formModalVisible"
      :title="formModalTitle"
      :fields="formModalFields"
      @save="(v: Record<string, string>) => { formModalVisible = false; formModalResolve?.(v); }"
      @cancel="formModalVisible = false; formModalResolve?.(null)"
    />

    <BindingEditorModal
      v-model:visible="bindingEditorVisible"
      :button-name="bindingEditorButton"
      :cli-type="bindingEditorCliType"
      :binding="bindingEditorBinding"
      @save="(b: any) => { bindingEditorVisible = false; }"
      @cancel="bindingEditorVisible = false"
    />
</template>
