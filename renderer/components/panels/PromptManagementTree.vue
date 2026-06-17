<script setup lang="ts">
/**
 * Prompt management tree — LEFT pane of the Prompt Editor.
 *
 * A progressive-disclosure tree of prompt templates (folders + leaves) with
 * full management ops backed by the PT-3 promptTemplates IPC:
 *   - create-folder, single rename, delete, move
 *   - multiselect for delete/move ONLY (rename/load/update are single-only)
 *   - load-template-into-textarea (emits 'load' with the template body)
 *   - save-new (creates a template from the current textarea body)
 *   - update-existing (overwrites a selected template's body)
 *
 * The tree mirrors the picker conventions (kind-discriminated folders, flat
 * visible-node list, jump-key accelerators). Move uses a two-step "move mode":
 * press Move, then click a destination folder (or the root drop target).
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { promptTemplatesClient, eventsClient } from '../../ipc/clients.js';
import { treeJumpKeyLabel } from '../../utils/jump-keys.js';
import FormModal, { type FormField } from '../modals/FormModal.vue';
import type { TreeNode } from '../../../src/session/prompt-template-manager.js';
import type { PromptTemplate } from '../../../src/session/prompt-template-types.js';

interface FlatNode {
  id: string;
  name: string;
  isFolder: boolean;
  depth: number;
  parentId: string | null;
}

const props = defineProps<{
  /** Current textarea body — source for save-new / update-existing. */
  currentText: string;
  /**
   * Template id to pre-select: expands its ancestor folders and marks it the
   * active/selected node. Used by the apply flow so a picked template is
   * highlighted in the tree when the editor opens.
   */
  selectNodeId?: string | null;
}>();

const emit = defineEmits<{
  /** Load a template body into the editor textarea. */
  (e: 'load', body: string): void;
}>();

const EMPTY_TREE: TreeNode = { id: '__root__', name: '', order: -1, kind: 'folder', children: [] };

const tree = ref<TreeNode>(EMPTY_TREE);
const expandedFolders = ref<Set<string>>(new Set());
const selectedIds = ref<Set<string>>(new Set());
/** Anchor for single-selection ops (rename/load/update). */
const activeId = ref<string | null>(null);
/** When true, the next folder click becomes the move destination. */
const moveMode = ref(false);

let unsubscribe: (() => void) | null = null;

onMounted(() => {
  // Register synchronously, BEFORE the awaited initial load, so an unmount
  // that races the first promptTemplateList() can always tear it down via
  // onUnmounted — otherwise the post-await continuation would register a
  // listener that leaks and reloads an unmounted tree on every change.
  unsubscribe = eventsClient.onPromptTemplateChanged?.(() => { void reload(); }) ?? null;
  void reload();
});

onUnmounted(() => {
  unsubscribe?.();
});

async function reload(): Promise<void> {
  try {
    const next = await promptTemplatesClient.promptTemplateList();
    tree.value = (next as TreeNode | null) ?? EMPTY_TREE;
    // Prune selection/expansion of nodes that no longer exist.
    const live = new Set<string>();
    collectIds(tree.value, live);
    selectedIds.value = new Set([...selectedIds.value].filter((id) => live.has(id)));
    expandedFolders.value = new Set([...expandedFolders.value].filter((id) => live.has(id)));
    if (activeId.value && !live.has(activeId.value)) activeId.value = null;
    // Re-apply pre-selection now that the tree (and its ancestor chain) is loaded.
    applySelectNodeId(props.selectNodeId);
  } catch (err) {
    console.warn('[PromptManagementTree] Failed to load tree:', err);
    tree.value = EMPTY_TREE;
  }
}

function collectIds(node: TreeNode, out: Set<string>): void {
  for (const child of node.children) {
    out.add(child.id);
    if (child.kind === 'folder') collectIds(child, out);
  }
}

/** Find the chain of ancestor folder ids leading to `targetId` (excludes target). */
function findAncestorPath(node: TreeNode, targetId: string, trail: string[] = []): string[] | null {
  for (const child of node.children) {
    if (child.id === targetId) return trail;
    if (child.kind === 'folder') {
      const found = findAncestorPath(child, targetId, [...trail, child.id]);
      if (found) return found;
    }
  }
  return null;
}

/** Expand ancestors of `selectNodeId` and mark it active/selected. */
function applySelectNodeId(id: string | null | undefined): void {
  if (!id) return;
  const ancestors = findAncestorPath(tree.value, id);
  if (ancestors === null) return; // not present in the loaded tree
  if (ancestors.length > 0) {
    expandedFolders.value = new Set([...expandedFolders.value, ...ancestors]);
  }
  selectedIds.value = new Set([id]);
  activeId.value = id;
}

watch(() => props.selectNodeId, (id) => applySelectNodeId(id));

/** Flatten the tree into a visible-nodes list based on expandedFolders state. */
const visibleNodes = computed<FlatNode[]>(() => {
  const result: FlatNode[] = [];
  function walk(node: TreeNode, depth: number, parentId: string | null): void {
    for (const child of node.children) {
      const isFolder = child.kind === 'folder';
      result.push({ id: child.id, name: child.name, isFolder, depth, parentId });
      if (isFolder && expandedFolders.value.has(child.id)) {
        walk(child, depth + 1, child.id);
      }
    }
  }
  walk(tree.value, 0, null);
  return result;
});

const selectionCount = computed(() => selectedIds.value.size);
const activeNode = computed<FlatNode | null>(() =>
  visibleNodes.value.find((n) => n.id === activeId.value) ?? null,
);
const activeIsTemplate = computed(() => activeNode.value != null && !activeNode.value.isFolder);

/** Single-selection ops require exactly one selected node. */
const canRename = computed(() => selectionCount.value === 1 && activeId.value != null);
const canDelete = computed(() => selectionCount.value >= 1);
const canMove = computed(() => selectionCount.value >= 1);
const canLoad = computed(() => selectionCount.value === 1 && activeIsTemplate.value);
const canUpdate = computed(() => selectionCount.value === 1 && activeIsTemplate.value);

/** Target folder for create/save: the active folder, or active template's parent, else root. */
const targetFolderId = computed<string | null>(() => {
  const node = activeNode.value;
  if (!node) return null;
  return node.isFolder ? node.id : node.parentId;
});

function isSelected(id: string): boolean {
  return selectedIds.value.has(id);
}

function toggleFolder(id: string): void {
  const next = new Set(expandedFolders.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedFolders.value = next;
}

/** Click a row: single-select (replace) unless additive (Ctrl/Meta) for multiselect. */
function onNodeClick(node: FlatNode, additive: boolean): void {
  if (moveMode.value && node.isFolder) {
    void completeMove(node.id);
    return;
  }
  if (additive) {
    const next = new Set(selectedIds.value);
    if (next.has(node.id)) {
      next.delete(node.id);
      if (activeId.value === node.id) activeId.value = next.size ? [...next][next.size - 1] : null;
    } else {
      next.add(node.id);
      activeId.value = node.id;
    }
    selectedIds.value = next;
  } else {
    selectedIds.value = new Set([node.id]);
    activeId.value = node.id;
  }
}

// ── Ops ───────────────────────────────────────────────────────────

async function createFolder(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  await promptTemplatesClient.promptTemplateCreateFolder(trimmed, targetFolderId.value);
}

async function renameNode(name: string): Promise<void> {
  const id = activeId.value;
  if (!id || selectionCount.value !== 1) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  await promptTemplatesClient.promptTemplateRename(id, trimmed);
}

async function deleteSelected(): Promise<void> {
  const ids = [...selectedIds.value];
  if (ids.length === 0) return;
  await promptTemplatesClient.promptTemplateDelete(ids);
  selectedIds.value = new Set();
  activeId.value = null;
}

function beginMove(): void {
  if (selectionCount.value === 0) return;
  moveMode.value = true;
}

function cancelMove(): void {
  moveMode.value = false;
}

async function completeMove(targetId: string | null): Promise<void> {
  const ids = [...selectedIds.value];
  moveMode.value = false;
  for (const id of ids) {
    // Skip moving a node into itself.
    if (id === targetId) continue;
    await promptTemplatesClient.promptTemplateMove(id, targetId);
  }
}

async function loadSelected(): Promise<void> {
  const id = activeId.value;
  if (!id || !activeIsTemplate.value) return;
  const node = await promptTemplatesClient.promptTemplateGetNode(id);
  const body = (node as PromptTemplate | null)?.body ?? '';
  emit('load', body);
}

async function saveNew(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  await promptTemplatesClient.promptTemplateCreateTemplate(trimmed, props.currentText, targetFolderId.value);
}

async function updateSelected(): Promise<void> {
  const id = activeId.value;
  if (!id || !activeIsTemplate.value) return;
  await promptTemplatesClient.promptTemplateUpdate(id, { body: props.currentText });
}

// ── UI handlers (in-app name dialog) ──────────────────────────────
//
// Electron does NOT implement window.prompt() (it returns null), so name
// entry routes through the in-app FormModal instead of a native prompt.

type NameAction = 'create-folder' | 'rename' | 'save-new';

const nameDialogVisible = ref(false);
const nameDialogAction = ref<NameAction | null>(null);

const nameDialogTitle = computed(() => {
  switch (nameDialogAction.value) {
    case 'create-folder': return 'New Folder';
    case 'rename': return 'Rename';
    case 'save-new': return 'Save Template';
    default: return '';
  }
});

const nameDialogFields = computed<FormField[]>(() => [{
  key: 'name',
  label: 'Name',
  required: true,
  placeholder: nameDialogAction.value === 'create-folder' ? 'Folder name' : 'Template name',
  defaultValue: nameDialogAction.value === 'rename' ? (activeNode.value?.name ?? '') : '',
}]);

function openNameDialog(action: NameAction): void {
  nameDialogAction.value = action;
  nameDialogVisible.value = true;
}

function promptCreateFolder(): void {
  openNameDialog('create-folder');
}

function promptRename(): void {
  if (!canRename.value) return;
  openNameDialog('rename');
}

function promptSaveNew(): void {
  openNameDialog('save-new');
}

function onNameDialogSave(values: Record<string, string>): void {
  const name = values.name ?? '';
  const action = nameDialogAction.value;
  nameDialogVisible.value = false;
  nameDialogAction.value = null;
  if (action === 'create-folder') void createFolder(name);
  else if (action === 'rename') void renameNode(name);
  else if (action === 'save-new') void saveNew(name);
}

function onNameDialogCancel(): void {
  nameDialogVisible.value = false;
  nameDialogAction.value = null;
}

watch(() => props.currentText, () => { /* keep reactive for save-new/update */ });

defineExpose({
  reload,
  visibleNodes,
  selectedIds,
  activeId,
  expandedFolders,
  moveMode,
  toggleFolder,
  onNodeClick,
  createFolder,
  renameNode,
  deleteSelected,
  beginMove,
  cancelMove,
  completeMove,
  loadSelected,
  saveNew,
  updateSelected,
  canRename,
  canDelete,
  canMove,
  canLoad,
  canUpdate,
  targetFolderId,
});
</script>

<template>
  <div class="prompt-mgmt-tree">
    <div class="prompt-mgmt-tree__toolbar">
      <button class="btn btn--sm btn--secondary prompt-mgmt-tree__btn" title="Create a new folder in the selected folder" @click="promptCreateFolder">
        <span class="prompt-mgmt-tree__btn-icon">📁＋</span><span class="prompt-mgmt-tree__btn-label">New</span>
      </button>
      <button class="btn btn--sm btn--secondary prompt-mgmt-tree__btn" :disabled="!canRename" title="Rename the selected item" @click="promptRename">
        <span class="prompt-mgmt-tree__btn-icon">✏️</span><span class="prompt-mgmt-tree__btn-label">Rename</span>
      </button>
      <button class="btn btn--sm btn--secondary prompt-mgmt-tree__btn" :disabled="!canDelete" title="Delete the selected item(s)" @click="deleteSelected">
        <span class="prompt-mgmt-tree__btn-icon">🗑️</span><span class="prompt-mgmt-tree__btn-label">Delete</span>
      </button>
      <button
        class="btn btn--sm btn--secondary prompt-mgmt-tree__btn"
        :class="{ 'btn--focused': moveMode }"
        :disabled="!canMove"
        title="Move selected item(s) — then click a destination folder"
        @click="moveMode ? cancelMove() : beginMove()"
      >
        <span class="prompt-mgmt-tree__btn-icon">➡️</span><span class="prompt-mgmt-tree__btn-label">Move</span>
      </button>
      <button class="btn btn--sm btn--secondary prompt-mgmt-tree__btn" :disabled="!canLoad" title="Load the selected template into the editor" @click="loadSelected">
        <span class="prompt-mgmt-tree__btn-icon">📥</span><span class="prompt-mgmt-tree__btn-label">Load</span>
      </button>
      <button class="btn btn--sm btn--secondary prompt-mgmt-tree__btn" title="Save the editor text as a new template" @click="promptSaveNew">
        <span class="prompt-mgmt-tree__btn-icon">💾＋</span><span class="prompt-mgmt-tree__btn-label">Save</span>
      </button>
      <button class="btn btn--sm btn--secondary prompt-mgmt-tree__btn" :disabled="!canUpdate" title="Overwrite the selected template with the editor text" @click="updateSelected">
        <span class="prompt-mgmt-tree__btn-icon">✔️</span><span class="prompt-mgmt-tree__btn-label">Update</span>
      </button>
    </div>

    <FormModal
      v-model:visible="nameDialogVisible"
      :title="nameDialogTitle"
      :fields="nameDialogFields"
      @save="onNameDialogSave"
      @cancel="onNameDialogCancel"
    />

    <div v-if="moveMode" class="prompt-mgmt-tree__move-hint">
      Click a folder to move {{ selectionCount }} item(s) · <button class="link-btn" @click="completeMove(null)">root</button> · <button class="link-btn" @click="cancelMove">cancel</button>
    </div>

    <div class="prompt-mgmt-tree__list" role="tree" aria-label="Prompt templates">
      <div v-if="visibleNodes.length === 0" class="prompt-mgmt-tree__empty">No templates yet.</div>
      <div
        v-for="(node, i) in visibleNodes"
        :key="node.id"
        class="prompt-mgmt-tree__item"
        :class="{
          'prompt-mgmt-tree__item--selected': isSelected(node.id),
          'prompt-mgmt-tree__item--active': node.id === activeId,
          'prompt-mgmt-tree__item--folder': node.isFolder,
        }"
        :role="node.isFolder ? 'treeitem' : undefined"
        @click="onNodeClick(node, $event.ctrlKey || $event.metaKey)"
      >
        <span v-if="treeJumpKeyLabel(i) != null" class="jump-key">{{ treeJumpKeyLabel(i) }}</span>
        <!-- Depth indent lives AFTER the accelerator so jump keys stay left-aligned. -->
        <span class="prompt-mgmt-tree__indent" :style="{ width: `${node.depth * 16}px` }"></span>
        <span
          v-if="node.isFolder"
          class="prompt-mgmt-tree__expand"
          @click.stop="toggleFolder(node.id)"
        >{{ expandedFolders.has(node.id) ? '▼' : '▶' }}</span>
        <span v-else class="prompt-mgmt-tree__leaf-icon">📄</span>
        <span class="prompt-mgmt-tree__name">{{ node.name }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.prompt-mgmt-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  border-right: 1px solid var(--border-color);
}

.prompt-mgmt-tree__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px;
  border-bottom: 1px solid var(--border-color);
}

.prompt-mgmt-tree__btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.prompt-mgmt-tree__btn-icon {
  line-height: 1;
}

.prompt-mgmt-tree__btn-label {
  font-size: 12px;
}

.prompt-mgmt-tree__move-hint {
  padding: 4px 8px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
}

.link-btn {
  background: none;
  border: none;
  color: var(--accent-color, #4488ff);
  cursor: pointer;
  padding: 0;
  font: inherit;
  text-decoration: underline;
}

.prompt-mgmt-tree__list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.prompt-mgmt-tree__empty {
  padding: 12px;
  color: var(--text-secondary);
  font-size: 13px;
}

.prompt-mgmt-tree__item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.prompt-mgmt-tree__item:hover {
  background: var(--bg-hover, rgba(255, 255, 255, 0.05));
}

.prompt-mgmt-tree__item--selected {
  background: var(--bg-selected, rgba(68, 136, 255, 0.18));
}

.prompt-mgmt-tree__item--active {
  outline: 1px solid var(--accent-color, #4488ff);
  outline-offset: -1px;
}

.prompt-mgmt-tree__indent {
  flex-shrink: 0;
}

.prompt-mgmt-tree__expand {
  width: 14px;
  text-align: center;
  flex-shrink: 0;
}

.prompt-mgmt-tree__leaf-icon {
  flex-shrink: 0;
}

.prompt-mgmt-tree__name {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
