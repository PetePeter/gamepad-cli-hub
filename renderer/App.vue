<script setup lang="ts">
/**
 * App.vue — Root Vue component for Helm.
 *
 * Owns the full layout: sidebar (left) + main area (right) + modals.
 * Composables handle bootstrap, navigation, and gamepad input.
 * Components are presentational — they receive props and emit events.
 */

declare global {
  interface Window {
    openLegacyBindingEditor?: (button: string, cliType: string, binding: any) => void;
  }
}

import { ref, computed, onMounted, onUnmounted } from 'vue';
import { state } from './state.js';
import { sessionsState } from './screens/sessions-state.js';
import { getTerminalManager } from './runtime/terminal-provider.js';
import { getCliDisplayName, getCliIcon, toDirection } from './utils.js';
import { processConfigBinding, processConfigRelease, initConfigCache, executeSequence } from './bindings.js';
import { formatElapsed, refreshSessions, doSpawn, switchToSession, doCloseSession,
  bootstrap, teardown, startTimerRefresh, stopTimerRefresh,
  getSortField, getSortDirection, setSortField, setSortDirection,
  setPendingContextText,
} from './composables/useAppBootstrap.js';
import type { SessionSortField, SortDirection } from './sort-logic.js';
import { findNavIndexBySessionId, toggleCollapse, isSessionHiddenFromOverview, resolveGroupDisplayName } from './session-groups.js';
import { showOverview, handleOverviewInput } from './screens/group-overview.js';
import { showPlanScreen, hidePlanScreen, handlePlanScreenDpad, handlePlanScreenAction, refreshCanvasIfVisible } from './plans/plan-screen.js';
import { handleSessionsScreenButton, toggleSessionOverviewVisibility } from './screens/sessions.js';
import { usePanelResize } from './composables/usePanelResize.js';
import { setSpawnCollapsed, setPlannerCollapsed } from './sidebar/section-collapse.js';
import { setDirPickerBridge } from './screens/sessions-spawn.js';
import { loadSettingsScreen, handleSettingsScreenButton } from './screens/settings.js';
import { onViewChange, currentView, type MainView as ViewName } from './main-view/main-view-manager.js';
import { useModalStack } from './composables/useModalStack.js';
import {
  closeConfirm, getCloseConfirmCallback,
  contextMenu,
  planDeleteConfirm, getPlanDeleteCallback,
  clearDonePlans, getClearDonePlansCallback,
  sequencePicker, getSequencePickerCallback,
  quickSpawn, getQuickSpawnCallback,
  dirPicker,
  draftSubmenu,
  formModal, getFormModalResolve,
  editorPopup, getEditorPopupOnSend, getEditorPopupResolve, setEditorPopupCallbacks,
  toolEditor, getToolEditorCallback,
  isAnyBridgeModalVisible,
} from './stores/modal-bridge.js';
import { collectSequenceItems } from './modals/context-menu.js';
import { showSequencePicker } from './modals/sequence-picker.js';
import { showQuickSpawn } from './modals/quick-spawn.js';
import { showDraftSubmenu } from './modals/draft-submenu.js';
import { showEditorPopup } from './editor/editor-popup.js';
import { showDraftEditor } from './drafts/draft-editor.js';
import { deliverBulkText } from './paste-handler.js';

// Sidebar components
import StatusStrip from './components/sidebar/StatusStrip.vue';
import SortBar from './components/sidebar/SortBar.vue';
import SessionGroup from './components/sidebar/SessionGroup.vue';
import SessionCard from './components/sidebar/SessionCard.vue';
import SpawnGrid from './components/sidebar/SpawnGrid.vue';
import PlansGrid from './components/sidebar/PlansGrid.vue';

// Panel components
import MainView from './components/panels/MainView.vue';
import SettingsPanel from './components/sidebar/SettingsPanel.vue';

// Modal components
import CloseConfirmModal from './components/modals/CloseConfirmModal.vue';
import PlanDeleteConfirmModal from './components/modals/PlanDeleteConfirmModal.vue';
import SequencePickerModal from './components/modals/SequencePickerModal.vue';
import QuickSpawnModal from './components/modals/QuickSpawnModal.vue';
import ContextMenu from './components/modals/ContextMenu.vue';
import DraftSubmenu from './components/modals/DraftSubmenu.vue';
import DirPickerModal from './components/modals/DirPickerModal.vue';
import FormModal from './components/modals/FormModal.vue';
import ToolEditorModal from './components/modals/ToolEditorModal.vue';
import EditorPopup from './components/modals/EditorPopup.vue';
import BindingEditorModal from './components/modals/BindingEditorModal.vue';
import ToastNotification from './components/ToastNotification.vue';
import ClearDonePlansModal from './components/modals/ClearDonePlansModal.vue';
import ChipBar from './components/chips/ChipBar.vue';
import { useChipBarStore } from './stores/chip-bar.js';
import { useNavigationStore } from './stores/navigation.js';

// ============================================================================
// Reactive view state
// ============================================================================

const activeView = ref<'terminal' | 'overview' | 'plan'>('terminal');
const settingsVisible = ref(false);
const terminalContainerRef = ref<HTMLElement | null>(null);
const chipBarStore = useChipBarStore();
const navStore = useNavigationStore();
let offTextDeliver: (() => void) | null = null;

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

// Panel resize
const { splitterRef, panelRef } = usePanelResize({
  onResized: () => { getTerminalManager()?.fitActive(); },
});

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
    startableCount: state.planDirStartableCounts.get(d.path) ?? 0,
    doingCount: state.planDirDoingCounts.get(d.path) ?? 0,
    blockedCount: state.planDirBlockedCounts.get(d.path) ?? 0,
    questionCount: state.planDirQuestionCounts.get(d.path) ?? 0,
    waitTestsCount: state.planDirWaitTestsCounts.get(d.path) ?? 0,
    pendingCount: state.planDirPendingCounts.get(d.path) ?? 0,
  }))
);

const hasActiveSession = computed(() => !!state.activeSessionId);

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

const chipBarVisible = computed(() =>
  !settingsVisible.value &&
  activeView.value === 'terminal' &&
  !!state.activeSessionId,
);

const chipBarDrafts = computed(() =>
  chipBarStore.drafts.map((draft) => ({
    id: draft.id,
    title: draft.label,
  })),
);

const chipBarPlans = computed(() => chipBarStore.plans);

// Maps each navList item's id → its index — fed to session cards/group headers as
// data-nav-index so the legacy updateSessionsFocus() can find focused elements.
const navIndexMap = computed(() => {
  const map = new Map<string, number>();
  sessionsState.navList.forEach((item, i) => { map.set(item.id, i); });
  return map;
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
    navStore.closeSettings();
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
      navStore.closeSettings();
    } else {
      handleSettingsScreenButton(button);
    }
    return;
  }

  // Plan screen — routes before session navigation so B closes plan, not session
  if (currentView() === 'plan') {
    const dir = toDirection(button);
    if (dir) { handlePlanScreenDpad(dir); return; }
    if (button === 'B') { void navStore.closePlan(); return; }
    if (handlePlanScreenAction(button)) return;
  }

  // Overview grid — routes before session navigation so A/B/Left/Right act on the grid
  if (currentView() === 'overview') {
    if (handleOverviewInput(button)) return;
  }

  // Session navigation — D-pad, A to select, overview-button, spawn/plans zones
  if (handleSessionsScreenButton(button)) return;

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
  void navStore.navigateToSession(sessionId);
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
  window.gamepadCli?.sessionSetState(sessionId, newState);
  state.sessionStates.set(sessionId, newState);
}

// Group actions
function onGroupToggleCollapse(dirPath: string): void {
  sessionsState.groupPrefs.collapsed = toggleCollapse(sessionsState.groupPrefs.collapsed, dirPath);
  void refreshSessions();
  void saveGroupPrefsToBackend();
}

async function saveGroupPrefsToBackend(): Promise<void> {
  try {
    await window.gamepadCli?.configSetSessionGroupPrefs({
      order: [...sessionsState.groupPrefs.order],
      collapsed: [...sessionsState.groupPrefs.collapsed],
      overviewHidden: [...sessionsState.groupPrefs.overviewHidden],
    });
  } catch { /* ignore */ }
}

function onShowPlans(dirPath: string): void {
  void navStore.openPlan(dirPath);
}

function onShowOverview(dirPath: string): void {
  void navStore.openOverview(dirPath, state.activeSessionId ?? undefined);
}

function onShowGlobalOverview(): void {
  void navStore.openOverview(null, state.activeSessionId ?? undefined);
}

function onToggleOverview(sessionId: string): void {
  void toggleSessionOverviewVisibility(sessionId);
}

async function onCancelSchedule(sessionId: string): Promise<void> {
  try {
    await window.gamepadCli.patternCancelSchedule(sessionId);
  } catch { /* ignore */ }
}

// Section collapse
async function loadCollapsePrefs(): Promise<void> {
  try {
    const prefs = await window.gamepadCli.configGetCollapsePrefs();
    if (prefs) {
      spawnCollapsed.value = prefs.spawnCollapsed ?? false;
      plannerCollapsed.value = prefs.plannerCollapsed ?? false;
      // Keep navigation module in sync (used by handleSessionsZone bounds checks)
      setSpawnCollapsed(spawnCollapsed.value);
      setPlannerCollapsed(plannerCollapsed.value);
    }
  } catch { /* first run — defaults are fine */ }
}

function toggleSpawnCollapse(): void {
  spawnCollapsed.value = !spawnCollapsed.value;
  setSpawnCollapsed(spawnCollapsed.value);
  window.gamepadCli.configSetCollapsePrefs({
    spawnCollapsed: spawnCollapsed.value,
    plannerCollapsed: plannerCollapsed.value,
  });
}

function togglePlannerCollapse(): void {
  plannerCollapsed.value = !plannerCollapsed.value;
  setPlannerCollapsed(plannerCollapsed.value);
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
  switch (action) {
    case 'copy': {
      const text = contextMenu.selectedText;
      if (text) navigator.clipboard.writeText(text);
      break;
    }
    case 'paste':
      navigator.clipboard.readText().then(text => {
        if (text && state.activeSessionId) {
          void deliverBulkText(state.activeSessionId, text);
        }
      });
      break;
    case 'editor':
      void showEditorPopup((text) => {
        if (state.activeSessionId) void deliverBulkText(state.activeSessionId, text);
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
          if (state.activeSessionId) void executeSequence(seq);
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
function onOpenLogsFolder(): void {
  window.gamepadCli?.openLogsFolder();
}

function onOpenSettings(): void {
  settingsVisible.value = true;
  navStore.openSettings();
  void loadSettingsScreen();
}

function onCloseSettings(): void {
  settingsVisible.value = false;
  navStore.closeSettings();
}

// Draft submenu actions
function onDraftNewDraft(): void {
  draftSubmenu.visible = false;
  if (!state.activeSessionId) return;
  showDraftEditor(state.activeSessionId);
}

function onChipBarDraftClick(draftId: string): void {
  chipBarStore.openDraft(draftId);
}

function onChipBarPlanClick(planId: string): void {
  void chipBarStore.openPlan(planId);
}

function onChipBarNewDraft(): void {
  chipBarStore.openNewDraft();
}

function onChipBarAction(sequence: string): void {
  void chipBarStore.triggerAction(sequence);
}

async function onDraftApply(draft: { id: string; text: string }): Promise<void> {
  draftSubmenu.visible = false;
  if (state.activeSessionId && draft.text) {
    void deliverBulkText(state.activeSessionId, draft.text);
  }
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

// Tool editor modal callbacks
function onToolEditorSave(values: any): void {
  toolEditor.visible = false;
  const cb = getToolEditorCallback();
  cb?.(values);
}

function onToolEditorCancel(): void {
  toolEditor.visible = false;
}

// Editor popup callbacks
function onEditorSend(text: string): void {
  const cb = getEditorPopupOnSend();
  cb?.(text);
}

function onEditorClose(): void {
  const resolve = getEditorPopupResolve();
  setEditorPopupCallbacks(null, null);
  resolve?.();
}


// Plan delete confirm
function onPlanDeleteConfirm(): void {
  planDeleteConfirm.visible = false;
  const cb = getPlanDeleteCallback();
  if (cb) cb();
}

// Clear done plans confirm
function onClearDonePlansConfirm(): void {
  clearDonePlans.visible = false;
  const cb = getClearDonePlansCallback();
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

// Binding editor handlers
function onEditBinding(button: string, cliType: string): void {
  bindingEditorButton.value = button;
  bindingEditorCliType.value = cliType;
  bindingEditorBinding.value = { action: 'keyboard', sequence: '' };
  bindingEditorVisible.value = true;
}

// Bridge function for legacy binding editor
function openLegacyBindingEditor(button: string, cliType: string, binding: any): void {
  onEditBinding(button, cliType);
}

// Make this function available globally for legacy code
window.openLegacyBindingEditor = openLegacyBindingEditor;

// Binding editor save
async function onBindingEditorSave(binding: any): Promise<void> {
  try {
    const result = await window.gamepadCli.configSetBinding(
      bindingEditorButton.value,
      bindingEditorCliType.value,
      binding
    );
    if (result.success) {
      // Refresh bindings cache to reflect the changes
      await initConfigCache();
      // Refresh the settings display to show updated bindings
      void loadSettingsScreen();
    }
    bindingEditorVisible.value = false;
  } catch (error) {
    console.error('Failed to save binding:', error);
    // Keep modal open if save fails
  }
}

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(async () => {
  if (!terminalContainerRef.value) return;

  offTextDeliver = window.gamepadCli.onTextDeliverRequest(async ({ requestId, sessionId, text }) => {
    try {
      await deliverBulkText(sessionId, text);
      await window.gamepadCli.textDeliverResponse(requestId, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await window.gamepadCli.textDeliverResponse(requestId, false, message);
    }
  });
  await window.gamepadCli.textDeliverReady();

  await bootstrap({
    terminalContainer: terminalContainerRef.value,
    handleButton,
    handleRelease,
    onTerminalSwitch(sessionId) {
      void navStore.reconcileTerminalSwitch(sessionId ?? null);
      if (sessionId) activeView.value = 'terminal';
    },
    onTerminalEmpty() {
      state.activeSessionId = null;
      chipBarStore.clear();
    },
    onTerminalTitleChange(sessionId, title) {
      const s = state.sessions.find(s => s.id === sessionId);
      if (s) s.title = title;
    },
  });

  // Wire sessions-spawn dir picker to Vue DirPickerModal
  setDirPickerBridge((cliType, dirs, preselectedPath) => {
    dirPicker.cliType = cliType;
    dirPicker.items = dirs;
    dirPicker.preselectedPath = preselectedPath;
    dirPicker.visible = true;
  });

  // Keyboard → modal stack bridge (all navigation keys reach modals via unified path)
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (!isAnyBridgeModalVisible()) return;
    const { handleInput } = useModalStack();
    const active = document.activeElement as HTMLElement | null;
    const editable = !!active && (
      active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      active.tagName === 'SELECT' ||
      active.isContentEditable
    );
    if (e.key === 'ArrowUp') {
      if (editable) return;
      e.preventDefault();
      handleInput('DPadUp');
    } else if (e.key === 'ArrowDown') {
      if (editable) return;
      e.preventDefault();
      handleInput('DPadDown');
    } else if (e.key === 'ArrowLeft') {
      if (editable) return;
      e.preventDefault();
      handleInput('DPadLeft');
    } else if (e.key === 'ArrowRight') {
      if (editable) return;
      e.preventDefault();
      handleInput('DPadRight');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      handleInput(e.shiftKey ? 'ShiftTab' : 'Tab');
    } else if (e.key === 'Enter') {
      if (document.activeElement?.tagName === 'TEXTAREA') return;
      e.preventDefault();
      handleInput('A');
    } else if (e.key === ' ' || e.key === 'Spacebar') {
      if (editable) return;
      e.preventDefault();
      handleInput('A');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleInput('B');
    }
  }, true);

  // Wire view-change listener so activeView stays in sync with legacy MainViewManager
  onViewChange((view: ViewName) => {
    activeView.value = view;
  });

  await loadCollapsePrefs();
  await chipBarStore.refresh(state.activeSessionId ?? null);

  // Dismiss splash after 3 seconds
  const splash = document.getElementById('splashScreen');
  if (splash) {
    setTimeout(() => {
      splash.classList.add('splash-screen--hidden');
      // Remove from DOM after transition completes
      setTimeout(() => {
        splash.style.display = 'none';
      }, 220); // Match CSS transition duration (0.22s)
    }, 3000);
  }
});

onUnmounted(() => {
  offTextDeliver?.();
  offTextDeliver = null;
  teardown();
});
</script>

<template>
    <!-- Left panel: sessions/settings -->
    <div class="panel-left" id="sidePanel" ref="panelRef">
      <header class="sidebar-header">
        <span class="sidebar-logo">
          <img src="./assets/helm-paper-boat.svg" alt="Helm logo" width="28" height="28">
        </span>
        <span class="sidebar-brand">
          <span class="sidebar-title">Helm</span>
          <span class="sidebar-tagline">steer your fleet of agents</span>
        </span>
        <div class="sidebar-actions">
          <button class="sidebar-btn" title="Open Logs Folder" @click="onOpenLogsFolder">🐛</button>
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
        <section v-show="!settingsVisible" class="sessions-screen-section">
          <SortBar
            :options="sortOptions"
            :field="getSortField()"
            :direction="getSortDirection()"
            @change="onSortChange"
          />
          <div class="sessions-list" id="sessionsList">
            <!-- Persistent global overview button — always visible when sessions exist -->
            <button
              v-if="state.sessions.length > 0"
              class="overview-nav-button"
              :class="{ focused: sessionsState.activeFocus === 'sessions' && sessionsState.navList[sessionsState.sessionsFocusIndex]?.type === 'overview-button' }"
              title="Overview — all sessions"
              @click="onShowGlobalOverview"
            >
              Overview
            </button>
            <template v-for="(group, gi) in sessionsState.groups" :key="group.dirPath">
              <template v-if="group.sessions.length > 0">
              <SessionGroup
                :group="{
                  dirPath: group.dirPath,
                  displayName: resolveGroupDisplayName(group.dirPath, sessionsState.directories),
                  collapsed: group.collapsed,
                  sessionCount: group.sessions.length,
                }"
                :data-nav-index="navIndexMap.get(group.dirPath) ?? -1"
                :is-focused="sessionsState.activeFocus === 'sessions'
                  && sessionsState.navList[sessionsState.sessionsFocusIndex]?.type === 'group-header'
                  && sessionsState.navList[sessionsState.sessionsFocusIndex]?.id === group.dirPath"
                :card-column="sessionsState.cardColumn"
                @toggle-collapse="onGroupToggleCollapse"
                @show-overview="onShowOverview"
              />
              <template v-if="!group.collapsed">
                <SessionCard
                  v-for="session in group.sessions"
                  :key="session.id"
                  :data-nav-index="navIndexMap.get(session.id) ?? -1"
                  :session="{ id: session.id, name: session.name, cliType: session.cliType, title: session.title }"
                  :session-state="state.sessionStates.get(session.id) || 'idle'"
                  :activity-level="state.sessionActivityLevels.get(session.id) || 'idle'"
                  :display-name="session.name !== session.cliType ? session.name : getCliDisplayName(session.cliType)"
                  :draft-count="state.draftCounts.get(session.id) ?? 0"
                  :last-output-time="state.lastOutputTimes.get(session.id) ?? null"
                  :elapsed-text="sessionElapsedText(session.id)"
                  :working-plan-label="state.workingPlanLabels?.get(session.id) || ''"
                  :working-plan-tooltip="state.workingPlanTooltips?.get(session.id) || ''"
                  :is-active="state.activeSessionId === session.id"
                  :is-focused="sessionsState.activeFocus === 'sessions'
                    && sessionsState.navList[sessionsState.sessionsFocusIndex]?.type === 'session-card'
                    && sessionsState.navList[sessionsState.sessionsFocusIndex]?.id === session.id"
                  :card-column="sessionsState.cardColumn"
                  :is-editing="editingSessionId === session.id"
                  :is-hidden-from-overview="isSessionHiddenFromOverview(session, sessionsState.groupPrefs)"
                  :scheduled-at="state.pendingSchedules.get(session.id) ?? null"
                  @click="onSessionClick"
                  @rename="onSessionRename"
                  @commit-rename="onCommitRename"
                  @cancel-rename="onCancelRename"
                  @close="onRequestClose"
                  @state-change="onSessionStateChange"
                  @toggle-overview="onToggleOverview"
                  @cancel-schedule="onCancelSchedule"
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
          <button class="section-toggle">{{ spawnCollapsed ? '▲' : '▼' }}</button>
          <span>Quick Spawn</span>
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
          <button class="section-toggle">{{ plannerCollapsed ? '▲' : '▼' }}</button>
          <span>Folder Planner</span>
        </div>
        <PlansGrid
          v-show="!plannerCollapsed"
          :directories="plansDirItems"
          :focus-index="sessionsState.plansFocusIndex"
          :is-active="sessionsState.activeFocus === 'plans'"
          @show-plans="onShowPlans"
        />
      </div>
    </div>

    <!-- Resize handle -->
    <div class="panel-splitter" id="panelSplitter" ref="splitterRef"></div>

    <!-- Right panel: terminal / overview / plan -->
    <div class="panel-right" id="mainArea">
      <ChipBar
        :drafts="chipBarDrafts"
        :plan-chips="chipBarPlans"
        :actions="chipBarStore.actions"
        :visible="chipBarVisible"
        :show-new-draft="true"
        @draft-click="onChipBarDraftClick"
        @plan-chip-click="onChipBarPlanClick"
        @new-draft="onChipBarNewDraft"
        @action-click="onChipBarAction"
      />
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

    <ClearDonePlansModal
      v-model:visible="clearDonePlans.visible"
      :count="clearDonePlans.count"
      :dir-name="clearDonePlans.dirName"
      @confirm="onClearDonePlansConfirm"
      @cancel="clearDonePlans.visible = false"
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

    <ToolEditorModal
      v-model:visible="toolEditor.visible"
      :mode="toolEditor.mode"
      :edit-key="toolEditor.editKey"
      :initial-data="toolEditor.initialData"
      @save="onToolEditorSave"
      @cancel="onToolEditorCancel"
    />

    <EditorPopup
      v-model:visible="editorPopup.visible"
      :initial-text="editorPopup.initialText"
      @send="onEditorSend"
      @close="onEditorClose"
    />

    <BindingEditorModal
      v-model:visible="bindingEditorVisible"
      :button-name="bindingEditorButton"
      :cli-type="bindingEditorCliType"
      :binding="bindingEditorBinding"
      @save="onBindingEditorSave"
      @cancel="bindingEditorVisible = false"
    />

    <ToastNotification />
</template>
