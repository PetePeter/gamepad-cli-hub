<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import ConfirmDialog from '../modals/ConfirmDialog.vue';
import MemoryDetailPopOutWindow from '../MemoryDetailPopOutWindow.vue';
import EmptyState from '../common/EmptyState.vue';
import ListRow from '../common/ListRow.vue';
import PanelHeader from '../common/PanelHeader.vue';
import SearchField from '../common/SearchField.vue';
import { useAppStore } from '../../stores/app.js';
import { buildMemoryGraphLayout } from '../../memories/memory-graph-layout.js';
import {
  confirmDelete,
  deleteAttachment,
  disposeMemoryChangedSubscription,
  ensureMemoryChangedSubscription,
  exportMemories,
  memoryScreenState,
  openAttachment,
  openDetail,
  refreshMemories,
  requestDelete,
  searchMemories,
  selectMemory,
  setGraphDepth,
} from '../../memories/memory-screen.js';

const appState = useAppStore().state;
const zoom = ref(1);
const pan = ref({ x: 0, y: 0 });
const dragging = ref(false);
const dragStart = ref({ x: 0, y: 0, panX: 0, panY: 0 });
const exportScope = ref<'selected' | 'all'>('selected');

const layout = computed(() => memoryScreenState.traversal
  ? buildMemoryGraphLayout(memoryScreenState.traversal, { zoom: zoom.value })
  : null);

const neighbors = computed(() => (memoryScreenState.traversal?.entries ?? [])
  .filter((entry) => entry.depth > 0)
  .map((entry) => ({ id: entry.id, label: entry.record?.tldr ?? entry.id, status: entry.status })));

function nodeByKey(key: string) {
  return layout.value?.nodes.find((node) => node.key === key);
}

function onWheel(event: WheelEvent): void {
  zoom.value = Math.min(2.5, Math.max(.5, zoom.value * (event.deltaY < 0 ? 1.1 : .9)));
}

function onPointerDown(event: PointerEvent): void {
  dragging.value = true;
  dragStart.value = { x: event.clientX, y: event.clientY, panX: pan.value.x, panY: pan.value.y };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging.value) return;
  pan.value = { x: dragStart.value.panX + event.clientX - dragStart.value.x, y: dragStart.value.panY + event.clientY - dragStart.value.y };
}

function onPointerUp(): void { dragging.value = false; }
function resetViewport(): void { zoom.value = 1; pan.value = { x: 0, y: 0 }; }

watch(() => appState.activeSessionId, () => { void refreshMemories(); });
onMounted(() => { ensureMemoryChangedSubscription(); void refreshMemories(); });
onUnmounted(disposeMemoryChangedSubscription);
</script>

<template>
  <section class="memory-screen">
    <PanelHeader title="Memories" :subtitle="`${memoryScreenState.summaries.length} memories`">
      <template #actions>
        <label class="memory-export-scope">Export
          <select v-model="exportScope" aria-label="Export scope">
            <option value="selected">selected root</option>
            <option value="all">all memories</option>
          </select>
        </label>
        <button type="button" class="btn btn--secondary btn--sm" @click="void exportMemories('markdown', exportScope === 'selected' ? memoryScreenState.selectedId : null)">Markdown</button>
        <button type="button" class="btn btn--secondary btn--sm" @click="void exportMemories('json', exportScope === 'selected' ? memoryScreenState.selectedId : null)">JSON</button>
        <button type="button" class="btn btn--secondary btn--sm" @click="void refreshMemories()">Refresh</button>
      </template>
      <template #toolbar>
        <div class="memory-controls">
          <SearchField
            v-model="memoryScreenState.searchQuery"
            placeholder="Search memories"
            aria-label="Search memories"
            @keyup.enter="void searchMemories()"
          />
          <label><input v-model="memoryScreenState.regex" type="checkbox"> Regex</label>
          <label>Graph depth
            <input
              :value="memoryScreenState.graphDepth"
              type="number"
              min="0"
              max="100"
              @change="setGraphDepth(Number(($event.target as HTMLInputElement).value))"
            >
          </label>
          <button type="button" class="btn btn--secondary btn--sm" @click="void searchMemories()">Search</button>
        </div>
      </template>
    </PanelHeader>

    <div class="memory-workspace">
      <aside class="memory-list" aria-label="Memory list">
        <EmptyState
          v-if="memoryScreenState.loading"
          title="Loading memories"
          hint="Retrieving session context…"
          loading
        />
        <template v-else>
          <ListRow
            v-for="summary in memoryScreenState.summaries"
            :key="summary.id"
            :selected="summary.id === memoryScreenState.selectedId"
            @click="void selectMemory(summary.id)"
            @dblclick="void selectMemory(summary.id).then(openDetail)"
          >
            <template #title>{{ summary.tldr }}</template>
            <template #meta>{{ summary.attachmentCount }} attachment(s) · {{ new Date(summary.updatedAt).toLocaleString() }}</template>
          </ListRow>
          <EmptyState
            v-if="!memoryScreenState.summaries.length"
            title="No memories for this session."
          />
        </template>
      </aside>

      <div class="memory-graph-panel">
        <div class="memory-graph-toolbar">
          <span>Read-only graph</span>
          <span v-if="memoryScreenState.searchQuery" class="memory-search-count">{{ memoryScreenState.searchResults.length }} match(es)</span>
          <button type="button" class="btn btn--secondary btn--sm" @click="resetViewport">Reset view</button>
          <button v-if="memoryScreenState.detail" type="button" class="btn btn--secondary btn--sm" @click="openDetail">Open detail</button>
        </div>
        <div
          class="memory-graph-canvas"
          @wheel.prevent="onWheel"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        >
          <svg v-if="layout" :viewBox="`0 0 ${Math.max(900, (layout.nodes.length + 1) * 230)} 700`" role="img" aria-label="Memory graph">
            <g :transform="`translate(${pan.x} ${pan.y}) scale(${layout.zoom})`">
              <line
                v-for="edge in layout.edges"
                :key="edge.from + '>' + edge.to"
                class="memory-graph-edge"
                :x1="(nodeByKey(edge.from)?.x ?? 0) + 170"
                :y1="(nodeByKey(edge.from)?.y ?? 0) + 42"
                :x2="nodeByKey(edge.to)?.x ?? 0"
                :y2="(nodeByKey(edge.to)?.y ?? 0) + 42"
              />
              <g
                v-for="node in layout.nodes"
                :key="node.key + ':' + node.status"
                class="memory-graph-node"
                :class="[`memory-status-${node.status}`, { selected: node.id === memoryScreenState.selectedId }]"
                :transform="`translate(${node.x} ${node.y})`"
                @click.stop="node.record ? void selectMemory(node.id) : undefined"
                @dblclick.stop="node.record ? void selectMemory(node.id).then(openDetail) : undefined"
              >
                <rect width="170" height="84" rx="6" />
                <text x="10" y="22">{{ node.label.slice(0, 25) }}</text>
                <text x="10" y="43" class="memory-node-status">{{ node.status }}</text>
                <text x="10" y="63" class="memory-node-path">{{ node.breadcrumbs.join(' › ').slice(0, 30) }}</text>
              </g>
            </g>
          </svg>
          <EmptyState v-else title="Select a memory to inspect its graph." />
        </div>
        <p v-if="memoryScreenState.notice" class="memory-notice" role="status">{{ memoryScreenState.notice }}</p>
      </div>
    </div>

    <MemoryDetailPopOutWindow
      :visible="memoryScreenState.detailVisible"
      :record="memoryScreenState.detail"
      :neighbors="neighbors"
      @close="memoryScreenState.detailVisible = false"
      @delete="requestDelete()"
      @open-attachment="openAttachment"
      @delete-attachment="deleteAttachment"
    />
    <ConfirmDialog
      v-if="memoryScreenState.deleteTargetId"
      :visible="true"
      modal-id="memory-delete-confirm"
      title="Delete memory?"
      aria-label="Confirm memory deletion"
      :buttons="[{ id: 'delete', label: 'Delete', variant: 'danger' }, { id: 'cancel', label: 'Cancel', variant: 'secondary' }]"
      :selected-index="0"
      cancel-action-id="cancel"
      @action="(action) => action === 'delete' ? void confirmDelete() : (memoryScreenState.deleteTargetId = null)"
      @cancel="memoryScreenState.deleteTargetId = null"
    >
      <p class="memory-confirm-copy">This removes the memory and reroutes its session-owned graph edges.</p>
    </ConfirmDialog>
  </section>
</template>

<style scoped>
.memory-screen { display: flex; flex-direction: column; height: 100%; min-height: 0; color: var(--text-primary); background: var(--bg-primary); }
.memory-controls, .memory-graph-toolbar { display: flex; align-items: center; gap: 10px; }
.memory-controls { width: 100%; }
.memory-graph-toolbar { padding: 10px 14px; border-bottom: 1px solid var(--border); }
.memory-export-scope { display: flex; align-items: center; gap: 4px; color: var(--text-secondary); font-size: 12px; }
.memory-controls .search-field { flex: 1; min-width: 180px; }
.memory-controls input[type='number'] { width: 60px; }
.memory-workspace { display: grid; grid-template-columns: minmax(190px, 26%) 1fr; min-height: 0; flex: 1; }
.memory-list { overflow: auto; border-right: 1px solid var(--border); }
.memory-graph-panel { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.memory-graph-toolbar { justify-content: space-between; color: var(--text-secondary); font-size: 12px; }
.memory-search-count { color: var(--text-secondary); }
.memory-graph-canvas { flex: 1; min-height: 260px; overflow: hidden; cursor: grab; touch-action: none; }
.memory-graph-canvas:active { cursor: grabbing; }
.memory-graph-canvas svg { display: block; width: 100%; height: 100%; min-height: 420px; }
.memory-graph-edge { stroke: var(--text-secondary); stroke-width: 2; opacity: .7; }
.memory-graph-node { cursor: pointer; }
.memory-graph-node rect { fill: var(--bg-secondary); stroke: var(--border); stroke-width: 2; }
.memory-graph-node.selected rect { stroke: var(--accent); }
.memory-status-cycle rect, .memory-status-reference rect { stroke: var(--status-blocked); }
.memory-status-missing rect, .memory-status-depth-limit rect { stroke: var(--danger); stroke-dasharray: 5 3; }
.memory-graph-node text { fill: var(--text-primary); font-size: 12px; pointer-events: none; }
.memory-graph-node .memory-node-status, .memory-graph-node .memory-node-path { fill: var(--text-secondary); font-size: 10px; }
.memory-notice { margin: 0; padding: 8px 14px; color: var(--accent); border-top: 1px solid var(--border); }
.memory-confirm-copy { padding: 0 18px; color: var(--text-secondary); }
</style>
