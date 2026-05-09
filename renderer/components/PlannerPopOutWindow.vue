<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue';
import type { PlanStatus, PlanType } from '../../src/types/plan.js';
import type { PlanCallbacks } from './panels/DraftEditor.vue';
import PlanScreen from './panels/PlanScreen.vue';
import DraftEditor from './panels/DraftEditor.vue';
import BackupRestoreModal from './modals/BackupRestoreModal.vue';
import {
  showPlanScreen,
  hidePlanScreen,
  refreshCanvasIfVisible,
  planScreenState,
  onPlanAddDependency,
  onPlanAddContext,
  onPlanAddNode,
  onPlanAssignSequence,
  onPlanClearDone,
  onPlanContextBind,
  onPlanContextBindTarget,
  onPlanContextClick,
  onPlanContextDelete,
  onPlanContextMove,
  onPlanContextSave,
  onPlanContextSelectPlan,
  onPlanContextUnbind,
  onPlanCreateSequence,
  onPlanDeleteSequence,
  onPlanDeleteSequenceWithPlans,
  onPlanExportDirectory,
  onPlanNodeApply,
  onPlanNodeClick,
  onPlanNodeComplete,
  onPlanNodeDelete,
  onPlanNodeEdit,
  onPlanRemoveDependency,
  onPlanUpdateSequence,
  toggleHasAttachmentFilter,
  toggleRelatedFocus,
  toggleStatusFilter,
  toggleTypeFilter,
  resetFilters,
  setPlanEditorOpener,
  setDraftEditorCloser,
  setDraftEditorVisibilityChecker,
  setPlanChangesChecker,
  setBackupRestoreOpener,
} from '../plans/plan-screen.js';
import { state } from '../state.js';

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

const props = defineProps<{ dirPath: string }>();

const draftEditorVisible = ref(false);
const draftEditorMode = ref<'draft' | 'plan'>('plan');
const draftEditorSessionId = ref('');
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
const draftEditorLabel = ref('');
const draftEditorText = ref('');
const draftEditorRef = ref<InstanceType<typeof DraftEditor> | null>(null);

const backupRestore = reactive({
  visible: false,
  dirPath: '',
  snapshots: [] as BackupMeta[],
  loading: false,
});

let offPlanChanged: (() => void) | null = null;
let offSessionUpdated: (() => void) | null = null;
let offSessionSpawned: (() => void) | null = null;

function openPlanEditor(
  sessionId: string,
  plan: { id: string; title: string; description: string; status: PlanStatus; stateInfo?: string; type?: PlanType; autoImplement?: boolean; humanId?: string; createdAt?: number; stateUpdatedAt?: number; completionNotes?: string },
  callbacks: PlanCallbacks,
): void {
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

function closeDraftEditor(): void {
  draftEditorPlanCallbacks.value?.onClose?.();
  draftEditorPlanId.value = null;
  draftEditorVisible.value = false;
}

async function openBackupRestore(): Promise<void> {
  backupRestore.dirPath = planScreenState.currentDir;
  backupRestore.loading = true;
  backupRestore.visible = true;
  try {
    backupRestore.snapshots = await window.gamepadCli.planListBackups(backupRestore.dirPath);
  } catch {
    backupRestore.snapshots = [];
  } finally {
    backupRestore.loading = false;
  }
}

async function onRestoreBackup(snapshotPath: string): Promise<void> {
  const snapshot = backupRestore.snapshots.find((entry) => entry.snapshotPath === snapshotPath);
  const result = await window.gamepadCli.planRestoreBackup(snapshotPath);
  if (result && snapshot?.dirPath === planScreenState.currentDir) {
    await refreshCanvasIfVisible();
  }
  backupRestore.visible = false;
}

async function onDeleteBackup(snapshotPath: string): Promise<void> {
  await window.gamepadCli.planDeleteBackup(snapshotPath);
  backupRestore.snapshots = await window.gamepadCli.planListBackups(backupRestore.dirPath);
}

async function onBackupNow(): Promise<void> {
  await window.gamepadCli.planCreateBackupNow(backupRestore.dirPath);
  backupRestore.snapshots = await window.gamepadCli.planListBackups(backupRestore.dirPath);
}

async function loadSessions(): Promise<void> {
  state.sessions = await window.gamepadCli.sessionGetAll();
  state.activeSessionId = (await window.gamepadCli.sessionGetActive())?.id ?? null;
}

async function closeWindow(): Promise<void> {
  hidePlanScreen();
  window.close();
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

onMounted(async () => {
  document.title = `${props.dirPath} - Plans`;
  setPlanEditorOpener(openPlanEditor);
  setDraftEditorCloser(closeDraftEditor);
  setDraftEditorVisibilityChecker(() => draftEditorVisible.value);
  setPlanChangesChecker(() => draftEditorRef.value?.hasUnsavedChanges?.() ?? false);
  setBackupRestoreOpener(openBackupRestore);

  await loadSessions();
  await showPlanScreen(props.dirPath);

  offPlanChanged = window.gamepadCli.onPlanChanged((dirPath: string) => {
    if (dirPath === planScreenState.currentDir) {
      void refreshCanvasIfVisible();
    }
  });
  offSessionUpdated = window.gamepadCli.onSessionUpdated?.(() => {
    void loadSessions();
  }) ?? null;
  offSessionSpawned = window.gamepadCli.onSessionSpawned?.(() => {
    void loadSessions();
  }) ?? null;
  window.addEventListener('focus', loadSessions);
});

onUnmounted(() => {
  offPlanChanged?.();
  offSessionUpdated?.();
  offSessionSpawned?.();
  window.removeEventListener('focus', loadSessions);
  closeDraftEditor();
  hidePlanScreen();
});
</script>

<template>
  <div class="planner-popout-window">
    <DraftEditor
      v-if="draftEditorVisible"
      ref="draftEditorRef"
      :visible="draftEditorVisible"
      :mode="draftEditorMode"
      :session-id="draftEditorSessionId"
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
      @close="closeDraftEditor"
      @plan-save="onPlanSave"
      @plan-apply="onPlanApply"
      @plan-done="onPlanDone"
      @plan-delete="onPlanDelete"
    />
    <PlanScreen
      :visible="true"
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
      :can-pop-out="false"
      @close="closeWindow()"
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
      @context-save="onPlanContextSave"
      @context-delete="onPlanContextDelete"
      @edit-node="onPlanNodeEdit"
      @apply-node="onPlanNodeApply"
      @complete-node="onPlanNodeComplete"
      @delete-node="onPlanNodeDelete"
      @add-dep="onPlanAddDependency"
      @remove-dep="onPlanRemoveDependency"
      @toggle-related-focus="toggleRelatedFocus()"
      @toggle-type-filter="toggleTypeFilter"
      @toggle-status-filter="toggleStatusFilter"
      @toggle-has-attachment-filter="toggleHasAttachmentFilter"
      @reset-filters="resetFilters()"
      @open-backups="openBackupRestore()"
    />
    <BackupRestoreModal
      :visible="backupRestore.visible"
      :dir-path="backupRestore.dirPath"
      :snapshots="backupRestore.snapshots"
      :loading="backupRestore.loading"
      @restore="onRestoreBackup"
      @delete="onDeleteBackup"
      @backup-now="onBackupNow"
      @close="backupRestore.visible = false"
    />
  </div>
</template>

<style scoped>
.planner-popout-window {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
</style>
