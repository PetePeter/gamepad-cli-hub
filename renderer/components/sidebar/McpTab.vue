<script setup lang="ts">
/**
 * McpTab.vue — MCP server configuration (connection, security, usage).
 *
 * Replaces renderMcpSettings() in settings-mcp.ts.
 */
import { ref, watch, computed } from 'vue';

export interface McpConfig {
  enabled: boolean;
  port: number;
  authToken: string;
}

const props = defineProps<{
  config: McpConfig;
}>();

const emit = defineEmits<{
  update: [updates: Partial<McpConfig>];
  generateToken: [];
}>();

const localEnabled = ref(props.config.enabled);
const localPort = ref(props.config.port);
const localToken = ref(props.config.authToken);
const showToken = ref(false);

watch(() => props.config, (c) => {
  localEnabled.value = c.enabled;
  localPort.value = c.port;
  localToken.value = c.authToken;
});

function onToggleEnabled(): void {
  emit('update', { enabled: localEnabled.value });
}

function onPortBlur(): void {
  const port = normalizePort(String(localPort.value));
  localPort.value = port;
  emit('update', { port });
}

function onTokenBlur(): void {
  emit('update', { authToken: localToken.value.trim() });
}

function onGenerateToken(): void {
  emit('generateToken');
}

function onClearToken(): void {
  localToken.value = '';
  emit('update', { authToken: '' });
}

function normalizePort(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return 47373;
  }
  return parsed;
}

const endpoint = computed(() => `http://127.0.0.1:${localPort.value}/mcp`);

const statusText = computed(() => {
  if (!localEnabled.value) return 'Disabled in Helm settings';
  if (!localToken.value) return 'Enabled, but generate or enter a token before clients can connect';
  return 'Ready while Helm is running';
});

</script>

<template>
  <div class="settings-mcp-panel">
    <!-- Connection -->
    <div class="tg-section">
      <h3 class="tg-section-title">Connection</h3>
      <div class="tg-form-row">
        <label class="tg-label">Enable localhost MCP</label>
        <input
          v-model="localEnabled"
          type="checkbox"
          class="focusable"
          @change="onToggleEnabled"
        />
      </div>
      <div class="tg-form-row">
        <label class="tg-label">Port</label>
        <input
          v-model.number="localPort"
          type="number"
          class="tg-input focusable"
          min="1"
          max="65535"
          step="1"
          @blur="onPortBlur"
        />
      </div>
      <p class="settings-form__hint">
        Helm hosts this endpoint only while the app is running, and it stays bound to 127.0.0.1.
      </p>
    </div>

    <!-- Auth Token -->
    <div class="tg-section">
      <h3 class="tg-section-title">Auth Token</h3>
      <div class="tg-form-row">
        <label class="tg-label">Bearer token</label>
        <div class="tg-input-row">
          <input
            v-model="localToken"
            :type="showToken ? 'text' : 'password'"
            class="tg-input focusable"
            placeholder="Generate a token or paste your own"
            @blur="onTokenBlur"
          />
          <button
            class="btn btn--secondary btn--sm focusable"
            @click="showToken = !showToken"
          >
            {{ showToken ? 'Hide' : 'Show' }}
          </button>
        </div>
      </div>
      <div class="tg-btn-row">
        <button class="btn btn--primary focusable" @click="onGenerateToken">
          Generate Token
        </button>
        <button class="btn btn--secondary focusable" @click="onClearToken">
          Clear Token
        </button>
      </div>
      <p class="settings-form__hint">
        Clients should send Authorization: Bearer &lt;token&gt;.
      </p>
    </div>

    <!-- Usage -->
    <div class="tg-section">
      <h3 class="tg-section-title">Usage</h3>
      <div class="settings-list-item">
        <div class="settings-list-item__info">
          <span class="settings-list-item__name">Endpoint</span>
          <span class="settings-list-item__detail">{{ endpoint }}</span>
        </div>
      </div>
      <div class="settings-list-item">
        <div class="settings-list-item__info">
          <span class="settings-list-item__name">Status</span>
          <span class="settings-list-item__detail">{{ statusText }}</span>
        </div>
      </div>
      <p class="settings-form__hint">
        External CLIs can use the same stable localhost endpoint as long as Helm stays open.
      </p>
    </div>
  </div>
</template>
