<script setup lang="ts">
defineProps<{
  actions: Array<{ label: string; sequence: string; preview: string }>;
}>();

const emit = defineEmits<{
  actionClick: [sequence: string];
}>();

// Alt+1..9 fire the first nine actions (see useChipActionKeys). The ⌥ glyph
// keeps the badge visually distinct from the Ctrl-based ^n session-jump badge.
function accelerator(index: number): string | null {
  return index < 9 ? `⌥${index + 1}` : null;
}

function tooltip(preview: string, index: number): string {
  const accel = accelerator(index);
  return accel ? `Alt+${index + 1} — ${preview}` : preview;
}
</script>

<template>
  <div class="chip-action-bar">
    <button
      v-for="(action, index) in actions"
      :key="`${action.label}:${action.sequence}`"
      type="button"
      class="chip-action-btn"
      :title="tooltip(action.preview, index)"
      @click="emit('actionClick', action.sequence)"
    >
      <span
        v-if="accelerator(index)"
        class="chip-action-btn__accel"
        aria-hidden="true"
      >{{ accelerator(index) }}</span>
      {{ action.label }}
    </button>
  </div>
</template>
