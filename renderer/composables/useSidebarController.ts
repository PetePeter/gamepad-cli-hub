import { ref, type Ref } from 'vue';
import { state } from '../state.js';
import { sessionsState } from '../screens/sessions-state.js';
import { configClient, patternsClient, schedulerClient, sessionsClient } from '../ipc/clients.js';
import { setSpawnCollapsed, setPlannerCollapsed } from '../sidebar/section-collapse.js';
import { setDirPickerBridge } from '../screens/sessions-spawn.js';
import { openDirPicker, dirPicker, closeConfirm, setCloseConfirmCallback } from '../stores/modal-bridge.js';
import { refreshSessions, getSortField, getSortDirection, setSortField, setSortDirection } from './useAppBootstrap.js';
import { startRename, commitRename, cancelRename } from '../sidebar/session-services.js';
import { toggleSessionOverviewVisibility, setSessionState, toggleGroupCollapse } from '../screens/sessions.js';
import { isAnyBridgeModalVisible } from '../stores/modal-bridge.js';
import type { ScheduledTask } from '../../src/types/scheduled-task.js';
import type { SessionSortField, SortDirection } from '../sort-logic.js';

interface NavigationController {
  closeOverview(): Promise<void> | void;
  navigateToSession(sessionId: string): Promise<void> | void;
  openPlan(dirPath: string): Promise<void> | void;
  openOverview(dirPath: string | null, sessionId?: string): Promise<void> | void;
}

interface NotificationController {
  dismissSession(sessionId: string): void;
}

export interface SidebarControllerDeps {
  activeView: Ref<'terminal' | 'overview' | 'plan'>;
  navStore: NavigationController;
  llmNotificationsStore: NotificationController;
  refreshProjects: () => Promise<void>;
  doSpawn: (cliType: string, dirPath?: string) => void | Promise<void>;
  doCloseSession: (sessionId: string) => void | Promise<void>;
}

function normalizePathForMatch(path: string): string {
  return path.toLowerCase();
}

export function useSidebarController(deps: SidebarControllerDeps) {
  const overviewCollapsedIds = ref<Set<string>>(new Set());
  const overviewGroupLabel = ref('');
  const spawnCollapsed = ref(false);
  const plannerCollapsed = ref(false);
  const schedulerCollapsed = ref(false);
  const schedulerPopupVisible = ref(false);
  const schedulerPopupTaskId = ref<string | null>(null);

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

  async function onSessionClick(sessionId: string): Promise<void> {
    if (isAnyBridgeModalVisible()) return;
    deps.llmNotificationsStore.dismissSession(sessionId);
    if (deps.activeView.value === 'overview') {
      await deps.navStore.closeOverview();
    }
    await deps.navStore.navigateToSession(sessionId);
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

  function onRequestClose(sessionId: string, displayName: string): void {
    closeConfirm.sessionId = sessionId;
    closeConfirm.sessionName = displayName;
    closeConfirm.draftCount = state.draftCounts.get(sessionId) ?? 0;
    closeConfirm.visible = true;
    setCloseConfirmCallback((targetSessionId: string) => {
      void deps.doCloseSession(targetSessionId);
    });
  }

  async function onSessionStateChange(sessionId: string, newState: string): Promise<void> {
    await setSessionState(sessionId, newState);
  }

  function onOverviewSelect(sessionId: string): void {
    void deps.navStore.navigateToSession(sessionId);
  }

  function onOverviewToggleCollapse(sessionId: string): void {
    if (overviewCollapsedIds.value.has(sessionId)) {
      overviewCollapsedIds.value.delete(sessionId);
    } else {
      overviewCollapsedIds.value.add(sessionId);
    }
  }

  function onGroupToggleCollapse(dirPath: string): void {
    void toggleGroupCollapse(dirPath);
  }

  function onShowPlans(dirPath: string): void {
    void deps.navStore.openPlan(dirPath);
  }

  function onShowOverview(dirPath: string): void {
    void deps.navStore.openOverview(dirPath, state.activeSessionId ?? undefined);
  }

  function onShowGlobalOverview(): void {
    void deps.navStore.openOverview(null, state.activeSessionId ?? undefined);
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

  async function loadCollapsePrefs(): Promise<void> {
    try {
      const prefs = await configClient.configGetCollapsePrefs();
      if (prefs) {
        spawnCollapsed.value = prefs.spawnCollapsed ?? false;
        plannerCollapsed.value = prefs.plannerCollapsed ?? false;
        schedulerCollapsed.value = (prefs as any).schedulerCollapsed ?? false;
        setSpawnCollapsed(spawnCollapsed.value);
        setPlannerCollapsed(plannerCollapsed.value);
      }
    } catch { /* first run - defaults are fine */ }
  }

  function persistCollapsePrefs(): void {
    configClient.configSetCollapsePrefs({
      spawnCollapsed: spawnCollapsed.value,
      plannerCollapsed: plannerCollapsed.value,
      schedulerCollapsed: schedulerCollapsed.value,
    });
  }

  function toggleSpawnCollapse(): void {
    spawnCollapsed.value = !spawnCollapsed.value;
    setSpawnCollapsed(spawnCollapsed.value);
    persistCollapsePrefs();
  }

  function togglePlannerCollapse(): void {
    plannerCollapsed.value = !plannerCollapsed.value;
    setPlannerCollapsed(plannerCollapsed.value);
    persistCollapsePrefs();
  }

  function toggleSchedulerCollapse(): void {
    schedulerCollapsed.value = !schedulerCollapsed.value;
    persistCollapsePrefs();
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

  async function onSpawn(cliType: string): Promise<void> {
    await deps.refreshProjects();
    const dirs = sessionsState.directories;
    if (dirs && dirs.length > 0) {
      openDirPicker(cliType, buildDirPickerItems(dirs));
    } else {
      await deps.doSpawn(cliType);
    }
  }

  function onDirPickerSelect(path: string, selectedCliType = dirPicker.cliType): void {
    deps.doSpawn(selectedCliType, path);
  }

  function onSortChange(field: string, direction: 'asc' | 'desc'): void {
    setSortField(field as SessionSortField);
    setSortDirection(direction as SortDirection);
    void refreshSessions();
  }

  function installDirPickerBridge(): void {
    setDirPickerBridge((cliType, dirs, preselectedPath) => {
      openDirPicker(cliType, buildDirPickerItems(dirs), preselectedPath);
    });
  }

  return {
    overviewCollapsedIds,
    overviewGroupLabel,
    spawnCollapsed,
    plannerCollapsed,
    schedulerCollapsed,
    schedulerPopupVisible,
    schedulerPopupTaskId,
    getSortField,
    getSortDirection,
    buildDirPickerItems,
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
  };
}
