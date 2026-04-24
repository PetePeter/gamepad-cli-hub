<script setup lang="ts">
/**
 * DraftEditor.vue — Slide-down editor panel for drafts and plans.
 *
 * Replaces draft-editor.ts with a reactive Vue component.
 * Handles both draft mode (per-session memos) and plan mode (plan item editing).
 */
import { ref, computed, watch, nextTick } from 'vue';
import type { PlanStatus } from '../../src/types/plan.js';

export interface PlanCallbacks {
  onSave: (updates: { title: string; description: string; status: PlanStatus; stateInfo?: string }) => void;
  onDelete: () => void;
  onDone?: () => void;
  onApply?: () => void;
  onClose?: () => void;
}

export interface DraftEditorProps {
  visible: boolean;
  mode: 'draft' | 'plan';
  sessionId: string;
  // Draft-specific
  draftId?: string | null;
  initialLabel?: string;
  initialText?: string;
  // Plan-specific
  planId?: string | null;
  planStatus?: PlanStatus;
  planStateInfo?: string;
  planCallbacks?: PlanCallbacks | null;
}

const props = withDefaults(defineProps<DraftEditorProps>(), {
  draftId: null,
  initialLabel: '',
  initialText: '',
  planId: null,
  planStatus: 'pending',
  planStateInfo: '',
  planCallbacks: null,
});

const emit = defineEmits<{
  'update:visible': [visible: boolean];
  save: [{ label: string; text: string }];
  apply: [{ label: string; text: string }];
  delete: [];
  close: [];
  // Plan-specific events
  'plan-save': [updates: { title: string; description: string; status: PlanStatus; stateInfo?: string }];
  'plan-apply': [];
  'plan-done': [];
  'plan-delete': [];
}>();

// ── Reactive state ─────────────────────────────────────────────────────────

const label = ref(props.initialLabel);
const text = ref(props.initialText);
const status = ref<PlanStatus>(props.planStatus);
const stateInfo = ref(props.planStateInfo);
const saveStatus = ref<'clean' | 'unsaved' | 'saving' | 'saved'>('clean');
const autoSaveTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const focusIndex = ref(0);
const hydratingFromProps = ref(false);

// Originals for unsaved detection
const origLabel = ref(props.initialLabel);
const origText = ref(props.initialText);
const origStatus = ref<PlanStatus>(props.planStatus);
const origStateInfo = ref(props.planStateInfo);

// Refs for focus management
const labelInputRef = ref<HTMLInputElement | null>(null);
const contentInputRef = ref<HTMLTextAreaElement | null>(null);
const stateSelectRef = ref<HTMLSelectElement | null>(null);
const stateInfoRef = ref<HTMLInputElement | null>(null);

// ── Computed ───────────────────────────────────────────────────────────────

const isDraft = computed(() => props.mode === 'draft');
const isPlan = computed(() => props.mode === 'plan');
const activePlanStatus = computed<PlanStatus>(() => (
  stateSelectRef.value?.disabled ? props.planStatus : status.value
));

const titleText = computed(() => {
  if (isDraft.value) {
    return props.draftId ? '📝 Edit Draft' : '📝 New Draft';
  }
  const statusLabels: Record<string, string> = {
    pending: '⏸ Pending',
    startable: '▶ Ready',
    doing: '🔄 In Progress',
    'wait-tests': '⏳ Wait Tests',
    blocked: '⛔ Blocked',
    question: '❓ Question',
    done: '✓ Done',
  };
  return `🗺️ Edit Plan · ${statusLabels[activePlanStatus.value] ?? activePlanStatus.value}`;
});

const showPlanStateSelect = computed(() => isPlan.value);
const showPlanStateInfo = computed(() => isPlan.value && (status.value === 'blocked' || status.value === 'question'));

const showDoneButton = computed(() => {
  if (!isPlan.value || !props.planCallbacks?.onDone) return false;
  return activePlanStatus.value === 'doing' || activePlanStatus.value === 'wait-tests';
});

const showApplyButton = computed(() => {
  if (isDraft.value) return true;
  if (!props.planCallbacks?.onApply) return false;
  return activePlanStatus.value === 'startable' || activePlanStatus.value === 'doing' || activePlanStatus.value === 'wait-tests';
});

const applyButtonText = computed(() => {
  if (isDraft.value) return 'Apply';
  if (activePlanStatus.value === 'doing' || activePlanStatus.value === 'wait-tests') return '↻ Apply Again';
  return '▶ Apply';
});

const hasUnsavedChanges = computed(() => {
  if (isDraft.value) {
    return label.value.trim() !== origLabel.value || text.value !== origText.value;
  }
  const effectiveStatus = stateSelectRef.value?.disabled ? props.planStatus : status.value;
  const effectiveStateInfo = showPlanStateInfo.value ? stateInfo.value : '';
  return label.value !== origLabel.value ||
    text.value !== origText.value ||
    effectiveStatus !== origStatus.value ||
    effectiveStateInfo !== origStateInfo.value;
});

const saveStatusText = computed(() => {
  const labels: Record<string, string> = {
    unsaved: '● Unsaved',
    saving: '◑ Saving…',
    saved: '✓ Saved',
  };
  return labels[saveStatus.value] ?? '';
});

// Focusable elements in order
const focusableElements = computed(() => {
  const elements: (HTMLElement | null)[] = [
    labelInputRef.value,
  ];
  if (showPlanStateSelect.value) {
    elements.push(stateSelectRef.value);
  }
  if (showPlanStateInfo.value) {
    elements.push(stateInfoRef.value);
  }
  elements.push(contentInputRef.value);
  // Buttons are always focusable
  return elements.filter(Boolean) as HTMLElement[];
});

// ── Watchers ───────────────────────────────────────────────────────────────

watch(() => props.visible, (visible) => {
  if (visible) {
    hydratingFromProps.value = true;
    label.value = props.initialLabel;
    text.value = props.initialText;
    status.value = props.planStatus;
    stateInfo.value = props.planStateInfo;
    origLabel.value = props.initialLabel;
    origText.value = props.initialText;
    origStatus.value = props.planStatus;
    origStateInfo.value = props.planStateInfo;
    saveStatus.value = 'clean';
    focusIndex.value = 0;
    nextTick(() => {
      hydratingFromProps.value = false;
      applyFocus();
    });
  } else {
    hydratingFromProps.value = false;
    if (autoSaveTimer.value) {
      clearTimeout(autoSaveTimer.value);
      autoSaveTimer.value = null;
    }
  }
});

watch(() => props.initialLabel, (val) => {
  if (props.visible) label.value = val;
});

watch(() => props.initialText, (val) => {
  if (props.visible) text.value = val;
});

// Mark as unsaved on input
watch([label, text, status, stateInfo], () => {
  if (!props.visible || hydratingFromProps.value) return;
  if (saveStatus.value === 'clean' || saveStatus.value === 'saved') {
    saveStatus.value = 'unsaved';
  }
  scheduleAutoSave();
}, { flush: 'post' });

// ── Methods ────────────────────────────────────────────────────────────────

function applyFocus(): void {
  const elements = focusableElements.value;
  if (focusIndex.value >= elements.length) focusIndex.value = 0;
  const el = elements[focusIndex.value];
  el?.focus();
}

function handleButton(button: string): boolean {
  const dir = button === 'DPadUp' || button === 'ArrowUp' ? 'up' :
    button === 'DPadDown' || button === 'ArrowDown' ? 'down' : null;

  if (dir === 'down') {
    focusIndex.value = (focusIndex.value + 1) % focusableElements.value.length;
    applyFocus();
    return true;
  }
  if (dir === 'up') {
    const len = focusableElements.value.length;
    focusIndex.value = (focusIndex.value - 1 + len) % len;
    applyFocus();
    return true;
  }

  switch (button) {
    case 'A': {
      // A on a focused button clicks it, on input does nothing special
      const active = document.activeElement;
      if (active?.tagName === 'BUTTON') {
        (active as HTMLButtonElement).click();
      }
      return true;
    }
    case 'B':
      emit('close');
      return true;
  }
  return false;
}

function onSave(): void {
  if (isDraft.value) {
    if (!label.value.trim()) return;
    emit('save', { label: label.value.trim(), text: text.value });
    emit('close');
  } else {
    const effectiveStatus = stateSelectRef.value?.disabled ? props.planStatus : status.value;
    const effectiveStateInfo = (effectiveStatus === 'blocked' || effectiveStatus === 'question')
      ? stateInfo.value : '';
    emit('plan-save', {
      title: label.value,
      description: text.value,
      status: effectiveStatus,
      stateInfo: effectiveStateInfo,
    });
    emit('close');
  }
}

function onApply(): void {
  if (isDraft.value) {
    emit('apply', { label: label.value.trim(), text: text.value });
  } else {
    emit('plan-apply');
  }
}

function onDone(): void {
  emit('plan-done');
}

function onDelete(): void {
  if (isDraft.value) {
    emit('delete');
  } else {
    emit('plan-delete');
  }
}

function onCancel(): void {
  emit('close');
}

function scheduleAutoSave(): void {
  if (autoSaveTimer.value) clearTimeout(autoSaveTimer.value);
  autoSaveTimer.value = setTimeout(() => {
    autoSaveTimer.value = null;
    if (hasUnsavedChanges.value) {
      doAutoSave();
    }
  }, 500);
}

function doAutoSave(): void {
  if (isDraft.value) {
    if (!label.value.trim()) return;
    saveStatus.value = 'saving';
    emit('save', { label: label.value.trim(), text: text.value });
    origLabel.value = label.value.trim();
    origText.value = text.value;
    saveStatus.value = 'saved';
    setTimeout(() => {
      if (saveStatus.value === 'saved') saveStatus.value = 'clean';
    }, 2000);
  } else {
    if (!props.planCallbacks?.onSave) return;
    const effectiveStatus = stateSelectRef.value?.disabled ? props.planStatus : status.value;
    const effectiveStateInfo = (effectiveStatus === 'blocked' || effectiveStatus === 'question')
      ? stateInfo.value : '';
    saveStatus.value = 'saving';
    props.planCallbacks.onSave({
      title: label.value,
      description: text.value,
      status: effectiveStatus,
      stateInfo: effectiveStateInfo,
    });
    origLabel.value = label.value;
    origText.value = text.value;
    origStatus.value = effectiveStatus;
    origStateInfo.value = effectiveStateInfo;
    saveStatus.value = 'saved';
    setTimeout(() => {
      if (saveStatus.value === 'saved') saveStatus.value = 'clean';
    }, 2000);
  }
}

function getHasUnsavedChanges(): boolean {
  return hasUnsavedChanges.value;
}

function onKeyDown(e: KeyboardEvent): void {
  if ((e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    onSave();
  } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    onSave();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    onCancel();
  }
}

function onLabelKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    contentInputRef.value?.focus();
  } else {
    onKeyDown(e);
  }
}

function onStateSelectChange(): void {
  // Reactive watcher handles visibility
}

// Expose handleButton for parent
defineExpose({ handleButton, hasUnsavedChanges: getHasUnsavedChanges });
</script>

<template>
  <div v-if="visible" class="draft-editor">
    <div class="draft-editor-header">
      <span class="draft-editor-title">{{ titleText }}</span>
      <div class="draft-editor-actions">
        <span
          v-if="saveStatus !== 'clean'"
          class="plan-save-status"
          :class="`plan-save-status--${saveStatus}`"
        >
          {{ saveStatusText }}
        </span>
        <button class="btn btn--primary btn--sm" @click="onSave">Save</button>
        <button
          v-if="showApplyButton"
          class="btn btn--primary btn--sm"
          @click="onApply"
        >
          {{ applyButtonText }}
        </button>
        <button
          v-if="showDoneButton"
          class="btn btn--success btn--sm"
          @click="onDone"
        >
          ✓ Done
        </button>
        <button class="btn btn--danger btn--sm" @click="onDelete">Delete</button>
        <button class="btn btn--secondary btn--sm" @click="onCancel">Cancel</button>
      </div>
    </div>

    <div class="draft-editor-title-row">
      <input
        ref="labelInputRef"
        v-model="label"
        type="text"
        class="draft-editor-label"
        placeholder="Title..."
        maxlength="100"
        @keydown="onLabelKeyDown"
      />
      <select
        v-if="showPlanStateSelect"
        ref="stateSelectRef"
        v-model="status"
        class="draft-editor-plan-select"
        :disabled="planStatus === 'done'"
        @change="onStateSelectChange"
      >
        <option value="pending">⏸ Pending</option>
        <option value="startable">▶ Ready</option>
        <option value="doing">🔄 In Progress</option>
        <option value="wait-tests">⏳ Wait Tests</option>
        <option value="blocked">⛔ Blocked</option>
        <option value="question">❓ Question</option>
      </select>
      <input
        v-if="showPlanStateInfo"
        ref="stateInfoRef"
        v-model="stateInfo"
        type="text"
        class="draft-editor-plan-info"
        placeholder="Add state context..."
        maxlength="200"
      />
    </div>

    <textarea
      ref="contentInputRef"
      v-model="text"
      class="draft-editor-content"
      placeholder="Enter your prompt..."
      rows="4"
      @keydown="onKeyDown"
    />
  </div>
</template>
