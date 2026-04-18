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
  notificationsEnabled: boolean;
}>();

const emit = defineEmits<{
  create: [];
  switch: [name: string];
  delete: [name: string];
  toggleNotifications: [enabled: boolean];
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
      <label class="notification-toggle">
        <input
          type="checkbox"
          :checked="notificationsEnabled"
          @change="emit('toggleNotifications', ($event.target as HTMLInputElement).checked)"
        />
        Enable desktop notifications
      </label>
    </div>
  </div>
</template>
