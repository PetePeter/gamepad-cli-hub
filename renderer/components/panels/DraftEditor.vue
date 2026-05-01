<script setup lang="ts">
/**
 * DraftEditor.vue — Slide-down editor panel for drafts and plans.
 *
 * Replaces draft-editor.ts with a reactive Vue component.
 * Handles both draft mode (per-session memos) and plan mode (plan item editing).
 */
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import type { PlanStatus } from '../../src/types/plan.js';
import type { PlanAttachment } from '../../src/types/plan-attachment.js';
import { formatDateTime } from '../../utils/date-format.js';
import PromptTextarea from '../common/PromptTextarea.vue';

export interface PlanCallbacks {
  onSave: (updates: { title: string; description: string; status: PlanStatus; stateInfo?: string; type?: 'bug' | 'feature' | 'research' }) => void;
  onDelete: () => void;
  onDone?: () => void;
  onApply?: () => void;
  onClose?: () => void;
}

export interface DraftEditorProps {
  visible: boolean;
  mode: 'draft' | 'plan';
  sessionId: string;
  draftId?: string | null;
  initialLabel?: string;
  initialText?: string;
  planId?: string | null;
  planStatus?: PlanStatus;
  planStateInfo?: string;
  planHumanId?: string;
  planCreatedAt?: number | null;
  planStateUpdatedAt?: number | null;
  planType?: 'bug' | 'feature' | 'research';
  planCallbacks?: PlanCallbacks | null;
  completionNotes?: string;
}

const props = withDefaults(defineProps<DraftEditorProps>(), {
  draftId: null,
  initialLabel: '',
  initialText: '',
  planId: null,
  planStatus: 'planning',
  planStateInfo: '',
  planHumanId: '',
  planCreatedAt: null,
  planStateUpdatedAt: null,
  planType: undefined,
  planCallbacks: null,
  completionNotes: '',
});

const emit = defineEmits<{
  'update:visible': [visible: boolean];
  save: [{ label: string; text: string }];
  apply: [{ label: string; text: string }];
  delete: [];
  close: [];
  'plan-save': [updates: { title: string; description: string; status: PlanStatus; stateInfo?: string; type?: 'bug' | 'feature' | 'research' }];
  'plan-apply': [];
  'plan-done': [];
  'plan-delete': [];
}>();

const label = ref(props.initialLabel);
const text = ref(props.initialText);
const status = ref<PlanStatus>(props.planStatus);
const stateInfo = ref(props.planStateInfo);
const type = ref<'bug' | 'feature' | 'research' | undefined>(props.planType);
const saveStatus = ref<'clean' | 'unsaved' | 'saving' | 'saved'>('clean');
const autoSaveTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const focusIndex = ref(0);
const hydratingFromProps = ref(false);

const origLabel = ref(props.initialLabel);
const origText = ref(props.initialText);
const origStatus = ref<PlanStatus>(props.planStatus);
const origStateInfo = ref(props.planStateInfo);
const origType = ref<'bug' | 'feature' | 'research' | undefined>(props.planType);

const labelInputRef = ref<HTMLInputElement | null>(null);
const stateSelectRef = ref<HTMLSelectElement | null>(null);
const stateInfoRef = ref<HTMLInputElement | null>(null);
const typeSelectRef = ref<HTMLSelectElement | null>(null);

const attachments = ref<PlanAttachment[]>([]);
const attachmentsLoading = ref(false);
const attachmentBusyId = ref<string | null>(null);
const attachmentError = ref('');

const resizeObserver = ref<ResizeObserver | null>(null);
const heightDebounceTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const editorHeightKey = computed(() => (isDraft.value ? 'draftEditorHeight' : 'planEditorHeight'));

const isDraft = computed(() => props.mode === 'draft');
const isPlan = computed(() => props.mode === 'plan');
const activePlanStatus = computed<PlanStatus>(() => (
  stateSelectRef.value?.disabled ? props.planStatus : status.value
));

const titleText = computed(() => {
  if (isDraft.value) return props.draftId ? '📝 Edit Draft' : '📝 New Draft';
  const statusLabels: Record<string, string> = {
    planning: '⏸ Planning', ready: '▶ Ready', coding: '🔄 Coding', review: '⏳ Review', blocked: '⛔ Blocked', done: '✓ Done',
  };
  return `🗺️ Edit Plan · ${statusLabels[activePlanStatus.value] ?? activePlanStatus.value}`;
});

const showPlanStateSelect = computed(() => isPlan.value);
const showPlanStateInfo = computed(() => isPlan.value);
const requiresStateInfo = computed(() => isPlan.value && (status.value === 'blocked' || status.value === 'done'));
const canSavePlan = computed(() => {
  if (!requiresStateInfo.value) return true;
  const trimmed = stateInfo.value.trim();
  return status.value === 'done' ? trimmed.length >= 10 : trimmed.length > 0;
});

const showDoneButton = computed(() => isPlan.value && !!props.planCallbacks?.onDone && (activePlanStatus.value === 'coding' || activePlanStatus.value === 'review'));
const showApplyButton = computed(() => isDraft.value || (!!props.planCallbacks?.onApply && (activePlanStatus.value === 'ready' || activePlanStatus.value === 'coding' || activePlanStatus.value === 'review')));
const applyButtonText = computed(() => isDraft.value ? 'Apply' : (activePlanStatus.value === 'coding' || activePlanStatus.value === 'review') ? '↻ Apply Again' : '▶ Apply');

const hasUnsavedChanges = computed(() => {
  if (isDraft.value) return label.value.trim() !== origLabel.value || text.value !== origText.value;
  return label.value !== origLabel.value || text.value !== origText.value || status.value !== origStatus.value || stateInfo.value !== origStateInfo.value || type.value !== origType.value;
});

const saveStatusText = computed(() => ({ unsaved: '● Unsaved', saving: '◑ Saving…', saved: '✓ Saved' }[saveStatus.value] ?? ''));

const planMetaText = computed(() => {
  if (!isPlan.value) return '';
  const parts: string[] = [];
  if (props.planHumanId) parts.push(props.planHumanId);
  if (props.planCreatedAt) parts.push(`Created ${formatDateTime(props.planCreatedAt)}`);
  if (props.planStateUpdatedAt) parts.push(`State ${formatDateTime(props.planStateUpdatedAt)}`);
  return parts.join('  ·  ');
});

const focusableElements = computed(() => {
  const elements: (HTMLElement | null)[] = [labelInputRef.value];
  if (showPlanStateSelect.value) {
    elements.push(typeSelectRef.value);
    elements.push(stateSelectRef.value);
  }
  if (showPlanStateInfo.value) elements.push(stateInfoRef.value);
  return elements.filter(Boolean) as HTMLElement[];
});

watch(() => props.visible, (visible) => {
  if (visible) {
    hydratingFromProps.value = true;
    label.value = props.initialLabel;
    text.value = props.initialText;
    status.value = props.planStatus;
    stateInfo.value = props.planStateInfo;
    type.value = props.planType;
    origLabel.value = props.initialLabel;
    origText.value = props.initialText;
    origStatus.value = props.planStatus;
    origStateInfo.value = props.planStateInfo;
    origType.value = props.planType;
    saveStatus.value = 'clean';
    focusIndex.value = 0;
    nextTick(() => {
      hydratingFromProps.value = false;
      applyFocus();
      applyPersistedHeight().then(() => setupHeightObserver());
    });
  } else {
    hydratingFromProps.value = false;
    teardownHeightObserver();
    if (autoSaveTimer.value) {
      clearTimeout(autoSaveTimer.value);
      autoSaveTimer.value = null;
    }
  }
}, { immediate: true });

watch(() => props.initialLabel, (val) => { if (props.visible) label.value = val; });
watch(() => props.initialText, (val) => { if (props.visible) text.value = val; });
watch(() => props.planId, () => {
  if (!props.visible || !isPlan.value) return;
  hydratingFromProps.value = true;
  label.value = props.initialLabel;
  text.value = props.initialText;
  status.value = props.planStatus;
  stateInfo.value = props.planStateInfo;
  type.value = props.planType;
  origLabel.value = props.initialLabel;
  origText.value = props.initialText;
  origStatus.value = props.planStatus;
  origStateInfo.value = props.planStateInfo;
  origType.value = props.planType;
  saveStatus.value = 'clean';
  nextTick(() => { hydratingFromProps.value = false; });
});

watch([label, text, status, stateInfo, type], () => {
  if (!props.visible || hydratingFromProps.value) return;
  if (saveStatus.value === 'clean' || saveStatus.value === 'saved') saveStatus.value = 'unsaved';
  scheduleAutoSave();
}, { flush: 'post' });

function applyFocus(): void {
  const elements = focusableElements.value;
  if (focusIndex.value >= elements.length) focusIndex.value = 0;
  elements[focusIndex.value]?.focus();
}

function handleButton(button: string): boolean {
  const dir = button === 'DPadUp' || button === 'ArrowUp' ? 'up' : button === 'DPadDown' || button === 'ArrowDown' ? 'down' : null;
  if (dir === 'down') { focusIndex.value = (focusIndex.value + 1) % focusableElements.value.length; applyFocus(); return true; }
  if (dir === 'up') { const len = focusableElements.value.length; focusIndex.value = (focusIndex.value - 1 + len) % len; applyFocus(); return true; }
  if (button === 'A') { const active = document.activeElement; if (active?.tagName === 'BUTTON') (active as HTMLButtonElement).click(); return true; }
  if (button === 'B') { emit('close'); return true; }
  return false;
}

function onSave(): void {
  if (isDraft.value) {
    if (!label.value.trim()) return;
    emit('save', { label: label.value.trim(), text: text.value });
    emit('close');
  } else {
    if (!canSavePlan.value) { stateInfoRef.value?.focus(); return; }
    emit('plan-save', { title: label.value, description: text.value, status: status.value, stateInfo: stateInfo.value.trim(), type: type.value });
    emit('close');
  }
}

function onApply(): void {
  if (isDraft.value) emit('apply', { label: label.value.trim(), text: text.value });
  else emit('plan-apply');
}

function onDone(): void {
  status.value = 'done';
  if (!canSavePlan.value) { stateInfoRef.value?.focus(); return; }
  emit('plan-save', { title: label.value, description: text.value, status: 'done', stateInfo: stateInfo.value.trim(), type: type.value });
  emit('close');
}

function onDelete(): void { isDraft.value ? emit('delete') : emit('plan-delete'); }
function onCancel(): void { emit('close'); }

function scheduleAutoSave(): void {
  if (autoSaveTimer.value) clearTimeout(autoSaveTimer.value);
  autoSaveTimer.value = setTimeout(() => {
    autoSaveTimer.value = null;
    if (hasUnsavedChanges.value) doAutoSave();
  }, 500);
}

function doAutoSave(): void {
  if (isDraft.value) {
    if (!label.value.trim()) return;
    saveStatus.value = 'saving';
    emit('save', { label: label.value.trim(), text: text.value });
    origLabel.value = label.value.trim(); origText.value = text.value; saveStatus.value = 'saved';
  } else {
    if (!props.planCallbacks?.onSave || !canSavePlan.value) return;
    saveStatus.value = 'saving';
    props.planCallbacks.onSave({ title: label.value, description: text.value, status: status.value, stateInfo: stateInfo.value.trim(), type: type.value });
    origLabel.value = label.value; origText.value = text.value; origStatus.value = status.value; origStateInfo.value = stateInfo.value.trim(); origType.value = type.value; saveStatus.value = 'saved';
  }
  setTimeout(() => { if (saveStatus.value === 'saved') saveStatus.value = 'clean'; }, 2000);
}

function getHasUnsavedChanges(): boolean { return hasUnsavedChanges.value; }

function onKeyDown(e: KeyboardEvent): void {
  if ((e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSave(); }
  else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSave(); }
  else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
}

function onLabelKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); }
  else onKeyDown(e);
}

function onStateSelectChange(): void {}

function formatAttachmentSize(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
  if (sizeBytes >= 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${sizeBytes} B`;
}

async function loadAttachments(): Promise<void> {
  const planId = props.planId;
  if (!planId || !isPlan.value) { attachments.value = []; return; }
  attachmentsLoading.value = true; attachmentError.value = '';
  try { attachments.value = await window.gamepadCli.planAttachmentList?.(planId) ?? []; }
  catch { attachmentError.value = 'Could not load attachments'; attachments.value = []; }
  finally { attachmentsLoading.value = false; }
}

async function addAttachment(): Promise<void> {
  const planId = props.planId;
  if (!planId) return;
  attachmentError.value = '';
  const filePath = await window.gamepadCli.dialogShowOpenFile?.([{ name: 'All Files', extensions: ['*'] }]);
  if (!filePath) return;
  const result = await window.gamepadCli.planAttachmentAddFile?.(planId, filePath);
  if (!result) { attachmentError.value = 'Could not attach file (max 10 MB)'; return; }
  await loadAttachments();
}

async function openAttachment(att: PlanAttachment): Promise<void> {
  const planId = props.planId;
  if (!planId) return;
  attachmentBusyId.value = att.id; attachmentError.value = '';
  try { const ok = await window.gamepadCli.planAttachmentOpen?.(planId, att.id); if (!ok) attachmentError.value = 'Could not open attachment'; }
  finally { attachmentBusyId.value = null; }
}

async function deleteAttachment(att: PlanAttachment): Promise<void> {
  const planId = props.planId;
  if (!planId) return;
  attachmentBusyId.value = att.id; attachmentError.value = '';
  try { const ok = await window.gamepadCli.planAttachmentDelete?.(planId, att.id); if (!ok) { attachmentError.value = 'Could not delete attachment'; return; } await loadAttachments(); }
  finally { attachmentBusyId.value = null; }
}

watch([() => props.planId, () => props.visible], ([, visible]) => {
  if (visible && isPlan.value) void loadAttachments();
  else attachments.value = [];
}, { immediate: true });

async function applyPersistedHeight(): Promise<void> {}
function scheduleHeightSave(): void {}
function setupHeightObserver(): void {}
function teardownHeightObserver(): void {
  if (resizeObserver.value) { resizeObserver.value.disconnect(); resizeObserver.value = null; }
  if (heightDebounceTimer.value) { clearTimeout(heightDebounceTimer.value); heightDebounceTimer.value = null; }
}

onMounted(() => { if (props.visible) applyPersistedHeight().then(() => setupHeightObserver()); });
onUnmounted(() => { teardownHeightObserver(); });

defineExpose({ handleButton, hasUnsavedChanges: getHasUnsavedChanges });
</script>

<template>
  <div v-if="visible" class="draft-editor">
    <div class="draft-editor-header">
      <span class="draft-editor-title">{{ titleText }}</span>
      <div class="draft-editor-actions">
        <span v-if="saveStatus !== 'clean'" class="plan-save-status" :class="`plan-save-status--${saveStatus}`">{{ saveStatusText }}</span>
        <button class="btn btn--primary btn--sm" @click="onSave">Save</button>
        <button v-if="showApplyButton" class="btn btn--primary btn--sm" @click="onApply">{{ applyButtonText }}</button>
        <button v-if="showDoneButton" class="btn btn--success btn--sm" @click="onDone">✓ Done</button>
        <button class="btn btn--danger btn--sm" @click="onDelete">Delete</button>
        <button class="btn btn--secondary btn--sm" @click="onCancel">Cancel</button>
      </div>
    </div>
    <div v-if="planMetaText" class="draft-editor-plan-meta">{{ planMetaText }}</div>

    <div class="draft-editor-title-row">
      <input ref="labelInputRef" v-model="label" type="text" class="draft-editor-label" placeholder="Title..." maxlength="100" @keydown="onLabelKeyDown" />
      <select v-if="isPlan" ref="typeSelectRef" v-model="type" class="draft-editor-plan-select draft-editor-type-select">
        <option :value="undefined">None</option><option value="bug">Bug</option><option value="feature">Feature</option><option value="research">Research</option>
      </select>
      <select v-if="showPlanStateSelect" ref="stateSelectRef" v-model="status" class="draft-editor-plan-select draft-editor-status-select" @change="onStateSelectChange">
        <option value="planning">⏸ Planning</option><option value="ready">▶ Ready</option><option value="coding">🔄 Coding</option><option value="review">⏳ Review</option><option value="blocked">⛔ Blocked</option><option value="done">✓ Done</option>
      </select>
      <input v-if="showPlanStateInfo" ref="stateInfoRef" v-model="stateInfo" type="text" class="draft-editor-plan-info" :placeholder="status === 'done' ? 'Required completion notes...' : requiresStateInfo ? 'Required blocker reason...' : 'Add state context...'" maxlength="200" />
    </div>

    <PromptTextarea
      v-model="text"
      placeholder="Enter your prompt..."
      :rows="4"
      :min-rows="4"
      :max-rows="18"
      textarea-class="draft-editor-content"
    />

    <div v-if="isPlan && planId" class="draft-editor-attachments">
      <div class="draft-editor-attachments__header"><span class="draft-editor-attachments__title">Attachments</span><button class="btn btn--secondary btn--sm" @click="addAttachment">Attach File</button></div>
      <div v-if="attachmentError" class="draft-editor-attachments__error">{{ attachmentError }}</div>
      <div v-if="attachmentsLoading" class="draft-editor-attachments__empty">Loading…</div>
      <div v-else-if="attachments.length === 0" class="draft-editor-attachments__empty">No attachments</div>
      <div v-else class="draft-editor-attachments__list">
        <div v-for="att in attachments" :key="att.id" class="draft-editor-attachments__row">
          <span class="draft-editor-attachments__name">{{ att.filename }}</span><span class="draft-editor-attachments__size">{{ formatAttachmentSize(att.sizeBytes) }}</span>
          <button class="btn btn--secondary btn--sm" :disabled="attachmentBusyId === att.id" @click="openAttachment(att)">Open</button>
          <button class="btn btn--danger btn--sm" :disabled="attachmentBusyId === att.id" @click="deleteAttachment(att)">Delete</button>
        </div>
      </div>
    </div>

    <div v-if="mode === 'plan' && planStatus === 'done' && completionNotes" class="draft-editor__completion-notes">
      <label>Completion Notes</label>
      <p class="draft-editor__completion-notes-text">{{ completionNotes }}</p>
    </div>
  </div>
</template>

<style scoped>
.draft-editor-attachments { border-top: 1px solid #2a2a2a; padding-top: 10px; margin-top: 4px; display: flex; flex-direction: column; gap: 6px; }
.draft-editor-attachments__header { display: flex; align-items: center; justify-content: space-between; }
.draft-editor-attachments__title { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
.draft-editor-attachments__empty, .draft-editor-attachments__error { font-size: 12px; color: #666; }
.draft-editor-attachments__error { color: #ff9a9a; }
.draft-editor-attachments__list { display: flex; flex-direction: column; gap: 4px; }
.draft-editor-attachments__row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto; align-items: center; gap: 6px; padding: 5px 8px; background: #151515; border: 1px solid #2a2a2a; border-radius: 4px; }
.draft-editor-attachments__name { font-size: 12px; color: #ddd; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.draft-editor-attachments__size { font-size: 11px; color: #666; white-space: nowrap; }
.draft-editor__completion-notes { margin-top: 12px; padding: 12px; background: var(--bg-tertiary); border-radius: 4px; border-left: 3px solid #44cc44; }
.draft-editor__completion-notes label { display: block; font-size: 0.8rem; font-weight: 500; color: var(--text-secondary); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
.draft-editor__completion-notes-text { margin: 0; font-size: 0.9rem; color: var(--text-primary); white-space: pre-wrap; line-height: 1.5; }
</style>
