<script setup lang="ts">
/**
 * PlanScreen.vue — SVG canvas for per-directory plan DAG visualisation.
 *
 * Replaces plan-screen.ts. Shows nodes (plan items) and arrows (dependencies)
 * on an interactive SVG canvas with pan/zoom, node selection, and a bottom
 * editor panel.
 */
import { ref, computed } from 'vue';

export interface PlanNode {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'startable' | 'doing' | 'blocked' | 'question' | 'done';
  stateInfo?: string;
}

export interface PlanDep {
  fromId: string;
  toId: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#555555',
  startable: '#4488ff',
  doing: '#44cc44',
  blocked: '#ff9f1a',
  question: '#d17cff',
  done: '#555555',
};

const props = defineProps<{
  visible: boolean;
  dirPath: string;
  nodes: PlanNode[];
  deps: PlanDep[];
  selectedId: string | null;
}>();

const emit = defineEmits<{
  selectNode: [id: string | null];
  addNode: [];
  deleteNode: [id: string];
  completeNode: [id: string];
  applyNode: [id: string];
  close: [];
}>();

const svgRef = ref<SVGSVGElement | null>(null);

const selectedNode = computed(() =>
  props.selectedId ? props.nodes.find(n => n.id === props.selectedId) ?? null : null
);

function getNodeColor(status: string): string {
  return STATUS_COLORS[status] ?? STATUS_COLORS.pending;
}

function handleButton(button: string): boolean {
  switch (button) {
    case 'B':
      if (props.selectedId) {
        emit('selectNode', null);
      } else {
        emit('close');
      }
      return true;
    case 'A':
      if (props.selectedId) {
        emit('applyNode', props.selectedId);
      }
      return true;
    case 'X':
      if (props.selectedId) {
        emit('deleteNode', props.selectedId);
      }
      return true;
    case 'Y':
      emit('addNode');
      return true;
    default:
      return false;
  }
}

defineExpose({ handleButton });
</script>

<template>
  <div
    class="plan-screen"
    :class="{ visible }"
    v-show="visible"
  >
    <div class="plan-screen-toolbar">
      <button class="plan-back-btn" @click="emit('close')">← Back</button>
      <span class="plan-screen-title">Plans: {{ dirPath }}</span>
      <button class="plan-add-btn" @click="emit('addNode')">+ Add</button>
    </div>

    <svg ref="svgRef" class="plan-canvas">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#888" />
        </marker>
      </defs>

      <line
        v-for="dep in deps"
        :key="`${dep.fromId}-${dep.toId}`"
        class="plan-dep-arrow"
        marker-end="url(#arrowhead)"
      />

      <g
        v-for="node in nodes"
        :key="node.id"
        class="plan-node"
        :class="{ selected: node.id === selectedId, done: node.status === 'done' }"
        @click="emit('selectNode', node.id)"
      >
        <rect
          class="plan-node-rect"
          :fill="getNodeColor(node.status)"
          rx="6" ry="6"
          width="200" height="80"
        />
        <text class="plan-node-title" x="100" y="35" text-anchor="middle">
          {{ node.title }}
        </text>
        <text class="plan-node-desc" x="100" y="55" text-anchor="middle">
          {{ node.description?.substring(0, 30) }}
        </text>
      </g>
    </svg>

    <div v-if="selectedNode" class="plan-node-editor">
      <div class="plan-editor-header">
        <span class="plan-editor-status" :style="{ color: getNodeColor(selectedNode.status) }">
          {{ selectedNode.status }}
        </span>
        <span class="plan-editor-title">{{ selectedNode.title }}</span>
      </div>
      <div class="plan-editor-desc">{{ selectedNode.description }}</div>
      <div class="plan-editor-actions">
        <button
          v-if="selectedNode.status !== 'done'"
          class="focusable"
          @click="emit('applyNode', selectedNode.id)"
        >
          Apply
        </button>
        <button
          v-if="selectedNode.status === 'doing'"
          class="focusable"
          @click="emit('completeNode', selectedNode.id)"
        >
          Done
        </button>
        <button
          class="focusable danger"
          @click="emit('deleteNode', selectedNode.id)"
        >
          Delete
        </button>
      </div>
    </div>
  </div>
</template>
