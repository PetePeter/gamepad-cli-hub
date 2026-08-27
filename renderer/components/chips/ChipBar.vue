<script setup lang="ts">
import { computed } from 'vue';
import PlanChip from './PlanChip.vue';
import ChipActionBar from './ChipActionBar.vue';

export interface PlanChipItem {
  id: string;
  humanId?: string;
  title: string;
  type?: 'bug' | 'feature' | 'research';
  status: 'planning' | 'ready' | 'coding' | 'review' | 'blocked' | 'done';
}

export interface ChipAction {
  label: string;
  sequence: string;
  preview: string;
}

const props = withDefaults(defineProps<{
  planChips: PlanChipItem[];
  actions: ChipAction[];
  visible: boolean;
  /** Which edge the bar sits against — decides which side carries the border. */
  placement?: 'top' | 'bottom';
}>(), { placement: 'top' });

const emit = defineEmits<{
  planChipClick: [id: string];
  planChipCopy: [humanId: string];
  actionClick: [sequence: string];
}>();

const hasContent = computed(() =>
  props.planChips.length > 0 ||
  props.actions.length > 0,
);
</script>

<template>
  <div v-if="visible && hasContent" class="chip-bar draft-strip" :class="`draft-strip--${props.placement}`">
    <PlanChip
      v-for="chip in planChips"
      :key="chip.id"
      :human-id="chip.humanId"
      :title="chip.title"
      :type="chip.type"
      :status="chip.status"
      @click="emit('planChipClick', chip.id)"
      @copy="chip.humanId && emit('planChipCopy', chip.humanId)"
    />

    <ChipActionBar
      :actions="actions"
      @action-click="emit('actionClick', $event)"
    />
  </div>
</template>
