<script setup lang="ts">
/**
 * DirectoriesTab.vue — Working directories CRUD.
 *
 * Replaces renderDirectoriesPanel() in settings.ts.
 */
import { ref } from 'vue';

export interface DirectoryItem {
  name: string;
  path: string;
}

const props = defineProps<{
  directories: DirectoryItem[];
}>();

const emit = defineEmits<{
  add: [name: string, path: string];
  edit: [index: number, name: string, path: string];
  delete: [index: number];
  move: [index: number, direction: 'up' | 'down'];
}>();

const showAddForm = ref(false);
const newDirName = ref('');
const newDirPath = ref('');
const newDirNameError = ref('');
const newDirPathError = ref('');
const deleteConfirmIndex = ref<number | null>(null);

function validateRequired(value: string, label: string): string {
  if (!value || !value.trim()) return `${label} is required`;
  return '';
}

function validateAddForm(): boolean {
  newDirNameError.value = validateRequired(newDirName.value, 'Name');
  newDirPathError.value = validateRequired(newDirPath.value, 'Path');
  return !newDirNameError.value && !newDirPathError.value;
}

function onSaveAdd(): void {
  if (!validateAddForm()) return;
  emit('add', newDirName.value.trim(), newDirPath.value.trim());
  resetAddForm();
}

function resetAddForm(): void {
  showAddForm.value = false;
  newDirName.value = '';
  newDirPath.value = '';
  newDirNameError.value = '';
  newDirPathError.value = '';
}

function onDeleteClick(index: number): void {
  if (deleteConfirmIndex.value === index) {
    emit('delete', index);
    deleteConfirmIndex.value = null;
  } else {
    deleteConfirmIndex.value = index;
    setTimeout(() => {
      if (deleteConfirmIndex.value === index) {
        deleteConfirmIndex.value = null;
      }
    }, 3000);
  }
}

function onBrowse(): void {
  if (!window.gamepadCli?.dialogOpenFolder) return;
  void window.gamepadCli.dialogOpenFolder().then((result: string | null) => {
    if (result) newDirPath.value = result;
  });
}
</script>

<template>
  <div class="settings-directories-panel">
    <div class="settings-panel__header">
      <span class="settings-panel__title">Working Directories</span>
      <button class="btn btn--primary btn--sm focusable" @click="showAddForm = true">
        + Add Directory
      </button>
    </div>

    <!-- Add form -->
    <div v-if="showAddForm" class="settings-form">
      <span class="settings-form__title">Add Directory</span>
      <div class="settings-form__field">
        <label>Name</label>
        <input
          v-model="newDirName"
          type="text"
          placeholder="e.g. My Project"
          class="focusable"
        />
        <p v-if="newDirNameError" class="settings-form__error" role="alert">{{ newDirNameError }}</p>
      </div>
      <div class="settings-form__field">
        <label>Path</label>
        <div class="settings-form__input-wrap">
          <input
            v-model="newDirPath"
            type="text"
            placeholder="e.g. C:\projects\my-project"
            class="focusable"
          />
          <button class="settings-form__browse-btn focusable" @click="onBrowse">Browse</button>
        </div>
        <p v-if="newDirPathError" class="settings-form__error" role="alert">{{ newDirPathError }}</p>
      </div>
      <div class="settings-form__row">
        <button class="btn btn--primary btn--sm focusable" @click="onSaveAdd">Save</button>
        <button class="btn btn--secondary btn--sm focusable" @click="resetAddForm">Cancel</button>
      </div>
    </div>

    <!-- Directories list -->
    <div class="settings-list">
      <div
        v-for="(dir, index) in directories"
        :key="index"
        class="settings-list-item"
      >
        <div class="settings-list-item__info">
          <span class="settings-list-item__name">{{ dir.name }}</span>
          <span class="settings-list-item__detail">{{ dir.path }}</span>
        </div>
        <div class="settings-list-item__actions">
          <button
            class="btn btn--ghost btn--sm focusable"
            :disabled="index === 0"
            title="Move up"
            @click="emit('move', index, 'up')"
          >&#9650;</button>
          <button
            class="btn btn--ghost btn--sm focusable"
            :disabled="index === directories.length - 1"
            title="Move down"
            @click="emit('move', index, 'down')"
          >&#9660;</button>
          <button class="btn btn--secondary btn--sm focusable" @click="$emit('edit', index, dir.name, dir.path)">
            Edit
          </button>
          <button
            class="btn btn--danger btn--sm focusable"
            @click="onDeleteClick(index)"
          >
            {{ deleteConfirmIndex === index ? 'Confirm?' : 'Delete' }}
          </button>
        </div>
      </div>
      <p v-if="directories.length === 0" class="settings-empty">
        No working directories configured
      </p>
    </div>
  </div>
</template>
