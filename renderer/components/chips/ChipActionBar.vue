<script setup lang="ts">
defineProps<{
  actions: Array<{ label: string; sequence: string; preview: string }>;
}>();

const emit = defineEmits<{
  actionClick: [sequence: string];
}>();
</script>

<template>
  <div class="chip-action-bar">
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
