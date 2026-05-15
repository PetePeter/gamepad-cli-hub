<script setup lang="ts">
import { useEditorPopupStore } from '../../stores/editor-popup.js';
import {
  closeConfirm, getCloseConfirmCallback, setCloseConfirmCallback,
  contextMenu,
  planDeleteConfirm, getPlanDeleteCallback, setPlanDeleteCallback,
  clearDonePlans, getClearDonePlansCallback,
  sequencePicker, getSequencePickerCallback,
  quickSpawn, getQuickSpawnCallback, closeQuickSpawn,
  dirPicker, closeDirPicker,
  draftSubmenu,
  formModal, getFormModalResolve,
  toolEditor, getToolEditorCallback,
} from '../../stores/modal-bridge.js';
import type { ScheduledTask } from '../../../src/types/scheduled-task.js';
import CloseConfirmModal from '../modals/CloseConfirmModal.vue';
import PlanDeleteConfirmModal from '../modals/PlanDeleteConfirmModal.vue';
import SequencePickerModal from '../modals/SequencePickerModal.vue';
import QuickSpawnModal from '../modals/QuickSpawnModal.vue';
import ContextMenu from '../modals/ContextMenu.vue';
import DraftSubmenu from '../modals/DraftSubmenu.vue';
import DirPickerModal from '../modals/DirPickerModal.vue';
import FormModal from '../modals/FormModal.vue';
import ToolEditorModal from '../modals/ToolEditorModal.vue';
import EditorPopup from '../modals/EditorPopup.vue';
import BindingEditorModal from '../modals/BindingEditorModal.vue';
import EscProtectionModal from '../modals/EscProtectionModal.vue';
import BackupRestoreModal from '../modals/BackupRestoreModal.vue';
import ClearDonePlansModal from '../modals/ClearDonePlansModal.vue';
import ScheduledTasksTab from '../sidebar/ScheduledTasksTab.vue';
import ToastNotification from '../ToastNotification.vue';

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

defineProps<{
  cliTypes: string[];
  hasActiveSession: boolean;
  hasSequences: boolean;
  hasDrafts: boolean;
  isActiveSessionSnappedOut: boolean;
  bindingEditorVisible: boolean;
  bindingEditorButton: string;
  bindingEditorCliType: string;
  bindingEditorBinding: any;
  backupRestore: {
    visible: boolean;
    dirPath: string;
    snapshots: BackupMeta[];
    loading: boolean;
  };
  schedulerPopupVisible: boolean;
  schedulerPopupTaskId: string | null;
}>();

const emit = defineEmits<{
  'close-session': [sessionId: string];
  'context-menu-action': [action: string];
  'draft-new-draft': [];
  'draft-apply': [draft: { id: string; text: string }];
  'draft-edit': [draft: { id: string; label: string; text: string }];
  'draft-delete': [draft: { id: string }];
  'dir-select': [path: string, cliType: string];
  'update:bindingEditorVisible': [visible: boolean];
  'binding-save': [binding: any];
  'backup-restore': [snapshotPath: string];
  'backup-delete': [snapshotPath: string];
  'backup-now': [];
  'backup-close': [];
  'update:schedulerPopupVisible': [visible: boolean];
  'task-created': [task: ScheduledTask];
  'task-updated': [task: ScheduledTask];
  'task-cancelled': [taskId: string];
}>();

const editorPopupStore = useEditorPopupStore();

function onCancelClose(): void {
  closeConfirm.visible = false;
  setCloseConfirmCallback(null);
}

function onConfirmClose(): void {
  closeConfirm.visible = false;
  const cb = getCloseConfirmCallback();
  if (cb) {
    cb(closeConfirm.sessionId);
  } else {
    emit('close-session', closeConfirm.sessionId);
  }
  setCloseConfirmCallback(null);
}

function onPlanDeleteConfirm(): void {
  planDeleteConfirm.visible = false;
  const cb = getPlanDeleteCallback();
  setPlanDeleteCallback(null);
  cb?.();
}

function onPlanDeleteCancel(): void {
  planDeleteConfirm.visible = false;
  setPlanDeleteCallback(null);
}

function onClearDonePlansConfirm(): void {
  clearDonePlans.visible = false;
  getClearDonePlansCallback()?.();
}

function onSequencePickerSelect(sequence: string): void {
  sequencePicker.visible = false;
  getSequencePickerCallback()?.(sequence);
}

function onQuickSpawnSelect(cliType: string): void {
  const cb = getQuickSpawnCallback();
  closeQuickSpawn();
  cb?.(cliType);
}

function onDirPickerSelect(path: string): void {
  const cliType = dirPicker.cliType;
  closeDirPicker();
  emit('dir-select', path, cliType);
}

function onFormModalSave(values: Record<string, string>): void {
  formModal.visible = false;
  getFormModalResolve()?.(values);
}

function onFormModalCancel(): void {
  formModal.visible = false;
  getFormModalResolve()?.(null);
}

function onToolEditorSave(values: any): void {
  toolEditor.visible = false;
  getToolEditorCallback()?.(values);
}
</script>

<template>
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
    :item-kind="planDeleteConfirm.itemKind"
    :title="planDeleteConfirm.title"
    :message="planDeleteConfirm.message"
    :confirm-label="planDeleteConfirm.confirmLabel"
    @confirm="onPlanDeleteConfirm"
    @cancel="onPlanDeleteCancel"
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
    :cli-types="cliTypes"
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
    :is-snapped-out="isActiveSessionSnappedOut"
    :mode="contextMenu.mode"
    :mouse-x="contextMenu.mouseX"
    :mouse-y="contextMenu.mouseY"
    @action="emit('context-menu-action', $event)"
    @cancel="contextMenu.visible = false"
  />

  <DraftSubmenu
    v-model:visible="draftSubmenu.visible"
    :drafts="draftSubmenu.items"
    @new-draft="emit('draft-new-draft')"
    @apply="emit('draft-apply', $event)"
    @edit="emit('draft-edit', $event)"
    @delete="emit('draft-delete', $event)"
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
    @cancel="toolEditor.visible = false"
  />

  <EditorPopup
    :visible="editorPopupStore.visible"
    :initial-text="editorPopupStore.initialText"
    @update:visible="editorPopupStore.setVisible"
    @send="editorPopupStore.handleSend"
    @close="editorPopupStore.handleClose"
  />

  <BindingEditorModal
    :visible="bindingEditorVisible"
    :button-name="bindingEditorButton"
    :cli-type="bindingEditorCliType"
    :binding="bindingEditorBinding"
    @update:visible="emit('update:bindingEditorVisible', $event)"
    @save="emit('binding-save', $event)"
    @cancel="emit('update:bindingEditorVisible', false)"
  />

  <EscProtectionModal />

  <BackupRestoreModal
    :visible="backupRestore.visible"
    :dir-path="backupRestore.dirPath"
    :snapshots="backupRestore.snapshots"
    :loading="backupRestore.loading"
    @restore="emit('backup-restore', $event)"
    @delete="emit('backup-delete', $event)"
    @backup-now="emit('backup-now')"
    @close="emit('backup-close')"
  />

  <div
    v-if="schedulerPopupVisible"
    class="scheduler-popup-backdrop"
    @click.self="emit('update:schedulerPopupVisible', false)"
  >
    <div class="scheduler-popup">
      <ScheduledTasksTab
        popup
        :initial-create="schedulerPopupTaskId === null"
        :initial-edit-task-id="schedulerPopupTaskId"
        @task-created="emit('task-created', $event)"
        @task-updated="emit('task-updated', $event)"
        @task-cancelled="emit('task-cancelled', $event)"
        @close="emit('update:schedulerPopupVisible', false)"
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
