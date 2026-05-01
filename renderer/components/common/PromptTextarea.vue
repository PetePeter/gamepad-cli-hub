<script setup lang="ts">
/**
 * PromptTextarea — reusable textarea for prompt/sequence fields that support
 * non-text commands such as {Enter}, {Send}, {Wait 500}, and {Ctrl+C}.
 */
import { computed, ref } from 'vue';
import { parseSequence, formatSequencePreview } from '../../../src/input/sequence-parser.js';
import { getSequenceSyntaxHelpText } from '../../utils.js';

const props = withDefaults(defineProps<{
  modelValue: string;
  id?: string;
  label?: string;
  placeholder?: string;
  rows?: number;
  textareaClass?: string;
  showPreview?: boolean;
}>(), {
  modelValue: '',
  rows: 3,
  textareaClass: '',
  showPreview: true,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const syntaxHelpExpanded = ref(false);
const syntaxHelpText = getSequenceSyntaxHelpText();
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const preview = computed(() => {
  if (!props.modelValue.trim()) return '';
  return formatSequencePreview(parseSequence(props.modelValue));
});

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value);
}

function insertToken(token: string): void {
  const el = textareaRef.value;
  const value = props.modelValue ?? '';
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  const next = value.slice(0, start) + token + value.slice(end);
  emit('update:modelValue', next);

  requestAnimationFrame(() => {
    textareaRef.value?.focus();
    const pos = start + token.length;
    textareaRef.value?.setSelectionRange(pos, pos);
  });
}
</script>

<template>
  <div class="prompt-textarea">
    <label v-if="label" :for="id" class="prompt-textarea__label">{{ label }}</label>
    <textarea
      :id="id"
      ref="textareaRef"
      :value="modelValue"
      :placeholder="placeholder"
      :rows="rows"
      :class="textareaClass"
      @input="onInput"
    />

    <div class="prompt-textarea__chips" aria-label="Insert prompt command">
      <button type="button" class="prompt-textarea__chip" @click="insertToken('{Send}')">Send</button>
      <button type="button" class="prompt-textarea__chip" @click="insertToken('{Enter}')">Enter</button>
      <button type="button" class="prompt-textarea__chip" @click="insertToken('{Wait 500}')">Wait</button>
      <button type="button" class="prompt-textarea__chip" @click="insertToken('{Ctrl+C}')">Ctrl+C</button>
    </div>

    <p v-if="showPreview && preview" class="prompt-textarea__preview">{{ preview }}</p>

    <div class="prompt-textarea__syntax-help">
      <button
        type="button"
        class="prompt-textarea__syntax-toggle"
        @click="syntaxHelpExpanded = !syntaxHelpExpanded"
      >{{ syntaxHelpExpanded ? '▾' : '▸' }} Syntax Reference</button>
      <pre v-if="syntaxHelpExpanded" class="prompt-textarea__syntax-content">{{ syntaxHelpText }}</pre>
    </div>
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
  color: var(--text-secondary);
  font-weight: 500;
}

.prompt-textarea__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.prompt-textarea__chip {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
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

.prompt-textarea__syntax-help {
  margin-top: 2px;
}

.prompt-textarea__syntax-toggle {
  font-size: 0.75rem;
  cursor: pointer;
  color: var(--text-secondary);
  background: none;
  border: none;
  padding: 2px 0;
  user-select: none;
}

.prompt-textarea__syntax-toggle:hover {
  color: var(--text-primary);
}

.prompt-textarea__syntax-content {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--spacing-sm) 10px;
  margin-top: 6px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 0.72rem;
  line-height: 1.5;
  color: var(--text-secondary);
  white-space: pre-wrap;
}
</style>
