<script setup lang="ts">
/**
 * ToolsTab.vue — CLI type management (list, add, edit, delete).
 *
 * Replaces renderToolsPanel() in settings-tools.ts. Tool data passed as props;
 * mutations emitted as events.
 */

export interface ToolItem {
  key: string;
  name: string;
  command: string;
  hasInitialPrompt: boolean;
  initialPromptCount: number;
}

const props = defineProps<{
  tools: ToolItem[];
}>();

const emit = defineEmits<{
  add: [];
  edit: [key: string];
  delete: [key: string];
}>();
</script>

<template>
  <div class="settings-tools-panel">
    <div class="settings-list">
      <div
        v-for="tool in tools"
        :key="tool.key"
        class="settings-list-item"
      >
        <div class="tool-info">
          <span class="tool-name">{{ tool.name }}</span>
          <span class="tool-command">{{ tool.command }}</span>
          <span v-if="tool.hasInitialPrompt" class="tool-prompt-badge">
            📋 {{ tool.initialPromptCount }} prompt{{ tool.initialPromptCount !== 1 ? 's' : '' }}
          </span>
        </div>
        <div class="tool-actions">
          <button class="focusable" @click="emit('edit', tool.key)">Edit</button>
          <button class="focusable danger" @click="emit('delete', tool.key)">Delete</button>
        </div>
      </div>
    </div>

    <div v-if="tools.length === 0" class="tools-empty">
      No CLI types configured.
    </div>

    <div class="settings-tool-actions">
      <button class="focusable" @click="emit('add')">
        + Add CLI Type
      </button>
    </div>
  </div>
</template>
