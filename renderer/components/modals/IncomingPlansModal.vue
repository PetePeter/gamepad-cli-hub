<script setup lang="ts">
/**
 * Incoming Plans Modal
 *
 * Shows pending JSON files waiting in config/plans/incoming/.
 * Users can accept (import into current directory) or dismiss individual files.
 * Wired from App.vue via the modal bridge.
 */
import { ref, watch, onMounted } from 'vue';
import { useModalStack } from '../../composables/useModalStack.js';

const MODAL_ID = 'incoming-plans';

const props = defineProps<{
  visible: boolean;
  targetDirPath: string;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'imported'): void;
}>();

const files = ref<string[]>([]);
const focusIndex = ref(0);
const modalStack = useModalStack();

watch(() => props.visible, async (v) => {
  if (v) {
    await loadFiles();
    focusIndex.value = 0;
    modalStack.push({ id: MODAL_ID, handler: handleButton });
  } else {
    modalStack.pop(MODAL_ID);
  }
}, { immediate: true });

async function loadFiles(): Promise<void> {
  files.value = await window.gamepadCli.planIncomingList();
}

async function acceptFile(filename: string): Promise<void> {
  try {
    const content = await window.gamepadCli.planReadFile(filename); // filename is full path from watcher
    if (!content) return;
    await window.gamepadCli.planImportFile(content, props.targetDirPath);
    await window.gamepadCli.planIncomingDelete(filename);
    emit('imported');
    await loadFiles();
    if (focusIndex.value >= files.value.length) focusIndex.value = Math.max(0, files.value.length - 1);
    if (files.value.length === 0) close();
  } catch (err) {
    console.error('[IncomingPlansModal] Accept failed:', err);
  }
}

async function dismissFile(filename: string): Promise<void> {
  await window.gamepadCli.planIncomingDelete(filename);
  await loadFiles();
  if (focusIndex.value >= files.value.length) focusIndex.value = Math.max(0, files.value.length - 1);
  if (files.value.length === 0) close();
}

function close(): void {
  emit('update:visible', false);
}

function handleButton(button: string): boolean {
  switch (button) {
    case 'DpadUp':
      focusIndex.value = Math.max(0, focusIndex.value - 1);
      return true;
    case 'DpadDown':
      focusIndex.value = Math.min(files.value.length - 1, focusIndex.value + 1);
      return true;
    case 'A':
      if (files.value[focusIndex.value]) void acceptFile(files.value[focusIndex.value]);
      return true;
    case 'X':
      if (files.value[focusIndex.value]) void dismissFile(files.value[focusIndex.value]);
      return true;
    case 'B':
      close();
      return true;
    default:
      return false;
  }
}

function shortName(filename: string): string {
  return filename.split(/[/\\]/).pop() ?? filename;
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay modal--visible incoming-plans-overlay" @click.self="close">
      <div class="incoming-plans-modal" role="dialog" aria-modal="true">
        <div class="incoming-plans-header">
          <span class="incoming-plans-title">📥 Incoming Plans</span>
          <button class="incoming-plans-close" @click="close">✕</button>
        </div>

        <p class="incoming-plans-hint">
          Plans queued for import into <strong>{{ targetDirPath || 'current directory' }}</strong>
        </p>

        <ul class="incoming-plans-list" v-if="files.length > 0">
          <li
            v-for="(file, idx) in files"
            :key="file"
            :class="['incoming-plans-item', { focused: idx === focusIndex }]"
          >
            <span class="incoming-plans-filename">{{ shortName(file) }}</span>
            <div class="incoming-plans-actions">
              <button class="focusable" @click="acceptFile(file)">Import</button>
              <button class="focusable" @click="dismissFile(file)">Dismiss</button>
            </div>
          </li>
        </ul>

        <p v-else class="incoming-plans-empty">No incoming files.</p>

        <div class="incoming-plans-footer">
          <span>A=Import · X=Dismiss · B=Close</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.incoming-plans-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}

.incoming-plans-modal {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 20px;
  width: 480px;
  max-width: 90vw;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.incoming-plans-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.incoming-plans-title {
  font-size: 15px;
  font-weight: 600;
  color: #e0e0e0;
}

.incoming-plans-close {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 16px;
  padding: 2px 6px;
}

.incoming-plans-hint {
  font-size: 12px;
  color: #888;
  margin: 0;
}

.incoming-plans-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.incoming-plans-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: #252525;
  border-radius: 4px;
  border: 1px solid transparent;
}

.incoming-plans-item.focused {
  border-color: #4488ff;
  background: #1e2d4a;
}

.incoming-plans-filename {
  font-size: 13px;
  color: #ccc;
  word-break: break-all;
  flex: 1;
  margin-right: 10px;
}

.incoming-plans-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.incoming-plans-actions button {
  padding: 4px 10px;
  font-size: 12px;
  background: #333;
  border: 1px solid #555;
  border-radius: 4px;
  color: #ccc;
  cursor: pointer;
}

.incoming-plans-actions button:first-child {
  background: #1e3d6e;
  border-color: #4488ff;
  color: #aac8ff;
}

.incoming-plans-empty {
  color: #666;
  font-size: 13px;
  margin: 0;
  text-align: center;
  padding: 20px 0;
}

.incoming-plans-footer {
  font-size: 11px;
  color: #555;
  text-align: center;
  border-top: 1px solid #2a2a2a;
  padding-top: 8px;
}
</style>
