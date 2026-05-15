<script setup lang="ts">
/**
 * MainWindowApp.vue -- main Helm window shell.
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

import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { state } from './state.js';
import { sessionsState } from './screens/sessions-state.js';
import { getTerminalManager } from './runtime/terminal-provider.js';
import { getCliDisplayName, getCliIcon } from './utils.js';
import { initConfigCache, executeSequence } from './bindings.js';
import { doSpawn, doSpawnShell, switchToSession, doCloseSession,
  bootstrap, teardown, startTimerRefresh, stopTimerRefresh,
  setPendingContextText, restoreSnappedBackSession, refreshProjects,
} from './composables/useAppBootstrap.js';
import { formatElapsed } from '../src/utils/time-parser.js';
import { findNavIndexBySessionId, getVisibleSessions, isSessionHiddenFromOverview, resolveGroupDisplayName } from './session-groups.js';
import { getOverviewSessions } from './screens/group-overview.js';
import {
  onPlanAddDependency,
  onPlanAddContext,
  onPlanAddNode,
  onPlanClearDone,
  onPlanAssignSequence,
  onPlanContextBind,
  onPlanContextBindTarget,
  onPlanContextClick,
  onPlanContextDelete,
  onPlanContextMove,
  onPlanContextSave,
  onPlanContextSelectPlan,
  onPlanContextUnbind,
  onPlanCreateSequence,
  onPlanExportDirectory,
  onPlanNodeApply,
  onPlanNodeClick,
  onPlanNodeComplete,
  onPlanNodeDelete,
  onPlanNodeEdit,
  onPlanRemoveDependency,
  onPlanDeleteSequence,
  onPlanDeleteSequenceWithPlans,
  onPlanUpdateSequence,
  planScreenState,
} from './plans/plan-screen.js';
import { usePanelResize } from './composables/usePanelResize.js';
import { onViewChange, type MainView as ViewName } from './main-view/main-view-manager.js';
import { useToast } from './composables/useToast.js';
import { useSettingsController } from './composables/useSettingsController.js';
import { useInputRouter } from './composables/useInputRouter.js';
import { useSidebarController } from './composables/useSidebarController.js';
import { useDraftPlanContextEditor } from './composables/useDraftPlanContextEditor.js';
import { usePlanWorkspaceController } from './composables/usePlanWorkspaceController.js';
import { appClient, configClient, deliveryClient, draftsClient, eventsClient, sessionsClient } from './ipc/clients.js';
import {
  contextMenu,
  openQuickSpawn,
  draftSubmenu,
  toolEditor,
  isAnyBridgeModalVisible,
} from './stores/modal-bridge.js';
import { collectSequenceItems } from './modals/context-menu.js';
import { showSequencePicker } from './modals/sequence-picker.js';
import { showDraftSubmenu } from './modals/draft-submenu.js';
import { showEditorPopup } from './editor/editor-popup.js';
import DraftEditor from './components/panels/DraftEditor.vue';
import type { ScheduledTask } from '../../src/types/scheduled-task.js';
import {
  setDraftEditorOpener as setDraftEditorCompatibilityOpener,
  setPlanEditorOpener as setPlanEditorCompatibilityOpener,
  setDraftEditorCloser as setDraftEditorCompatibilityCloser,
  setDraftEditorVisibilityChecker as setDraftEditorCompatibilityVisibilityChecker,
  setDraftEditorButtonHandler as setDraftEditorCompatibilityButtonHandler,
  setPlanChangesChecker as setPlanCompatibilityChangesChecker,
} from './drafts/draft-editor.js';
import {
  setPlanEditorOpener as setChipBarPlanEditorOpener,
} from './stores/chip-bar.js';
import {
  setPlanEditorOpener as setPlanScreenPlanEditorOpener,
  setDraftEditorCloser as setPlanScreenDraftEditorCloser,
  setDraftEditorVisibilityChecker as setPlanScreenDraftEditorVisibilityChecker,
  setPlanChangesChecker as setPlanScreenPlanChangesChecker,
  setBackupRestoreOpener as setPlanScreenBackupRestoreOpener,
  setPlanScreenContextEditorOpener,
  onPlanContextEdit,
} from './plans/plan-screen.js';
import { deliverBulkText } from './paste-handler.js';
import { deliverPromptSequence } from './sequence-delivery.js';

// Sidebar components
import StatusStrip from './components/sidebar/StatusStrip.vue';
import SortBar from './components/sidebar/SortBar.vue';
import SessionList from './components/sidebar/SessionList.vue';
import SpawnGrid from './components/sidebar/SpawnGrid.vue';
import PlansGrid from './components/sidebar/PlansGrid.vue';
import SchedulerSection from './components/sidebar/SchedulerSection.vue';

// Panel components
import MainView from './components/panels/MainView.vue';
import OverviewGrid from './components/panels/OverviewGrid.vue';
import PlanScreen from './components/panels/PlanScreen.vue';
import SettingsPanel from './components/sidebar/SettingsPanel.vue';

// Settings tab components
import BindingsTab from './components/sidebar/BindingsTab.vue';
import ToolsTab from './components/sidebar/ToolsTab.vue';
import TelegramTab from './components/sidebar/TelegramTab.vue';
import DirectoriesTab from './components/sidebar/DirectoriesTab.vue';
import ProjectsTab from './components/sidebar/ProjectsTab.vue';
import ChipbarActionsTab from './components/sidebar/ChipbarActionsTab.vue';
import McpTab from './components/sidebar/McpTab.vue';
import BackupTab from './components/sidebar/BackupTab.vue';

import { loadSessions } from './screens/sessions.js';

import AppModalHost from './components/app/AppModalHost.vue';
import ChipBar from './components/chips/ChipBar.vue';
import ChipActionBar from './components/chips/ChipActionBar.vue';
import { useChipBarStore } from './stores/chip-bar.js';
import { useNavigationStore } from './stores/navigation.js';
import { useLlmNotificationsStore } from './stores/llmNotifications.js';

// ============================================================================
// Reactive view state
// ============================================================================

const activeView = ref<'terminal' | 'overview' | 'plan'>('terminal');
const settingsVisible = ref(false);
const terminalContainerRef = ref<HTMLElement | null>(null);
const chipBarStore = useChipBarStore();
const navStore = useNavigationStore();
const llmNotificationsStore = useLlmNotificationsStore();

const {
  draftEditorVisible,
  draftEditorMode,
  draftEditorSessionId,
  draftEditorDraftId,
  draftEditorLabel,
  draftEditorText,
  draftEditorPlanId,
  draftEditorPlanStatus,
  draftEditorPlanStateInfo,
  draftEditorPlanType,
  draftEditorPlanAutoImplement,
  draftEditorPlanHumanId,
  draftEditorPlanCreatedAt,
  draftEditorPlanStateUpdatedAt,
  draftEditorPlanCallbacks,
  draftEditorCompletionNotes,
  draftEditorContextId,
  draftEditorContextType,
  draftEditorContextPermission,
  draftEditorContextCallbacks,
  draftEditorContextBoundPlans,
  draftEditorContextBoundSequences,
  draftEditorPendingContextUnbinds,
  draftEditorRef,
  openDraftEditor,
  openPlanEditor,
  openContextEditor,
  closeDraftEditor,
  saveContextEditor,
  onDraftSave,
  onDraftApply,
  onDraftDelete,
  onDraftClose,
  onPlanSave,
  onPlanApply,
  onPlanDone,
  onPlanDelete,
  onContextDelete,
  hasUnsavedChanges,
  handleButton: handleDraftEditorButton,
} = useDraftPlanContextEditor({
  saveContext: (id, updates, pendingUnbinds) => onPlanContextSave(id, updates, pendingUnbinds),
  refreshDraftSession: (sessionId) => chipBarStore.refresh(sessionId),
});
let offTextDeliver: (() => void) | null = null;
let unsubSnapOut: (() => void) | null = null;
let unsubSnapBack: (() => void) | null = null;
let unsubLlmNotify: (() => void) | null = null;

// Non-modal local state
const bindingEditorVisible = ref(false);
const bindingEditorButton = ref('');
const bindingEditorCliType = ref('');
const bindingEditorBinding = ref<any>(null);

// Settings panel state
const settingsPanelRef = ref<any>(null);
const {
  settingsTab,
  settingsTools,
  settingsProjects,
  settingsChipbarActions,
  settingsTelegramConfig,
  settingsTelegramBotRunning,
  settingsMcpConfig,
  settingsBindings,
  settingsSequenceGroups,
  settingsBindingSortField,
  settingsBindingSortDirection,
  settingsAddableButtons,
  settingsBindingCopySources,
  loadSettingsData,
  loadCurrentTabBindings,
  buildSettingsTabs,
  onToolAdd,
  onToolEdit,
  onToolDelete,
  onToolReorder,
  onDirectoryAdd,
  onDirectoryEdit,
  onDirectoryDelete,
  onDirectoryReorder,
  onChipbarActionAdd,
  onChipbarActionEdit,
  onChipbarActionDelete,
  onChipbarActionMove,
  onTelegramUpdateField,
  onTelegramStartBot,
  onTelegramStopBot,
  onMcpUpdate,
  onMcpGenerateToken,
  onMcpRunInCmd,
  onBindingAdd,
  onBindingDelete,
  onBindingCopyFrom,
  onBindingSortChange,
  onAddSequenceGroup,
  onEditSequenceGroup,
  onDeleteSequenceGroup,
} = useSettingsController({
  refreshProjects,
  doSpawnShell,
  reloadSessions: () => { loadSessions(); },
  closeSettings: () => {
    settingsVisible.value = false;
    navStore.closeSettings();
  },
  openBindingEditor: (button, cliType, binding) => onEditBinding(button, cliType, binding),
});

const {
  overviewCollapsedIds,
  overviewGroupLabel,
  spawnCollapsed,
  plannerCollapsed,
  schedulerCollapsed,
  schedulerPopupVisible,
  schedulerPopupTaskId,
  getSortField,
  getSortDirection,
  onSessionClick,
  onSessionRename,
  onCommitRename,
  onCancelRename,
  onRequestClose,
  onSessionStateChange,
  onOverviewSelect,
  onOverviewToggleCollapse,
  onGroupToggleCollapse,
  onShowPlans,
  onShowOverview,
  onShowGlobalOverview,
  onToggleOverview,
  onCancelSchedule,
  onSessionSnapOut,
  onSessionSnapBack,
  loadCollapsePrefs,
  toggleSpawnCollapse,
  togglePlannerCollapse,
  toggleSchedulerCollapse,
  openSchedulerPopup,
  deleteScheduledTask,
  onSpawn,
  onDirPickerSelect,
  onSortChange,
  installDirPickerBridge,
} = useSidebarController({
  activeView,
  navStore,
  refreshProjects,
  doSpawn,
  doCloseSession,
});

// Panel resize
const { splitterRef, panelRef } = usePanelResize({
  onResized: () => { getTerminalManager()?.fitActive(); },
});
const { addToast } = useToast();
const {
  backupRestore,
  onPlanPopOut,
  onToggleTypeFilter,
  onToggleStatusFilter,
  onResetFilters,
  onToggleHasAttachmentFilter,
  onToggleAutoFilter,
  onToggleRelatedFocus,
  openBackupRestore,
  onBackupRestore,
  onBackupDelete,
  onBackupNow,
  onBackupClose,
} = usePlanWorkspaceController({ addToast });

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
    codingCount: state.planDirCodingCounts.get(d.path) ?? 0,
    blockedCount: state.planDirBlockedCounts.get(d.path) ?? 0,
    reviewCount: state.planDirReviewCounts.get(d.path) ?? 0,
    planningCount: state.planDirPlanningCounts.get(d.path) ?? 0,
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

const chipBarPlans = computed(() => chipBarStore.plans);
const chipBarHasPills = computed(() =>
  chipBarPlans.value.length > 0,
);
const chipActionBarVisible = computed(() =>
  chipBarVisible.value &&
  (chipBarHasPills.value || chipBarStore.actions.length > 0)
);

// Overview sessions with preview lines
const overviewSessions = computed(() => {
  const tm = getTerminalManager();
  const mapSession = (session: typeof state.sessions[number]) => {
    const lines = tm?.getTerminalLines(session.id, 10) ?? [];
    // Trim leading blank lines
    let start = 0;
    while (start < lines.length && (lines[start] ?? '').trim() === '') start++;
    const trimmedLines = lines.slice(start);
    // Pad to bottom-align
    const padCount = 10 - trimmedLines.length;
    const previewLines = [
      ...Array(padCount).fill('\u00A0'),
      ...trimmedLines.map(l => l || '\u00A0'),
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
        label: resolveGroupDisplayName(group.dirPath, sessionsState.directories, settingsProjects.value),
        sessions: getVisibleSessions([group], sessionsState.groupPrefs).map(mapSession),
      }))
      .filter((section) => section.sessions.length > 0);
  }

  return [{
    id: sessionsState.overviewGroup ?? 'current',
    label: overviewGroupLabel.value || 'Sessions',
    sessions: getOverviewSessions().map(mapSession),
  }];
});

watch(() => activeView.value, (view) => {
  if (view === 'overview') {
    if (sessionsState.overviewIsGlobal) {
      overviewGroupLabel.value = 'All Sessions';
    } else if (sessionsState.overviewGroup) {
      overviewGroupLabel.value = resolveGroupDisplayName(sessionsState.overviewGroup, sessionsState.directories, settingsProjects.value);
    } else {
      overviewGroupLabel.value = 'Sessions';
    }
  }
});

watch(() => state.activeSessionId, (next, prev) => {
  if (!next) return;
  if (prev && prev !== next) {
    state.lastSelectedSessionId = prev;
  }
  state.recentSessionId = next;
});

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

const { handleButton, handleRelease, handleModalKeyboardBridge } = useInputRouter({
  settingsVisible,
  activeView,
  bindingEditorVisible,
  draftEditorVisible,
  draftEditorRef,
  settingsPanelRef,
  settingsTab,
  overviewCollapsedIds,
  buildSettingsTabs,
  navStore,
});

function handleRenameRequest(e: Event): void {
  const detail = (e as CustomEvent).detail as { sessionId: string } | undefined;
  if (detail?.sessionId) {
    onSessionRename(detail.sessionId);
  }
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
        if (state.activeSessionId) void deliverPromptSequence(state.activeSessionId, text);
      });
      break;
    case 'new-session':
      setPendingContextText(null);
      openQuickSpawn((cliType) => {
        onSpawn(cliType);
      });
      break;
    case 'new-session-with-selection': {
      const selText = contextMenu.selectedText;
      setPendingContextText(selText || null);
      openQuickSpawn((cliType) => {
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
    case 'snap-out':
      if (state.activeSessionId) void onSessionSnapOut(state.activeSessionId);
      break;
    case 'snap-back':
      if (state.activeSessionId) void onSessionSnapBack(state.activeSessionId);
      break;
    case 'cancel':
      break;
  }
}

// Settings
function onOpenLogsFolder(): void {
  void systemClient.systemOpenLogsFolder();
}

function onOpenSettings(): void {
  settingsVisible.value = true;
  navStore.openSettings();
  settingsTab.value = state.settingsTab || 'tools';
  void loadSettingsData();
}

watch(settingsTab, () => {
  state.settingsTab = settingsTab.value;
  void loadCurrentTabBindings();
});

watch(() => toolEditor.visible, (visible) => {
  if (!visible && settingsVisible.value) {
    void loadSettingsData();
  }
});

function onCloseSettings(): void {
  settingsVisible.value = false;
  navStore.closeSettings();
}

// ── Scheduled Tasks Tab Handlers ─────────────────────────────────────────────

async function onScheduledTaskCreated(task: ScheduledTask): Promise<void> {
  console.log('[App] Scheduled task created:', task.title);
}

async function onScheduledTaskUpdated(task: ScheduledTask): Promise<void> {
  console.log('[App] Scheduled task updated:', task.title);
}

async function onScheduledTaskCancelled(taskId: string): Promise<void> {
  console.log('[App] Scheduled task cancelled:', taskId);
}

// Draft submenu actions
function onDraftNewDraft(): void {
  draftSubmenu.visible = false;
  if (!state.activeSessionId) return;
  openDraftEditor(state.activeSessionId);
}

function onChipBarPlanClick(planId: string): void {
  void chipBarStore.openPlan(planId);
}

function onChipBarAction(sequence: string): void {
  void chipBarStore.triggerAction(sequence);
}

async function onDraftSubmenuApply(draft: { id: string; text: string }): Promise<void> {
  draftSubmenu.visible = false;
  if (state.activeSessionId && draft.text) {
    void deliverPromptSequence(state.activeSessionId, draft.text);
  }
  await draftsClient.draftDelete(draft.id);
}

function onDraftSubmenuEdit(draft: { id: string; label: string; text: string }): void {
  draftSubmenu.visible = false;
  if (!state.activeSessionId) return;
  openDraftEditor(state.activeSessionId, draft);
}

async function onDraftSubmenuDelete(draft: { id: string }): Promise<void> {
  draftSubmenu.visible = false;
  await draftsClient.draftDelete(draft.id);
}

// Binding editor handlers
function onEditBinding(button: string, cliType: string, binding: any = { action: 'keyboard', sequence: '' }): void {
  bindingEditorButton.value = button;
  bindingEditorCliType.value = cliType;
  bindingEditorBinding.value = { ...binding };
  bindingEditorVisible.value = true;
}

// Bridge function for legacy binding editor
function openLegacyBindingEditor(button: string, cliType: string, binding: any): void {
  onEditBinding(button, cliType, binding);
}

// Make this function available globally for legacy code
window.openLegacyBindingEditor = openLegacyBindingEditor;

// Binding editor save
async function onBindingEditorSave(binding: any): Promise<void> {
  try {
    const result = await configClient.configSetBinding(
      bindingEditorButton.value,
      bindingEditorCliType.value,
      binding
    );
    if (result.success) {
      // Refresh bindings cache to reflect the changes
      await initConfigCache();
      // Refresh the settings display to show updated bindings
      void loadCurrentTabBindings();
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
  if (!terminalContainerRef.value) {
    await appClient.appStartupReady();
    return;
  }

  try {
    offTextDeliver = eventsClient.onTextDeliverRequest(async ({ requestId, sessionId, text, withReturn, submitSuffix, deliveryContext }) => {
      try {
        await deliverBulkText(sessionId, text, { withReturn, submitSuffix, deliveryContext: deliveryContext ?? 'background' });
        await deliveryClient.textDeliverResponse(requestId, true);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await deliveryClient.textDeliverResponse(requestId, false, message);
      }
    });
    await deliveryClient.textDeliverReady();

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

    installDirPickerBridge();

    // Keyboard → modal stack bridge (all navigation keys reach modals via unified path)
    window.addEventListener('keydown', handleModalKeyboardBridge, true);

    // Ctrl+Shift+R → inline rename request from paste-handler
    window.addEventListener('rename-session-request', handleRenameRequest);

    // Snap-out / snap-back IPC listeners
    unsubSnapOut = eventsClient.onSnapOut
      ? eventsClient.onSnapOut((sessionId: string) => {
          state.snappedOutSessions.add(sessionId);
          const tm = getTerminalManager();
          if (tm) tm.detachTerminal(sessionId, true);
        })
      : null;
    unsubSnapBack = eventsClient.onSnapBack
      ? eventsClient.onSnapBack((sessionId: string) => {
          void restoreSnappedBackSession(sessionId);
        })
      : null;

    // LLM notification IPC listener
    unsubLlmNotify = eventsClient.onLlmNotify
      ? eventsClient.onLlmNotify(({ sessionId, title, content }) => {
          llmNotificationsStore.add({ sessionId, title, content });
        })
      : null;

    onViewChange((view: ViewName) => {
      activeView.value = view;
    });

    // Wire draft/plan editor callbacks
    setDraftEditorCompatibilityOpener(openDraftEditor);
    setPlanEditorCompatibilityOpener(openPlanEditor);
    setDraftEditorCompatibilityCloser(closeDraftEditor);
    setDraftEditorCompatibilityVisibilityChecker(() => draftEditorVisible.value);
    setDraftEditorCompatibilityButtonHandler(handleDraftEditorButton);
    setPlanCompatibilityChangesChecker(hasUnsavedChanges);

    setChipBarPlanEditorOpener(openPlanEditor);

    setPlanScreenPlanEditorOpener(openPlanEditor);
    setPlanScreenContextEditorOpener(openContextEditor);
    setPlanScreenDraftEditorCloser(closeDraftEditor);
    setPlanScreenDraftEditorVisibilityChecker(() => draftEditorVisible.value);
    setPlanScreenPlanChangesChecker(hasUnsavedChanges);
    setPlanScreenBackupRestoreOpener(openBackupRestore);

    await loadCollapsePrefs();
    await chipBarStore.refresh(state.activeSessionId ?? null);
  } catch (error) {
    console.error('[App] Startup failed:', error);
  } finally {
    try {
      await appClient.appStartupReady();
    } catch (error) {
      console.error('[App] Failed to notify main process that startup completed:', error);
    }
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleModalKeyboardBridge, true);
  window.removeEventListener('rename-session-request', handleRenameRequest);
  offTextDeliver?.();
  offTextDeliver = null;
  unsubSnapOut?.();
  unsubSnapOut = null;
  unsubSnapBack?.();
  unsubSnapBack = null;
  unsubLlmNotify?.();
  unsubLlmNotify = null;
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
          <SessionList
            :has-sessions="state.sessions.length > 0"
            :groups="sessionsState.groups"
            :directories="sessionsState.directories"
            :projects="settingsProjects"
            :nav-index-map="navIndexMap"
            :active-focus="sessionsState.activeFocus"
            :sessions-focus-index="sessionsState.sessionsFocusIndex"
            :nav-list="sessionsState.navList"
            :focus-column="sessionsState.cardColumn"
            :active-session-id="state.activeSessionId"
            :editing-session-id="sessionsState.editingSessionId"
            :session-states="state.sessionStates"
            :session-activity-levels="state.sessionActivityLevels"
            :draft-counts="state.draftCounts"
            :working-plan-labels="state.workingPlanLabels"
            :working-plan-tooltips="state.workingPlanTooltips"
            :pending-schedules="state.pendingSchedules"
            :snapped-out-sessions="state.snappedOutSessions"
            :llm-notifications="llmNotificationsStore.bySession"
            :get-cli-display-name="getCliDisplayName"
            :resolve-group-display-name="resolveGroupDisplayName"
            :is-session-hidden-from-overview="(session) => isSessionHiddenFromOverview(session, sessionsState.groupPrefs)"
            :session-elapsed-text="sessionElapsedText"
            @show-global-overview="onShowGlobalOverview"
            @toggle-group-collapse="onGroupToggleCollapse"
            @show-overview="onShowOverview"
            @session-click="onSessionClick"
            @session-rename="onSessionRename"
            @commit-rename="onCommitRename"
            @cancel-rename="onCancelRename"
            @request-close="onRequestClose"
            @session-state-change="onSessionStateChange"
            @toggle-overview="onToggleOverview"
            @cancel-schedule="onCancelSchedule"
            @dismiss-notification="llmNotificationsStore.dismiss"
          />
        </section>

        <!-- Settings screen (Vue components) -->
        <SettingsPanel
          v-show="settingsVisible"
          ref="settingsPanelRef"
          :visible="settingsVisible"
          :tabs="buildSettingsTabs()"
          :active-tab="settingsTab"
          @update:active-tab="settingsTab = $event"
          @close="onCloseSettings"
        >
          <template #default="{ activeTab }">
            <ToolsTab
              v-if="activeTab === 'tools'"
              :tools="settingsTools"
              @add="onToolAdd"
              @edit="onToolEdit"
              @delete="onToolDelete"
              @move="onToolReorder"
            />
            <ProjectsTab
              v-else-if="activeTab === 'projects'"
              @changed="refreshProjects"
            />
            <ChipbarActionsTab
              v-else-if="activeTab === 'chipbar-actions'"
              :actions="settingsChipbarActions"
              @add="onChipbarActionAdd"
              @edit="onChipbarActionEdit"
              @delete="onChipbarActionDelete"
              @move="onChipbarActionMove"
            />
            <TelegramTab
              v-else-if="activeTab === 'telegram'"
              :config="settingsTelegramConfig"
              :bot-running="settingsTelegramBotRunning"
              @update-field="onTelegramUpdateField"
              @start-bot="onTelegramStartBot"
              @stop-bot="onTelegramStopBot"
            />
            <McpTab
              v-else-if="activeTab === 'mcp'"
              :config="settingsMcpConfig"
              @update="onMcpUpdate"
              @generate-token="onMcpGenerateToken"
              @run-in-cmd="onMcpRunInCmd"
            />
            <BackupTab
              v-else-if="activeTab === 'backups'"
            />
            <BindingsTab
              v-else
              :bindings="settingsBindings"
              :sequence-groups="settingsSequenceGroups"
              :cli-type="activeTab"
              :cli-label="getCliDisplayName(activeTab)"
              :addable-buttons="settingsAddableButtons"
              :copy-source-options="settingsBindingCopySources"
              :sort-field="settingsBindingSortField"
              :sort-direction="settingsBindingSortDirection"
              @add-binding="onBindingAdd"
              @edit-binding="onEditBinding($event, activeTab)"
              @delete-binding="onBindingDelete"
              @copy-from="onBindingCopyFrom"
              @sort-change="onBindingSortChange"
              @edit-sequence-group="onEditSequenceGroup"
              @delete-sequence-group="onDeleteSequenceGroup"
              @add-sequence-group="onAddSequenceGroup"
            />
          </template>
        </SettingsPanel>
      </main>

      <!-- Spawn sections pinned at bottom of sidebar -->
      <div id="schedulerSection" v-show="!settingsVisible" class="spawn-section" :class="{ 'spawn-section--collapsed': schedulerCollapsed }">
        <div class="section-label" @click="toggleSchedulerCollapse">
          <button class="section-toggle">{{ schedulerCollapsed ? '▲' : '▼' }}</button>
          <span>Scheduler</span>
        </div>
        <SchedulerSection
          :collapsed="schedulerCollapsed"
          @open="openSchedulerPopup"
          @delete="deleteScheduledTask"
        />
      </div>

      <div id="quickSpawnSection" v-show="!settingsVisible" class="spawn-section" :class="{ 'spawn-section--collapsed': spawnCollapsed }">
        <div class="section-label" @click="toggleSpawnCollapse">
          <button class="section-toggle">{{ spawnCollapsed ? '▲' : '▼' }}</button>
          <span>Quick Spawn</span>
          <span class="section-hint">Ctrl+Shift+N / Ctrl+Shift+W</span>
        </div>
        <SpawnGrid
          v-show="!spawnCollapsed"
          :items="spawnItems"
          :focus-index="sessionsState.spawnFocusIndex"
          :is-active="sessionsState.activeFocus === 'spawn'"
          @spawn="onSpawn"
        />
      </div>

      <div id="plannerSection" v-show="!settingsVisible" class="spawn-section" :class="{ 'spawn-section--collapsed': plannerCollapsed }">
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
        id="draftStrip"
        :plan-chips="chipBarPlans"
        :actions="[]"
        :visible="chipBarVisible && activeView !== 'overview'"
        @plan-chip-click="onChipBarPlanClick"
        @action-click="onChipBarAction"
      />
      <DraftEditor
        v-if="draftEditorVisible"
        ref="draftEditorRef"
        :visible="draftEditorVisible"
        :mode="draftEditorMode"
        :session-id="draftEditorSessionId"
        :draft-id="draftEditorDraftId"
        :initial-label="draftEditorLabel"
        :initial-text="draftEditorText"
        :plan-id="draftEditorPlanId"
        :plan-status="draftEditorPlanStatus"
        :plan-state-info="draftEditorPlanStateInfo"
        :plan-type="draftEditorPlanType"
        :plan-auto-implement="draftEditorPlanAutoImplement"
        :plan-human-id="draftEditorPlanHumanId"
        :plan-created-at="draftEditorPlanCreatedAt"
        :plan-state-updated-at="draftEditorPlanStateUpdatedAt"
        :plan-callbacks="draftEditorPlanCallbacks"
        :completion-notes="draftEditorCompletionNotes"
        :context-id="draftEditorContextId"
        :context-type="draftEditorContextType"
        :context-permission="draftEditorContextPermission"
        :context-callbacks="draftEditorContextCallbacks"
        :context-bound-plans="draftEditorContextBoundPlans"
        :context-bound-sequences="draftEditorContextBoundSequences"
        :context-pending-unbind-count="draftEditorPendingContextUnbinds.length"
        @save="onDraftSave"
        @apply="onDraftApply"
        @delete="onDraftDelete"
        @close="onDraftClose"
        @plan-save="onPlanSave"
        @plan-apply="onPlanApply"
        @plan-done="onPlanDone"
        @plan-delete="onPlanDelete"
        @context-save="(u) => draftEditorContextId && saveContextEditor(draftEditorContextId, u)"
        @context-delete="onContextDelete"
      />
      <div
        v-show="activeView === 'terminal'"
        class="terminal-container"
        id="terminalContainer"
        ref="terminalContainerRef"
      >
        <!-- xterm.js terminals rendered by TerminalManager -->
      </div>
      <OverviewGrid
        v-if="activeView === 'overview'"
        :sections="overviewSessions"
        :focus-index="sessionsState.overviewFocusIndex"
        :collapsed-ids="overviewCollapsedIds"
        :active-session-id="state.activeSessionId"
        :group-label="overviewGroupLabel"
        :show-section-marks="sessionsState.overviewIsGlobal"
        @select="onOverviewSelect"
        @toggle-collapse="onOverviewToggleCollapse"
        @close="navStore.closeOverview()"
      />
      <PlanScreen
        v-if="activeView === 'plan'"
        :visible="activeView === 'plan'"
        :dir-path="planScreenState.currentDir"
        :items="planScreenState.items"
        :deps="planScreenState.deps"
        :sequences="planScreenState.sequences"
        :contexts="planScreenState.contexts"
        :layout="planScreenState.layout"
        :selected-id="planScreenState.selectedId"
        :selected-context-id="planScreenState.selectedContextId"
        :selected-ids="planScreenState.selectedIds"
        :notice="planScreenState.notice"
        :related-focus-root-id="planScreenState.relatedFocusRootId"
        :related-focus-ids="planScreenState.relatedFocusIds"
        :related-transient-ids="planScreenState.relatedTransientIds"
        :filters="planScreenState.filters"
        :attachment-has-any="planScreenState.attachmentHasAny"
        @close="navStore.closePlan()"
        @pop-out="onPlanPopOut()"
        @add-node="onPlanAddNode()"
        @add-context="onPlanAddContext()"
        @export-dir="onPlanExportDirectory()"
        @clear-done="onPlanClearDone()"
        @create-sequence="onPlanCreateSequence"
        @assign-sequence="onPlanAssignSequence"
        @update-sequence="onPlanUpdateSequence"
        @delete-sequence="onPlanDeleteSequence"
        @delete-sequence-with-plans="onPlanDeleteSequenceWithPlans"
        @node-click="onPlanNodeClick"
        @context-click="onPlanContextClick"
        @context-move="onPlanContextMove"
        @context-bind="onPlanContextBind"
        @context-bind-target="onPlanContextBindTarget"
        @context-unbind="onPlanContextUnbind"
        @context-select-plan="onPlanContextSelectPlan"
        @context-edit="onPlanContextEdit"
        @context-delete="onPlanContextDelete"
        @edit-node="onPlanNodeEdit"
        @apply-node="onPlanNodeApply"
        @complete-node="onPlanNodeComplete"
        @delete-node="onPlanNodeDelete"
        @add-dep="onPlanAddDependency"
        @remove-dep="onPlanRemoveDependency"
        @toggle-related-focus="onToggleRelatedFocus"
        @toggle-type-filter="onToggleTypeFilter"
        @toggle-status-filter="onToggleStatusFilter"
        @reset-filters="onResetFilters"
        @toggle-has-attachment-filter="onToggleHasAttachmentFilter"
        @toggle-auto-filter="onToggleAutoFilter"
        @open-backups="openBackupRestore()"
      />
      <div v-if="chipActionBarVisible && activeView === 'terminal'" class="chip-action-dock">
        <ChipActionBar
          :actions="chipBarStore.actions"
          @action-click="onChipBarAction"
        />
      </div>
    </div>

    <AppModalHost
      :cli-types="state.cliTypes"
      :has-active-session="hasActiveSession"
      :has-sequences="hasSequences"
      :has-drafts="hasDrafts"
      :is-active-session-snapped-out="state.activeSessionId ? state.snappedOutSessions.has(state.activeSessionId) : false"
      v-model:binding-editor-visible="bindingEditorVisible"
      :binding-editor-button="bindingEditorButton"
      :binding-editor-cli-type="bindingEditorCliType"
      :binding-editor-binding="bindingEditorBinding"
      :backup-restore="backupRestore"
      v-model:scheduler-popup-visible="schedulerPopupVisible"
      :scheduler-popup-task-id="schedulerPopupTaskId"
      @close-session="(sessionId) => void doCloseSession(sessionId)"
      @context-menu-action="onContextMenuAction"
      @draft-new-draft="onDraftNewDraft"
      @draft-apply="onDraftSubmenuApply"
      @draft-edit="onDraftSubmenuEdit"
      @draft-delete="onDraftSubmenuDelete"
      @dir-select="onDirPickerSelect"
      @binding-save="onBindingEditorSave"
      @backup-restore="onBackupRestore"
      @backup-delete="onBackupDelete"
      @backup-now="onBackupNow"
      @backup-close="onBackupClose"
      @task-created="onScheduledTaskCreated"
      @task-updated="onScheduledTaskUpdated"
      @task-cancelled="onScheduledTaskCancelled"
    />
</template>
