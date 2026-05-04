<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { ScheduledTask } from '../../../src/types/scheduled-task.js';

const emit = defineEmits<{
  open: [taskId: string | null];
  delete: [task: ScheduledTask];
}>();

const props = defineProps<{
  collapsed: boolean;
}>();

const tasks = ref<ScheduledTask[]>([]);
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let offChanged: (() => void) | null = null;

const visibleTasks = computed(() => tasks.value
  .filter((task) => task.status === 'pending' || task.status === 'executing')
  .sort((a, b) => nextRunMs(a) - nextRunMs(b))
  .slice(0, 4));

async function loadTasks(): Promise<void> {
  try {
    tasks.value = await window.gamepadCli.scheduledTaskList() ?? [];
  } catch {
    tasks.value = [];
  }
}

function nextRunMs(task: ScheduledTask): number {
  return new Date(task.nextRunAt ?? task.scheduledTime).getTime();
}

function timeRemaining(task: ScheduledTask): string {
  if (task.status === 'executing') return 'running';
  const diff = nextRunMs(task) - Date.now();
  if (diff <= 0) return 'due';
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m`;
  return '<1m';
}

onMounted(() => {
  void loadTasks();
  refreshTimer = setInterval(loadTasks, 15000);
  offChanged = window.gamepadCli.onScheduledTaskChanged?.(() => {
    void loadTasks();
  }) ?? null;
});

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
  offChanged?.();
});
</script>

<template>
  <div v-show="!props.collapsed" class="scheduler-section">
    <button class="scheduler-create focusable" @click.stop="emit('open', null)">New Schedule</button>
    <div v-if="visibleTasks.length === 0" class="scheduler-empty">No scheduled runs</div>
    <div
      v-for="task in visibleTasks"
      :key="task.id"
      class="scheduler-row focusable"
      :class="{ 'scheduler-row--running': task.status === 'executing' }"
    >
      <span class="scheduler-title">{{ task.title }}</span>
      <span class="scheduler-time">{{ timeRemaining(task) }}</span>
      <div class="scheduler-actions">
        <button class="scheduler-action" type="button" title="Edit schedule" aria-label="Edit schedule" @click.stop="emit('open', task.id)">i</button>
        <button class="scheduler-action scheduler-action--danger" type="button" title="Delete schedule" aria-label="Delete schedule" @click.stop="emit('delete', task)">x</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scheduler-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 8px 8px;
}
.scheduler-create,
.scheduler-row {
  width: 100%;
  min-height: 30px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.82rem;
}
.scheduler-create {
  color: var(--accent-primary);
}
.scheduler-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  padding: 5px 7px;
  text-align: left;
  cursor: default;
}
.scheduler-row:hover {
  border-color: var(--border-color);
}
.scheduler-create:hover {
  border-color: var(--accent-primary);
}
.scheduler-row--running {
  border-color: #ff9f1a;
}
.scheduler-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.scheduler-time {
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.scheduler-actions {
  display: flex;
  gap: 4px;
}
.scheduler-action {
  width: 22px;
  height: 22px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.75rem;
  line-height: 1;
}
.scheduler-action:hover {
  border-color: var(--accent-primary);
  color: var(--text-primary);
}
.scheduler-action--danger:hover {
  border-color: #ff4444;
  color: #ff6666;
}
.scheduler-empty {
  padding: 8px;
  color: var(--text-secondary);
  font-size: 0.8rem;
  text-align: center;
}
</style>
