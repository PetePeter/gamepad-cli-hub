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

import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue';
import { state } from './state.js';
import { sessionsState } from './screens/sessions-state.js';
import { getTerminalManager } from './runtime/terminal-provider.js';
import { getCliDisplayName, getCliIcon, toDirection } from './utils.js';
import { processConfigBinding, processConfigRelease, initConfigCache, executeSequence } from './bindings.js';
import { refreshSessions, doSpawn, doSpawnShell, switchToSession, doCloseSession,
  bootstrap, teardown, startTimerRefresh, stopTimerRefresh,
  getSortField, getSortDirection, setSortField, setSortDirection,
  setPendingContextText, restoreSnappedBackSession, refreshProjects,
} from './composables/useAppBootstrap.js';
import { formatElapsed } from '../src/utils/time-parser.js';
import { type SessionSortField, type SortDirection } from './sort-logic.js';
import { findNavIndexBySessionId, getVisibleSessions, isSessionHiddenFromOverview, resolveGroupDisplayName } from './session-groups.js';
import { getOverviewSessions } from './screens/group-overview.js';
import {
  handlePlanScreenDpad,
  handlePlanScreenAction,
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
  toggleTypeFilter,
  toggleStatusFilter,
  toggleRelatedFocus,
  resetFilters,
  toggleHasAttachmentFilter,
  refreshCanvasIfVisible,
} from './plans/plan-screen.js';
import { handleSessionsScreenButton, toggleSessionOverviewVisibility, setSessionState, toggleGroupCollapse } from './screens/sessions.js';
import { usePanelResize } from './composables/usePanelResize.js';
import { setSpawnCollapsed, setPlannerCollapsed } from './sidebar/section-collapse.js';
import { setDirPickerBridge } from './screens/sessions-spawn.js';
import { onViewChange, currentView, type MainView as ViewName } from './main-view/main-view-manager.js';
import { useModalStack } from './composables/useModalStack.js';
import { useEscProtection } from './composables/useEscProtection.js';
import { useToast } from './composables/useToast.js';
import { useSettingsController } from './composables/useSettingsController.js';
import { appClient, backupsClient, configClient, deliveryClient, draftsClient, eventsClient, plansClient, sessionsClient } from './ipc/clients.js';
import {
  closeConfirm, getCloseConfirmCallback, setCloseConfirmCallback,
  contextMenu,
  planDeleteConfirm, getPlanDeleteCallback,
  clearDonePlans, getClearDonePlansCallback,
  sequencePicker, getSequencePickerCallback,
  quickSpawn, getQuickSpawnCallback, openQuickSpawn, closeQuickSpawn,
  dirPicker, openDirPicker, closeDirPicker,
  draftSubmenu,
  formModal, getFormModalResolve,
  toolEditor, getToolEditorCallback,
  isAnyBridgeModalVisible,
} from './stores/modal-bridge.js';
import { collectSequenceItems } from './modals/context-menu.js';
import { showSequencePicker } from './modals/sequence-picker.js';
import { showDraftSubmenu } from './modals/draft-submenu.js';
import { showEditorPopup } from './editor/editor-popup.js';
import { useEditorPopupStore } from './stores/editor-popup.js';
import DraftEditor from './components/panels/DraftEditor.vue';
import type { PlanStatus, PlanType } from '../../src/types/plan.js';
import type { ScheduledTask } from '../../src/types/scheduled-task.js';
import type { PlanCallbacks, ContextCallbacks } from './components/panels/DraftEditor.vue';
import {
  setDraftEditorOpener as setLegacyDraftEditorOpener,
  setPlanEditorOpener as setLegacyPlanEditorOpener,
  setDraftEditorCloser as setLegacyDraftEditorCloser,
  setDraftEditorVisibilityChecker as setLegacyDraftEditorVisibilityChecker,
  setDraftEditorButtonHandler as setLegacyDraftEditorButtonHandler,
  setPlanChangesChecker as setLegacyPlanChangesChecker,
} from './drafts/draft-editor.js';
import { saveDraftWithStableId } from './drafts/draft-save.js';
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
import {
  getActiveInputContext,
  isEditableElement,
  isEditableElementInContainer,
  MODAL_NAVIGATION_SELECTOR,
} from './input/input-ownership.js';
import { deliverPromptSequence } from './sequence-delivery.js';
import { startRename, commitRename, cancelRename } from './screens/sessions-render.js';

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
import ScheduledTasksTab from './components/sidebar/ScheduledTasksTab.vue';
import BackupTab from './components/sidebar/BackupTab.vue';

import { logEvent, navigateFocus } from './utils.js';
import { loadSessions } from './screens/sessions.js';

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
import EscProtectionModal from './components/modals/EscProtectionModal.vue';
import BackupRestoreModal from './components/modals/BackupRestoreModal.vue';
import ToastNotification from './components/ToastNotification.vue';
import ClearDonePlansModal from './components/modals/ClearDonePlansModal.vue';
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
const editorPopupStore = useEditorPopupStore();

// Draft editor state
const draftEditorVisible = ref(false);
const draftEditorMode = ref<'draft' | 'plan' | 'context'>('draft');
const draftEditorSessionId = ref('');
const draftEditorDraftId = ref<string | null>(null);
const draftEditorLabel = ref('');
const draftEditorText = ref('');
const draftEditorPlanId = ref<string | null>(null);
const draftEditorPlanStatus = ref<PlanStatus>('planning');
const draftEditorPlanStateInfo = ref('');
const draftEditorPlanType = ref<PlanType | undefined>(undefined);
const draftEditorPlanAutoImplement = ref(false);
const draftEditorPlanHumanId = ref('');
const draftEditorPlanCreatedAt = ref<number | null>(null);
const draftEditorPlanStateUpdatedAt = ref<number | null>(null);
const draftEditorPlanCallbacks = ref<PlanCallbacks | null>(null);
const draftEditorCompletionNotes = ref('');
const draftEditorContextId = ref<string | null>(null);
const draftEditorContextType = ref('Knowledge');
const draftEditorContextPermission = ref<'readonly' | 'writable'>('readonly');
const draftEditorContextCallbacks = ref<ContextCallbacks | null>(null);
const draftEditorContextBoundPlans = ref<Array<{ id: string; title: string; humanId?: string; type?: PlanType; status?: PlanStatus }>>([]);
const draftEditorContextBoundSequences = ref<Array<{ id: string; title: string }>>([]);
const draftEditorPendingContextUnbinds = ref<Array<{ targetType: 'plan' | 'sequence'; targetId: string }>>([]);
const draftEditorRef = ref<InstanceType<typeof DraftEditor> | null>(null);
let offTextDeliver: (() => void) | null = null;
let unsubSnapOut: (() => void) | null = null;
let unsubSnapBack: (() => void) | null = null;
let unsubLlmNotify: (() => void) | null = null;

// Overview state
const overviewCollapsedIds = ref<Set<string>>(new Set());
const overviewGroupLabel = ref('');

// Backup restore modal state
interface BackupMeta {
  timestamp: string;
  dirPath: string;
  planCount: number;
  dependencyCount: number;
  status: 'complete' | 'partial' | 'error';
  error?: string;
  sizeBytes?: number;
  index: number;
  snapshotPath?: string;
}

const backupRestore = reactive({
  visible: false,
  dirPath: '',
  snapshots: [] as BackupMeta[],
  loading: false,
});

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

// Section collapse
const spawnCollapsed = ref(false);
const plannerCollapsed = ref(false);
const schedulerCollapsed = ref(false);
const schedulerPopupVisible = ref(false);
const schedulerPopupTaskId = ref<string | null>(null);

// Panel resize
const { splitterRef, panelRef } = usePanelResize({
  onResized: () => { getTerminalManager()?.fitActive(); },
});
const { addToast } = useToast();

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

function normalizePathForMatch(path: string): string {
  return path.toLowerCase();
}

function findProjectForDirPath(dirPath: string) {
  const normalized = normalizePathForMatch(dirPath);
  return state.projects.find(project =>
    normalizePathForMatch(project.canonicalPath) === normalized
    || project.alternatePaths.some(alt => normalizePathForMatch(alt) === normalized));
}

function buildDirPickerItems(dirs: Array<{ name: string; path: string }>) {
  return dirs.map(dir => {
    const project = findProjectForDirPath(dir.path);
    return {
      name: dir.name,
      path: dir.path,
      projectId: project?.id,
      projectName: project?.name,
    };
  });
}

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

  // Draft editor captures gamepad input
  if (draftEditorVisible.value) {
    draftEditorRef.value?.handleButton(button);
    return;
  }

  // Settings screen
  if (settingsVisible.value) {
    if (button === 'B') {
      settingsVisible.value = false;
      navStore.closeSettings();
    } else if (button === 'A') {
      const active = document.activeElement as HTMLElement;
      if (active?.classList.contains('focusable')) {
        active.click();
      }
    } else {
      const dir = toDirection(button);
      if (dir === 'left' || dir === 'right') {
        if (settingsPanelRef.value?.handleButton) {
          settingsPanelRef.value.handleButton(button);
        } else {
          const tabs = buildSettingsTabs();
          const idx = tabs.findIndex(t => t.id === settingsTab.value);
          let nextIdx = idx + (dir === 'left' ? -1 : 1);
          if (nextIdx < 0) nextIdx = tabs.length - 1;
          if (nextIdx >= tabs.length) nextIdx = 0;
          settingsTab.value = tabs[nextIdx].id;
        }
      } else if (dir === 'up' || dir === 'down') {
        navigateFocus(dir === 'up' ? -1 : 1);
      } else if (settingsPanelRef.value?.handleButton) {
        settingsPanelRef.value.handleButton(button);
      }
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

  // Overview grid — routes before session navigation so A/B/Left/Right act on the grid.
  // Up/Down intentionally fall through to the sidebar session navigation path,
  // matching the keyboard/legacy gamepad contract and avoiding trapped overview focus.
  if (activeView.value === 'overview') {
    const sessions = getOverviewSessions();
    const count = sessions.length;
    const dir = toDirection(button);

    if (count === 0) {
      void navStore.closeOverview();
      return;
    }

    if (dir === 'left') {
      void navStore.closeOverview();
      return;
    }
    if (dir === 'right') {
      return;
    }

    if (button === 'A') {
      const session = sessions[sessionsState.overviewFocusIndex];
      if (session) {
        void navStore.navigateToSession(session.id);
      }
      return;
    }

    if (button === 'X') {
      const session = sessions[sessionsState.overviewFocusIndex];
      if (session) {
        if (overviewCollapsedIds.value.has(session.id)) {
          overviewCollapsedIds.value.delete(session.id);
        } else {
          overviewCollapsedIds.value.add(session.id);
        }
      }
      return;
    }

    if (button === 'B') {
      void navStore.closeOverview();
      return;
    }

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

async function onSessionClick(sessionId: string): Promise<void> {
  if (isAnyBridgeModalVisible()) return;
  llmNotificationsStore.dismissSession(sessionId);
  if (activeView.value === 'overview') {
    await navStore.closeOverview();
  }
  await navStore.navigateToSession(sessionId);
}

function onSessionRename(sessionId: string): void {
  startRename(sessionId);
}

async function onCommitRename(sessionId: string, newName: string): Promise<void> {
  await commitRename(sessionId, newName);
}

function onCancelRename(): void {
  cancelRename();
}

function handleRenameRequest(e: Event): void {
  const detail = (e as CustomEvent).detail as { sessionId: string } | undefined;
  if (detail?.sessionId) {
    onSessionRename(detail.sessionId);
  }
}

// ── Draft / Plan Editor ────────────────────────────────────────────────────

function openDraftEditor(sessionId: string, draft?: { id: string; label: string; text: string }) {
  draftEditorMode.value = 'draft';
  draftEditorSessionId.value = sessionId;
  draftEditorDraftId.value = draft?.id ?? null;
  draftEditorLabel.value = draft?.label ?? '';
  draftEditorText.value = draft?.text ?? '';
  draftEditorPlanCallbacks.value = null;
  draftEditorVisible.value = true;
}

function openPlanEditor(
  sessionId: string,
  plan: { id: string; title: string; description: string; status: PlanStatus; stateInfo?: string; type?: PlanType; autoImplement?: boolean; humanId?: string; createdAt?: number; stateUpdatedAt?: number; completionNotes?: string },
  callbacks: PlanCallbacks,
) {
  draftEditorMode.value = 'plan';
  draftEditorSessionId.value = sessionId;
  draftEditorPlanId.value = plan.id;
  draftEditorPlanStatus.value = plan.status;
  draftEditorPlanStateInfo.value = plan.stateInfo ?? '';
  draftEditorPlanType.value = plan.type;
  draftEditorPlanAutoImplement.value = Boolean(plan.autoImplement);
  draftEditorPlanHumanId.value = plan.humanId ?? '';
  draftEditorPlanCreatedAt.value = plan.createdAt ?? null;
  draftEditorPlanStateUpdatedAt.value = plan.stateUpdatedAt ?? plan.createdAt ?? null;
  draftEditorCompletionNotes.value = plan.completionNotes ?? '';
  draftEditorLabel.value = plan.title;
  draftEditorText.value = plan.description;
  draftEditorPlanCallbacks.value = callbacks;
  draftEditorVisible.value = true;
}

function closeDraftEditor() {
  draftEditorPlanCallbacks.value?.onClose?.();
  draftEditorContextCallbacks.value?.onClose?.();
  draftEditorPlanId.value = null;
  draftEditorContextId.value = null;
  draftEditorPendingContextUnbinds.value = [];
  draftEditorVisible.value = false;
}

function openContextEditor(
  context: { id: string; title: string; type: string; permission: 'readonly' | 'writable'; content: string; planIds?: string[]; sequenceIds?: string[] },
  callbacks: ContextCallbacks,
) {
  draftEditorMode.value = 'context';
  draftEditorSessionId.value = '';
  draftEditorContextId.value = context.id;
  draftEditorContextType.value = context.type;
  draftEditorContextPermission.value = context.permission;
  draftEditorLabel.value = context.title;
  draftEditorText.value = context.content;
  draftEditorPlanCallbacks.value = null;
  draftEditorPendingContextUnbinds.value = [];
  draftEditorContextCallbacks.value = {
    ...callbacks,
    onSave: (updates) => {
      void saveContextEditor(context.id, updates);
    },
    onUnbind: queueContextUnbind,
  };
  draftEditorContextBoundPlans.value = (context.planIds ?? [])
    .map((pid) => planScreenState.items.find((item) => item.id === pid))
    .filter(Boolean)
    .map((item) => ({
      id: item!.id,
      title: item!.title,
      humanId: item!.humanId,
      type: item!.type,
      status: item!.status,
    }));
  draftEditorContextBoundSequences.value = (context.sequenceIds ?? [])
    .map((sid) => planScreenState.sequences.find((seq) => seq.id === sid))
    .filter(Boolean) as Array<{ id: string; title: string }>;
  draftEditorVisible.value = true;
}

function queueContextUnbind(targetType: 'plan' | 'sequence', targetId: string): void {
  if (targetType === 'plan') {
    draftEditorContextBoundPlans.value = draftEditorContextBoundPlans.value.filter((plan) => plan.id !== targetId);
  } else {
    draftEditorContextBoundSequences.value = draftEditorContextBoundSequences.value.filter((sequence) => sequence.id !== targetId);
  }
  if (!draftEditorPendingContextUnbinds.value.some((entry) => entry.targetType === targetType && entry.targetId === targetId)) {
    draftEditorPendingContextUnbinds.value = [...draftEditorPendingContextUnbinds.value, { targetType, targetId }];
  }
}

async function saveContextEditor(
  id: string,
  updates: { title?: string; content?: string; type?: string; permission?: 'readonly' | 'writable' },
): Promise<void> {
  const pendingUnbinds = draftEditorPendingContextUnbinds.value;
  draftEditorPendingContextUnbinds.value = [];
  await onPlanContextSave(id, updates, pendingUnbinds);
}

function onRequestClose(sessionId: string, displayName: string): void {
  closeConfirm.sessionId = sessionId;
  closeConfirm.sessionName = displayName;
  closeConfirm.draftCount = state.draftCounts.get(sessionId) ?? 0;
  closeConfirm.visible = true;
  setCloseConfirmCallback((targetSessionId: string) => {
    void doCloseSession(targetSessionId);
  });
}

function onCancelClose(): void {
  closeConfirm.visible = false;
  setCloseConfirmCallback(null);
}

async function onConfirmClose(): Promise<void> {
  closeConfirm.visible = false;
  const cb = getCloseConfirmCallback();
  if (cb) {
    await cb(closeConfirm.sessionId);
  } else {
    await doCloseSession(closeConfirm.sessionId);
  }
  setCloseConfirmCallback(null);
}

async function onSessionStateChange(sessionId: string, newState: string): Promise<void> {
  await setSessionState(sessionId, newState);
}

// Overview actions
function onOverviewSelect(sessionId: string): void {
  void navStore.navigateToSession(sessionId);
}

function onOverviewToggleCollapse(sessionId: string): void {
  if (overviewCollapsedIds.value.has(sessionId)) {
    overviewCollapsedIds.value.delete(sessionId);
  } else {
    overviewCollapsedIds.value.add(sessionId);
  }
}

// Group actions
function onGroupToggleCollapse(dirPath: string): void {
  void toggleGroupCollapse(dirPath);
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
    await patternsClient.patternCancelSchedule(sessionId);
  } catch { /* ignore */ }
}

async function onSessionSnapOut(sessionId: string): Promise<void> {
  try {
    await sessionsClient.sessionSnapOut(sessionId);
  } catch (error) {
    console.error('Failed to snap out session:', error);
  }
}

async function onSessionSnapBack(sessionId: string): Promise<void> {
  try {
    await sessionsClient.sessionSnapBack(sessionId);
  } catch (error) {
    console.error('Failed to snap back session:', error);
  }
}

// Section collapse
async function loadCollapsePrefs(): Promise<void> {
  try {
    const prefs = await configClient.configGetCollapsePrefs();
    if (prefs) {
      spawnCollapsed.value = prefs.spawnCollapsed ?? false;
      plannerCollapsed.value = prefs.plannerCollapsed ?? false;
      schedulerCollapsed.value = (prefs as any).schedulerCollapsed ?? false;
      // Keep navigation module in sync (used by handleSessionsZone bounds checks)
      setSpawnCollapsed(spawnCollapsed.value);
      setPlannerCollapsed(plannerCollapsed.value);
    }
  } catch { /* first run — defaults are fine */ }
}

function toggleSpawnCollapse(): void {
  spawnCollapsed.value = !spawnCollapsed.value;
  setSpawnCollapsed(spawnCollapsed.value);
  configClient.configSetCollapsePrefs({
    spawnCollapsed: spawnCollapsed.value,
    plannerCollapsed: plannerCollapsed.value,
    schedulerCollapsed: schedulerCollapsed.value,
  });
}

function togglePlannerCollapse(): void {
  plannerCollapsed.value = !plannerCollapsed.value;
  setPlannerCollapsed(plannerCollapsed.value);
  configClient.configSetCollapsePrefs({
    spawnCollapsed: spawnCollapsed.value,
    plannerCollapsed: plannerCollapsed.value,
    schedulerCollapsed: schedulerCollapsed.value,
  });
}

function toggleSchedulerCollapse(): void {
  schedulerCollapsed.value = !schedulerCollapsed.value;
  configClient.configSetCollapsePrefs({
    spawnCollapsed: spawnCollapsed.value,
    plannerCollapsed: plannerCollapsed.value,
    schedulerCollapsed: schedulerCollapsed.value,
  });
}

function openSchedulerPopup(taskId: string | null): void {
  schedulerPopupTaskId.value = taskId;
  schedulerPopupVisible.value = true;
}

async function deleteScheduledTask(task: ScheduledTask): Promise<void> {
  const confirmed = window.confirm(`Delete scheduled task "${task.title}"?`);
  if (!confirmed) return;
  await schedulerClient.scheduledTaskDelete(task.id);
}

// Spawn
async function onSpawn(cliType: string): Promise<void> {
  await refreshProjects();
  const dirs = sessionsState.directories;
  if (dirs && dirs.length > 0) {
    openDirPicker(cliType, buildDirPickerItems(dirs));
  } else {
    doSpawn(cliType);
  }
}

function onDirPickerSelect(path: string): void {
  const cliType = dirPicker.cliType;
  closeDirPicker();
  doSpawn(cliType, path);
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

async function onPlanPopOut(): Promise<void> {
  if (!planScreenState.currentDir) return;
  const result = await plansClient.planPopOut(planScreenState.currentDir);
  if (!result?.success) {
    console.error('[App] Failed to pop out planner:', result?.error ?? 'unknown error');
  }
}

function onChipBarAction(sequence: string): void {
  void chipBarStore.triggerAction(sequence);
}

async function onDraftSave(payload: { label: string; text: string }): Promise<void> {
  const sessionId = draftEditorSessionId.value;
  const draftId = draftEditorDraftId.value;
  try {
    const savedDraftId = await saveDraftWithStableId(draftsClient, sessionId, draftId, payload);
    if (!draftId && savedDraftId) {
      draftEditorDraftId.value = savedDraftId;
    }
  } catch (err) {
    console.error('[App] Failed to save draft:', err);
  }
  await chipBarStore.refresh(sessionId);
}

async function onDraftApply(payload: { label: string; text: string }): Promise<void> {
  const sessionId = draftEditorSessionId.value;
  const draftId = draftEditorDraftId.value;
  closeDraftEditor();
  if (payload.text && sessionId) {
    try {
      await deliverPromptSequence(sessionId, payload.text);
    } catch (err) {
      console.error('[App] Failed to apply draft:', err);
    }
  }
  if (draftId) {
    try { await draftsClient.draftDelete(draftId); }
    catch (err) { console.error('[App] Failed to delete draft after apply:', err); }
  }
  await chipBarStore.refresh(sessionId);
}

async function onDraftDelete(): Promise<void> {
  const sessionId = draftEditorSessionId.value;
  const draftId = draftEditorDraftId.value;
  closeDraftEditor();
  if (draftId) {
    try { await draftsClient.draftDelete(draftId); }
    catch (err) { console.error('[App] Failed to delete draft:', err); }
  }
  await chipBarStore.refresh(sessionId);
}

function onDraftClose(): void {
  closeDraftEditor();
}

async function onPlanSave(updates: { title: string; description: string; status: PlanStatus; stateInfo?: string; type?: PlanType; autoImplement?: boolean }): Promise<void> {
  await draftEditorPlanCallbacks.value?.onSave?.(updates);
}

function onPlanApply(): void {
  draftEditorPlanCallbacks.value?.onApply?.();
  closeDraftEditor();
}

function onPlanDone(): void {
  draftEditorPlanCallbacks.value?.onDone?.();
  closeDraftEditor();
}

function onPlanDelete(): void {
  draftEditorPlanCallbacks.value?.onDelete?.();
  closeDraftEditor();
}

function onContextDelete(): void {
  draftEditorContextCallbacks.value?.onDelete?.();
  closeDraftEditor();
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

// Plan delete confirm
function onPlanDeleteConfirm(): void {
  planDeleteConfirm.visible = false;
  const cb = getPlanDeleteCallback();
  if (cb) cb();
}

// Filter handlers
function onToggleTypeFilter(type: 'bug' | 'feature' | 'research' | 'untyped'): void {
  toggleTypeFilter(type);
}

function onToggleStatusFilter(status: 'planning' | 'ready' | 'coding' | 'review' | 'blocked' | 'done'): void {
  toggleStatusFilter(status);
}

function onResetFilters(): void {
  resetFilters();
}

function onToggleHasAttachmentFilter(value: 'yes' | 'no'): void {
  toggleHasAttachmentFilter(value);
}

function onToggleRelatedFocus(): void {
  toggleRelatedFocus();
}

// Clear done plans confirm
function onClearDonePlansConfirm(): void {
  clearDonePlans.visible = false;
  const cb = getClearDonePlansCallback();
  if (cb) cb();
}

// Backup restore modal handlers
async function openBackupRestore(): Promise<void> {
  backupRestore.dirPath = planScreenState.currentDir;
  backupRestore.loading = true;
  backupRestore.visible = true;
  try {
    const snapshots = await backupsClient.planListBackups(backupRestore.dirPath);
    backupRestore.snapshots = snapshots;
  } catch {
    backupRestore.snapshots = [];
  } finally {
    backupRestore.loading = false;
  }
}

async function onBackupRestore(snapshotPath: string): Promise<void> {
  try {
    const snapshot = backupRestore.snapshots.find((entry) => entry.snapshotPath === snapshotPath);
    const result = await backupsClient.planRestoreBackup(snapshotPath);
    if (result && typeof result === 'object' && 'success' in result && result.success) {
      const timestamp = snapshot?.timestamp ? new Date(snapshot.timestamp).toLocaleString() : '';
      planScreenState.notice = timestamp ? `Restored backup from ${timestamp}` : 'Restored from backup';
      void refreshCanvasIfVisible();
    }
  } catch {
    planScreenState.notice = 'Restore failed';
  }
  backupRestore.visible = false;
}

async function onBackupDelete(snapshotPath: string): Promise<void> {
  try {
    await backupsClient.planDeleteBackup(snapshotPath);
    const snapshots = await backupsClient.planListBackups(backupRestore.dirPath);
    backupRestore.snapshots = snapshots;
    addToast({ message: 'Backup deleted', type: 'info' });
  } catch (err) {
    addToast({ message: err instanceof Error ? err.message : 'Failed to delete backup', type: 'error' });
  }
}

async function onBackupNow(): Promise<void> {
  try {
    const metadata = await backupsClient.planCreateBackupNow(backupRestore.dirPath);
    const snapshots = await backupsClient.planListBackups(backupRestore.dirPath);
    backupRestore.snapshots = snapshots;
    addToast({
      message: metadata?.timestamp
        ? `Backup created ${new Date(metadata.timestamp).toLocaleString()}`
        : 'Backup created',
      type: 'success',
    });
  } catch (err) {
    addToast({ message: err instanceof Error ? err.message : 'Backup failed', type: 'error' });
  }
}

function onBackupClose(): void {
  backupRestore.visible = false;
}

// Sequence picker select
function onSequencePickerSelect(seq: string): void {
  sequencePicker.visible = false;
  const cb = getSequencePickerCallback();
  if (cb) cb(seq);
}

// Quick spawn select
function onQuickSpawnSelect(cliType: string): void {
  const cb = getQuickSpawnCallback();
  closeQuickSpawn();
  if (cb) cb(cliType);
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

function isEditableElementInsideModal(element: Element | null): element is HTMLElement {
  return isEditableElement(element) && isEditableElementInContainer(
    element,
    '.modal-overlay.modal--visible, .scheduled-tasks-tab--popup',
  );
}

function handleModalKeyboardBridge(e: KeyboardEvent): void {
  const stack = useModalStack();
  if (!stack.isOpen.value) return;

  const active = document.activeElement;
  const activeContext = getActiveInputContext({
    activeElement: active,
    modalNavigationSelectors: MODAL_NAVIGATION_SELECTOR,
  });
  const editableInModal = activeContext === 'editable-field' && isEditableElementInsideModal(active);
  const interceptKeys = stack.topInterceptKeys.value;
  const escProtection = useEscProtection();

  if (escProtection.isProtecting.value && e.key !== 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    escProtection.dismissProtection();
    return;
  }

  if (e.key === 'ArrowUp') {
    if (!interceptKeys.has('arrows') || editableInModal) return;
    e.preventDefault();
    stack.handleInput('DPadUp');
  } else if (e.key === 'ArrowDown') {
    if (!interceptKeys.has('arrows') || editableInModal) return;
    e.preventDefault();
    stack.handleInput('DPadDown');
  } else if (e.key === 'ArrowLeft') {
    if (!interceptKeys.has('arrows') || editableInModal) return;
    e.preventDefault();
    stack.handleInput('DPadLeft');
  } else if (e.key === 'ArrowRight') {
    if (!interceptKeys.has('arrows') || editableInModal) return;
    e.preventDefault();
    stack.handleInput('DPadRight');
  } else if (e.key === 'Tab') {
    if (!interceptKeys.has('tab')) return;
    e.preventDefault();
    stack.handleInput(e.shiftKey ? 'ShiftTab' : 'Tab');
  } else if (e.key === 'Enter') {
    if (!interceptKeys.has('enter') || (editableInModal && document.activeElement?.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    stack.handleInput('A');
  } else if (e.key === ' ' || e.key === 'Spacebar') {
    if (!interceptKeys.has('space') || editableInModal) return;
    e.preventDefault();
    stack.handleInput('A');
  } else if (e.key === 'Escape') {
    if (!interceptKeys.has('escape')) return;
    e.preventDefault();
    stack.handleInput('B');
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
    offTextDeliver = eventsClient.onTextDeliverRequest(async ({ requestId, sessionId, text, withReturn, submitSuffix }) => {
      try {
        await deliverBulkText(sessionId, text, { withReturn, submitSuffix, deliveryContext: 'background' });
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

    // Wire sessions-spawn dir picker to Vue DirPickerModal
    setDirPickerBridge((cliType, dirs, preselectedPath) => {
      openDirPicker(cliType, buildDirPickerItems(dirs), preselectedPath);
    });

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
    setLegacyDraftEditorOpener(openDraftEditor);
    setLegacyPlanEditorOpener(openPlanEditor);
    setLegacyDraftEditorCloser(closeDraftEditor);
    setLegacyDraftEditorVisibilityChecker(() => draftEditorVisible.value);
    setLegacyDraftEditorButtonHandler((button: string) => {
      if (!draftEditorRef.value) {
        console.warn('[DraftEditor] button handler called but ref is null');
        return;
      }
      draftEditorRef.value.handleButton(button);
    });
    setLegacyPlanChangesChecker(() => draftEditorRef.value?.hasUnsavedChanges?.() ?? false);

    setChipBarPlanEditorOpener(openPlanEditor);

    setPlanScreenPlanEditorOpener(openPlanEditor);
    setPlanScreenContextEditorOpener(openContextEditor);
    setPlanScreenDraftEditorCloser(closeDraftEditor);
    setPlanScreenDraftEditorVisibilityChecker(() => draftEditorVisible.value);
    setPlanScreenPlanChangesChecker(() => draftEditorRef.value?.hasUnsavedChanges?.() ?? false);
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
        @save="onDraftSave"
        @apply="onDraftApply"
        @delete="onDraftDelete"
        @close="onDraftClose"
        @plan-save="onPlanSave"
        @plan-apply="onPlanApply"
        @plan-done="onPlanDone"
        @plan-delete="onPlanDelete"
        @context-save="(u) => draftEditorContextId.value && saveContextEditor(draftEditorContextId.value, u)"
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
        @open-backups="openBackupRestore()"
      />
      <div v-if="chipActionBarVisible && activeView === 'terminal'" class="chip-action-dock">
        <ChipActionBar
          :actions="chipBarStore.actions"
          @action-click="onChipBarAction"
        />
      </div>
    </div>

    <!-- Modals (teleported to body by each component) -->
    <CloseConfirmModal
      v-model:visible="closeConfirm.visible"
      :session-name="closeConfirm.sessionName"
      :draft-count="closeConfirm.draftCount"
      @confirm="onConfirmClose"
      @cancel="onCancelClose"
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
      @cancel="closeQuickSpawn()"
    />

    <ContextMenu
      v-model:visible="contextMenu.visible"
      :has-selection="contextMenu.hasSelection"
      :has-active-session="hasActiveSession"
      :has-sequences="hasSequences"
      :has-drafts="hasDrafts"
      :is-snapped-out="state.activeSessionId ? state.snappedOutSessions.has(state.activeSessionId) : false"
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
      @apply="onDraftSubmenuApply"
      @edit="onDraftSubmenuEdit"
      @delete="onDraftSubmenuDelete"
      @cancel="draftSubmenu.visible = false"
    />

    <DirPickerModal
      v-model:visible="dirPicker.visible"
      :cli-type="dirPicker.cliType"
      :items="dirPicker.items"
      :preselected-path="dirPicker.preselectedPath"
      @select="onDirPickerSelect"
      @cancel="closeDirPicker()"
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
      :visible="editorPopupStore.visible"
      :initial-text="editorPopupStore.initialText"
      @update:visible="editorPopupStore.setVisible"
      @send="editorPopupStore.handleSend"
      @close="editorPopupStore.handleClose"
    />

    <BindingEditorModal
      v-model:visible="bindingEditorVisible"
      :button-name="bindingEditorButton"
      :cli-type="bindingEditorCliType"
      :binding="bindingEditorBinding"
      @save="onBindingEditorSave"
      @cancel="bindingEditorVisible = false"
    />

    <EscProtectionModal />

    <BackupRestoreModal
      :visible="backupRestore.visible"
      :dir-path="backupRestore.dirPath"
      :snapshots="backupRestore.snapshots"
      :loading="backupRestore.loading"
      @restore="onBackupRestore"
      @delete="onBackupDelete"
      @backup-now="onBackupNow"
      @close="onBackupClose"
    />

    <div v-if="schedulerPopupVisible" class="scheduler-popup-backdrop" @click.self="schedulerPopupVisible = false">
      <div class="scheduler-popup">
        <ScheduledTasksTab
          popup
          :initial-create="schedulerPopupTaskId === null"
          :initial-edit-task-id="schedulerPopupTaskId"
          @task-created="onScheduledTaskCreated"
          @task-updated="onScheduledTaskUpdated"
          @task-cancelled="onScheduledTaskCancelled"
          @close="schedulerPopupVisible = false"
        />
      </div>
    </div>

    <ToastNotification />
</template>

<style scoped>
.scheduler-popup-backdrop {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.45);
}

.scheduler-popup {
  width: min(760px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
}
</style>
