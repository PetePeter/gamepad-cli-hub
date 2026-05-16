<script setup lang="ts">
/**
 * TelegramTab.vue — Telegram bot configuration (connection, security, notifications).
 */
import { ref, watch } from 'vue';
import { dialogClient } from '../../ipc/clients.js';

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  allowedUsers: string;
  notificationsEnabled: boolean;
  autoStart: boolean;
  openWhisprPath: string;
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
const openWhisprPath = ref(props.config.openWhisprPath);

// Sync from props when they change externally
watch(() => props.config, (c) => {
  botToken.value = c.botToken;
  chatId.value = c.chatId;
  allowedUsers.value = c.allowedUsers;
  openWhisprPath.value = c.openWhisprPath;
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

async function browseOpenWhisprPath(): Promise<void> {
  const selected = await dialogClient.dialogOpenFolder();
  if (selected) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    openWhisprPath.value = selected;
    emit('updateField', 'openWhisprPath', selected);
  }
}
</script>

<template>
  <div class="settings-telegram-panel">
    <section class="telegram-section telegram-setup-guide">
      <details>
        <summary>Setup Guide</summary>
        <ol>
          <li><strong>Create a bot</strong> — Message <code>@BotFather</code>, send <code>/newbot</code>, copy the Bot Token</li>
          <li><strong>Enable forum topics</strong> — Group settings &rarr; Topics &rarr; Enable Topics; add bot as admin with "Manage Topics" permission</li>
          <li><strong>Get Chat ID</strong> — Add <code>@userinfobot</code> to your group &rarr; it posts the group ID (negative number like <code>-1001234567890</code>)</li>
          <li><strong>Get your User ID</strong> — DM <code>@userinfobot</code> &rarr; copy your ID &rarr; paste into Allowed Users</li>
          <li><strong>Start bot</strong> — Fill in the fields above, click Start Bot &rarr; status turns green</li>
          <li><strong>Test</strong> — In your group type <code>/start</code>; from a CLI session call <code>telegram_chat</code> MCP tool</li>
        </ol>
      </details>
    </section>

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
      <h4>Startup</h4>
      <label class="notification-toggle">
        <input
          type="checkbox"
          :checked="config.autoStart"
          @change="emit('updateField', 'autoStart', ($event.target as HTMLInputElement).checked)"
        />
        Auto-start bot 60 seconds after launch
      </label>
    </section>

    <section class="telegram-section">
      <h4>Audio</h4>
      <label class="telegram-field">
        OpenWhispr Path
        <div class="telegram-path-row">
          <input
            v-model="openWhisprPath"
            type="text"
            placeholder="C:\\Program Files\\OpenWhispr"
            @input="debouncedEmit('openWhisprPath', openWhisprPath)"
            @blur="immediateEmit('openWhisprPath', openWhisprPath)"
          />
          <button class="telegram-browse-btn" type="button" @click="browseOpenWhisprPath">📂</button>
        </div>
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

<style scoped>
.telegram-setup-guide summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: var(--font-size-sm);
  padding: var(--spacing-xs) 0;
}

.telegram-setup-guide ol {
  margin: var(--spacing-xs) 0 0 0;
  padding-left: 1.5em;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  color: var(--text-primary);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.telegram-setup-guide code {
  background: var(--bg-tertiary);
  padding: 0.1em 0.3em;
  border-radius: 3px;
  font-size: inherit;
}

.telegram-path-row {
  display: flex;
  gap: var(--spacing-xs);
  align-items: center;
}

.telegram-path-row input {
  flex: 1;
  min-width: 0;
}

.telegram-browse-btn {
  flex-shrink: 0;
  padding: 0 var(--spacing-xs);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--font-size-sm);
  line-height: 1;
  height: 100%;
}

.telegram-browse-btn:hover {
  background: var(--bg-hover);
}
</style>
