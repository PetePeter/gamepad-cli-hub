<script setup lang="ts">
/**
 * SettingsPanel.vue — Slide-over settings with dynamic tab switching.
 *
 * Replaces settings.ts orchestrator. Tabs are rendered via slot content
 * based on the active tab. Each tab is a separate child component provided
 * by the parent (App.vue).
 */
import { computed } from 'vue';

export interface SettingsTab {
  id: string;
  label: string;
}

const props = defineProps<{
  visible: boolean;
  tabs: SettingsTab[];
  activeTab: string;
}>();

const emit = defineEmits<{
  'update:activeTab': [tabId: string];
  close: [];
}>();

const activeTabIndex = computed(() =>
  props.tabs.findIndex(t => t.id === props.activeTab)
);

function navigateTab(delta: number): void {
  const idx = activeTabIndex.value + delta;
  if (idx >= 0 && idx < props.tabs.length) {
    emit('update:activeTab', props.tabs[idx].id);
  }
}

function handleButton(button: string): boolean {
  switch (button) {
    case 'B':
      emit('close');
      return true;
    case 'DPadLeft':
    case 'ArrowLeft':
      navigateTab(-1);
      return true;
    case 'DPadRight':
    case 'ArrowRight':
      navigateTab(1);
      return true;
    default:
      return false;
  }
}

defineExpose({ handleButton });
</script>

<template>
  <div v-if="visible" class="settings-panel">
    <div class="settings-panel__header">
      <button class="settings-back-btn" @click="emit('close')" title="Back (B)">← Back</button>
    </div>
    <div class="settings-tabs" id="settingsTabs" role="tablist">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="settings-tab focusable"
        :class="{ 'settings-tab--active': tab.id === activeTab }"
        role="tab"
        :aria-selected="tab.id === activeTab"
        @click="emit('update:activeTab', tab.id)"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="settings-content">
      <div class="settings-action-bar" id="bindingActionBar" />
      <div class="settings-display" id="bindingsDisplay">
        <slot :activeTab="activeTab" />
      </div>
    </div>
  </div>
</template>
