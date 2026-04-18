<script setup lang="ts">
/**
 * TelegramTab.vue — Telegram bot configuration (connection, security, notifications).
 *
 * Replaces renderTelegramSettings() in settings-telegram.ts. Config data is
 * passed as props; changes emitted as events with debounced save.
 */
import { ref, watch } from 'vue';

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  allowedUsers: string;
  notificationsEnabled: boolean;
}

const props = defineProps<{
  config: TelegramConfig;
  botRunning: boolean;
}>();

const emit = defineEmits<{
  updateField: [field: string, value: string | boolean];
  startBot: [];
  stopBot: [];
}>();

// Local editable copies
const botToken = ref(props.config.botToken);
const chatId = ref(props.config.chatId);
const allowedUsers = ref(props.config.allowedUsers);

// Sync from props when they change externally
watch(() => props.config, (c) => {
  botToken.value = c.botToken;
  chatId.value = c.chatId;
  allowedUsers.value = c.allowedUsers;
});

// Debounced save
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedEmit(field: string, value: string): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => emit('updateField', field, value), 500);
}

function immediateEmit(field: string, value: string): void {
  if (saveTimer) clearTimeout(saveTimer);
  emit('updateField', field, value);
}
</script>

<template>
  <div class="settings-telegram-panel">
    <section class="telegram-section">
      <h4>Connection</h4>
      <label class="telegram-field">
        Bot Token
        <input
          v-model="botToken"
          type="password"
          placeholder="Enter bot token..."
          @input="debouncedEmit('botToken', botToken)"
          @blur="immediateEmit('botToken', botToken)"
        />
      </label>
      <label class="telegram-field">
        Chat ID
        <input
          v-model="chatId"
          type="text"
          placeholder="Enter chat ID..."
          @input="debouncedEmit('chatId', chatId)"
          @blur="immediateEmit('chatId', chatId)"
        />
      </label>
    </section>

    <section class="telegram-section">
      <h4>Security</h4>
      <label class="telegram-field">
        Allowed Users (comma-separated)
        <input
          v-model="allowedUsers"
          type="text"
          placeholder="user1, user2"
          @input="debouncedEmit('allowedUsers', allowedUsers)"
          @blur="immediateEmit('allowedUsers', allowedUsers)"
        />
      </label>
    </section>

    <section class="telegram-section">
      <h4>Notifications</h4>
      <label class="notification-toggle">
        <input
          type="checkbox"
          :checked="config.notificationsEnabled"
          @change="emit('updateField', 'notificationsEnabled', ($event.target as HTMLInputElement).checked)"
        />
        Enable Telegram notifications
      </label>
    </section>

    <section class="telegram-section">
      <h4>Bot Control</h4>
      <div class="bot-status">
        <span :class="botRunning ? 'bot-running' : 'bot-stopped'">
          {{ botRunning ? '🟢 Running' : '⚪ Stopped' }}
        </span>
        <button
          v-if="!botRunning"
          class="focusable"
          @click="emit('startBot')"
        >
          Start Bot
        </button>
        <button
          v-else
          class="focusable danger"
          @click="emit('stopBot')"
        >
          Stop Bot
        </button>
      </div>
    </section>
  </div>
</template>
