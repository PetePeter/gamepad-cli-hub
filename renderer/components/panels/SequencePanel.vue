<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { PlanItem, PlanSequence } from '../../../src/types/plan.js';

const props = defineProps<{
  sequences: PlanSequence[];
  selectedItem: PlanItem | null;
}>();

const emit = defineEmits<{
  createSequence: [title: string, missionStatement: string, sharedMemory: string];
  assignSequence: [planId: string, sequenceId: string | null];
  updateSequence: [id: string, updates: { title?: string; missionStatement?: string; sharedMemory?: string }];
  deleteSequence: [id: string];
}>();

const modalVisible = ref(false);
const modalMode = ref<'create' | 'edit'>('create');
const deleteConfirm = ref(false);
const draft = reactive({ id: '', title: '', missionStatement: '', sharedMemory: '' });

const selectedSequence = computed(() =>
  props.selectedItem?.sequenceId
    ? props.sequences.find((s) => s.id === props.selectedItem!.sequenceId) ?? null
    : null,
);

function openCreate(): void {
  draft.id = '';
  draft.title = '';
  draft.missionStatement = '';
  draft.sharedMemory = '';
  deleteConfirm.value = false;
  modalMode.value = 'create';
  modalVisible.value = true;
}

function openEdit(): void {
  const seq = selectedSequence.value;
  if (!seq) return;
  draft.id = seq.id;
  draft.title = seq.title;
  draft.missionStatement = seq.missionStatement ?? '';
  draft.sharedMemory = seq.sharedMemory ?? '';
  deleteConfirm.value = false;
  modalMode.value = 'edit';
  modalVisible.value = true;
}

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

function onAssign(event: Event): void {
  if (!props.selectedItem) return;
  const value = (event.target as HTMLSelectElement).value;
  emit('assignSequence', props.selectedItem.id, value || null);
}
</script>

<template>
  <section class="sequence-panel">
    <div class="sequence-panel__header">
      <span class="sequence-panel__label">Sequence</span>
      <button class="plan-header__btn plan-header__btn--secondary" @click="openCreate">New Sequence</button>
    </div>

    <div v-if="selectedItem" class="sequence-panel__row">
      <select class="sequence-panel__select" :value="selectedItem.sequenceId ?? ''" @change="onAssign">
        <option value="">None</option>
        <option v-for="seq in sequences" :key="seq.id" :value="seq.id">{{ seq.title }}</option>
      </select>
      <template v-if="selectedSequence">
        <button class="plan-header__btn plan-header__btn--secondary" @click="emit('assignSequence', selectedItem.id, null)">Unlink Plan</button>
        <button class="plan-header__btn plan-header__btn--secondary" @click="openEdit">Edit</button>
        <button class="plan-header__btn plan-header__btn--danger" @click="emit('deleteSequence', selectedSequence.id)">Delete Sequence</button>
      </template>
    </div>
  </section>

  <Teleport to="body">
    <div v-if="modalVisible" class="plan-sequence-modal-overlay" @mousedown.self="modalVisible = false">
      <div class="plan-sequence-modal">
        <div class="plan-sequence-modal__header">
          {{ modalMode === 'create' ? 'New Sequence' : 'Edit Sequence' }}
        </div>

        <label class="plan-sequence-modal__field">
          <span>Title</span>
          <input
            v-model="draft.title"
            class="plan-sequence-modal__input"
            placeholder="Sequence title..."
            maxlength="100"
          />
        </label>

        <label class="plan-sequence-modal__field">
          <span>Mission</span>
          <textarea
            v-model="draft.missionStatement"
            class="plan-sequence-modal__textarea"
            placeholder="What is this sequence working toward?"
            rows="3"
          />
        </label>

        <label class="plan-sequence-modal__field">
          <span>Memory</span>
          <textarea
            v-model="draft.sharedMemory"
            class="plan-sequence-modal__textarea"
            placeholder="Shared context for all plans in this sequence..."
            rows="3"
          />
        </label>

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
          <button class="btn btn--secondary btn--sm" @click="modalVisible = false">Cancel</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
