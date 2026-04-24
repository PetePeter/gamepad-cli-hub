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

import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { state } from './state.js';
import SnapOutWindow from './components/SnapOutWindow.vue';
import { sessionsState } from './screens/sessions-state.js';
import { getTerminalManager } from './runtime/terminal-provider.js';
import { getCliDisplayName, getCliIcon, toDirection } from './utils.js';
import { processConfigBinding, processConfigRelease, initConfigCache, executeSequence } from './bindings.js';
import { refreshSessions, doSpawn, switchToSession, doCloseSession,
  bootstrap, teardown, startTimerRefresh, stopTimerRefresh,
  getSortField, getSortDirection, setSortField, setSortDirection,
  setPendingContextText, restoreSnappedBackSession,
} from './composables/useAppBootstrap.js';
import { formatElapsed } from '../src/utils/time-parser.js';
import { sortBindingEntries, type BindingSortField, type SessionSortField, type SortDirection } from './sort-logic.js';
import { findNavIndexBySessionId, getVisibleSessions, isSessionHiddenFromOverview, resolveGroupDisplayName } from './session-groups.js';
import { getOverviewSessions } from './screens/group-overview.js';
import { showPlanScreen, hidePlanScreen, handlePlanScreenDpad, handlePlanScreenAction, refreshCanvasIfVisible } from './plans/plan-screen.js';
import { handleSessionsScreenButton, toggleSessionOverviewVisibility, setSessionState, toggleGroupCollapse } from './screens/sessions.js';
import { usePanelResize } from './composables/usePanelResize.js';
import { setSpawnCollapsed, setPlannerCollapsed } from './sidebar/section-collapse.js';
import { setDirPickerBridge } from './screens/sessions-spawn.js';
import { onViewChange, currentView, type MainView as ViewName } from './main-view/main-view-manager.js';
import { useModalStack } from './composables/useModalStack.js';
import { useEscProtection } from './composables/useEscProtection.js';
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
  editorPopup, getEditorPopupOnSend, getEditorPopupResolve, setEditorPopupCallbacks,
  toolEditor, getToolEditorCallback,
  isAnyBridgeModalVisible,
} from './stores/modal-bridge.js';
import { collectSequenceItems } from './modals/context-menu.js';
import { showSequencePicker } from './modals/sequence-picker.js';
import { showDraftSubmenu } from './modals/draft-submenu.js';
import { showEditorPopup } from './editor/editor-popup.js';
import { showDraftEditor } from './drafts/draft-editor.js';
import { deliverBulkText, deliverViaClipboardPaste } from './paste-handler.js';
import { startRename, commitRename, cancelRename } from './screens/sessions-render.js';

// Sidebar components
import StatusStrip from './components/sidebar/StatusStrip.vue';
import SortBar from './components/sidebar/SortBar.vue';
import SessionList from './components/sidebar/SessionList.vue';
import SpawnGrid from './components/sidebar/SpawnGrid.vue';
import PlansGrid from './components/sidebar/PlansGrid.vue';

// Panel components
import MainView from './components/panels/MainView.vue';
import OverviewGrid from './components/panels/OverviewGrid.vue';
import SettingsPanel from './components/sidebar/SettingsPanel.vue';

// Settings tab components
import BindingsTab from './components/sidebar/BindingsTab.vue';
import ProfilesTab from './components/sidebar/ProfilesTab.vue';
import ToolsTab from './components/sidebar/ToolsTab.vue';
import TelegramTab from './components/sidebar/TelegramTab.vue';
import DirectoriesTab from './components/sidebar/DirectoriesTab.vue';
import ChipbarActionsTab from './components/sidebar/ChipbarActionsTab.vue';
import McpTab from './components/sidebar/McpTab.vue';

import { logEvent, showFormModal, updateProfileDisplay, navigateFocus } from './utils.js';
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
import ToastNotification from './components/ToastNotification.vue';
import ClearDonePlansModal from './components/modals/ClearDonePlansModal.vue';
import ChipBar from './components/chips/ChipBar.vue';
import ChipActionBar from './components/chips/ChipActionBar.vue';
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
let unsubSnapOut: (() => void) | null = null;
let unsubSnapBack: (() => void) | null = null;

// Overview state
const overviewCollapsedIds = ref<Set<string>>(new Set());
const overviewGroupLabel = ref('');

// Snap-out mode detection
const isSnapOut = computed(() => {
  const params = new URLSearchParams(window.location.search);
  return params.get('snapOut') === '1';
});

const snapOutSessionId = computed(() => {
  const params = new URLSearchParams(window.location.search);
  return params.get('sessionId') || '';
});

// Non-modal local state
const bindingEditorVisible = ref(false);
const bindingEditorButton = ref('');
const bindingEditorCliType = ref('');
const bindingEditorBinding = ref<any>(null);

// Settings panel state
const settingsPanelRef = ref<any>(null);
const settingsTab = ref(state.settingsTab || 'profiles');
const settingsCliTypes = ref<string[]>([]);
const settingsProfiles = ref<Array<{ name: string; isActive: boolean }>>([]);
const settingsTools = ref<Array<{ key: string; name: string; command: string; hasInitialPrompt: boolean; initialPromptCount: number }>>([]);
const settingsDirectories = ref<Array<{ name: string; path: string }>>([]);
const settingsChipbarActions = ref<Array<{ label: string; sequence: string }>>([]);
const settingsTelegramConfig = ref({ botToken: '', chatId: '', allowedUsers: '', notificationsEnabled: false });
const settingsTelegramBotRunning = ref(false);
const settingsMcpConfig = ref({ enabled: false, port: 47373, authToken: '' });
const settingsNotificationsEnabled = ref(false);
const settingsBindings = ref<Array<{ button: string; action: string; label: string; detail: string }>>([]);
const settingsSequenceGroups = ref<Array<{ name: string; items: Array<{ label: string; sequence: string }> }>>([]);
const settingsBindingSortField = ref<BindingSortField>('button');
const settingsBindingSortDirection = ref<SortDirection>('asc');

// Section collapse
const spawnCollapsed = ref(false);
const plannerCollapsed = ref(false);

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

const ALL_BINDING_BUTTONS = [
  'A', 'B', 'X', 'Y',
  'DPadUp', 'DPadDown', 'DPadLeft', 'DPadRight',
  'LeftBumper', 'RightBumper', 'LeftTrigger', 'RightTrigger',
  'LeftStick', 'RightStick',
  'Sandwich', 'Back', 'Xbox',
  'LeftStickUp', 'LeftStickDown', 'LeftStickLeft', 'LeftStickRight',
  'RightStickUp', 'RightStickDown', 'RightStickLeft', 'RightStickRight',
] as const;

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
const chipBarHasPills = computed(() =>
  chipBarDrafts.value.length > 0 ||
  chipBarPlans.value.length > 0,
);
const settingsAddableButtons = computed(() => {
  const mapped = new Set(settingsBindings.value.map((binding) => binding.button));
  return ALL_BINDING_BUTTONS.filter((button) => !mapped.has(button));
});
const settingsBindingCopySources = computed(() =>
  settingsCliTypes.value
    .filter((cliType) => cliType !== settingsTab.value)
    .map((cliType) => ({
      id: cliType,
      label: getCliDisplayName(cliType),
    })),
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
        label: resolveGroupDisplayName(group.dirPath, sessionsState.directories),
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
      overviewGroupLabel.value = resolveGroupDisplayName(sessionsState.overviewGroup, sessionsState.directories);
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

  // Overview grid — routes before session navigation so A/B/Left/Right act on the grid
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

    if (dir === 'up') {
      if (sessionsState.overviewFocusIndex > 0) {
        sessionsState.overviewFocusIndex--;
      }
      return;
    }
    if (dir === 'down') {
      if (sessionsState.overviewFocusIndex < count - 1) {
        sessionsState.overviewFocusIndex++;
      }
      return;
    }

    return;
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
  void navStore.navigateToSession(sessionId);
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
    await window.gamepadCli.patternCancelSchedule(sessionId);
  } catch { /* ignore */ }
}

async function onSessionSnapOut(sessionId: string): Promise<void> {
  try {
    await window.gamepadCli.sessionSnapOut(sessionId);
  } catch (error) {
    console.error('Failed to snap out session:', error);
  }
}

async function onSessionSnapBack(sessionId: string): Promise<void> {
  try {
    await window.gamepadCli.sessionSnapBack(sessionId);
  } catch (error) {
    console.error('Failed to snap back session:', error);
  }
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
    openDirPicker(cliType, dirs.map(d => ({ name: d.name, path: d.path })));
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
        if (state.activeSessionId) void deliverBulkText(state.activeSessionId, text);
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
  window.gamepadCli?.openLogsFolder();
}

async function loadSettingsData(): Promise<void> {
  if (!window.gamepadCli) return;

  // Load CLI types
  settingsCliTypes.value = state.cliTypes.length > 0
    ? state.cliTypes
    : (await window.gamepadCli.configGetCliTypes());
  const validTabs = new Set([
    'profiles',
    ...settingsCliTypes.value,
    'tools',
    'chipbar-actions',
    'directories',
    'telegram',
    'mcp',
  ]);
  if (!validTabs.has(settingsTab.value)) {
    settingsTab.value = 'profiles';
  }

  // Load profiles
  const profiles = await window.gamepadCli.profileList();
  const activeProfile = await window.gamepadCli.profileGetActive();
  settingsProfiles.value = profiles.map((name: string) => ({
    name,
    isActive: name === activeProfile,
  }));

  // Load notifications setting
  try {
    settingsNotificationsEnabled.value = await window.gamepadCli.configGetNotifications();
  } catch {
    settingsNotificationsEnabled.value = false;
  }

  // Load tools
  try {
    const toolsData = await window.gamepadCli.toolsGetAll();
    const cliTypes = toolsData?.cliTypes || {};
    settingsTools.value = Object.entries(cliTypes).map(([key, value]: [string, any]) => ({
      key,
      name: value.name || key,
      command: value.command || '',
      hasInitialPrompt: Array.isArray(value.initialPrompt) && value.initialPrompt.length > 0,
      initialPromptCount: Array.isArray(value.initialPrompt) ? value.initialPrompt.length : 0,
    }));
  } catch {
    settingsTools.value = [];
  }

  // Load directories
  try {
    const dirs = await window.gamepadCli.configGetWorkingDirs();
    settingsDirectories.value = dirs || [];
    sessionsState.directories = dirs || [];
  } catch {
    settingsDirectories.value = [];
    sessionsState.directories = [];
  }

  // Load chipbar actions
  try {
    const chipbarData = await window.gamepadCli.configGetChipbarActions();
    settingsChipbarActions.value = chipbarData?.actions || [];
  } catch {
    settingsChipbarActions.value = [];
  }

  // Load telegram config
  try {
    const tgConfig = await window.gamepadCli.telegramGetConfig();
    settingsTelegramConfig.value = {
      botToken: tgConfig?.botToken || '',
      chatId: tgConfig?.chatId ? String(tgConfig.chatId) : '',
      allowedUsers: (tgConfig?.allowedUserIds || []).join(', '),
      notificationsEnabled: tgConfig?.enabled || false,
    };
    settingsTelegramBotRunning.value = await window.gamepadCli.telegramIsRunning();
  } catch {
    settingsTelegramConfig.value = { botToken: '', chatId: '', allowedUsers: '', notificationsEnabled: false };
    settingsTelegramBotRunning.value = false;
  }

  // Load MCP config
  try {
    const mcpConfig = await window.gamepadCli.configGetMcpConfig();
    settingsMcpConfig.value = {
      enabled: mcpConfig?.enabled ?? false,
      port: mcpConfig?.port ?? 47373,
      authToken: mcpConfig?.authToken || '',
    };
  } catch {
    settingsMcpConfig.value = { enabled: false, port: 47373, authToken: '' };
  }

  // Load current tab bindings
  try {
    const prefs = await window.gamepadCli.configGetSortPrefs('bindings');
    settingsBindingSortField.value = (prefs?.field as BindingSortField) || 'button';
    settingsBindingSortDirection.value = (prefs?.direction as SortDirection) || 'asc';
  } catch {
    settingsBindingSortField.value = 'button';
    settingsBindingSortDirection.value = 'asc';
  }

  await loadCurrentTabBindings();
}

async function loadCurrentTabBindings(): Promise<void> {
  const tab = settingsTab.value;
  if (tab === 'profiles' || tab === 'tools' || tab === 'chipbar-actions' || tab === 'directories' || tab === 'telegram' || tab === 'mcp') {
    settingsBindings.value = [];
    settingsSequenceGroups.value = [];
    return;
  }

  let bindings = state.cliBindingsCache[tab];
  if (!bindings && window.gamepadCli) {
    bindings = await window.gamepadCli.configGetBindings(tab);
    if (bindings) state.cliBindingsCache[tab] = bindings;
  }

  const sortedEntries = sortBindingEntries(
    Object.entries(bindings || {}),
    settingsBindingSortField.value,
    settingsBindingSortDirection.value,
  );

  // Convert bindings to BindingEntry format
  const entries = sortedEntries.map(([button, binding]: [string, any]) => ({
    button,
    action: binding.action || '',
    label: binding.label || binding.action || '',
    detail: binding.sequence || binding.command || '',
  }));
  settingsBindings.value = entries;

  // Load sequence groups
  try {
    const sequences = state.cliSequencesCache[tab] || await window.gamepadCli.configGetSequences(tab);
    if (sequences) {
      state.cliSequencesCache[tab] = sequences;
      settingsSequenceGroups.value = Object.entries(sequences).map(([name, items]: [string, any]) => ({
        name,
        items: Array.isArray(items) ? items : [],
      }));
    } else {
      settingsSequenceGroups.value = [];
    }
  } catch {
    settingsSequenceGroups.value = [];
  }
}

function buildSettingsTabs() {
  return [
    { id: 'profiles', label: '👤 Profiles' },
    ...settingsCliTypes.value.map(ct => ({
      id: ct,
      label: getCliDisplayName(ct),
    })),
    { id: 'tools', label: '🔧 Tools' },
    { id: 'chipbar-actions', label: '⚡ Quick Actions' },
    { id: 'directories', label: '📁 Dirs' },
    { id: 'telegram', label: '📨 Telegram' },
    { id: 'mcp', label: '🧩 MCP' },
  ];
}

function onOpenSettings(): void {
  settingsVisible.value = true;
  navStore.openSettings();
  settingsTab.value = state.settingsTab || 'profiles';
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

// ── Profiles Tab Handlers ──────────────────────────────────────────────────

async function onProfileCreate(): Promise<void> {
  const existingProfiles = settingsProfiles.value.map(p => p.name);
  const result = await showFormModal('Create Profile', [
    { key: 'name', label: 'Profile Name', required: true, placeholder: 'e.g. my-profile' },
    { key: 'copyFrom', label: 'Copy from', type: 'select', options: [
      { value: '', label: '(None — start empty)' },
      ...existingProfiles.map(p => ({ value: p, label: p })),
    ] },
  ]);

  if (!result || !result.name) return;

  try {
    const createResult = await window.gamepadCli.profileCreate(result.name, result.copyFrom || undefined);
    if (createResult.success) {
      logEvent(`Created profile: ${result.name}`);
      void loadSettingsData();
    } else {
      logEvent('Profile creation failed');
    }
  } catch (error) {
    console.error('Failed to create profile:', error);
    logEvent(`Profile create error: ${error}`);
  }
}

async function onProfileSwitch(name: string): Promise<void> {
  const tm = getTerminalManager();
  const sessionCount = tm?.getCount() ?? 0;

  if (sessionCount > 0) {
    const result = await showFormModal('Switch Profile', [{
      key: 'action',
      label: `${sessionCount} terminal(s) are open. What should happen?`,
      type: 'select',
      options: [
        { value: 'keep', label: 'Keep sessions open' },
        { value: 'close', label: 'Close all sessions' },
      ],
      defaultValue: 'keep',
    }]);
    if (!result) return;

    if (result.action === 'close' && tm) {
      tm.dispose();
      state.sessions = [];
      state.activeSessionId = null;
    }
  }

  await window.gamepadCli.profileSwitch(name);
  state.cliTypes = await window.gamepadCli.configGetCliTypes();
  state.availableSpawnTypes = state.cliTypes;
  await initConfigCache();
  useChipBarStore().invalidateActions();
  void useChipBarStore().refresh();
  updateProfileDisplay();
  logEvent(`Profile: ${name}`);
  void loadSettingsData();
  loadSessions();
}

async function onProfileDelete(name: string): Promise<void> {
  try {
    const result = await window.gamepadCli.profileDelete(name);
    if (result.success) {
      logEvent(`Deleted profile: ${name}`);
      void loadSettingsData();
    }
  } catch (error) {
    console.error('Delete profile failed:', error);
  }
}

async function onToggleNotifications(enabled: boolean): Promise<void> {
  await window.gamepadCli.configSetNotifications(enabled);
  logEvent(`Notifications: ${enabled ? 'ON' : 'OFF'}`);
}

// ── Tools Tab Handlers ─────────────────────────────────────────────────────

function onToolAdd(): void {
  toolEditor.mode = 'add';
  toolEditor.editKey = '';
  toolEditor.initialData = {
    name: '',
    command: '',
    args: '',
    env: [],
    initialPromptDelay: 0,
    pasteMode: 'pty',
    spawnCommand: '',
    resumeCommand: '',
    continueCommand: '',
    renameCommand: '',
    handoffCommand: '',
    initialPrompt: [],
  };
  toolEditor.visible = true;
}

async function onToolEdit(key: string): Promise<void> {
  try {
    const toolsData = await window.gamepadCli.toolsGetAll();
    const value = toolsData?.cliTypes?.[key];
    if (!value) return;

    toolEditor.mode = 'edit';
    toolEditor.editKey = key;
    toolEditor.initialData = {
      name: value.name || key,
      command: value.command || '',
      args: value.args || '',
      env: Array.isArray(value.env)
        ? value.env.map((i: any) => ({ name: i.name || '', value: i.value || '' }))
        : [],
      initialPromptDelay: value.initialPromptDelay ?? 0,
      pasteMode: value.pasteMode || 'pty',
      spawnCommand: value.spawnCommand || '',
      resumeCommand: value.resumeCommand || '',
      continueCommand: value.continueCommand || '',
      renameCommand: value.renameCommand || '',
      handoffCommand: value.handoffCommand || '',
      initialPrompt: Array.isArray(value.initialPrompt)
        ? value.initialPrompt.map((i: any) => ({ label: i.label || '', sequence: i.sequence || '' }))
        : [],
    };
    toolEditor.visible = true;
  } catch (error) {
    console.error('Failed to load tool for edit:', error);
  }
}

async function onToolDelete(key: string): Promise<void> {
  try {
    const result = await window.gamepadCli.toolsRemoveCliType(key);
    if (result.success) {
      logEvent(`Deleted CLI type: ${key}`);
      delete state.cliBindingsCache[key];
      delete state.cliSequencesCache[key];
      state.cliTypes = await window.gamepadCli.configGetCliTypes();
      state.availableSpawnTypes = state.cliTypes;
      loadSessions();
      void loadSettingsData();
    } else {
      logEvent(`Failed to delete: ${result.error || 'unknown error'}`);
    }
  } catch (error) {
    console.error('Delete CLI type failed:', error);
  }
}

// ── Directories Tab Handlers ───────────────────────────────────────────────

async function onDirectoryAdd(name: string, path: string): Promise<void> {
  try {
    const result = await window.gamepadCli.configAddWorkingDir(name, path);
    if (result.success) {
      const dirs = await window.gamepadCli.configGetWorkingDirs();
      settingsDirectories.value = dirs || [];
      sessionsState.directories = dirs || [];
      logEvent(`Added directory: ${name}`);
    } else {
      logEvent('Failed to add directory');
    }
  } catch (error) {
    console.error('Add directory failed:', error);
    logEvent('Failed to add directory');
  }
}

async function onDirectoryEdit(index: number, _name: string, _path: string): Promise<void> {
  const dir = settingsDirectories.value[index];
  if (!dir) return;

  const result = await showFormModal('Edit Directory', [
    { key: 'name', label: 'Name', required: true, defaultValue: dir.name },
    { key: 'path', label: 'Path', required: true, defaultValue: dir.path, browse: true },
  ]);

  if (!result) return;

  const updateResult = await window.gamepadCli.configUpdateWorkingDir(index, result.name, result.path);
  if (updateResult.success) {
    const dirs = await window.gamepadCli.configGetWorkingDirs();
    settingsDirectories.value = dirs || [];
    sessionsState.directories = dirs || [];
    logEvent(`Updated directory: ${result.name}`);
  } else {
    logEvent('Failed to update directory');
  }
}

async function onDirectoryDelete(index: number): Promise<void> {
  const dir = settingsDirectories.value[index];
  if (!dir) return;

  try {
    const result = await window.gamepadCli.configRemoveWorkingDir(index);
    if (result.success) {
      const dirs = await window.gamepadCli.configGetWorkingDirs();
      settingsDirectories.value = dirs || [];
      sessionsState.directories = dirs || [];
      logEvent(`Deleted directory: ${dir.name}`);
    }
  } catch (error) {
    console.error('Delete directory failed:', error);
  }
}

// ── Chipbar Actions Tab Handlers ───────────────────────────────────────────

async function onChipbarActionAdd(): Promise<void> {
  const result = await showFormModal('Add Chip Bar Action', [
    {
      key: 'label',
      label: 'Label',
      required: true,
      placeholder: 'e.g. 💾 Save Plan',
      help: 'Button label shown in the chipbar (emojis recommended)',
    },
    {
      key: 'sequence',
      label: 'Sequence',
      type: 'textarea',
      required: true,
      placeholder: 'e.g. Write exactly one JSON file into {inboxDir}/ and do not write it anywhere else.{Enter}',
      help: 'Sequence to send when clicked. Use {Enter}, {Ctrl+C}, and template expansions.',
    },
  ]);

  if (!result) return;

  const label = result.label?.trim();
  const sequence = result.sequence?.trim();

  if (!label || !sequence) {
    logEvent('Add chip bar action: label and sequence are required');
    return;
  }

  try {
    const chipbarData = await window.gamepadCli.configGetChipbarActions();
    const updatedActions = [...(chipbarData?.actions || []), { label, sequence }];
    const saveResult = await window.gamepadCli.configSetChipbarActions(updatedActions);
    if (saveResult.success) {
      settingsChipbarActions.value = updatedActions;
      useChipBarStore().invalidateActions();
      void useChipBarStore().refresh();
      logEvent(`Added chip bar action: ${label}`);
    } else {
      throw new Error(saveResult.error || 'Failed to add chip bar action');
    }
  } catch (error) {
    console.error('Add chip bar action failed:', error);
    logEvent(`Failed to add action: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

async function onChipbarActionEdit(index: number): Promise<void> {
  const action = settingsChipbarActions.value[index];
  if (!action) return;

  const result = await showFormModal(`Edit Chip Bar Action: ${action.label}`, [
    {
      key: 'label',
      label: 'Label',
      required: true,
      defaultValue: action.label,
      help: 'Button label shown in the chipbar',
    },
    {
      key: 'sequence',
      label: 'Sequence',
      type: 'textarea',
      required: true,
      defaultValue: action.sequence,
      help: 'Sequence to send when clicked.',
    },
  ]);

  if (!result) return;

  const label = result.label?.trim() || action.label;
  const sequence = result.sequence?.trim() || action.sequence;

  if (!label || !sequence) {
    logEvent('Edit chip bar action: label and sequence are required');
    return;
  }

  try {
    const updatedActions = [...settingsChipbarActions.value];
    updatedActions[index] = { label, sequence };
    const saveResult = await window.gamepadCli.configSetChipbarActions(updatedActions);
    if (saveResult.success) {
      settingsChipbarActions.value = updatedActions;
      useChipBarStore().invalidateActions();
      void useChipBarStore().refresh();
      logEvent(`Updated chip bar action: ${label}`);
    } else {
      throw new Error(saveResult.error || 'Failed to update chip bar action');
    }
  } catch (error) {
    console.error('Update chip bar action failed:', error);
    logEvent(`Failed to update action: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

async function onChipbarActionDelete(index: number): Promise<void> {
  const action = settingsChipbarActions.value[index];
  if (!action) return;

  try {
    const updatedActions = settingsChipbarActions.value.filter((_, i) => i !== index);
    const result = await window.gamepadCli.configSetChipbarActions(updatedActions);
    if (result.success) {
      settingsChipbarActions.value = updatedActions;
      useChipBarStore().invalidateActions();
      void useChipBarStore().refresh();
      logEvent(`Deleted chip bar action: ${action.label}`);
    } else {
      throw new Error(result.error || 'Failed to delete chip bar action');
    }
  } catch (error) {
    console.error('Delete chip bar action failed:', error);
    logEvent(`Failed to delete action: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

async function onChipbarActionMove(fromIndex: number, toIndex: number): Promise<void> {
  const actions = [...settingsChipbarActions.value];
  const [moved] = actions.splice(fromIndex, 1);
  actions.splice(toIndex, 0, moved);

  try {
    const result = await window.gamepadCli.configSetChipbarActions(actions);
    if (result.success) {
      settingsChipbarActions.value = actions;
      useChipBarStore().invalidateActions();
      void useChipBarStore().refresh();
      logEvent(`Moved chip bar action from position ${fromIndex + 1} to ${toIndex + 1}`);
    } else {
      throw new Error(result.error || 'Failed to reorder chip bar action');
    }
  } catch (error) {
    console.error('Move chip bar action failed:', error);
  }
}

// ── Telegram Tab Handlers ──────────────────────────────────────────────────

async function onTelegramUpdateField(field: string, value: string | boolean): Promise<void> {
  try {
    if (field === 'notificationsEnabled') {
      await window.gamepadCli.telegramSetConfig({ enabled: Boolean(value) });
      settingsTelegramConfig.value.notificationsEnabled = Boolean(value);
    } else if (field === 'botToken') {
      await window.gamepadCli.telegramSetConfig({ botToken: String(value) });
      settingsTelegramConfig.value.botToken = String(value);
    } else if (field === 'chatId') {
      await window.gamepadCli.telegramSetConfig({ chatId: String(value) });
      settingsTelegramConfig.value.chatId = String(value);
    } else if (field === 'allowedUsers') {
      const ids = String(value).split(',').map(s => s.trim()).filter(Boolean);
      await window.gamepadCli.telegramSetConfig({ allowedUserIds: ids });
      settingsTelegramConfig.value.allowedUsers = String(value);
    }
  } catch (error) {
    console.error('Failed to update Telegram config:', error);
  }
}

async function onTelegramStartBot(): Promise<void> {
  try {
    await window.gamepadCli.telegramStartBot();
    settingsTelegramBotRunning.value = true;
  } catch (error) {
    console.error('Failed to start Telegram bot:', error);
  }
}

async function onTelegramStopBot(): Promise<void> {
  try {
    await window.gamepadCli.telegramStopBot();
    settingsTelegramBotRunning.value = false;
  } catch (error) {
    console.error('Failed to stop Telegram bot:', error);
  }
}

// ── MCP Tab Handlers ───────────────────────────────────────────────────────

async function onMcpUpdate(updates: Partial<{ enabled: boolean; port: number; authToken: string }>): Promise<void> {
  try {
    await window.gamepadCli.configSetMcpConfig(updates);
    settingsMcpConfig.value = { ...settingsMcpConfig.value, ...updates };
  } catch (error) {
    console.error('Failed to update MCP config:', error);
  }
}

async function onMcpGenerateToken(): Promise<void> {
  try {
    const result = await window.gamepadCli.configGenerateMcpToken();
    if (result?.success && typeof result.token === 'string') {
      settingsMcpConfig.value.authToken = result.token;
      await window.gamepadCli.configSetMcpConfig({ authToken: result.token });
    }
  } catch (error) {
    console.error('Failed to generate MCP token:', error);
  }
}

// ── Bindings Tab Handlers ──────────────────────────────────────────────────

function onBindingAdd(button?: string): void {
  const targetButton = button || settingsAddableButtons.value[0];
  if (!targetButton) {
    logEvent('All buttons already have bindings');
    return;
  }

  onEditBinding(targetButton, settingsTab.value);
}

async function onBindingDelete(button: string): Promise<void> {
  try {
    const result = await window.gamepadCli.configSetBinding(button, settingsTab.value, null);
    if (result.success) {
      await initConfigCache();
      void loadCurrentTabBindings();
      logEvent(`Deleted binding for ${button}`);
    }
  } catch (error) {
    console.error('Failed to delete binding:', error);
  }
}

async function onBindingCopyFrom(sourceCli: string): Promise<void> {
  try {
    const result = await window.gamepadCli.configCopyCliBindings(sourceCli, settingsTab.value);
    if (result.success) {
      await initConfigCache();
      void loadCurrentTabBindings();
      logEvent(`Copied bindings from ${getCliDisplayName(sourceCli)}`);
    } else {
      logEvent(`Failed to copy bindings: ${result.error || 'unknown error'}`);
    }
  } catch (error) {
    console.error('Failed to copy bindings:', error);
  }
}

async function onBindingSortChange(field: string, direction: 'asc' | 'desc'): Promise<void> {
  settingsBindingSortField.value = field as BindingSortField;
  settingsBindingSortDirection.value = direction;
  try {
    await window.gamepadCli.configSetSortPrefs('bindings', { field, direction });
  } catch (error) {
    console.error('Failed to save binding sort prefs:', error);
  }
  await loadCurrentTabBindings();
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
  const cb = getQuickSpawnCallback();
  closeQuickSpawn();
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
      void loadCurrentTabBindings();
    }
    bindingEditorVisible.value = false;
  } catch (error) {
    console.error('Failed to save binding:', error);
    // Keep modal open if save fails
  }
}

function isEditableElement(element: Element | null): element is HTMLElement {
  return !!element && (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.tagName === 'SELECT' ||
    (element as HTMLElement).isContentEditable
  );
}

function isEditableElementInsideModal(element: Element | null): element is HTMLElement {
  return isEditableElement(element) && !!element.closest('.modal-overlay.modal--visible');
}

function handleModalKeyboardBridge(e: KeyboardEvent): void {
  const stack = useModalStack();
  if (!stack.isOpen.value) return;

  const active = document.activeElement;
  const editableInModal = isEditableElementInsideModal(active);
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
    await window.gamepadCli.appStartupReady();
    return;
  }

  try {
    offTextDeliver = window.gamepadCli.onTextDeliverRequest(async ({ requestId, sessionId, text }) => {
      try {
        const session = state.sessions.find(s => s.id === sessionId);
        const tool = session ? state.cliToolsCache?.[session.cliType] : undefined;

        // Use clipboard+Ctrl+V only for 'clippaste' pasteMode (terminal paste mode)
        if (tool?.pasteMode === 'clippaste') {
          await deliverViaClipboardPaste(text);
        } else {
          // Use standard delivery for other pasteMode options
          await deliverBulkText(sessionId, text);
        }
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
      openDirPicker(cliType, dirs, preselectedPath);
    });

    // Keyboard → modal stack bridge (all navigation keys reach modals via unified path)
    window.addEventListener('keydown', handleModalKeyboardBridge, true);

    // Ctrl+Shift+R → inline rename request from paste-handler
    window.addEventListener('rename-session-request', handleRenameRequest);

    // Snap-out / snap-back IPC listeners
    unsubSnapOut = window.gamepadCli?.onSnapOut
      ? window.gamepadCli.onSnapOut((sessionId: string) => {
          state.snappedOutSessions.add(sessionId);
          const tm = getTerminalManager();
          if (tm) tm.detachTerminal(sessionId);
        })
      : null;
    unsubSnapBack = window.gamepadCli?.onSnapBack
      ? window.gamepadCli.onSnapBack((sessionId: string) => {
          void restoreSnappedBackSession(sessionId);
        })
      : null;
    onViewChange((view: ViewName) => {
      activeView.value = view;
    });

    await loadCollapsePrefs();
    await chipBarStore.refresh(state.activeSessionId ?? null);
  } catch (error) {
    console.error('[App] Startup failed:', error);
  } finally {
    try {
      await window.gamepadCli.appStartupReady();
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
  teardown();
});
</script>

<template>
  <SnapOutWindow
    v-if="isSnapOut"
    :session-id="snapOutSessionId"
  />
  <template v-else>
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
          <SessionList
            :has-sessions="state.sessions.length > 0"
            :groups="sessionsState.groups"
            :directories="sessionsState.directories"
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
            <ProfilesTab
              v-if="activeTab === 'profiles'"
              :profiles="settingsProfiles"
              :active-profile="state.activeProfile"
              :notifications-enabled="settingsNotificationsEnabled"
              @create="onProfileCreate"
              @switch="onProfileSwitch"
              @delete="onProfileDelete"
              @toggle-notifications="onToggleNotifications"
            />
            <ToolsTab
              v-else-if="activeTab === 'tools'"
              :tools="settingsTools"
              @add="onToolAdd"
              @edit="onToolEdit"
              @delete="onToolDelete"
            />
            <DirectoriesTab
              v-else-if="activeTab === 'directories'"
              :directories="settingsDirectories"
              @add="onDirectoryAdd"
              @edit="onDirectoryEdit"
              @delete="onDirectoryDelete"
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
            />
          </template>
        </SettingsPanel>
      </main>

      <!-- Spawn sections pinned at bottom of sidebar -->
      <div v-show="!settingsVisible" class="spawn-section" :class="{ 'spawn-section--collapsed': spawnCollapsed }">
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
        id="draftStrip"
        :drafts="chipBarDrafts"
        :plan-chips="chipBarPlans"
        :actions="[]"
        :visible="chipBarVisible && activeView !== 'overview'"
        :show-new-draft="false"
        @draft-click="onChipBarDraftClick"
        @plan-chip-click="onChipBarPlanClick"
        @new-draft="onChipBarNewDraft"
        @action-click="onChipBarAction"
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
      <div v-if="chipActionBarVisible && activeView === 'terminal'" class="chip-action-dock">
        <ChipActionBar
          :actions="chipBarStore.actions"
          :show-new-draft="true"
          @new-draft="onChipBarNewDraft"
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

    <EscProtectionModal />

    <ToastNotification />
  </template>
</template>
