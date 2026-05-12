<script setup lang="ts">
/**
 * ProjectsTab.vue — Project list CRUD with expandable directory management.
 *
 * Reads from the project IPC bridge (projectList/Update/Delete/AddDir/RemoveDir).
 * Projects are auto-created when directories are opened; this tab lets users
 * rename, reorganise directories, and delete projects.
 */
import { ref, onMounted } from 'vue';

interface ProjectRecord {
  id: string;
  key: string;
  name: string;
  canonicalPath: string;
  alternatePaths: string[];
  rootKind: string;
  gitCommonDir?: string;
  repoRootPath?: string;
  createdAt: number;
  updatedAt: number;
}

const projects = ref<ProjectRecord[]>([]);
const expandedIds = ref<Set<string>>(new Set());
const editingId = ref<string | null>(null);
const editingName = ref('');
const deleteConfirmId = ref<string | null>(null);

async function refresh(): Promise<void> {
  try {
    projects.value = await window.gamepadCli.projectList();
  } catch {
    projects.value = [];
  }
}

onMounted(() => { void refresh(); });

function toggleExpand(id: string): void {
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id);
  } else {
    expandedIds.value.add(id);
  }
}

function isExpanded(id: string): boolean {
  return expandedIds.value.has(id);
}

// ── Inline rename ──────────────────────────────────────────────────────────

function startEditing(project: ProjectRecord): void {
  editingId.value = project.id;
  editingName.value = project.name;
}

async function commitEdit(): Promise<void> {
  const id = editingId.value;
  const name = editingName.value.trim();
  editingId.value = null;
  if (!id || !name) return;

  try {
    await window.gamepadCli.projectUpdate(id, { name });
  } catch { /* ignore */ }
  await refresh();
}

function cancelEdit(): void {
  editingId.value = null;
}

// ── Delete (3-second hold-to-confirm) ──────────────────────────────────────

let deleteTimer: ReturnType<typeof setTimeout> | null = null;

function onDeleteClick(id: string): void {
  if (deleteConfirmId.value === id) {
    // Confirmed — delete
    deleteConfirmId.value = null;
    if (deleteTimer) { clearTimeout(deleteTimer); deleteTimer = null; }
    void doDelete(id);
  } else {
    // First click — start 3s confirmation window
    deleteConfirmId.value = id;
    if (deleteTimer) clearTimeout(deleteTimer);
    deleteTimer = setTimeout(() => {
      if (deleteConfirmId.value === id) {
        deleteConfirmId.value = null;
      }
      deleteTimer = null;
    }, 3000);
  }
}

async function doDelete(id: string): Promise<void> {
  try {
    await window.gamepadCli.projectDelete(id);
  } catch { /* ignore */ }
  await refresh();
}

// ── Directory management ───────────────────────────────────────────────────

async function onAddDir(projectId: string): Promise<void> {
  try {
    const dirPath = await window.gamepadCli.dialogOpenFolder();
    if (!dirPath) return;
    await window.gamepadCli.projectAddDir(projectId, dirPath);
  } catch { /* ignore */ }
  await refresh();
}

async function onRemoveDir(projectId: string, dirPath: string): Promise<void> {
  try {
    await window.gamepadCli.projectRemoveDir(projectId, dirPath);
  } catch { /* ignore */ }
  await refresh();
}
</script>

<template>
  <div class="settings-projects-panel">
    <div class="settings-panel__header">
      <span class="settings-panel__title">Projects</span>
    </div>

    <div class="settings-list">
      <div
        v-for="project in projects"
        :key="project.id"
        class="settings-project-item"
      >
        <!-- Header row -->
        <div class="settings-project-header">
          <button
            class="settings-project-toggle focusable"
            :class="{ 'settings-project-toggle--expanded': isExpanded(project.id) }"
            @click="toggleExpand(project.id)"
            title="Expand / Collapse"
          >{{ isExpanded(project.id) ? '▼' : '▶' }}</button>

          <span
            v-if="editingId === project.id"
            class="settings-project-name-edit"
          >
            <input
              v-model="editingName"
              class="focusable"
              type="text"
              @keydown.enter="commitEdit()"
              @keydown.escape="cancelEdit()"
              @blur="commitEdit()"
            />
          </span>
          <span
            v-else
            class="settings-project-name focusable"
            title="Double-click to rename"
            @dblclick="startEditing(project)"
          >{{ project.name }}</span>

          <span class="settings-project-badge">{{ project.rootKind }}</span>

          <button
            class="btn btn--danger btn--sm focusable"
            @click="onDeleteClick(project.id)"
          >
            {{ deleteConfirmId === project.id ? 'Confirm?' : 'Delete' }}
          </button>
        </div>

        <!-- Expanded directory list -->
        <div v-if="isExpanded(project.id)" class="settings-project-dirs">
          <div class="settings-project-dir settings-project-dir--canonical">
            <span class="settings-project-dir__label">canonical</span>
            <span class="settings-project-dir__path">{{ project.canonicalPath }}</span>
          </div>
          <div
            v-for="altPath in project.alternatePaths"
            :key="altPath"
            class="settings-project-dir"
          >
            <span class="settings-project-dir__path">{{ altPath }}</span>
            <button
              class="btn btn--ghost btn--sm focusable"
              title="Remove directory"
              @click="onRemoveDir(project.id, altPath)"
            >×</button>
          </div>
          <button
            class="btn btn--secondary btn--sm focusable settings-project-add-dir"
            @click="onAddDir(project.id)"
          >+ Add Directory</button>
        </div>
      </div>

      <p v-if="projects.length === 0" class="settings-empty">
        No projects yet. Projects are created automatically when you open directories.
      </p>
    </div>
  </div>
</template>

<style scoped>
.settings-projects-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.settings-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.settings-panel__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ── Project item ─────────────────────────────────────────────────────────── */

.settings-project-item {
  border: 1px solid var(--border-color, #333);
  border-radius: 6px;
  overflow: hidden;
}

.settings-project-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-secondary, #1a1a2e);
}

.settings-project-toggle {
  background: none;
  border: none;
  color: var(--text-secondary, #888);
  cursor: pointer;
  font-size: 10px;
  padding: 2px 4px;
  line-height: 1;
  transition: transform 0.15s ease;
}
.settings-project-toggle--expanded {
  color: var(--text-primary, #eee);
}

.settings-project-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #eee);
  cursor: default;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-project-name-edit {
  flex: 1;
}
.settings-project-name-edit input {
  width: 100%;
  padding: 2px 6px;
  font-size: 13px;
  background: var(--bg-primary, #111);
  color: var(--text-primary, #eee);
  border: 1px solid var(--accent-color, #4488ff);
  border-radius: 3px;
  outline: none;
}

.settings-project-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--bg-tertiary, #2a2a3e);
  color: var(--text-secondary, #888);
  text-transform: uppercase;
}

/* ── Expanded directory list ─────────────────────────────────────────────── */

.settings-project-dirs {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 8px 12px 8px 32px;
  background: var(--bg-primary, #111);
  border-top: 1px solid var(--border-color, #333);
}

.settings-project-dir {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid var(--border-color, #222);
}
.settings-project-dir:last-of-type {
  border-bottom: none;
}

.settings-project-dir--canonical .settings-project-dir__path {
  font-weight: 600;
}

.settings-project-dir__label {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--accent-color, #4488ff);
  color: #fff;
  text-transform: uppercase;
  flex-shrink: 0;
}

.settings-project-dir__path {
  flex: 1;
  font-size: 12px;
  color: var(--text-secondary, #aaa);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-project-add-dir {
  margin-top: 8px;
  align-self: flex-start;
}

/* ── Empty state ──────────────────────────────────────────────────────────── */

.settings-empty {
  color: var(--text-secondary, #888);
  font-size: 13px;
  text-align: center;
  padding: 24px 0;
}
</style>
