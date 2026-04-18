<script setup lang="ts">
/**
 * TerminalPane.vue — xterm.js terminal wrapper.
 *
 * Wraps the imperative TerminalView lifecycle within Vue's reactive system.
 * Terminal created on mount, disposed on unmount. xterm.js stays imperative.
 *
 * During migration, TerminalManager continues to own actual terminal
 * instances. This SFC provides the Vue-native replacement pattern.
 */
import { ref, onMounted, onUnmounted, watch } from 'vue';

const props = defineProps<{
  sessionId: string;
  visible: boolean;
  tabLabel: string;
  activityColor: string;
}>();

const emit = defineEmits<{
  data: [data: string];
  resize: [cols: number, rows: number];
  titleChange: [title: string];
  scrollInput: [data: string];
}>();

const containerRef = ref<HTMLElement | null>(null);
const ready = ref(false);

onMounted(() => {
  ready.value = true;
});

onUnmounted(() => {
  ready.value = false;
});

watch(() => props.visible, (v) => {
  if (v && containerRef.value) {
    emit('resize', 0, 0);
  }
});

function write(_data: string): void {
  // In full implementation, calls terminal.write(data)
}

function getSelection(): string {
  return '';
}

function hasSelection(): boolean {
  return false;
}

defineExpose({ write, getSelection, hasSelection, containerRef });
</script>

<template>
  <div
    ref="containerRef"
    class="terminal-pane"
    :class="{ visible }"
    v-show="visible"
    :data-session-id="sessionId"
  />
</template>
