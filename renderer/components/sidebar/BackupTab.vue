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
import { ref, onMounted } from 'vue';

interface BackupConfig {
  enabled: boolean;
  maxSnapshots: number;
  snapshotIntervalMs: number;
}

const enabled = ref(true);
const maxSnapshots = ref(10);
const intervalHours = ref(1);
const saving = ref(false);

onMounted(async () => {
  try {
    const config = await window.gamepadCli.planGetBackupConfig();
    enabled.value = config.enabled;
    maxSnapshots.value = config.maxSnapshots;
    intervalHours.value = Math.round(config.snapshotIntervalMs / 3600000);
  } catch { /* use defaults */ }
});

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 500);
}

async function doSave(): Promise<void> {
  saving.value = true;
  try {
    await window.gamepadCli.planSetBackupConfig({
      enabled: enabled.value,
      maxSnapshots: maxSnapshots.value,
      snapshotIntervalMs: intervalHours.value * 3600000,
    });
  } catch { /* ignore */ }
  saving.value = false;
}

async function createBackupNow(): Promise<void> {
  try {
    const firstDir = (await window.gamepadCli.configGetWorkingDirs())?.[0]?.path;
    if (firstDir) {
      await window.gamepadCli.planCreateBackupNow(firstDir);
    }
  } catch { /* ignore */ }
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
      <button class="btn btn--secondary" :disabled="saving" @click="createBackupNow">Backup Now</button>
      <span v-if="saving" class="saving-indicator">Saving...</span>
    </div>
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
</style>
