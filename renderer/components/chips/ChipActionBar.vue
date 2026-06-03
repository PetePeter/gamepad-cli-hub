<script setup lang="ts">
defineProps<{
  actions: Array<{ label: string; sequence: string; preview: string }>;
}>();

const emit = defineEmits<{
  actionClick: [sequence: string];
}>();

// Alt+1..9 and Alt+0 fire the first ten actions (see useNumberAccelerator).
// Slot 0 = the 10th action. The ⌥ glyph keeps the badge visually distinct
// from the Ctrl-based ^n session-jump badge.
function acceleratorDigit(index: number): number | null {
  if (index < 9) return index + 1;
  if (index === 9) return 0;
  return null;
}

function accelerator(index: number): string | null {
  const digit = acceleratorDigit(index);
  return digit === null ? null : `⌥${digit}`;
}

function tooltip(preview: string, index: number): string {
  const digit = acceleratorDigit(index);
  return digit === null ? preview : `Alt+${digit} — ${preview}`;
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
