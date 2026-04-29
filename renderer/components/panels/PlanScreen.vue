<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { getDisplayTitle } from '../../types.js';
import type { PlanDependency, PlanItem, PlanSequence } from '../../../src/types/plan.js';
import type { LayoutResult } from '../../plans/plan-layout.js';

const NODE_W = 200;
const NODE_H = 102;
const CONNECTOR_R = 6;
const CONNECTOR_SNAP_TOLERANCE_PX = 16;
const EMPTY_SEQ_W = 260;
const EMPTY_SEQ_H = 80;

const STATUS_COLORS: Record<string, string> = {
  planning: '#555555',
  ready: '#4488ff',
  coding: '#44cc44',
  review: '#44ccff',
  blocked: '#ff9f1a',
  done: '#555555',
};

const props = withDefaults(defineProps<{
  visible: boolean;
  dirPath: string;
  items: PlanItem[];
  deps: PlanDependency[];
  sequences?: PlanSequence[];
  layout: LayoutResult;
  selectedId: string | null;
  selectedIds?: Set<string>;
  notice?: string;
  relatedFocusRootId?: string | null;
  relatedFocusIds?: Set<string>;
  relatedTransientIds?: Set<string>;
  filters?: {
    types: { bug: boolean; feature: boolean; research: boolean; untyped: boolean };
    statuses: { planning: boolean; ready: boolean; coding: boolean; review: boolean; blocked: boolean; done: boolean };
  };
}>(), {
  sequences: () => [],
  selectedIds: () => new Set<string>(),
  relatedFocusRootId: null,
  relatedFocusIds: () => new Set<string>(),
  relatedTransientIds: () => new Set<string>(),
  filters: () => ({
    types: { bug: true, feature: true, research: true, untyped: true },
    statuses: { planning: true, ready: true, coding: true, review: true, blocked: true, done: true },
  }),
});

const emit = defineEmits<{
  close: [];
  addNode: [];
  exportDir: [];
  clearDone: [];
  createSequence: [title: string, missionStatement: string, sharedMemory: string];
  assignSequence: [planId: string, sequenceId: string | null];
  updateSequence: [id: string, updates: { title?: string; missionStatement?: string; sharedMemory?: string; order?: number }];
  deleteSequence: [id: string];
  deleteSequenceWithPlans: [id: string];
  nodeClick: [id: string, event?: MouseEvent];
  editNode: [id: string];
  applyNode: [id: string];
  completeNode: [id: string];
  deleteNode: [id: string];
  addDep: [fromId: string, toId: string];
  removeDep: [fromId: string, toId: string];
  toggleRelatedFocus: [];
  toggleTypeFilter: [type: 'bug' | 'feature' | 'research' | 'untyped'];
  toggleStatusFilter: [status: 'planning' | 'ready' | 'coding' | 'review' | 'blocked' | 'done'];
  resetFilters: [];
  openBackups: [];
}>();

const wrapperRef = ref<HTMLElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);
const viewBox = ref({ x: 0, y: 0, w: 800, h: 600 });
const isPanning = ref(false);
const panStart = ref({ x: 0, y: 0, vbx: 0, vby: 0 });
const dragState = ref<{ fromId: string; x: number; y: number } | null>(null);
const seqDragState = ref<{ ids: string[]; x: number; y: number; hoveredSeqId: string | null } | null>(null);

const seqModalVisible = ref(false);
const seqModalMode = ref<'create' | 'edit'>('create');
const seqModalDeleteConfirm = ref(false);
const seqModalDeleteWithPlansConfirm = ref(false);
const seqDraft = reactive({ id: '', title: '', missionStatement: '', sharedMemory: '' });

const nodeMap = computed(() => {
  const map = new Map<string, LayoutResult['nodes'][number]>();
  for (const node of props.layout.nodes) map.set(node.id, node);
  return map;
});

const positionedItems = computed(() =>
  props.items
    .map((item) => {
      const layoutNode = nodeMap.value.get(item.id);
      return layoutNode ? { ...item, ...layoutNode } : null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null),
);

const selectedItem = computed(() =>
  props.selectedId ? props.items.find((item) => item.id === props.selectedId) ?? null : null,
);

const sequenceBoxes = computed(() => {
  const populated: { sequence: PlanSequence; x: number; y: number; width: number; height: number; isEmpty: false }[] = [];
  const empty: { sequence: PlanSequence; x: number; y: number; width: number; height: number; isEmpty: true }[] = [];

  for (const sequence of props.sequences) {
    const nodes = positionedItems.value.filter((item) => item.sequenceId === sequence.id);
    if (nodes.length > 0) {
      const minX = Math.min(...nodes.map((node) => node.x)) - 30;
      const minY = Math.min(...nodes.map((node) => node.y)) - 42;
      const maxX = Math.max(...nodes.map((node) => node.x + NODE_W)) + 30;
      const maxY = Math.max(...nodes.map((node) => node.y + NODE_H)) + 26;
      populated.push({ sequence, x: minX, y: minY, width: maxX - minX, height: maxY - minY, isEmpty: false });
    } else {
      empty.push({ sequence, x: 0, y: 0, width: EMPTY_SEQ_W, height: EMPTY_SEQ_H, isEmpty: true });
    }
  }

  const emptyRowY = Math.max(props.layout.height, 600) + 80;
  for (let i = 0; i < empty.length; i++) {
    empty[i]!.x = 20 + i * (EMPTY_SEQ_W + 20);
    empty[i]!.y = emptyRowY;
  }

  return [...populated, ...empty] as Array<{ sequence: PlanSequence; x: number; y: number; width: number; height: number; isEmpty: boolean }>;
});

const hasEmptySequences = computed(() => sequenceBoxes.value.some((b) => b.isEmpty));

const relatedFocusActive = computed(() => !!props.relatedFocusRootId);

const relatedForegroundIds = computed(() => {
  const ids = new Set(props.relatedFocusIds ?? []);
  for (const id of props.relatedTransientIds ?? []) ids.add(id);
  return ids;
});

const dragPath = computed(() => {
  if (!dragState.value) return '';
  const from = nodeMap.value.get(dragState.value.fromId);
  if (!from) return '';
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = dragState.value.x;
  const y2 = dragState.value.y;
  return `M ${x1} ${y1} L ${x2} ${y2}`;
});

watch(() => [props.visible, props.layout.width, props.layout.height], () => {
  if (!props.visible) return;
  const baseH = Math.max(props.layout.height, 600);
  const extraH = hasEmptySequences.value ? EMPTY_SEQ_H + 120 : 0;
  viewBox.value = {
    x: 0,
    y: 0,
    w: Math.max(props.layout.width, 800),
    h: baseH + extraH,
  };
}, { immediate: true });

function getNodeColor(status: string): string {
  return STATUS_COLORS[status] ?? STATUS_COLORS.planning;
}

function formatPlanDate(value?: number): string {
  return value ? new Date(value).toLocaleDateString() : '';
}

function connectorPoint(id: string, side: 'in' | 'out'): { x: number; y: number } | null {
  const node = nodeMap.value.get(id);
  if (!node) return null;
  return {
    x: side === 'out' ? node.x + NODE_W : node.x,
    y: node.y + NODE_H / 2,
  };
}

function depPath(dep: PlanDependency): string {
  const from = connectorPoint(dep.fromId, 'out');
  const to = connectorPoint(dep.toId, 'in');
  if (!from || !to) return '';
  const cpx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  return `M ${from.x} ${from.y} Q ${cpx} ${from.y}, ${cpx} ${my} Q ${cpx} ${to.y}, ${to.x} ${to.y}`;
}

function isRelatedBackground(id: string): boolean {
  return relatedFocusActive.value && !relatedForegroundIds.value.has(id);
}

function isDepRelatedBackground(dep: PlanDependency): boolean {
  return isRelatedBackground(dep.fromId) || isRelatedBackground(dep.toId);
}

function wrapperPoint(clientX: number, clientY: number): { x: number; y: number } {
  const rect = wrapperRef.value?.getBoundingClientRect();
  if (!rect) return { x: clientX, y: clientY };
  return {
    x: ((clientX - rect.left) / (rect.width || 1)) * viewBox.value.w + viewBox.value.x,
    y: ((clientY - rect.top) / (rect.height || 1)) * viewBox.value.h + viewBox.value.y,
  };
}

function applyMatrix(matrix: DOMMatrix, x: number, y: number): { x: number; y: number } {
  return {
    x: matrix.a * x + matrix.c * y + matrix.e,
    y: matrix.b * x + matrix.d * y + matrix.f,
  };
}

function svgPoint(clientX: number, clientY: number): { x: number; y: number } {
  const svg = svgRef.value;
  const matrix = svg && typeof svg.getScreenCTM === 'function' ? svg.getScreenCTM() : null;
  const inverse = matrix?.inverse?.() ?? null;
  return inverse ? applyMatrix(inverse, clientX, clientY) : wrapperPoint(clientX, clientY);
}

function connectorClientPoint(x: number, y: number): { x: number; y: number } {
  const svg = svgRef.value;
  const matrix = svg && typeof svg.getScreenCTM === 'function' ? svg.getScreenCTM() : null;
  if (matrix) return applyMatrix(matrix, x, y);
  const rect = wrapperRef.value?.getBoundingClientRect();
  if (!rect) return { x, y };
  return {
    x: ((x - viewBox.value.x) / viewBox.value.w) * (rect.width || 1) + rect.left,
    y: ((y - viewBox.value.y) / viewBox.value.h) * (rect.height || 1) + rect.top,
  };
}

function findSnapTarget(clientX: number, clientY: number, fromId: string): string | null {
  let best: { id: string; distance: number } | null = null;
  for (const node of props.layout.nodes) {
    if (node.id === fromId) continue;
    const point = connectorClientPoint(node.x, node.y + NODE_H / 2);
    const distance = Math.hypot(clientX - point.x, clientY - point.y);
    if (distance > CONNECTOR_SNAP_TOLERANCE_PX) continue;
    if (!best || distance < best.distance) {
      best = { id: node.id, distance };
    }
  }
  return best?.id ?? null;
}

function onCanvasMouseDown(e: MouseEvent): void {
  const target = e.target as Element;
  if (target.closest('.plan-node') || target.closest('.plan-arrow')) return;
  isPanning.value = true;
  panStart.value = {
    x: e.clientX,
    y: e.clientY,
    vbx: viewBox.value.x,
    vby: viewBox.value.y,
  };
}

function onCanvasMouseMove(e: MouseEvent): void {
  if (dragState.value) {
    dragState.value = {
      ...dragState.value,
      ...svgPoint(e.clientX, e.clientY),
    };
    return;
  }
  if (seqDragState.value) {
    const pt = svgPoint(e.clientX, e.clientY);
    seqDragState.value = {
      ...seqDragState.value,
      x: pt.x,
      y: pt.y,
      hoveredSeqId: findSeqBoxAtPoint(pt.x, pt.y),
    };
    return;
  }
  if (!isPanning.value || !wrapperRef.value) return;
  const rect = wrapperRef.value.getBoundingClientRect();
  const sx = viewBox.value.w / (rect.width || 1);
  const sy = viewBox.value.h / (rect.height || 1);
  viewBox.value = {
    ...viewBox.value,
    x: panStart.value.vbx - (e.clientX - panStart.value.x) * sx,
    y: panStart.value.vby - (e.clientY - panStart.value.y) * sy,
  };
}

function onCanvasMouseUp(e: MouseEvent): void {
  if (dragState.value) {
    const targetId = findSnapTarget(e.clientX, e.clientY, dragState.value.fromId);
    if (targetId && targetId !== dragState.value.fromId) {
      emit('addDep', dragState.value.fromId, targetId);
    }
    dragState.value = null;
  }
  if (seqDragState.value) {
    if (seqDragState.value.hoveredSeqId) {
      for (const id of seqDragState.value.ids) {
        emit('assignSequence', id, seqDragState.value.hoveredSeqId);
      }
    }
    seqDragState.value = null;
  }
  isPanning.value = false;
}

function onCanvasWheel(e: WheelEvent): void {
  e.preventDefault();
  if (!wrapperRef.value) return;
  const rect = wrapperRef.value.getBoundingClientRect();
  const scale = e.deltaY > 0 ? 1.1 : 0.9;
  const mx = ((e.clientX - rect.left) / (rect.width || 1)) * viewBox.value.w + viewBox.value.x;
  const my = ((e.clientY - rect.top) / (rect.height || 1)) * viewBox.value.h + viewBox.value.y;
  viewBox.value = {
    w: viewBox.value.w * scale,
    h: viewBox.value.h * scale,
    x: mx - ((e.clientX - rect.left) / (rect.width || 1)) * viewBox.value.w * scale,
    y: my - ((e.clientY - rect.top) / (rect.height || 1)) * viewBox.value.h * scale,
  };
}

function startDragConnection(id: string, e: MouseEvent): void {
  e.stopPropagation();
  dragState.value = {
    fromId: id,
    ...svgPoint(e.clientX, e.clientY),
  };
}

function onNodeBodyMouseDown(id: string, e: MouseEvent): void {
  if ((e.target as Element).closest('.plan-node__connector')) return;
  e.stopPropagation();
  const ids = props.selectedIds.has(id) ? [...props.selectedIds] : [id];
  const pt = svgPoint(e.clientX, e.clientY);
  seqDragState.value = { ids, x: pt.x, y: pt.y, hoveredSeqId: null };
}

function findSeqBoxAtPoint(x: number, y: number): string | null {
  for (const box of sequenceBoxes.value) {
    if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) {
      return box.sequence.id;
    }
  }
  return null;
}

function unlinkFromSequence(id: string, e: MouseEvent): void {
  e.stopPropagation();
  emit('assignSequence', id, null);
}

function openSeqCreate(): void {
  seqDraft.id = '';
  seqDraft.title = '';
  seqDraft.missionStatement = '';
  seqDraft.sharedMemory = '';
  seqModalDeleteConfirm.value = false;
  seqModalDeleteWithPlansConfirm.value = false;
  seqModalMode.value = 'create';
  seqModalVisible.value = true;
}

function openSeqEdit(sequence: PlanSequence): void {
  seqDraft.id = sequence.id;
  seqDraft.title = sequence.title;
  seqDraft.missionStatement = sequence.missionStatement ?? '';
  seqDraft.sharedMemory = sequence.sharedMemory ?? '';
  seqModalDeleteConfirm.value = false;
  seqModalDeleteWithPlansConfirm.value = false;
  seqModalMode.value = 'edit';
  seqModalVisible.value = true;
}

function onSeqSave(): void {
  if (seqModalMode.value === 'create') {
    emit('createSequence', seqDraft.title, seqDraft.missionStatement, seqDraft.sharedMemory);
  } else {
    emit('updateSequence', seqDraft.id, {
      title: seqDraft.title,
      missionStatement: seqDraft.missionStatement,
      sharedMemory: seqDraft.sharedMemory,
    });
  }
  seqModalVisible.value = false;
}

function onSeqDelete(): void {
  if (!seqModalDeleteConfirm.value) {
    seqModalDeleteConfirm.value = true;
    seqModalDeleteWithPlansConfirm.value = false;
    return;
  }
  emit('deleteSequence', seqDraft.id);
  seqModalVisible.value = false;
}

function onSeqDeleteWithPlans(): void {
  if (!seqModalDeleteWithPlansConfirm.value) {
    seqModalDeleteWithPlansConfirm.value = true;
    seqModalDeleteConfirm.value = false;
    return;
  }
  emit('deleteSequenceWithPlans', seqDraft.id);
  seqModalVisible.value = false;
}
</script>

<template>
  <div v-show="visible" class="plan-screen" :class="{ visible }">
    <div class="plan-header">
      <button class="plan-header__btn" @click="emit('close')">← Back</button>
      <button class="plan-header__btn plan-header__btn--add" @click="emit('addNode')">+ Add Node</button>
      <button class="plan-header__btn plan-header__btn--secondary" @click="openSeqCreate">+ Sequence</button>
      <span class="plan-header__title">{{ dirPath }} - Plans</span>

      <div class="plan-header__filters">
        <span class="plan-header__filter-label">Type:</span>
        <label class="plan-header__filter">
          <input type="checkbox" :checked="filters.types.bug" @change="emit('toggleTypeFilter', 'bug')"> Bug
        </label>
        <label class="plan-header__filter">
          <input type="checkbox" :checked="filters.types.feature" @change="emit('toggleTypeFilter', 'feature')"> Feature
        </label>
        <label class="plan-header__filter">
          <input type="checkbox" :checked="filters.types.research" @change="emit('toggleTypeFilter', 'research')"> Research
        </label>
        <label class="plan-header__filter">
          <input type="checkbox" :checked="filters.types.untyped" @change="emit('toggleTypeFilter', 'untyped')"> Untyped
        </label>

        <span class="plan-header__filter-label plan-header__filter-label--status">Status:</span>
        <label class="plan-header__filter">
          <input type="checkbox" :checked="filters.statuses.planning" @change="emit('toggleStatusFilter', 'planning')"> Planning
        </label>
        <label class="plan-header__filter">
          <input type="checkbox" :checked="filters.statuses.ready" @change="emit('toggleStatusFilter', 'ready')"> Ready
        </label>
        <label class="plan-header__filter">
          <input type="checkbox" :checked="filters.statuses.coding" @change="emit('toggleStatusFilter', 'coding')"> Coding
        </label>
        <label class="plan-header__filter">
          <input type="checkbox" :checked="filters.statuses.review" @change="emit('toggleStatusFilter', 'review')"> Review
        </label>
        <label class="plan-header__filter">
          <input type="checkbox" :checked="filters.statuses.blocked" @change="emit('toggleStatusFilter', 'blocked')"> Blocked
        </label>
        <label class="plan-header__filter">
          <input type="checkbox" :checked="filters.statuses.done" @change="emit('toggleStatusFilter', 'done')"> Done
        </label>

        <button class="plan-header__btn plan-header__btn--reset" @click="emit('resetFilters')">Reset</button>
      </div>

      <div class="plan-header__controls">
        <button
          class="plan-header__btn plan-header__btn--secondary"
          :disabled="!selectedId && !relatedFocusActive"
          title="Focus related plans (F)"
          @click="emit('toggleRelatedFocus')"
        >{{ relatedFocusActive ? 'Clear Focus' : 'Focus Related' }}</button>
        <button class="plan-header__btn plan-header__btn--secondary" @click="emit('exportDir')">⬆ Export Dir</button>
        <button class="plan-header__btn plan-header__btn--secondary" @click="emit('clearDone')">🧹 Clear Done</button>
        <button class="plan-header__btn plan-header__btn--secondary" @click="emit('openBackups')" title="Backups (R)">💾 Backups</button>
      </div>
      <span v-if="notice" class="plan-notice plan-notice--visible">{{ notice }}</span>
    </div>

    <div
      ref="wrapperRef"
      class="plan-canvas"
      @mousedown="onCanvasMouseDown"
      @mousemove="onCanvasMouseMove"
      @mouseup="onCanvasMouseUp"
      @mouseleave="onCanvasMouseUp"
      @wheel="onCanvasWheel"
    >
      <svg
        ref="svgRef"
        :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`"
      >
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#555" />
          </marker>
        </defs>

        <g
          v-for="box in sequenceBoxes"
          :key="box.sequence.id"
          class="plan-sequence-lane"
          :class="{
            'plan-sequence-lane--empty': box.isEmpty,
            'plan-sequence-lane--drop-target': seqDragState?.hoveredSeqId === box.sequence.id,
          }"
          :transform="`translate(${box.x}, ${box.y})`"
        >
          <rect
            :width="box.width"
            :height="box.height"
            rx="8"
            ry="8"
          />
          <foreignObject x="10" y="8" :width="Math.max(120, box.width - 44)" height="28">
            <div
              xmlns="http://www.w3.org/1999/xhtml"
              class="plan-sequence-lane__title"
            >{{ box.sequence.title }}</div>
          </foreignObject>
          <g
            class="plan-seq-edit-btn"
            :transform="`translate(${box.width - 30}, 6)`"
            @mousedown.stop
            @mouseup.stop
            @click.stop="openSeqEdit(box.sequence)"
          >
            <title>Edit sequence</title>
            <rect width="22" height="20" rx="4" pointer-events="all" />
            <text x="11" y="14" text-anchor="middle">✎</text>
          </g>
          <text
            v-if="box.isEmpty"
            class="plan-sequence-lane__placeholder"
            x="50%"
            y="55%"
            text-anchor="middle"
          >Drop plans here</text>
        </g>

        <path
          v-for="dep in deps"
          :key="`${dep.fromId}-${dep.toId}`"
          class="plan-arrow"
          :class="{ 'plan-arrow--related-background': isDepRelatedBackground(dep) }"
          :d="depPath(dep)"
          fill="none"
          stroke="#555"
          stroke-width="1.5"
          marker-end="url(#arrowhead)"
          @click.stop="emit('removeDep', dep.fromId, dep.toId)"
        />

        <path
          v-if="dragPath"
          class="plan-drag-line"
          :d="dragPath"
          fill="none"
          stroke="#ff6600"
          stroke-width="2"
          stroke-dasharray="6 3"
        />

        <g
          v-for="item in positionedItems"
          :key="item.id"
          class="plan-node"
          :class="{
            'plan-node--selected': item.id === selectedId,
            'plan-node--multiselected': selectedIds.has(item.id) && item.id !== selectedId,
            'plan-node--done': item.status === 'done',
            'plan-node--related-background': isRelatedBackground(item.id),
            'plan-node--related-transient': relatedTransientIds.has(item.id),
          }"
          :data-id="item.id"
          :transform="`translate(${item.x}, ${item.y})`"
          @click.stop="emit('nodeClick', item.id, $event)"
          @dblclick.stop="emit('editNode', item.id)"
          @mousedown="onNodeBodyMouseDown(item.id, $event)"
        >
          <rect
            width="200"
            height="102"
            rx="10"
            ry="10"
            fill="#1a1a1a"
            stroke="#333"
            stroke-width="1.5"
          />
          <circle
            cx="18"
            cy="18"
            r="7"
            :fill="getNodeColor(item.status)"
          />
          <foreignObject x="32" y="6" width="160" height="20">
            <div xmlns="http://www.w3.org/1999/xhtml" class="plan-node__title">{{ getDisplayTitle(item.title, item.type) }}</div>
          </foreignObject>
          <foreignObject x="8" y="26" width="184" height="14">
            <div xmlns="http://www.w3.org/1999/xhtml" class="plan-node__meta">
              {{ item.humanId || 'Plan' }} · C {{ formatPlanDate(item.createdAt) }} · S {{ formatPlanDate(item.stateUpdatedAt || item.updatedAt) }}
            </div>
          </foreignObject>
          <foreignObject x="8" y="42" width="184" :height="item.stateInfo ? 24 : 34">
            <div xmlns="http://www.w3.org/1999/xhtml" class="plan-node__desc">{{ item.description }}</div>
          </foreignObject>
          <foreignObject v-if="item.stateInfo" x="8" y="78" width="184" height="16">
            <div xmlns="http://www.w3.org/1999/xhtml" class="plan-node__state-info">{{ item.stateInfo }}</div>
          </foreignObject>
          <g
            v-if="item.sequenceId"
            class="plan-node__unlink"
            @mousedown.stop
            @mouseup.stop
            @click.stop="unlinkFromSequence(item.id, $event)"
          >
            <title>Unlink from sequence</title>
            <circle cx="190" cy="12" r="8" />
            <path d="M185 12h4" />
            <path d="M191 12h4" />
            <path d="M188.5 9.5l3 5" />
          </g>
          <circle
            class="plan-node__connector plan-node__connector--in"
            cx="0"
            cy="51"
            :r="CONNECTOR_R"
            fill="#333"
            stroke="#555"
            stroke-width="1"
          />
          <circle
            class="plan-node__connector plan-node__connector--out"
            cx="200"
            cy="51"
            :r="CONNECTOR_R"
            fill="#333"
            stroke="#555"
            stroke-width="1"
            @mousedown.stop="startDragConnection(item.id, $event)"
          />
        </g>

        <text v-if="items.length === 0" class="plan-canvas-empty" x="50%" y="45%" text-anchor="middle">
          No plan items yet
        </text>
        <text v-if="items.length === 0" class="plan-canvas-empty-hint" x="50%" y="55%" text-anchor="middle">
          Click + Add or press Y to create your first item
        </text>
      </svg>
    </div>

    <div class="plan-controls-hint">
      <span>Y add</span>
      <span>A edit</span>
      <span>X delete</span>
      <span>B back or deselect</span>
      <span>Double click edit</span>
      <span>Drag node to sequence</span>
      <span>Drag connector to link</span>
      <span>F focus related</span>
    </div>

    <div v-if="selectedItem" class="plan-inspector">
      <div class="plan-inspector__header">
        <span class="plan-inspector__title">{{ selectedItem.title }}</span>
        <div class="plan-header__controls">
          <button class="plan-header__btn" @click="emit('editNode', selectedItem.id)">Edit</button>
          <button
            v-if="selectedItem.status !== 'done'"
            class="plan-header__btn plan-header__btn--secondary"
            @click="emit('applyNode', selectedItem.id)"
          >Apply</button>
          <button
            v-if="selectedItem.status === 'coding' || selectedItem.status === 'review'"
            class="plan-header__btn plan-header__btn--secondary"
            @click="emit('completeNode', selectedItem.id)"
          >Done</button>
          <button class="plan-header__btn plan-header__btn--secondary" @click="emit('deleteNode', selectedItem.id)">Delete</button>
        </div>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="seqModalVisible" class="plan-sequence-modal-overlay" @mousedown.self="seqModalVisible = false">
      <div class="plan-sequence-modal">
        <div class="plan-sequence-modal__header">
          {{ seqModalMode === 'create' ? 'New Sequence' : 'Edit Sequence' }}
        </div>

        <label class="plan-sequence-modal__field">
          <span>Title</span>
          <input
            v-model="seqDraft.title"
            class="plan-sequence-modal__input"
            placeholder="Sequence title..."
            maxlength="100"
          />
        </label>

        <label class="plan-sequence-modal__field">
          <span>Mission</span>
          <textarea
            v-model="seqDraft.missionStatement"
            class="plan-sequence-modal__textarea"
            placeholder="What is this sequence working toward?"
            rows="3"
          />
        </label>

        <label class="plan-sequence-modal__field">
          <span>Memory</span>
          <textarea
            v-model="seqDraft.sharedMemory"
            class="plan-sequence-modal__textarea"
            placeholder="Shared context for all plans in this sequence..."
            rows="3"
          />
        </label>

        <div class="plan-sequence-modal__actions">
          <button class="btn btn--primary btn--sm" @click="onSeqSave">
            {{ seqModalMode === 'create' ? 'Create' : 'Save' }}
          </button>
          <button
            v-if="seqModalMode === 'edit'"
            class="btn btn--sm"
            :class="seqModalDeleteConfirm ? 'btn--danger' : 'btn--secondary'"
            @click="onSeqDelete"
          >{{ seqModalDeleteConfirm ? 'Confirm Delete' : 'Delete' }}</button>
          <button
            v-if="seqModalMode === 'edit'"
            class="btn btn--sm"
            :class="seqModalDeleteWithPlansConfirm ? 'btn--danger' : 'btn--secondary'"
            @click="onSeqDeleteWithPlans"
          >{{ seqModalDeleteWithPlansConfirm ? 'Confirm Delete All' : 'Delete + Plans' }}</button>
          <button class="btn btn--secondary btn--sm" @click="seqModalVisible = false">Cancel</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.plan-node--multiselected rect:first-child {
  stroke: #4488ff;
  stroke-width: 2;
}
.plan-node__unlink {
  cursor: pointer;
}
.plan-node__unlink circle {
  fill: rgba(46, 58, 76, 0.92);
  stroke: #6f86a8;
  stroke-width: 1.5;
  pointer-events: all;
}
.plan-node__unlink path {
  fill: none;
  stroke: #c3d2e6;
  stroke-linecap: round;
  stroke-width: 1.4;
  pointer-events: none;
}
.plan-node__unlink:hover circle {
  fill: rgba(58, 75, 102, 0.96);
  stroke: #9bb7dc;
  stroke-width: 2;
}
.plan-node__unlink:hover path {
  stroke: #f0f6ff;
}
.plan-seq-edit-btn {
  cursor: pointer;
}
.plan-seq-edit-btn rect {
  fill: #2a2a2a;
  stroke: #555;
  stroke-width: 1;
}
.plan-seq-edit-btn text {
  fill: #aaa;
  font-size: 12px;
  pointer-events: none;
  user-select: none;
}
.plan-seq-edit-btn:hover rect {
  fill: #383838;
  stroke: #888;
}
.plan-seq-edit-btn:hover text {
  fill: #eee;
}
.plan-sequence-lane--empty rect {
  stroke-dasharray: 6 4;
  stroke: #444;
  fill: transparent;
}
.plan-sequence-lane--empty .plan-sequence-lane__placeholder {
  fill: #555;
  font-size: 12px;
}
.plan-sequence-lane--drop-target rect {
  stroke: #44cc44;
  stroke-width: 2.5;
  fill: rgba(68, 204, 68, 0.08);
}
.plan-sequence-lane__title {
  cursor: pointer;
  font-weight: 600;
  font-size: 13px;
  color: var(--text-primary, #ddd);
}
.plan-sequence-lane__title:hover {
  color: #4488ff;
}
</style>
