<script setup lang="ts">
/**
 * ProfilesTab.vue — Profile management tab (list, create, switch, delete).
 *
 * Replaces renderProfilesPanel() in settings-profiles.ts with reactive rendering.
 * IPC calls are emitted as events for the parent to handle (keeps component pure).
 */

export interface ProfileItem {
  name: string;
  isActive: boolean;
}

const props = defineProps<{
  profiles: ProfileItem[];
  activeProfile: string;
  notificationMode: 'off' | 'auto' | 'llm';
}>();

const emit = defineEmits<{
  create: [];
  switch: [name: string];
  delete: [name: string];
  updateNotificationMode: [mode: 'off' | 'auto' | 'llm'];
}>();
</script>

<template>
  <div class="settings-profiles-panel">
    <div class="settings-list">
      <div
        v-for="profile in profiles"
        :key="profile.name"
        class="settings-list-item"
        :class="{ 'settings-list-item--active': profile.isActive }"
      >
        <span class="profile-name">
          {{ profile.name }}
          <span v-if="profile.isActive" class="profile-active-badge">Active</span>
        </span>
        <div class="profile-actions">
          <button
            v-if="!profile.isActive"
            class="focusable"
            @click="emit('switch', profile.name)"
          >
            Switch
          </button>
          <button
            v-if="!profile.isActive"
            class="focusable danger"
            @click="emit('delete', profile.name)"
          >
            Delete
          </button>
        </div>
      </div>
    </div>

    <div class="settings-profile-actions">
      <button class="focusable" @click="emit('create')">
        + Create Profile
      </button>
    </div>

    <div class="settings-notifications">
      <label class="settings-list-item__detail">Desktop notifications</label>
      <div class="notification-mode-control" role="radiogroup" aria-label="Desktop notifications">
        <label
          v-for="option in [
            { value: 'off', label: 'Off' },
            { value: 'auto', label: 'Automatic' },
            { value: 'llm', label: 'LLM-directed' },
          ]"
          :key="option.value"
          class="notification-mode-option"
          :class="{ active: notificationMode === option.value }"
        >
          <input
            type="radio"
            name="notificationMode"
            :value="option.value"
            :checked="notificationMode === option.value"
            @change="emit('updateNotificationMode', option.value as 'off' | 'auto' | 'llm')"
          />
          {{ option.label }}
        </label>
      </div>
    </div>
  </div>
</template>
