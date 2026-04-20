<script setup lang="ts">
/**
 * Prompt editor modal — compose multi-line prompts before sending to PTY.
 *
 * Send (Ctrl+Enter): deliver text, close.
 * Cancel / Esc / click-outside: close without sending.
 *
 * History: single click = preview below list; double-click or Insert = insert at caret.
 */
import { ref, computed, watch, nextTick } from 'vue';
import { type InterceptKey, useModalStack } from '../../composables/useModalStack.js';
import { toDirection } from '../../utils.js';
import {
  addEditorHistoryEntry,
  loadEditorHistory,
  getEditorHistoryPreview,
} from '../../editor/editor-history.js';

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
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const modalStack = useModalStack();
const EDITOR_POPUP_KEYS = new Set<InterceptKey>(['arrows', 'escape']);

const isEmpty = computed(() => !text.value.trim());

watch(() => props.visible, async (v) => {
  if (v) {
    text.value = props.initialText ?? '';
    selectedHistory.value = null;
    focusTarget.value = 'textarea';
    history.value = await loadEditorHistory();
    modalStack.push({ id: MODAL_ID, handler: handleButton, interceptKeys: EDITOR_POPUP_KEYS });
    await nextTick();
    focusTextareaEnd();
  } else {
    modalStack.pop(MODAL_ID);
  }
}, { immediate: true });

function focusTextareaEnd(): void {
  const ta = textareaRef.value;
  if (!ta) return;
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}

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
  await addEditorHistoryEntry(t);
  emit('send', t);
  emit('close');
  emit('update:visible', false);
}

function onClose(): void {
  emit('close');
  emit('update:visible', false);
}

function onHistorySelect(entry: string): void {
  selectedHistory.value = entry;
}

function onHistoryInsert(): void {
  const entry = selectedHistory.value;
  if (!entry) return;
  const ta = textareaRef.value;
  if (!ta) {
    text.value += entry;
    nextTick(() => focusTextareaEnd());
    return;
  }
  const start = ta.selectionStart ?? text.value.length;
  const end = ta.selectionEnd ?? start;
  text.value = `${text.value.slice(0, start)}${entry}${text.value.slice(end)}`;
  nextTick(() => {
    ta.focus();
    ta.setSelectionRange(start + entry.length, start + entry.length);
  });
}

function onHistoryDblClick(entry: string): void {
  selectedHistory.value = entry;
  onHistoryInsert();
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault();
    void onSend();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    onClose();
  }
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
      <div class="modal editor-popup">
        <div class="editor-popup__header modal-header">
          <h2 class="modal-title">Prompt Editor</h2>
          <button class="icon-button" aria-label="Close editor" @click="onClose">×</button>
        </div>

        <div class="editor-popup__body">
          <section class="editor-popup__composer">
            <textarea
              ref="textareaRef"
              v-model="text"
              class="editor-popup__textarea"
              rows="12"
              placeholder="Enter your prompt…"
              @keydown="handleKeydown"
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
            Ctrl+Enter send · Esc cancel · Double-click history to insert
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
