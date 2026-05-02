<script setup lang="ts">
/**
 * PromptTextarea — reusable editor for prompt/sequence fields that support
 * non-text commands such as {Enter}, {Send}, {Wait 500}, and {Ctrl+C}.
 *
 * This component is edit/preview-only. Execution is intentionally handled later
 * by the paste/PTY delivery pipeline.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { parseSequence, formatSequencePreview } from '../../../src/input/sequence-parser.js';
import { getSequenceSyntaxHelpText } from '../../utils.js';

const props = withDefaults(defineProps<{
  modelValue: string;
  id?: string;
  label?: string;
  placeholder?: string;
  rows?: number;
  minRows?: number;
  maxRows?: number;
  textareaClass?: string;
  showPreview?: boolean;
}>(), {
  modelValue: '',
  rows: 3,
  minRows: 3,
  maxRows: 14,
  textareaClass: '',
  showPreview: true,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const syntaxHelpExpanded = ref(false);
const syntaxHelpText = getSequenceSyntaxHelpText();
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const manualHeight = ref<number | null>(null);
let resizeStartY = 0;
let resizeStartHeight = 0;

const preview = computed(() => {
  if (!props.modelValue.trim()) return '';
  return formatSequencePreview(parseSequence(props.modelValue));
});

function autosize(): void {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = 'auto';
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight || '18');
  const minHeight = lineHeight * props.minRows;
  const maxHeight = lineHeight * props.maxRows;
  const nextHeight = Math.min(Math.max(el.scrollHeight, manualHeight.value ?? 0, minHeight), maxHeight);
  el.style.height = `${nextHeight}px`;
  el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value);
  nextTick(autosize);
}

function insertToken(token: string): void {
  const el = textareaRef.value;
  const value = props.modelValue ?? '';
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  const next = value.slice(0, start) + token + value.slice(end);
  emit('update:modelValue', next);

  nextTick(() => {
    textareaRef.value?.focus();
    const pos = start + token.length;
    textareaRef.value?.setSelectionRange(pos, pos);
    autosize();
  });
}

function clampHeight(height: number): number {
  const el = textareaRef.value;
  if (!el) return height;
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight || '18');
  return Math.min(Math.max(height, lineHeight * props.minRows), lineHeight * props.maxRows);
}

function onResizeMove(event: PointerEvent): void {
  manualHeight.value = clampHeight(resizeStartHeight + event.clientY - resizeStartY);
  autosize();
}

function stopResize(): void {
  window.removeEventListener('pointermove', onResizeMove);
  window.removeEventListener('pointerup', stopResize);
}

function startResize(event: PointerEvent): void {
  const el = textareaRef.value;
  if (!el) return;
  event.preventDefault();
  resizeStartY = event.clientY;
  resizeStartHeight = el.getBoundingClientRect().height;
  manualHeight.value = resizeStartHeight;
  window.addEventListener('pointermove', onResizeMove);
  window.addEventListener('pointerup', stopResize, { once: true });
}

function focus(): void {
  textareaRef.value?.focus();
}

onMounted(autosize);
onBeforeUnmount(stopResize);
watch(() => props.modelValue, () => nextTick(autosize));

defineExpose({ focus });
</script>

<template>
  <div class="prompt-textarea">
    <label v-if="label" :for="id" class="prompt-textarea__label">{{ label }}</label>

    <div class="prompt-textarea__editor-shell">
      <textarea
        :id="id"
        ref="textareaRef"
        :value="modelValue"
        :placeholder="placeholder"
        :rows="rows"
        class="prompt-textarea__editor"
        :class="textareaClass"
        spellcheck="false"
        @input="onInput"
      />
      <button
        type="button"
        class="prompt-textarea__info"
        title="Prompt syntax help"
        aria-label="Prompt syntax help"
        @click="syntaxHelpExpanded = !syntaxHelpExpanded"
      >i</button>
      <div
        class="prompt-textarea__resize-grip"
        role="separator"
        aria-label="Resize prompt field vertically"
        aria-orientation="horizontal"
        title="Resize prompt field"
        @pointerdown="startResize"
      >
        <span></span>
      </div>
    </div>

    <div class="prompt-textarea__chips" aria-label="Insert prompt command">
      <button type="button" class="prompt-textarea__chip" @click="insertToken('{Send}')">Send</button>
      <button type="button" class="prompt-textarea__chip" @click="insertToken('{Enter}')">Enter</button>
      <button type="button" class="prompt-textarea__chip" @click="insertToken('{Wait 500}')">Wait</button>
      <button type="button" class="prompt-textarea__chip" @click="insertToken('{Ctrl+C}')">Ctrl+C</button>
    </div>

    <p v-if="showPreview && preview" class="prompt-textarea__preview">{{ preview }}</p>

    <pre v-if="syntaxHelpExpanded" class="prompt-textarea__syntax-content">{{ syntaxHelpText }}</pre>
  </div>
</template>

<style scoped>
.prompt-textarea {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.prompt-textarea__label {
  font-size: var(--font-size-sm);
  color: var(--accent);
  font-weight: 600;
}

.prompt-textarea__editor-shell {
  position: relative;
}

.prompt-textarea__editor {
  width: 100%;
  min-height: 0;
  resize: none;
  background: linear-gradient(180deg, rgba(100, 160, 255, 0.08), rgba(100, 160, 255, 0.025)), var(--bg-tertiary);
  border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--border));
  border-left: 4px solid var(--accent);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: var(--font-size-sm);
  line-height: 1.45;
  padding: var(--spacing-sm) 34px 18px var(--spacing-md);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.025);
}

.prompt-textarea__editor:focus {
  border-color: var(--accent);
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent);
}

.prompt-textarea__info {
  position: absolute;
  top: 7px;
  right: 7px;
  width: 20px;
  height: 20px;
  border: 1px solid var(--accent);
  border-radius: 999px;
  background: var(--bg-secondary);
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
  font-family: serif;
  line-height: 18px;
  cursor: pointer;
}

.prompt-textarea__info:hover {
  background: var(--accent);
  color: var(--bg-primary);
}

.prompt-textarea__resize-grip {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 5px;
  height: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ns-resize;
  touch-action: none;
}

.prompt-textarea__resize-grip span {
  width: 42px;
  height: 4px;
  border-top: 1px solid color-mix(in srgb, var(--accent) 65%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  opacity: 0.75;
}

.prompt-textarea__resize-grip:hover span {
  opacity: 1;
  border-color: var(--accent);
}

.prompt-textarea__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.prompt-textarea__chip {
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
  border-radius: 999px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  padding: 2px 8px;
  font-size: 0.72rem;
  cursor: pointer;
}

.prompt-textarea__chip:hover {
  color: var(--text-primary);
  border-color: var(--accent);
}

.prompt-textarea__preview {
  margin: 0;
  font-size: 0.72rem;
  color: var(--text-dim);
  line-height: 1.35;
}

.prompt-textarea__syntax-content {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--spacing-sm) 10px;
  margin: 0;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 0.72rem;
  line-height: 1.5;
  color: var(--text-secondary);
  white-space: pre-wrap;
}
</style>
