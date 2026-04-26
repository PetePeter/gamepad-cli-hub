<script setup lang="ts">
import { computed } from 'vue';
import DraftChip from './DraftChip.vue';
import PlanChip from './PlanChip.vue';
import ChipActionBar from './ChipActionBar.vue';

export interface DraftPill {
  id: string;
  title: string;
}

export interface PlanChipItem {
  id: string;
  title: string;
  type?: 'bug' | 'feature' | 'research';
  status: 'startable' | 'doing' | 'wait-tests' | 'blocked' | 'question';
}

export interface ChipAction {
  label: string;
  sequence: string;
  preview: string;
}

const props = defineProps<{
  drafts: DraftPill[];
  planChips: PlanChipItem[];
  actions: ChipAction[];
  visible: boolean;
  showNewDraft?: boolean;
}>();

const emit = defineEmits<{
  draftClick: [id: string];
  planChipClick: [id: string];
  newDraft: [];
  actionClick: [sequence: string];
}>();

const hasContent = computed(() =>
  props.drafts.length > 0 ||
  props.planChips.length > 0 ||
  props.actions.length > 0,
);
</script>

<template>
  <div v-if="visible && hasContent" class="chip-bar draft-strip">
    <DraftChip
      v-for="draft in drafts"
      :key="draft.id"
      :title="draft.title"
      @click="emit('draftClick', draft.id)"
    />

    <PlanChip
      v-for="chip in planChips"
      :key="chip.id"
      :title="chip.title"
      :type="chip.type"
      :status="chip.status"
      @click="emit('planChipClick', chip.id)"
    />

    <ChipActionBar
      :actions="actions"
      :show-new-draft="showNewDraft ?? true"
      @new-draft="emit('newDraft')"
      @action-click="emit('actionClick', $event)"
    />
  </div>
</template>
