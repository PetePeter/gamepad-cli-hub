<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  title: string;
}>();

const emit = defineEmits<{
  click: [];
}>();

const displayTitle = computed(() => truncateTitle(props.title));

function truncateTitle(title: string): string {
  return title.length > 20 ? `${title.slice(0, 20)}…` : title;
}
</script>

<template>
  <button type="button" class="draft-pill" :title="title" @click="emit('click')">
    <span>📝</span>
    <span>{{ displayTitle }}</span>
  </button>
</template>
