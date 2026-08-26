<script setup lang="ts">
import { computed, ref, type Component, type CSSProperties } from 'vue';
import type { DockNodePath, DockNode, DockSide, PaneId } from '../../dock-types.js';
import { DOCK_MIN_TRACK_PX, DOCK_SPLITTER_PX } from '../../dock-types.js';
import { isDockCollapsed, listPanes } from '../../dock-layout.js';
import DockSplitter from './DockSplitter.vue';
import DockTabGroup from './DockTabGroup.vue';

defineOptions({ name: 'DockNode' });

const props = defineProps<{
  node: DockNode;
  path: DockNodePath;
  focusedPaneId: PaneId | null;
  paneComponents: Readonly<Record<PaneId, Component>>;
  revealedPaneIds: readonly PaneId[];
  draggedPaneId?: PaneId | null;
}>();

const emit = defineEmits<{
  'focus-pane': [paneId: PaneId, focusedItemId?: string];
  'activate-pane': [paneId: PaneId];
  'close-pane': [paneId: PaneId];
  'resize-split': [path: DockNodePath, sizes: number[]];
  'reveal-pane': [paneId: PaneId];
  'autohide-close': [paneId: PaneId];
  'drag-start': [paneId: PaneId, event: PointerEvent];
  'dock-edge': [paneId: PaneId, side: DockSide];
  'reorder-tab': [paneId: PaneId, index: number];
}>();

const splitRef = ref<HTMLElement | null>(null);

const dockPaneIds = computed(() => props.node.type === 'dock' ? listPanes(props.node.child) : []);
const dockAnchorPaneId = computed(() => dockPaneIds.value[0]);
const dockContentVisible = computed(() =>
  props.node.type !== 'dock' || !collapsed(props.node));

/** Collapse state comes from the shared model predicate, never from local state. */
function collapsed(node: DockNode): boolean {
  return isDockCollapsed(node, props.revealedPaneIds, props.focusedPaneId);
}

function splitStyle(): CSSProperties {
  const node = props.node;
  if (node.type !== 'split') return {};
  // A collapsed dock gets an auto (rail-sized) track instead of an `fr` share,
  // so closing it hands its space back to its siblings rather than leaving a gap.
  const tracks = node.children.map((child, index) =>
    collapsed(child) ? 'auto' : `minmax(${DOCK_MIN_TRACK_PX}px, ${node.sizes[index]}fr)`);
  const gap = ` ${DOCK_SPLITTER_PX}px `;
  return node.direction === 'horizontal'
    ? { gridTemplateColumns: tracks.join(gap) }
    : { gridTemplateRows: tracks.join(gap) };
}

function childPath(index: number): DockNodePath {
  return [...props.path, index];
}

function dockChildPath(): DockNodePath {
  return [...props.path, -1];
}

function onFocusPane(paneId: PaneId, focusedItemId?: string): void {
  emit('focus-pane', paneId, focusedItemId);
}

function onActivatePane(paneId: PaneId): void {
  emit('activate-pane', paneId);
}

function onClosePane(paneId: PaneId): void {
  emit('close-pane', paneId);
}

function onResize(sizes: number[]): void {
  emit('resize-split', props.path, sizes);
}

function openRail(): void {
  const paneId = dockAnchorPaneId.value;
  if (paneId) emit('reveal-pane', paneId);
}

function onDockFocusIn(): void {
  const paneId = dockAnchorPaneId.value;
  if (props.node.type === 'dock' && props.node.mode === 'autohide' && paneId) emit('reveal-pane', paneId);
}

function onDockFocusOut(event: FocusEvent): void {
  if (props.node.type !== 'dock' || props.node.mode !== 'autohide') return;
  const current = event.currentTarget;
  const next = event.relatedTarget;
  if (current instanceof HTMLElement && next instanceof Node && current.contains(next)) return;
  const paneId = dockAnchorPaneId.value;
  if (paneId) emit('autohide-close', paneId);
}
</script>

<template>
  <div v-if="node.type === 'empty'" class="dock-node dock-node--empty" aria-label="Empty workspace">
    No panes open
  </div>

  <div
    v-else-if="node.type === 'split'"
    ref="splitRef"
    class="dock-node dock-node--split"
    :class="`dock-node--${node.direction}`"
    :style="splitStyle()"
    :data-dock-path="path.join('.')"
  >
    <template v-for="(child, index) in node.children" :key="`child-${index}`">
      <DockNode
        :node="child"
        :path="childPath(index)"
        :focused-pane-id="focusedPaneId"
        :pane-components="paneComponents"
        :revealed-pane-ids="revealedPaneIds"
        :dragged-pane-id="draggedPaneId"
        @focus-pane="onFocusPane"
        @activate-pane="onActivatePane"
        @close-pane="onClosePane"
        @resize-split="(...args) => emit('resize-split', ...args)"
        @reveal-pane="(paneId) => emit('reveal-pane', paneId)"
        @autohide-close="(paneId) => emit('autohide-close', paneId)"
        @drag-start="(...args) => emit('drag-start', ...args)"
        @dock-edge="(...args) => emit('dock-edge', ...args)"
        @reorder-tab="(...args) => emit('reorder-tab', ...args)"
      />
      <DockSplitter
        v-if="index < node.children.length - 1"
        :container-ref="splitRef"
        :direction="node.direction"
        :index="index"
        :sizes="node.sizes"
        @resize="onResize"
      />
    </template>
  </div>

  <div
    v-else-if="node.type === 'group'"
    class="dock-node dock-node--group"
    :data-dock-path="path.join('.')"
  >
    <DockTabGroup
      :tabs="node.tabs"
      :active-tab="node.activeTab"
      :focused-pane-id="focusedPaneId"
      :pane-components="paneComponents"
      :dragged-pane-id="draggedPaneId"
      @focus="onFocusPane"
      @activate="onActivatePane"
      @close="onClosePane"
      @drag-start="(...args) => emit('drag-start', ...args)"
      @dock-edge="(...args) => emit('dock-edge', ...args)"
      @reorder="(...args) => emit('reorder-tab', ...args)"
    />
  </div>

  <div
    v-else
    class="dock-node dock-node--dock"
    :class="[
      `dock-node--side-${node.side}`,
      `dock-node--mode-${node.mode}`,
      { 'dock-node--collapsed': !dockContentVisible },
    ]"
    :data-dock-side="node.side"
    :data-dock-collapsed="!dockContentVisible"
    @focusin="onDockFocusIn"
    @focusout="onDockFocusOut"
  >
    <div class="dock-node__content" v-show="dockContentVisible">
      <DockNode
        :node="node.child"
        :path="dockChildPath()"
        :focused-pane-id="focusedPaneId"
        :pane-components="paneComponents"
        :revealed-pane-ids="revealedPaneIds"
        :dragged-pane-id="draggedPaneId"
        @focus-pane="onFocusPane"
        @activate-pane="onActivatePane"
        @close-pane="onClosePane"
        @resize-split="(...args) => emit('resize-split', ...args)"
        @reveal-pane="(paneId) => emit('reveal-pane', paneId)"
        @autohide-close="(paneId) => emit('autohide-close', paneId)"
        @drag-start="(...args) => emit('drag-start', ...args)"
        @dock-edge="(...args) => emit('dock-edge', ...args)"
        @reorder-tab="(...args) => emit('reorder-tab', ...args)"
      />
    </div>
    <button
      v-if="node.mode !== 'pinned'"
      class="dock-rail"
      :data-dock-rail="node.side"
      type="button"
      :aria-label="`${node.mode === 'hidden' ? 'Show' : 'Open'} ${dockAnchorPaneId ?? 'dock'} pane`"
      :aria-expanded="dockContentVisible"
      @click="openRail"
    >
      <span class="dock-rail__label">{{ dockAnchorPaneId ?? 'Pane' }}</span>
    </button>
  </div>
</template>
