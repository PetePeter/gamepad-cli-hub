<script setup lang="ts">
defineProps<{
  actions: Array<{ label: string; sequence: string; preview: string }>;
  showNewDraft: boolean;
}>();

const emit = defineEmits<{
  newDraft: [];
  actionClick: [sequence: string];
}>();
</script>

<template>
  <div class="chip-action-bar">
    <button
      v-if="showNewDraft"
      type="button"
      class="chip-action-btn"
      @click="emit('newDraft')"
    >
      + New Draft
    </button>
    <button
      v-for="action in actions"
      :key="`${action.label}:${action.sequence}`"
      type="button"
      class="chip-action-btn"
      :title="action.preview"
      @click="emit('actionClick', action.sequence)"
    >
      {{ action.label }}
    </button>
  </div>
</template>
