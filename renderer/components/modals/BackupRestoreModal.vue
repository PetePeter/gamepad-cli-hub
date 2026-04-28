<script setup lang="ts">
/**
 * BackupRestoreModal.vue — Modal for restoring plan backups.
 *
 * Features:
 * - List of dated backups (newest first, scrollable)
 * - Each row shows timestamp, plan count, dependency count, status
 * - Click/Select to preview and restore
 * - Buttons: Restore, Delete, Cancel
 * - Manual "Backup Now" button
 * - Keyboard navigation: arrows to navigate, A=confirm, B=close, Backspace=delete
 * - Error handling + loading state
 */

import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { BackupMetadata } from '../../../src/types/plan-backup.js';

const props = defineProps<{
  visible: boolean;
  dirPath: string;
  snapshots: BackupMetadata[];
  loading: boolean;
}>();

const emit = defineEmits<{
  'restore': [snapshotPath: string];
  'delete': [snapshotPath: string];
  'backup-now': [];
  close: [];
}>();

// State
const selectedIndex = ref(-1);
const processing = ref(false);

// Computed
const sortedSnapshots = computed(() => {
  return [...props.snapshots].sort((a, b) => {
    const timeCompare = b.timestamp.localeCompare(a.timestamp);
    if (timeCompare !== 0) return timeCompare;
    return b.index - a.index;
  });
});

const selectedSnapshot = computed(() => {
  if (selectedIndex.value < 0 || selectedIndex.value >= sortedSnapshots.value.length) {
    return null;
  }
  return sortedSnapshots.value[selectedIndex.value];
});

// Methods
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getStatusBadge(status: BackupMetadata['status']): { label: string; class: string } {
  if (status === 'complete') {
    return { label: '✓', class: 'status-complete' };
  }
  if (status === 'partial') {
    return { label: '⚠', class: 'status-partial' };
  }
  return { label: '✗', class: 'status-error' };
}

function selectSnapshot(index: number): void {
  selectedIndex.value = index;
}

async function handleRestore(): Promise<void> {
  const snapshot = selectedSnapshot.value;
  if (!snapshot || processing.value) return;

  processing.value = true;
  try {
    // Get the snapshot file path
    const snapshotPath = getSnapshotPath(snapshot);
    emit('restore', snapshotPath);
  } finally {
    processing.value = false;
  }
}

async function handleDelete(): Promise<void> {
  const snapshot = selectedSnapshot.value;
  if (!snapshot) return;

  processing.value = true;
  try {
    const snapshotPath = getSnapshotPath(snapshot);
    emit('delete', snapshotPath);
    if (selectedIndex.value >= sortedSnapshots.value.length - 1) {
      selectedIndex.value = Math.max(0, sortedSnapshots.value.length - 2);
    }
  } finally {
    processing.value = false;
  }
}

function handleBackupNow(): void {
  emit('backup-now');
}

function handleClose(): void {
  emit('close');
}

function handleKeyDown(event: KeyboardEvent): void {
  if (!props.visible) return;

  switch (event.key) {
    case 'ArrowUp':
    case 'ArrowLeft':
      event.preventDefault();
      if (selectedIndex.value > 0) {
        selectedIndex.value--;
      } else if (sortedSnapshots.value.length > 0) {
        selectedIndex.value = sortedSnapshots.value.length - 1;
      }
      break;
    case 'ArrowDown':
    case 'ArrowRight':
      event.preventDefault();
      if (selectedIndex.value < sortedSnapshots.value.length - 1) {
        selectedIndex.value++;
      } else if (sortedSnapshots.value.length > 0) {
        selectedIndex.value = 0;
      }
      break;
    case 'a':
    case 'A':
    case 'Enter':
      event.preventDefault();
      handleRestore();
      break;
    case 'b':
    case 'B':
    case 'Escape':
      event.preventDefault();
      handleClose();
      break;
    case 'Backspace':
    case 'Delete':
      event.preventDefault();
      handleDelete();
      break;
  }
}

function getSnapshotPath(metadata: BackupMetadata): string {
  // This would be computed from the backup directory structure
  // For now, return a placeholder that the renderer will resolve
  return '';
}

// Lifecycle
onMounted(() => {
  document.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay" @click.self="handleClose">
      <div class="backup-restore-modal">
        <div class="modal-header">
          <h2>Plan Backups</h2>
          <button class="modal-close" @click="handleClose" title="Close (B)">✕</button>
        </div>

        <div class="modal-body">
          <div v-if="loading" class="modal-loading">Loading backups...</div>

          <div v-else-if="sortedSnapshots.length === 0" class="modal-empty">
            <p>No backups available for this directory.</p>
            <button class="btn btn--primary" @click="handleBackupNow">
              Create First Backup
            </button>
          </div>

          <div v-else class="backups-list">
            <div
              v-for="(snapshot, index) in sortedSnapshots"
              :key="`${snapshot.timestamp}-${snapshot.index}`"
              class="backup-row"
              :class="{ 'backup-row--selected': index === selectedIndex }"
              @click="selectSnapshot(index)"
            >
              <div class="backup-info">
                <span class="backup-time">{{ formatTime(snapshot.timestamp) }}</span>
                <span class="backup-counts">{{ snapshot.planCount }} plans · {{ snapshot.dependencyCount }} deps</span>
              </div>
              <div class="backup-status">
                <span :class="getStatusBadge(snapshot.status).class">
                  {{ getStatusBadge(snapshot.status).label }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button
            v-if="selectedSnapshot"
            class="btn btn--danger"
            :disabled="processing"
            @click="handleDelete"
            title="Delete (Backspace)"
          >
            Delete
          </button>
          <button
            class="btn btn--secondary"
            :disabled="processing"
            @click="handleBackupNow"
            title="Backup Now"
          >
            Backup Now
          </button>
          <button
            v-if="selectedSnapshot"
            class="btn btn--primary"
            :disabled="processing"
            @click="handleRestore"
            title="Restore (A)"
          >
            Restore
          </button>
          <button
            class="btn btn--secondary"
            :disabled="processing"
            @click="handleClose"
            title="Cancel (B)"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.backup-restore-modal {
  background: var(--bg-secondary);
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h2 {
  margin: 0;
  font-size: 1.2rem;
  color: var(--text-primary);
}

.modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.modal-close:hover {
  background: var(--bg-tertiary);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.modal-loading,
.modal-empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-secondary);
}

.backups-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.backup-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-primary);
  border-radius: 6px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s;
}

.backup-row:hover {
  background: var(--bg-tertiary);
}

.backup-row--selected {
  border-color: var(--accent-primary);
  background: var(--bg-tertiary);
}

.backup-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.backup-time {
  font-weight: 500;
  color: var(--text-primary);
}

.backup-counts {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.backup-status {
  font-size: 1.2rem;
}

.status-complete {
  color: #44cc44;
}

.status-partial {
  color: #ff9f1a;
}

.status-error {
  color: #ff4444;
}

.modal-footer {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
  flex-wrap: wrap;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  font-size: 0.95rem;
  transition: opacity 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--primary {
  background: var(--accent-primary);
  color: white;
}

.btn--secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.btn--danger {
  background: #ff4444;
  color: white;
}
</style>
