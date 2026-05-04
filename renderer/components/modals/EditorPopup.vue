<script setup lang="ts">
/**
 * Prompt editor modal — compose multi-line prompts before sending to PTY.
 *
 * Send (Ctrl+Enter): deliver text, close.
 * Cancel / Esc / click-outside: close without sending.
 *
 * History: single click = preview below list; double-click or Insert = insert at caret.
 */
import { ref, computed, watch, nextTick, onUnmounted } from 'vue';
import { type InterceptKey, useModalStack } from '../../composables/useModalStack.js';
import { toDirection } from '../../utils.js';
import { state } from '../../state.js';
import PromptTextarea from '../common/PromptTextarea.vue';
import {
  addEditorHistoryEntry,
  loadEditorHistory,
  getEditorHistoryPreview,
} from '../../editor/editor-history.js';
import EditorPopupConfirmDialog from './EditorPopupConfirmDialog.vue';

const MODAL_ID = 'editor-popup';

const props = defineProps<{
  visible: boolean;
  initialText?: string;
}>();

const emit = defineEmits<{
  (e: 'send', text: string): void;
  (e: 'close'): void;
  (e: 'update:visible', value: boolean): void;
}>();

type FocusTarget = 'textarea' | 'send' | 'cancel';
const FOCUS_ORDER: FocusTarget[] = ['textarea', 'send', 'cancel'];

const text = ref('');
const history = ref<string[]>([]);
const selectedHistory = ref<string | null>(null);
const focusTarget = ref<FocusTarget>('textarea');
const modalStack = useModalStack();
const EDITOR_POPUP_KEYS = new Set<InterceptKey>(['arrows', 'escape']);

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 400;
const MIN_WIDTH = 300;
const MIN_HEIGHT = 200;
const MAX_VIEWPORT_RATIO = 0.85;

const editorWidth = ref(DEFAULT_WIDTH);
const editorHeight = ref(DEFAULT_HEIGHT);
let isResizing = false;
let resizeStartX = 0;
let resizeStartY = 0;
let resizeStartWidth = 0;
let resizeStartHeight = 0;

const lastSentDraft = ref<string>('');
const currentDraftId = ref<string | null>(null);
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
const AUTOSAVE_DEBOUNCE_MS = 2000;

const showConfirmDismiss = ref(false);

const isEmpty = computed(() => !text.value.trim());
const hasUnsent = computed(() => text.value !== lastSentDraft.value);

const modalStyle = computed(() => ({
  width: `${editorWidth.value}px`,
  height: `${editorHeight.value}px`,
}));

watch(() => props.visible, async (v) => {
  if (v) {
    await loadEditorDraft();
    if (props.initialText) text.value = props.initialText;
    selectedHistory.value = null;
    focusTarget.value = 'textarea';
    history.value = await loadEditorHistory(getEditorScope());
    modalStack.push({ id: MODAL_ID, handler: handleButton, interceptKeys: EDITOR_POPUP_KEYS });
    await loadEditorDimensions();
  } else {
    modalStack.pop(MODAL_ID);
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
  }
}, { immediate: true });

async function loadEditorDimensions(): Promise<void> {
  try {
    const prefs = await window.gamepadCli.configGetEditorPrefs();
    if (prefs.editorPopupWidth) editorWidth.value = Math.max(MIN_WIDTH, Math.min(prefs.editorPopupWidth, window.innerWidth * MAX_VIEWPORT_RATIO));
    else editorWidth.value = Math.max(MIN_WIDTH, Math.min(DEFAULT_WIDTH, window.innerWidth * MAX_VIEWPORT_RATIO));
    if (prefs.editorPopupHeight) editorHeight.value = Math.max(MIN_HEIGHT, Math.min(prefs.editorPopupHeight, window.innerHeight * MAX_VIEWPORT_RATIO));
  } catch (err) {
    console.warn('[EditorPopup] Failed to load dimensions:', err);
  }
}

async function saveEditorDimensions(): Promise<void> {
  try {
    await window.gamepadCli.configSetEditorPrefs({
      editorPopupWidth: editorWidth.value,
      editorPopupHeight: editorHeight.value,
    });
  } catch (err) {
    console.warn('[EditorPopup] Failed to save dimensions:', err);
  }
}

function onResizeMouseDown(e: MouseEvent): void {
  if (e.button !== 0) return; // only left-click
  e.preventDefault();
  isResizing = true;
  resizeStartX = e.clientX;
  resizeStartY = e.clientY;
  resizeStartWidth = editorWidth.value;
  resizeStartHeight = editorHeight.value;

  document.addEventListener('mousemove', onResizeMouseMove);
  document.addEventListener('mouseup', onResizeMouseUp);
}

function onResizeMouseMove(e: MouseEvent): void {
  if (!isResizing) return;
  const deltaX = e.clientX - resizeStartX;
  const deltaY = e.clientY - resizeStartY;

  const newWidth = Math.max(MIN_WIDTH, Math.min(resizeStartWidth + deltaX, window.innerWidth * MAX_VIEWPORT_RATIO));
  const newHeight = Math.max(MIN_HEIGHT, Math.min(resizeStartHeight + deltaY, window.innerHeight * MAX_VIEWPORT_RATIO));

  editorWidth.value = newWidth;
  editorHeight.value = newHeight;
}

function onResizeMouseUp(): void {
  if (!isResizing) return;
  isResizing = false;
  document.removeEventListener('mousemove', onResizeMouseMove);
  document.removeEventListener('mouseup', onResizeMouseUp);
  void saveEditorDimensions();
}

async function loadEditorDraft(): Promise<void> {
  const scope = getEditorScope();
  if (!scope) return;
  try {
    const drafts = await window.gamepadCli.draftList(scope);
    const draft = drafts.find((d: any) => d.label === 'ctrl-g-draft');
    if (draft) {
      currentDraftId.value = draft.id;
      text.value = draft.text;
      lastSentDraft.value = draft.text;
    } else {
      currentDraftId.value = null;
      lastSentDraft.value = '';
    }
  } catch (err) {
    console.warn('[EditorPopup] Failed to load draft:', err);
  }
}

async function saveEditorDraft(): Promise<void> {
  const scope = getEditorScope();
  if (!scope || isEmpty.value) {
    if (currentDraftId.value) await deleteEditorDraft();
    return;
  }
  try {
    if (currentDraftId.value) {
      await window.gamepadCli.draftUpdate(currentDraftId.value, { text: text.value });
    } else {
      const draft = await window.gamepadCli.draftCreate(scope, 'ctrl-g-draft', text.value);
      if (draft) currentDraftId.value = draft.id;
    }
    lastSentDraft.value = text.value;
  } catch (err) {
    console.warn('[EditorPopup] Failed to save draft:', err);
  }
}

async function deleteEditorDraft(): Promise<void> {
  if (!currentDraftId.value) return;
  try {
    await window.gamepadCli.draftDelete(currentDraftId.value);
    currentDraftId.value = null;
    lastSentDraft.value = '';
  } catch (err) {
    console.warn('[EditorPopup] Failed to delete draft:', err);
  }
}

function scheduleAutoSave(): void {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    void saveEditorDraft();
    autoSaveTimer = null;
  }, AUTOSAVE_DEBOUNCE_MS);
}

watch(text, () => {
  if (!props.visible) return;
  scheduleAutoSave();
});

onUnmounted(() => {
  document.removeEventListener('mousemove', onResizeMouseMove);
  document.removeEventListener('mouseup', onResizeMouseUp);
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
});

function handleButton(button: string): boolean {
  const dir = toDirection(button);
  if (dir === 'up') {
    const idx = FOCUS_ORDER.indexOf(focusTarget.value);
    focusTarget.value = FOCUS_ORDER[(idx - 1 + FOCUS_ORDER.length) % FOCUS_ORDER.length];
    return true;
  }
  if (dir === 'down') {
    const idx = FOCUS_ORDER.indexOf(focusTarget.value);
    focusTarget.value = FOCUS_ORDER[(idx + 1) % FOCUS_ORDER.length];
    return true;
  }
  if (button === 'A') {
    if (focusTarget.value === 'send') void onSend();
    else if (focusTarget.value === 'cancel') onClose();
    return true;
  }
  if (button === 'B') {
    onClose();
    return true;
  }
  return true;
}

async function onSend(): Promise<void> {
  if (isEmpty.value) return;
  const t = text.value.trim();
  await addEditorHistoryEntry(t, getEditorScope());
  await deleteEditorDraft();
  lastSentDraft.value = '';
  emit('send', t);
  emit('close');
  emit('update:visible', false);
}

function onClose(): void {
  if (hasUnsent.value) {
    showConfirmDismiss.value = true;
  } else {
    doClose();
  }
}

function doClose(): void {
  showConfirmDismiss.value = false;
  emit('close');
  emit('update:visible', false);
}

async function onConfirmDiscard(): Promise<void> {
  await deleteEditorDraft();
  doClose();
}

async function onConfirmSaveThenDiscard(): Promise<void> {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  await saveEditorDraft();
  doClose();
}

function onConfirmKeepEditing(): void {
  showConfirmDismiss.value = false;
}

function onHistorySelect(entry: string): void {
  selectedHistory.value = entry;
}

function onHistoryInsert(): void {
  const entry = selectedHistory.value;
  if (!entry) return;
  text.value += text.value && !text.value.endsWith('\n') ? `\n${entry}` : entry;
  nextTick(() => { focusTarget.value = 'textarea'; });
}

function getEditorScope(): string | undefined {
  const sessionId = state.activeSessionId ?? state.recentSessionId;
  const session = sessionId ? state.sessions.find((item) => item.id === sessionId) : null;
  return session?.workingDir || sessionId || undefined;
}

function onHistoryDblClick(entry: string): void {
  selectedHistory.value = entry;
  onHistoryInsert();
}

defineExpose({ handleButton });
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="modal-overlay modal--visible editor-popup-overlay"
      role="dialog"
      aria-label="Prompt editor"
      @click.self="onClose"
    >
      <div class="modal editor-popup" :style="modalStyle">
        <div class="editor-popup__header modal-header">
          <div class="editor-popup__title-group">
            <h2 class="modal-title">Prompt Editor</h2>
            <span v-if="hasUnsent" class="editor-popup__unsaved-badge">💾 Unsaved</span>
          </div>
          <button class="icon-button" aria-label="Close editor" @click="onClose">×</button>
        </div>

        <div class="editor-popup__body">
          <section class="editor-popup__composer">
            <PromptTextarea
              v-model="text"
              placeholder="Enter your prompt…"
              :rows="12"
              :min-rows="8"
              :max-rows="24"
              textarea-class="editor-popup__textarea"
              @keydown.ctrl.enter.prevent="onSend"
              @keydown.escape.prevent.stop="onClose"
            />
          </section>

          <aside class="editor-popup__history">
            <h3>Recent Prompts</h3>
            <div v-if="history.length === 0" class="editor-popup__history-empty">No recent prompts yet.</div>
            <div v-else class="editor-popup__history-list">
              <button
                v-for="(entry, i) in history"
                :key="i"
                type="button"
                class="editor-popup__history-item"
                :class="{ 'editor-popup__history-item--selected': selectedHistory === entry }"
                title="Click to preview · Double-click to insert"
                @click="onHistorySelect(entry)"
                @dblclick.prevent="onHistoryDblClick(entry)"
              >
                <span class="editor-popup__history-index">{{ i + 1 }}.</span>
                <span class="editor-popup__history-text">{{ getEditorHistoryPreview(entry) }}</span>
              </button>
            </div>

            <div v-if="selectedHistory" class="editor-popup__history-preview">
              <div class="editor-popup__history-preview-text">{{ selectedHistory }}</div>
              <button class="btn btn--secondary btn--sm" @click="onHistoryInsert">Insert</button>
            </div>
          </aside>
        </div>

        <div class="modal-footer editor-popup__footer">
          <div class="editor-popup__footer-buttons">
            <button
              class="btn btn--primary"
              :class="{ 'btn--focused': focusTarget === 'send' }"
              :disabled="isEmpty"
              @click="onSend"
            >Send</button>
            <button
              class="btn btn--ghost"
              :class="{ 'btn--focused': focusTarget === 'cancel' }"
              @click="onClose"
            >Cancel</button>
          </div>
          <div class="editor-popup__footer-hint">
            Send button submits · Esc/click outside cancel · Double-click history to insert
          </div>
        </div>

        <div class="editor-popup__resize-handle" @mousedown="onResizeMouseDown" title="Drag to resize"></div>

        <EditorPopupConfirmDialog
          v-model:visible="showConfirmDismiss"
          @keep-editing="onConfirmKeepEditing"
          @save-discard="onConfirmSaveThenDiscard"
          @discard="onConfirmDiscard"
        />
      </div>
    </div>
  </Teleport>
</template>
