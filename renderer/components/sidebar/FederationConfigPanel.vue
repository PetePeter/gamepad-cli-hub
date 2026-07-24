<script setup lang="ts">
/**
 * FederationConfigPanel.vue — in-app cross-machine federation config (P-0658).
 * Mirrors McpTab's connection panel: an enabled checkbox, host + port inputs, and
 * a status line. Emits `update` with a partial on each change; the parent persists
 * + hot-applies (no app restart). Port is normalised to the default when invalid.
 */
import { ref, watch, computed } from 'vue';

export interface FederationConfig {
  enabled: boolean;
  host: string;
  port: number;
}

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 47474;

const props = defineProps<{ config: FederationConfig }>();
const emit = defineEmits<{ update: [updates: Partial<FederationConfig>] }>();

const localEnabled = ref(props.config.enabled);
const localHost = ref(props.config.host);
const localPort = ref(props.config.port);

watch(() => props.config, (c) => {
  localEnabled.value = c.enabled;
  localHost.value = c.host;
  localPort.value = c.port;
});

function onToggleEnabled(): void {
  emit('update', { enabled: localEnabled.value });
}

function commitHost(): void {
  const host = (localHost.value ?? '').trim() || DEFAULT_HOST;
  localHost.value = host;
  emit('update', { host });
}

function commitPort(): void {
  const port = normalizePort(String(localPort.value));
  localPort.value = port;
  emit('update', { port });
}

function normalizePort(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return DEFAULT_PORT;
  }
  return parsed;
}

// Status reflects the ROUND-TRIPPED, server-confirmed config (props.config), NOT
// the local form refs — so it shows "Running" only after the IPC persist + live
// hot-apply confirms, and reverts to "Off" if a change fails to apply. The form
// inputs stay bound to the local refs for editing.
const statusText = computed(() => {
  if (!props.config.enabled) return 'Off';
  return `Running on ${props.config.host}:${props.config.port}`;
});
const statusOn = computed(() => props.config.enabled);
</script>

<template>
  <div class="federation-config-panel">
    <div class="tg-section">
      <h3 class="tg-section-title">Federation</h3>
      <div class="tg-form-row">
        <label class="tg-label">Enable cross-machine federation</label>
        <input
          v-model="localEnabled"
          type="checkbox"
          class="focusable"
          @change="onToggleEnabled"
        />
      </div>
      <div class="tg-form-row">
        <label class="tg-label">Host</label>
        <input
          v-model="localHost"
          type="text"
          class="fcp-input focusable"
          placeholder="0.0.0.0"
          @change="commitHost"
          @blur="commitHost"
        />
      </div>
      <div class="tg-form-row">
        <label class="tg-label">Port</label>
        <input
          v-model.number="localPort"
          type="number"
          class="fcp-input focusable"
          min="1"
          max="65535"
          step="1"
          @change="commitPort"
          @blur="commitPort"
        />
      </div>
      <div class="fcp-status-row">
        <span class="fcp-status-label">Status</span>
        <span class="fcp-status-value" :class="{ 'fcp-status-value--on': statusOn }">{{ statusText }}</span>
      </div>
      <p class="fcp-hint">
        Applied live — Helm starts or stops the peer transport and mDNS discovery
        immediately, no restart needed. Bound only while Helm is running.
      </p>
    </div>
  </div>
</template>

<style scoped>
.federation-config-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.tg-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
}
.tg-section-title {
  margin: 0;
  font-size: 0.95rem;
  color: var(--text-primary);
}
.tg-form-row {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: space-between;
}
.tg-label {
  font-size: 0.85rem;
  color: var(--text-primary);
}
.fcp-input {
  min-width: 140px;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.85rem;
}
.fcp-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 4px;
}
.fcp-status-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
}
.fcp-status-value {
  font-size: 0.82rem;
  color: var(--text-secondary);
  font-family: ui-monospace, "Cascadia Code", monospace;
}
.fcp-status-value--on {
  color: #44cc44;
}
.fcp-hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-secondary);
}
</style>
