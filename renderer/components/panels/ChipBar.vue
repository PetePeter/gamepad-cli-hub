<script setup lang="ts">
/**
 * ChipBar.vue — Horizontal strip above the terminal showing draft pills
 * and plan chips for the active session context.
 *
 * Replaces chip-bar.ts + draft-strip.ts + plan-chips.ts rendering.
 */
import { computed } from 'vue';

export interface DraftPill {
  id: string;
  title: string;
}

export interface PlanChip {
  id: string;
  title: string;
  status: 'startable' | 'doing' | 'blocked' | 'question';
}

const props = defineProps<{
  drafts: DraftPill[];
  planChips: PlanChip[];
  visible: boolean;
}>();

const emit = defineEmits<{
  draftClick: [id: string];
  planChipClick: [id: string];
  newDraft: [];
}>();

const STATUS_ICONS: Record<string, string> = {
  startable: '🔵',
  doing: '🟢',
  blocked: '⛔',
  question: '❓',
};

function chipIcon(status: string): string {
  return STATUS_ICONS[status] ?? '🔵';
}

const hasDrafts = computed(() => props.drafts.length > 0);
const hasChips = computed(() => props.planChips.length > 0);
const hasContent = computed(() => hasDrafts.value || hasChips.value);
</script>

<template>
  <div v-if="visible && hasContent" class="chip-bar draft-strip">
    <span
      v-for="draft in drafts"
      :key="draft.id"
      class="draft-pill"
      @click="emit('draftClick', draft.id)"
    >
      📝 {{ draft.title }}
    </span>

    <span
      v-for="chip in planChips"
      :key="chip.id"
      class="plan-chip"
      :class="`plan-chip--${chip.status}`"
      @click="emit('planChipClick', chip.id)"
    >
      {{ chipIcon(chip.status) }} {{ chip.title }}
    </span>
  </div>
</template>
