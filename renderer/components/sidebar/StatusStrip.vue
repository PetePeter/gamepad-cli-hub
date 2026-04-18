<script setup lang="ts">
/**
 * StatusStrip.vue — Gamepad connection indicator + profile badge.
 *
 * Shows a green/grey dot for gamepad connected/disconnected, the count of
 * connected gamepads, and the active profile name.
 */
import { computed } from 'vue';

const props = defineProps<{
  gamepadCount: number;
  activeProfile: string;
  totalSessions: number;
  activeSessions: number;
}>();

const dotColor = computed(() => props.gamepadCount > 0 ? '#44cc44' : '#555555');
const dotTitle = computed(() =>
  props.gamepadCount > 0
    ? `${props.gamepadCount} gamepad${props.gamepadCount > 1 ? 's' : ''} connected`
    : 'No gamepad connected'
);
</script>

<template>
  <div class="status-strip">
    <span class="gamepad-status">
      <span class="gamepad-dot" :style="{ background: dotColor }" :title="dotTitle" />
      <span class="gamepad-count">🎮 {{ gamepadCount }}</span>
    </span>

    <span class="status-counts">
      {{ totalSessions }} session{{ totalSessions !== 1 ? 's' : '' }}
      <template v-if="activeSessions > 0">
        · {{ activeSessions }} active
      </template>
    </span>

    <span class="profile-badge" :title="`Profile: ${activeProfile}`">
      📋 {{ activeProfile }}
    </span>
  </div>
</template>
