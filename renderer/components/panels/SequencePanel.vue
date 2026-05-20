<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import type { PlanItem, PlanSequence } from '../../../src/types/plan.js';
import { configClient } from '../../ipc/clients.js';

const props = defineProps<{
  sequences: PlanSequence[];
  selectedItem: PlanItem | null;
}>();

const emit = defineEmits<{
  createSequence: [title: string, missionStatement: string, sharedMemory: string];
  updateSequence: [id: string, updates: { title?: string; missionStatement?: string; sharedMemory?: string; order?: number }];
  deleteSequence: [id: string];
  deleteSequenceWithPlans: [id: string];
}>();

const modalVisible = ref(false);
const modalMode = ref<'create' | 'edit'>('create');
const deleteConfirm = ref(false);
const draft = reactive({ id: '', title: '', missionStatement: '', sharedMemory: '' });
const modalRef = ref<HTMLDivElement | null>(null);
let resizeObserver: ResizeObserver | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const selectedSequence = computed(() =>
  props.selectedItem?.sequenceId
    ? props.sequences.find((s) => s.id === props.selectedItem!.sequenceId) ?? null
    : null,
);

function onModalResize(): void {
  if (!modalRef.value || !modalVisible.value) return;
  const rect = modalRef.value.getBoundingClientRect();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    await configClient.configSetEditorPrefs?.({
      sequenceModalBounds: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
      },
    });
  }, 300);
}

function startObserving(): void {
  if (resizeObserver || !modalRef.value) return;
  resizeObserver = new ResizeObserver(onModalResize);
  resizeObserver.observe(modalRef.value);
}

function stopObserving(): void {
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
}

async function applyPersistedSize(): Promise<void> {
  const prefs = await configClient.configGetEditorPrefs?.() ?? {};
  if (!modalRef.value) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const minW = 300;
  const minH = 200;

  const bounds = prefs.sequenceModalBounds;
  if (bounds && Number.isFinite(bounds.right - bounds.left) && Number.isFinite(bounds.bottom - bounds.top)) {
    const w = Math.min(Math.max(bounds.right - bounds.left, minW), vw * 0.95);
    const h = Math.min(Math.max(bounds.bottom - bounds.top, minH), vh * 0.95);
    modalRef.value.style.width = `${w}px`;
    modalRef.value.style.height = `${h}px`;
    return;
  }

  // Backward compat: old width/height-only prefs
  const w = prefs.sequenceModalWidth as number | undefined;
  const h = prefs.sequenceModalHeight as number | undefined;
  if (Number.isFinite(w) && w! > 0) modalRef.value.style.width = `${Math.min(w!, vw * 0.95)}px`;
  if (Number.isFinite(h) && h! > 0) modalRef.value.style.height = `${Math.min(h!, vh * 0.95)}px`;
}

function openCreate(): void {
  draft.id = '';
  draft.title = '';
  draft.missionStatement = '';
  draft.sharedMemory = '';
  deleteConfirm.value = false;
  modalMode.value = 'create';
  modalVisible.value = true;
  nextTick(() => { void applyPersistedSize(); startObserving(); });
}

function openEdit(sequence?: PlanSequence): void {
  const seq = sequence ?? selectedSequence.value;
  if (!seq) return;
  draft.id = seq.id;
  draft.title = seq.title;
  draft.missionStatement = seq.missionStatement ?? '';
  draft.sharedMemory = seq.sharedMemory ?? '';
  deleteConfirm.value = false;
  modalMode.value = 'edit';
  modalVisible.value = true;
  nextTick(() => { void applyPersistedSize(); startObserving(); });
}

watch(modalVisible, (v) => { if (!v) stopObserving(); });

onBeforeUnmount(stopObserving);

function onSave(): void {
  if (modalMode.value === 'create') {
    emit('createSequence', draft.title, draft.missionStatement, draft.sharedMemory);
  } else {
    emit('updateSequence', draft.id, {
      title: draft.title,
      missionStatement: draft.missionStatement,
      sharedMemory: draft.sharedMemory,
    });
  }
  modalVisible.value = false;
}

function onDelete(): void {
  if (!deleteConfirm.value) {
    deleteConfirm.value = true;
    return;
  }
  emit('deleteSequence', draft.id);
  modalVisible.value = false;
}

function onDeleteWithPlans(): void {
  if (!deleteConfirm.value) {
    deleteConfirm.value = true;
    return;
  }
  emit('deleteSequenceWithPlans', draft.id);
  modalVisible.value = false;
}

defineExpose({ openCreate, openEdit });
</script>

<template>
  <Teleport to="body">
    <div v-if="modalVisible" class="modal-overlay modal--visible plan-sequence-modal-overlay" @mousedown.self="modalVisible = false">
      <div ref="modalRef" class="plan-sequence-modal">
        <div class="plan-sequence-modal__header">
          {{ modalMode === 'create' ? 'New Sequence' : 'Edit Sequence' }}
        </div>

        <div class="plan-sequence-modal__body">
          <label class="plan-sequence-modal__field">
            <span>Title</span>
            <input
              v-model="draft.title"
              class="plan-sequence-modal__input"
              placeholder="Sequence title..."
              maxlength="100"
            />
          </label>

          <label class="plan-sequence-modal__field plan-sequence-modal__field--mission">
            <span>Mission</span>
            <textarea
              v-model="draft.missionStatement"
              class="plan-sequence-modal__textarea"
              placeholder="What is this sequence working toward?"
              rows="3"
            />
          </label>

          <label class="plan-sequence-modal__field plan-sequence-modal__field--memory">
            <span>Memory</span>
            <textarea
              v-model="draft.sharedMemory"
              class="plan-sequence-modal__textarea"
              placeholder="Legacy coordination notes for plans in this sequence..."
            />
          </label>
        </div>

        <div class="plan-sequence-modal__actions">
          <button class="btn btn--primary btn--sm" @click="onSave">
            {{ modalMode === 'create' ? 'Create' : 'Save' }}
          </button>
          <button
            v-if="modalMode === 'edit'"
            class="btn btn--sm"
            :class="deleteConfirm ? 'btn--danger' : 'btn--secondary'"
            @click="onDelete"
          >{{ deleteConfirm ? 'Confirm Delete' : 'Delete' }}</button>
          <button
            v-if="modalMode === 'edit'"
            class="btn btn--sm"
            :class="deleteConfirm ? 'btn--danger' : 'btn--secondary'"
            @click="onDeleteWithPlans"
          >{{ deleteConfirm ? 'Confirm Delete All' : 'Delete + Plans' }}</button>
          <button class="btn btn--secondary btn--sm" @click="modalVisible = false">Cancel</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
