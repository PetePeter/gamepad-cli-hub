<script setup lang="ts">
/**
 * RecycleBinModal.vue — restore or forget closed, recoverable sessions.
 *
 * Sessions that were closed while carrying a cliSessionName land here (30-day
 * window). Entries are grouped by working directory so restore stays co-located
 * with the folder the session came from. Restore re-spawns via the normal
 * spawn-with-resume flow; Forget deletes a single entry; Empty clears the bin.
 */
import { computed, onUnmounted, ref, watch } from 'vue';
import type { RecycleBinEntry } from '../../../src/types/recycle-bin.js';
import { useFocusTrap } from '../../composables/useFocusTrap.js';
import { FORM_KEYS, useModalStack } from '../../composables/useModalStack.js';
import { useRecycleBin } from '../../composables/useRecycleBin.js';

const MODAL_ID = 'recycle-bin';
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ 'update:visible': [value: boolean] }>();

const { entries, refresh, restore, forget, empty } = useRecycleBin();

const overlayRef = ref<HTMLElement | null>(null);
const { onKeydown: trapOnKeydown } = useFocusTrap('.rb-modal');
const modalStack = useModalStack();

interface DirGroup {
  key: string;
  label: string;
  entries: RecycleBinEntry[];
}

function shortenPath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  if (parts.length <= 2) return path;
  return '.../' + parts.slice(-2).join('/');
}

const dirGroups = computed<DirGroup[]>(() => {
  const groups = new Map<string, DirGroup>();
  for (const entry of entries.value) {
    let group = groups.get(entry.workingDir);
    if (!group) {
      group = { key: entry.workingDir, label: shortenPath(entry.workingDir), entries: [] };
      groups.set(entry.workingDir, group);
    }
    group.entries.push(entry);
  }
  return [...groups.values()];
});

function relativeClosed(ms: number): string {
  const secs = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function expiresIn(ms: number): string {
  const remaining = ms + RETENTION_MS - Date.now();
  const days = Math.max(0, Math.floor(remaining / 86_400_000));
  if (days >= 1) return `expires in ${days}d`;
  const hours = Math.max(0, Math.floor(remaining / 3_600_000));
  return `expires in ${hours}h`;
}

function isExpiring(ms: number): boolean {
  return ms + RETENTION_MS - Date.now() < 3 * 86_400_000;
}

function close(): void {
  emit('update:visible', false);
}

async function onRestore(entry: RecycleBinEntry): Promise<void> {
  await restore(entry.id);
  if (entries.value.length === 0) close();
}

function handleButton(): boolean {
  return true;
}

function onOverlayKeydown(event: KeyboardEvent): void {
  trapOnKeydown(event);
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
  }
}

watch(() => props.visible, (visible) => {
  if (visible) {
    modalStack.push({ id: MODAL_ID, handler: handleButton, interceptKeys: FORM_KEYS });
    void refresh();
  } else {
    modalStack.pop(MODAL_ID);
  }
}, { immediate: true });

onUnmounted(() => {
  modalStack.pop(MODAL_ID);
});

defineExpose({ handleButton });
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="overlayRef"
      class="modal-overlay modal--visible"
      role="dialog"
      aria-label="Recycle Bin"
      tabindex="-1"
      @click.self="close"
      @keydown="onOverlayKeydown"
    >
      <div class="modal rb-modal">
        <div class="rb-head">
          <h3 class="rb-title">🗑️ Recycle Bin</h3>
          <span class="rb-count">{{ entries.length }} recoverable · last 30 days</span>
          <span class="rb-spacer"></span>
          <button class="rb-clear focusable" type="button" :disabled="entries.length === 0" @click="empty">Empty bin</button>
          <button class="rb-x focusable" type="button" aria-label="Close" @click="close">✕</button>
        </div>

        <div class="rb-body">
          <div v-if="entries.length === 0" class="rb-empty">No closed sessions to restore</div>

          <template v-for="group in dirGroups" :key="group.key">
            <div class="rb-dir-label" :title="group.key">{{ group.label }}</div>
            <div
              v-for="entry in group.entries"
              :key="entry.id"
              class="rb-row"
              :class="{ 'rb-row--expiring': isExpiring(entry.closedAt) }"
            >
              <div class="rb-info">
                <div class="rb-name">{{ entry.name }}</div>
                <div class="rb-meta">closed {{ relativeClosed(entry.closedAt) }} · {{ expiresIn(entry.closedAt) }}</div>
              </div>
              <span class="rb-cli">{{ entry.cliType }}</span>
              <button class="rb-icon rb-icon--restore focusable" type="button" title="Restore" @click="onRestore(entry)">↺</button>
              <button class="rb-icon rb-icon--forget focusable" type="button" title="Forget" @click="forget(entry.id)">🗑</button>
            </div>
          </template>
        </div>

        <div class="rb-foot">
          <span class="rb-hint">A ↺ Restore · X Forget · B Close</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.rb-modal {
  border: 2px solid var(--accent-primary);
  border-radius: 10px;
  background: var(--bg-secondary);
  width: min(520px, 92vw);
  display: flex;
  flex-direction: column;
}
.rb-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-color);
}
.rb-title { margin: 0; font-size: 1.1rem; color: var(--text-primary); }
.rb-count { color: var(--text-secondary); font-size: 0.8rem; }
.rb-spacer { margin-left: auto; }
.rb-clear {
  background: none; border: 1px solid var(--border-color); color: var(--text-secondary);
  border-radius: 4px; padding: 5px 10px; cursor: pointer; font-size: 0.78rem;
}
.rb-clear:hover:not(:disabled) { border-color: #c55; color: #ff6666; }
.rb-clear:disabled { opacity: 0.5; cursor: not-allowed; }
.rb-x { background: none; border: none; color: var(--text-secondary); font-size: 1.2rem; cursor: pointer; }
.rb-x:hover { color: var(--text-primary); }
.rb-body { padding: 12px 18px 18px; max-height: 60vh; overflow: auto; }
.rb-empty { text-align: center; padding: 40px; color: var(--text-secondary); }

.rb-dir-label {
  font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--text-secondary); margin: 14px 0 8px; position: sticky; top: 0;
  background: var(--bg-secondary); padding: 4px 0; z-index: 1;
}
.rb-dir-label:first-child { margin-top: 0; }

.rb-row {
  display: flex; align-items: center; gap: 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; background: var(--bg-primary);
}
.rb-row--expiring { opacity: 0.6; }
.rb-info { flex: 1; min-width: 0; }
.rb-name { font-size: 0.95rem; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rb-meta { font-size: 0.76rem; color: var(--text-secondary); }
.rb-cli { background: var(--bg-tertiary); padding: 2px 8px; border-radius: 3px; font-size: 0.74rem; color: var(--accent-primary); flex-shrink: 0; }

.rb-icon {
  width: 30px; height: 30px; border-radius: 4px; flex-shrink: 0;
  border: 1px solid var(--border-color); background: var(--bg-tertiary);
  color: var(--text-primary); cursor: pointer; font-size: 0.95rem;
}
.rb-icon--restore:hover { border-color: var(--accent-primary); color: var(--accent-primary); }
.rb-icon--forget:hover { border-color: #c55; color: #ff6666; }

.rb-foot { border-top: 1px solid var(--border-color); padding: 10px 18px; }
.rb-hint { font-size: 0.76rem; color: var(--text-secondary); }
</style>
