<script setup lang="ts">
/**
 * ScheduledTasksTab.vue — UI for creating and managing scheduled tasks.
 *
 * Features:
 * - Task list showing title, scheduled time, status, cancel button
 * - Create Task form with all required fields
 * - Auto-refresh every 10s
 * - Cancel action for pending tasks
 */
import { ref, onMounted, onUnmounted, computed } from 'vue';
import type { ScheduledTask } from '../../../src/types/scheduled-task.js';

const emit = defineEmits<{
  'task-created': [task: ScheduledTask];
  'task-cancelled': [taskId: string];
}>();

// State
const tasks = ref<ScheduledTask[]>([]);
const loading = ref(false);
const showCreateForm = ref(false);
const refreshInterval = ref<number | null>(null);

// Form state
const formTitle = ref('');
const formDescription = ref('');
const formPlanIds = ref<string[]>([]);
const formInitialPrompt = ref('');
const formCliType = ref('claude-code');
const formCliParams = ref('');
const formTime = ref('');
const formDirPath = ref('');

// Available options
const cliTypes = ['claude-code', 'copilot-cli'];
const statusColors: Record<ScheduledTask['status'], string> = {
  pending: '#4488ff',
  executing: '#44cc44',
  completed: '#555555',
  failed: '#ff4444',
  cancelled: '#999999',
};

// Computed
const formValid = computed(() => {
  return formTitle.value.trim() !== '' &&
    formInitialPrompt.value.trim() !== '' &&
    formTime.value !== '' &&
    formDirPath.value.trim() !== '';
});

const sortedTasks = computed(() => {
  return [...tasks.value].sort((a, b) =>
    new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime()
  );
});

// Methods
async function loadTasks(): Promise<void> {
  try {
    const result = await window.gamepadCli.scheduledTaskList();
    tasks.value = result || [];
  } catch (error) {
    console.error('[ScheduledTasksTab] Failed to load tasks:', error);
  }
}

async function refreshTasks(): Promise<void> {
  loading.value = true;
  await loadTasks();
  loading.value = false;
}

function openCreateForm(): void {
  showCreateForm.value = true;
  // Set default time to next hour
  const nextHour = new Date();
  nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
  formTime.value = nextHour.toISOString().slice(0, 16);
  // Set default directory from active session
  const activeSession = (window as any).state?.sessions?.find((s: any) => s.id === (window as any).state?.activeSessionId);
  if (activeSession?.workingDir) {
    formDirPath.value = activeSession.workingDir;
  }
}

function closeCreateForm(): void {
  showCreateForm.value = false;
  resetForm();
}

function resetForm(): void {
  formTitle.value = '';
  formDescription.value = '';
  formPlanIds.value = [];
  formInitialPrompt.value = '';
  formCliType.value = 'claude-code';
  formCliParams.value = '';
  formTime.value = '';
  formDirPath.value = '';
}

async function submitTask(): Promise<void> {
  if (!formValid.value) return;

  loading.value = true;
  try {
    const result = await window.gamepadCli.scheduledTaskCreate({
      title: formTitle.value.trim(),
      description: formDescription.value.trim() || undefined,
      planIds: formPlanIds.value,
      initialPrompt: formInitialPrompt.value.trim(),
      cliType: formCliType.value,
      cliParams: formCliParams.value.trim() || undefined,
      scheduledTime: new Date(formTime.value),
      dirPath: formDirPath.value.trim(),
    });

    if (result) {
      emit('task-created', result);
      closeCreateForm();
      await refreshTasks();
    }
  } catch (error) {
    console.error('[ScheduledTasksTab] Failed to create task:', error);
  } finally {
    loading.value = false;
  }
}

async function cancelTask(taskId: string): Promise<void> {
  loading.value = true;
  try {
    const success = await window.gamepadCli.scheduledTaskCancel(taskId);
    if (success) {
      emit('task-cancelled', taskId);
      await refreshTasks();
    }
  } catch (error) {
    console.error('[ScheduledTasksTab] Failed to cancel task:', error);
  } finally {
    loading.value = false;
  }
}

function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString();
}

function formatStatus(status: ScheduledTask['status']): string {
  const labels: Record<ScheduledTask['status'], string> = {
    pending: '⏳ Pending',
    executing: '▶️ Executing',
    completed: '✅ Completed',
    failed: '❌ Failed',
    cancelled: '🚫 Cancelled',
  };
  return labels[status];
}

// Lifecycle
onMounted(() => {
  loadTasks();
  refreshInterval.value = window.setInterval(loadTasks, 10000) as unknown as number;
});

onUnmounted(() => {
  if (refreshInterval.value !== null) {
    clearInterval(refreshInterval.value);
  }
});
</script>

<template>
  <div class="scheduled-tasks-tab">
    <!-- Header -->
    <div class="st-header">
      <h2 class="st-title">Scheduled Tasks</h2>
      <button
        v-if="!showCreateForm"
        class="st-create-btn focusable"
        @click="openCreateForm"
      >
        + Create Task
      </button>
    </div>

    <!-- Create Form -->
    <div v-if="showCreateForm" class="st-form">
      <h3 class="st-form-title">Create New Task</h3>

      <div class="st-form-row">
        <label class="st-label">Title *</label>
        <input
          v-model="formTitle"
          type="text"
          class="st-input focusable"
          placeholder="Task name"
          maxlength="100"
        />
      </div>

      <div class="st-form-row">
        <label class="st-label">Description</label>
        <input
          v-model="formDescription"
          type="text"
          class="st-input focusable"
          placeholder="Optional description"
          maxlength="500"
        />
      </div>

      <div class="st-form-row">
        <label class="st-label">Initial Prompt *</label>
        <textarea
          v-model="formInitialPrompt"
          class="st-textarea focusable"
          placeholder="What should the CLI work on?"
          rows="3"
        />
      </div>

      <div class="st-form-row">
        <label class="st-label">CLI Type *</label>
        <select v-model="formCliType" class="st-select focusable">
          <option v-for="type in cliTypes" :key="type" :value="type">
            {{ type === 'claude-code' ? 'Claude Code' : 'Copilot CLI' }}
          </option>
        </select>
      </div>

      <div class="st-form-row">
        <label class="st-label">CLI Params</label>
        <input
          v-model="formCliParams"
          type="text"
          class="st-input focusable"
          placeholder="Optional CLI parameters"
        />
      </div>

      <div class="st-form-row">
        <label class="st-label">Scheduled Time *</label>
        <input
          v-model="formTime"
          type="datetime-local"
          class="st-input focusable"
        />
      </div>

      <div class="st-form-row">
        <label class="st-label">Working Directory *</label>
        <input
          v-model="formDirPath"
          type="text"
          class="st-input focusable"
          placeholder="X:\\path\\to\\project"
        />
      </div>

      <div class="st-form-actions">
        <button
          class="st-btn st-btn--primary focusable"
          :disabled="!formValid || loading"
          @click="submitTask"
        >
          Create Task
        </button>
        <button
          class="st-btn st-btn--secondary focusable"
          :disabled="loading"
          @click="closeCreateForm"
        >
          Cancel
        </button>
      </div>
    </div>

    <!-- Task List -->
    <div v-if="!showCreateForm" class="st-task-list">
      <div v-if="loading && tasks.length === 0" class="st-loading">
        Loading tasks...
      </div>

      <div v-else-if="sortedTasks.length === 0" class="st-empty">
        No scheduled tasks. Click "Create Task" to add one.
      </div>

      <div
        v-for="task in sortedTasks"
        :key="task.id"
        class="st-task-card"
        :style="{ borderLeftColor: statusColors[task.status] }"
      >
        <div class="st-task-header">
          <h4 class="st-task-title">{{ task.title }}</h4>
          <span
            class="st-task-status"
            :style="{ color: statusColors[task.status] }"
          >
            {{ formatStatus(task.status) }}
          </span>
        </div>

        <div v-if="task.description" class="st-task-description">
          {{ task.description }}
        </div>

        <div class="st-task-details">
          <div class="st-task-detail">
            <span class="st-detail-label">⏰</span>
            <span>{{ formatTime(task.scheduledTime) }}</span>
          </div>
          <div class="st-task-detail">
            <span class="st-detail-label">🖥️</span>
            <span>{{ task.cliType }}</span>
          </div>
          <div class="st-task-detail">
            <span class="st-detail-label">📁</span>
            <span class="st-detail-value">{{ task.dirPath }}</span>
          </div>
        </div>

        <div v-if="task.sessionId" class="st-task-session">
          Session: <code>{{ task.sessionId }}</code>
        </div>

        <div v-if="task.error" class="st-task-error">
          ❌ {{ task.error }}
        </div>

        <div v-if="task.status === 'pending'" class="st-task-actions">
          <button
            class="st-btn st-btn--danger focusable"
            :disabled="loading"
            @click="cancelTask(task.id)"
          >
            Cancel Task
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scheduled-tasks-tab {
  padding: 16px;
  max-width: 800px;
  margin: 0 auto;
}

.st-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.st-title {
  margin: 0;
  font-size: 1.5rem;
  color: var(--text-primary);
}

.st-create-btn {
  padding: 8px 16px;
  background: var(--accent-primary);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

.st-create-btn:hover {
  opacity: 0.9;
}

.st-form {
  background: var(--bg-secondary);
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.st-form-title {
  margin: 0 0 16px 0;
  font-size: 1.2rem;
  color: var(--text-primary);
}

.st-form-row {
  margin-bottom: 16px;
}

.st-label {
  display: block;
  margin-bottom: 6px;
  font-size: 0.9rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.st-input,
.st-select,
.st-textarea {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 0.95rem;
  box-sizing: border-box;
}

.st-textarea {
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
}

.st-form-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.st-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  font-size: 0.95rem;
}

.st-btn--primary {
  background: var(--accent-primary);
  color: white;
}

.st-btn--primary:hover:not(:disabled) {
  opacity: 0.9;
}

.st-btn--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.st-btn--secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.st-btn--secondary:hover:not(:disabled) {
  background: var(--border-color);
}

.st-btn--danger {
  background: #ff4444;
  color: white;
  padding: 6px 12px;
  font-size: 0.85rem;
}

.st-btn--danger:hover:not(:disabled) {
  background: #cc0000;
}

.st-task-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.st-loading,
.st-empty {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}

.st-task-card {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 16px;
  border-left: 4px solid transparent;
}

.st-task-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.st-task-title {
  margin: 0;
  font-size: 1.1rem;
  color: var(--text-primary);
}

.st-task-status {
  font-size: 0.85rem;
  font-weight: 500;
  white-space: nowrap;
}

.st-task-description {
  color: var(--text-secondary);
  margin-bottom: 12px;
  font-size: 0.95rem;
}

.st-task-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}

.st-task-detail {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.st-detail-label {
  font-size: 1rem;
}

.st-detail-value {
  font-family: monospace;
  font-size: 0.85rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.st-task-session {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.st-task-session code {
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
}

.st-task-error {
  margin-top: 8px;
  padding: 8px;
  background: rgba(255, 68, 68, 0.1);
  border-radius: 4px;
  color: #ff4444;
  font-size: 0.9rem;
}

.st-task-actions {
  margin-top: 12px;
}
</style>
