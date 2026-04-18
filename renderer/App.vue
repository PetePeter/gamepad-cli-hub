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
import { loadSettingsScreen, handleSettingsScreenButton } from './screens/settings.js';
import { onViewChange, type MainView as ViewName } from './main-view/main-view-manager.js';
import { useModalStack } from './composables/useModalStack.js';
import {
  closeConfirm, getCloseConfirmCallback,
  contextMenu,
  planDeleteConfirm, getPlanDeleteCallback,
  sequencePicker, getSequencePickerCallback,
  quickSpawn, getQuickSpawnCallback,
  dirPicker,
  draftSubmenu,
  formModal, getFormModalResolve,
  isAnyBridgeModalVisible,
} from './stores/modal-bridge.js';
import { collectSequenceItems } from './modals/context-menu.js';
import { showSequencePicker } from './modals/sequence-picker.js';
import { showQuickSpawn } from './modals/quick-spawn.js';
import { showDraftSubmenu } from './modals/draft-submenu.js';
import { showEditorPopup } from './editor/editor-popup.js';
import { showDraftEditor } from './drafts/draft-editor.js';

// Sidebar components
import StatusStrip from './components/sidebar/StatusStrip.vue';
import SortBar from './components/sidebar/SortBar.vue';
import SessionGroup from './components/sidebar/SessionGroup.vue';
import SessionCard from './components/sidebar/SessionCard.vue';
import SpawnGrid from './components/sidebar/SpawnGrid.vue';
import PlansGrid from './components/sidebar/PlansGrid.vue';

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
const terminalContainerRef = ref<HTMLElement | null>(null);

// Non-modal local state
const bindingEditorVisible = ref(false);
const bindingEditorButton = ref('');
const bindingEditorCliType = ref('');
const bindingEditorBinding = ref<any>(null);

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

  // Modal stack — top modal gets input (Vue modals push/pop themselves)
  const { handleInput } = useModalStack();
  if (handleInput(button)) return;

  // Race guard — bridge state set but Vue component not yet rendered/stacked
  if (isAnyBridgeModalVisible()) return;

  // Binding editor uses local refs (not bridged)
  if (bindingEditorVisible.value) return;

  // Settings screen
  if (settingsVisible.value) {
    if (button === 'B') {
      settingsVisible.value = false;
      state.currentScreen = 'sessions';
    } else {
      handleSettingsScreenButton(button);
    }
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
  closeConfirm.sessionId = sessionId;
  closeConfirm.sessionName = displayName;
  closeConfirm.draftCount = state.draftCounts.get(sessionId) ?? 0;
  closeConfirm.visible = true;
}

function onConfirmClose(): void {
  closeConfirm.visible = false;
  const cb = getCloseConfirmCallback();
  if (cb) {
    cb(closeConfirm.sessionId);
  } else {
    doCloseSession(closeConfirm.sessionId);
  }
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
    dirPicker.cliType = cliType;
    dirPicker.items = dirs.map(d => ({ name: d.name, path: d.path }));
    dirPicker.preselectedPath = undefined;
    dirPicker.visible = true;
  } else {
    doSpawn(cliType);
  }
}

function onDirPickerSelect(path: string): void {
  dirPicker.visible = false;
  doSpawn(dirPicker.cliType, path);
}

// Sort
function onSortChange(field: string, direction: 'asc' | 'desc'): void {
  setSortField(field as SessionSortField);
  setSortDirection(direction as SortDirection);
  void refreshSessions();
}

// Context menu
function onContextMenuAction(action: string): void {
  contextMenu.visible = false;
  const tm = getTerminalManager();
  switch (action) {
    case 'copy': {
      const text = contextMenu.selectedText;
      if (text) navigator.clipboard.writeText(text);
      break;
    }
    case 'paste':
      navigator.clipboard.readText().then(text => {
        if (text && tm) tm.writeToActive(text);
      });
      break;
    case 'editor':
      showEditorPopup().then(text => {
        if (text && tm) tm.writeToActive(text);
      });
      break;
    case 'new-session':
      setPendingContextText(null);
      showQuickSpawn(state.cliTypes, (cliType) => {
        onSpawn(cliType);
      });
      break;
    case 'new-session-with-selection': {
      const selText = contextMenu.selectedText;
      setPendingContextText(selText || null);
      showQuickSpawn(state.cliTypes, (cliType) => {
        onSpawn(cliType);
      });
      break;
    }
    case 'sequences': {
      const items = collectSequenceItems();
      if (items.length > 0) {
        showSequencePicker(items, (seq) => {
          const tm2 = getTerminalManager();
          if (tm2) tm2.writeToActive(seq);
        });
      }
      break;
    }
    case 'drafts':
      void showDraftSubmenu();
      break;
    case 'cancel':
      break;
  }
}

// Settings
function onOpenSettings(): void {
  settingsVisible.value = true;
  state.currentScreen = 'settings';
  void loadSettingsScreen();
}

function onCloseSettings(): void {
  settingsVisible.value = false;
  state.currentScreen = 'sessions';
}

// Draft submenu actions
function onDraftNewDraft(): void {
  draftSubmenu.visible = false;
  if (!state.activeSessionId) return;
  window.gamepadCli?.draftCreate(state.activeSessionId, 'New Draft', '');
}

async function onDraftApply(draft: { id: string; text: string }): Promise<void> {
  draftSubmenu.visible = false;
  const tm = getTerminalManager();
  if (tm && draft.text) tm.writeToActive(draft.text);
  await window.gamepadCli?.draftDelete(draft.id);
}

function onDraftEdit(draft: { id: string; label: string; text: string }): void {
  draftSubmenu.visible = false;
  if (!state.activeSessionId) return;
  showDraftEditor(state.activeSessionId, draft);
}

async function onDraftDelete(draft: { id: string }): Promise<void> {
  draftSubmenu.visible = false;
  await window.gamepadCli?.draftDelete(draft.id);
}

// Form modal callbacks
function onFormModalSave(values: Record<string, string>): void {
  formModal.visible = false;
  const resolve = getFormModalResolve();
  if (resolve) resolve(values);
}

function onFormModalCancel(): void {
  formModal.visible = false;
  const resolve = getFormModalResolve();
  if (resolve) resolve(null);
}

// Plan delete confirm
function onPlanDeleteConfirm(): void {
  planDeleteConfirm.visible = false;
  const cb = getPlanDeleteCallback();
  if (cb) cb();
}

// Sequence picker select
function onSequencePickerSelect(seq: string): void {
  sequencePicker.visible = false;
  const cb = getSequencePickerCallback();
  if (cb) cb(seq);
}

// Quick spawn select
function onQuickSpawnSelect(cliType: string): void {
  quickSpawn.visible = false;
  const cb = getQuickSpawnCallback();
  if (cb) cb(cliType);
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
              <template v-if="group.sessions.length > 0">
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
        </section>

        <!-- Settings screen (legacy DOM rendering) -->
        <div v-show="settingsVisible" class="settings-panel">
          <div class="settings-panel__header">
            <button class="settings-back-btn" @click="onCloseSettings" title="Back (B)">← Back</button>
          </div>
          <div class="settings-tabs" id="settingsTabs" role="tablist">
            <!-- Legacy renderSettingsTabs() populates this -->
          </div>
          <div class="settings-content">
            <div class="settings-action-bar" id="bindingActionBar"></div>
            <div class="settings-display" id="bindingsDisplay"></div>
          </div>
        </div>
      </main>

      <!-- Spawn sections pinned at bottom of sidebar -->
      <div v-show="!settingsVisible" class="spawn-section" :class="{ 'spawn-section--collapsed': spawnCollapsed }">
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

      <div v-show="!settingsVisible" class="spawn-section" :class="{ 'spawn-section--collapsed': plannerCollapsed }">
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
      v-model:visible="closeConfirm.visible"
      :session-name="closeConfirm.sessionName"
      :draft-count="closeConfirm.draftCount"
      @confirm="onConfirmClose"
      @cancel="closeConfirm.visible = false"
    />

    <PlanDeleteConfirmModal
      v-model:visible="planDeleteConfirm.visible"
      :plan-title="planDeleteConfirm.planTitle"
      @confirm="onPlanDeleteConfirm"
      @cancel="planDeleteConfirm.visible = false"
    />

    <SequencePickerModal
      v-model:visible="sequencePicker.visible"
      :items="sequencePicker.items"
      @select="onSequencePickerSelect"
      @cancel="sequencePicker.visible = false"
    />

    <QuickSpawnModal
      v-model:visible="quickSpawn.visible"
      :cli-types="state.cliTypes"
      :preselected-cli-type="quickSpawn.preselectedCliType"
      @select="onQuickSpawnSelect"
      @cancel="quickSpawn.visible = false"
    />

    <ContextMenu
      v-model:visible="contextMenu.visible"
      :has-selection="contextMenu.hasSelection"
      :has-active-session="hasActiveSession"
      :has-sequences="hasSequences"
      :has-drafts="hasDrafts"
      :mode="contextMenu.mode"
      :mouse-x="contextMenu.mouseX"
      :mouse-y="contextMenu.mouseY"
      @action="onContextMenuAction"
      @cancel="contextMenu.visible = false"
    />

    <DraftSubmenu
      v-model:visible="draftSubmenu.visible"
      :drafts="draftSubmenu.items"
      @new-draft="onDraftNewDraft"
      @apply="onDraftApply"
      @edit="onDraftEdit"
      @delete="onDraftDelete"
      @cancel="draftSubmenu.visible = false"
    />

    <DirPickerModal
      v-model:visible="dirPicker.visible"
      :cli-type="dirPicker.cliType"
      :items="dirPicker.items"
      :preselected-path="dirPicker.preselectedPath"
      @select="onDirPickerSelect"
      @cancel="dirPicker.visible = false"
    />

    <FormModal
      v-model:visible="formModal.visible"
      :title="formModal.title"
      :fields="formModal.fields"
      @save="onFormModalSave"
      @cancel="onFormModalCancel"
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
