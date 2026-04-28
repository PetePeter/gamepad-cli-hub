<script setup lang="ts">
/**
 * BackupTab.vue — Settings panel tab for plan backup configuration.
 *
 * Features:
 * - Toggle auto-backup on/off
 * - Configure max snapshots and interval
 * - Debounced save (500ms after change)
 * - Manual "Backup Now" button
 */
import { computed, ref, onMounted } from 'vue';

interface BackupConfig {
  enabled: boolean;
  maxSnapshots: number;
  snapshotIntervalMs: number;
}

const enabled = ref(true);
const maxSnapshots = ref(10);
const intervalHours = ref(1);
const saving = ref(false);
const backingUp = ref(false);
const selectedDirPath = ref('');
const workingDirs = ref<Array<{ name?: string; path: string }>>([]);
const statusMessage = ref('');
const errorMessage = ref('');

const canBackupNow = computed(() => selectedDirPath.value.trim() !== '' && !backingUp.value);

onMounted(async () => {
  try {
    const config = await window.gamepadCli.planGetBackupConfig();
    enabled.value = config.enabled;
    maxSnapshots.value = config.maxSnapshots;
    intervalHours.value = Math.round(config.snapshotIntervalMs / 3600000);
  } catch { /* use defaults */ }
  try {
    workingDirs.value = await window.gamepadCli.configGetWorkingDirs() ?? [];
  } catch {
    workingDirs.value = [];
    errorMessage.value = 'Could not load configured folders';
  }
});

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 500);
}

async function doSave(): Promise<void> {
  saving.value = true;
  errorMessage.value = '';
  statusMessage.value = '';
  try {
    await window.gamepadCli.planSetBackupConfig({
      enabled: enabled.value,
      maxSnapshots: maxSnapshots.value,
      snapshotIntervalMs: intervalHours.value * 3600000,
    });
    statusMessage.value = 'Backup settings saved';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not save backup settings';
  }
  saving.value = false;
}

async function createBackupNow(): Promise<void> {
  if (!canBackupNow.value) return;
  backingUp.value = true;
  errorMessage.value = '';
  statusMessage.value = '';
  try {
    const metadata = await window.gamepadCli.planCreateBackupNow(selectedDirPath.value);
    statusMessage.value = metadata?.timestamp
      ? `Backup created ${new Date(metadata.timestamp).toLocaleString()}`
      : 'Backup created';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not create backup';
  } finally {
    backingUp.value = false;
  }
}
</script>

<template>
  <div class="backup-tab">
    <div class="setting-row">
      <label>Auto Backup</label>
      <input type="checkbox" :checked="enabled" @change="enabled = ($event.target as HTMLInputElement).checked; scheduleSave()" />
    </div>
    <div class="setting-row">
      <label>Max Snapshots</label>
      <input type="number" :value="maxSnapshots" min="1" max="100" @change="maxSnapshots = Number(($event.target as HTMLInputElement).value); scheduleSave()" />
    </div>
    <div class="setting-row">
      <label>Interval (hours)</label>
      <input type="number" :value="intervalHours" min="1" max="168" @change="intervalHours = Number(($event.target as HTMLInputElement).value); scheduleSave()" />
    </div>
    <div class="setting-row">
      <label>Backup Directory</label>
      <select v-model="selectedDirPath" class="backup-select">
        <option value="">Select a folder...</option>
        <option v-for="dir in workingDirs" :key="dir.path" :value="dir.path">
          {{ dir.name || dir.path }}
        </option>
      </select>
    </div>
    <div class="setting-row">
      <button class="btn btn--secondary" :disabled="saving || !canBackupNow" @click="createBackupNow">
        {{ backingUp ? 'Backing Up...' : 'Backup Now' }}
      </button>
      <span v-if="saving" class="saving-indicator">Saving...</span>
    </div>
    <p v-if="statusMessage" class="backup-message backup-message--success">{{ statusMessage }}</p>
    <p v-if="errorMessage" class="backup-message backup-message--error">{{ errorMessage }}</p>
  </div>
</template>

<style scoped>
.backup-tab {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.setting-row label {
  color: var(--text-primary);
  font-size: 0.9rem;
}
.setting-row input[type="number"] {
  width: 80px;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.9rem;
}
.backup-select {
  min-width: 180px;
  max-width: 280px;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.9rem;
}
.setting-row input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}
.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}
.btn--secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.saving-indicator {
  color: var(--text-secondary);
  font-size: 0.85rem;
}
.backup-message {
  margin: 0;
  font-size: 0.85rem;
}
.backup-message--success { color: #44cc44; }
.backup-message--error { color: #ff6666; }
</style>
