<script setup lang="ts">
/**
 * Prompt tree picker modal — progressive-disclosure tree of prompt templates.
 *
 * Gamepad D-pad up/down cycles visible nodes (wrapping), left/right
 * expands/collapses folders, A picks (template → select, folder → toggle),
 * B cancels. Keyboard accelerators index visible nodes: 1-9,0 then a-z.
 */
import { ref, computed, watch, nextTick } from 'vue';
import { TREE_SELECTION_KEYS, useModalStack } from '../../composables/useModalStack.js';
import { toDirection } from '../../utils.js';
import { treeJumpKeyLabel, treeJumpButtonToPosition } from '../../utils/jump-keys.js';
import type { TreeNode } from '../../../src/session/prompt-template-manager.js';

interface FlatNode {
  id: string;
  name: string;
  isFolder: boolean;
  depth: number;
}

const MODAL_ID = 'prompt-tree-picker';

const props = defineProps<{
  visible: boolean;
  tree: TreeNode;
}>();

const emit = defineEmits<{
  (e: 'select', templateId: string): void;
  (e: 'cancel'): void;
  (e: 'update:visible', value: boolean): void;
}>();

const selectedIndex = ref(0);
const expandedFolders = ref<Set<string>>(new Set());
const listEl = ref<HTMLElement | null>(null);
const modalStack = useModalStack();

/** Flatten the tree into a visible-nodes list based on expandedFolders state. */
const visibleNodes = computed<FlatNode[]>(() => {
  const result: FlatNode[] = [];
  function walk(node: TreeNode, depth: number): void {
    for (const child of node.children) {
      // Discriminate by explicit kind — NOT children.length. An empty folder
      // has [] children but must still behave (and render) as a folder.
      const isFolder = child.kind === 'folder';
      result.push({ id: child.id, name: child.name, isFolder, depth });
      if (isFolder && expandedFolders.value.has(child.id)) {
        walk(child, depth + 1);
      }
    }
  }
  walk(props.tree, 0);
  return result;
});

// Auto-expand root-level folders on open
watch(() => props.visible, (v) => {
  if (v) {
    expandedFolders.value = new Set(
      props.tree.children
        .filter(c => c.kind === 'folder')
        .map(c => c.id),
    );
    selectedIndex.value = 0;
    modalStack.push({ id: MODAL_ID, handler: handleButton, interceptKeys: TREE_SELECTION_KEYS });
  } else {
    modalStack.pop(MODAL_ID);
  }
}, { immediate: true });

watch(selectedIndex, () => {
  nextTick(scrollSelectedIntoView);
});

const leafSlots = computed(() => {
  const m = new Map<number, number>();
  let n = 0;
  visibleNodes.value.forEach((node, i) => { if (!node.isFolder) { m.set(i, n); n++; } });
  return m;
});
function accelLabel(i: number): string | null {
  const slot = leafSlots.value.get(i);
  return slot == null ? null : treeJumpKeyLabel(slot);
}

function scrollSelectedIntoView(): void {
  const list = listEl.value;
  if (!list) return;
  const selected = list.querySelector('.context-menu-item--selected');
  selected?.scrollIntoView({ block: 'nearest' });
}

function handleButton(button: string): boolean {
  const dir = toDirection(button);
  const nodes = visibleNodes.value;
  if (nodes.length === 0) return true;

  if (dir === 'up') {
    selectedIndex.value = (selectedIndex.value - 1 + nodes.length) % nodes.length;
    return true;
  }
  if (dir === 'down') {
    selectedIndex.value = (selectedIndex.value + 1) % nodes.length;
    return true;
  }
  if (dir === 'left') {
    const node = nodes[selectedIndex.value];
    if (node?.isFolder && expandedFolders.value.has(node.id)) {
      toggleFolder(node.id);
      // Keep selection on the collapsed folder
      const idx = visibleNodes.value.findIndex(n => n.id === node.id);
      if (idx >= 0) selectedIndex.value = idx;
    }
    return true;
  }
  if (dir === 'right') {
    const node = nodes[selectedIndex.value];
    if (node?.isFolder && !expandedFolders.value.has(node.id)) {
      toggleFolder(node.id);
    }
    return true;
  }
  if (button === 'A') {
    activateNode(selectedIndex.value);
    return true;
  }
  if (button === 'B') {
    emit('cancel');
    emit('update:visible', false);
    return true;
  }
  const pos = treeJumpButtonToPosition(button);
  if (pos !== null) {
    for (const [idx, slot] of leafSlots.value) {
      if (slot === pos) { activateNode(idx); break; }
    }
    return true;
  }
  return true;
}

function activateNode(index: number): void {
  const node = visibleNodes.value[index];
  if (!node) return;
  if (node.isFolder) {
    toggleFolder(node.id);
    // Re-find the folder's new index after toggle
    const idx = visibleNodes.value.findIndex(n => n.id === node.id);
    if (idx >= 0) selectedIndex.value = idx;
  } else {
    emit('select', node.id);
    emit('update:visible', false);
  }
}

function toggleFolder(id: string): void {
  const next = new Set(expandedFolders.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  expandedFolders.value = next;
}

defineExpose({ handleButton });
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="modal-overlay modal--visible"
      role="tree"
      aria-label="Prompt template picker"
    >
      <div ref="listEl" class="context-menu" id="promptTreePicker">
        <div
          v-for="(node, i) in visibleNodes"
          :key="node.id"
          class="context-menu-item prompt-tree-item"
          :class="{
            'context-menu-item--selected': i === selectedIndex,
            'prompt-tree-folder': node.isFolder,
          }"
          :style="{ paddingLeft: `${12 + node.depth * 16}px` }"
          @click="activateNode(i)"
          :role="node.isFolder ? 'treeitem' : undefined"
        >
          <span v-if="accelLabel(i) != null" class="jump-key">{{ accelLabel(i) }}</span>
          <span v-if="node.isFolder" class="prompt-tree-expand-icon">
            {{ expandedFolders.has(node.id) ? '▼' : '▶' }}
          </span>
          <span class="prompt-tree-name">{{ node.name }}</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>
