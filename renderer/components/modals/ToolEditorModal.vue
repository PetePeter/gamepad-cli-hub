<script setup lang="ts">
/**
 * Tool editor modal — purpose-built form for adding/editing CLI Type tool
 * configurations. Replaces the generic FormModal with a structured layout
 * featuring grouped sections and two-column fields.
 */
import { ref, watch, computed } from 'vue';
import { useModalStack } from '../../composables/useModalStack.js';
import { getSequenceSyntaxHelpText } from '../../utils.js';

const MODAL_ID = 'tool-editor-modal';

export interface ToolEditorData {
  name: string;
  command: string;
  args: string;
  initialPromptDelay: number;
  pasteMode: 'pty' | 'sendkeys' | 'sendkeysindividual';
  spawnCommand: string;
  resumeCommand: string;
  continueCommand: string;
  renameCommand: string;
  handoffCommand: string;
  initialPrompt: Array<{ label: string; sequence: string }>;
}

const props = defineProps<{
  visible: boolean;
  mode: 'add' | 'edit';
  editKey: string;
  initialData: ToolEditorData;
}>();

const emit = defineEmits<{
  (e: 'save', values: {
    name: string;
    command: string;
    args: string;
    initialPromptDelay: number;
    pasteMode: string;
    spawnCommand: string;
    resumeCommand: string;
    continueCommand: string;
    renameCommand: string;
    handoffCommand: string;
    _promptItems: Array<{ label: string; sequence: string }>;
  }): void;
  (e: 'cancel'): void;
  (e: 'update:visible', value: boolean): void;
}>();

/* ── Form state ─────────────────────────────────────────────────────────── */

const name = ref('');
const command = ref('');
const args = ref('');
const initialPromptDelay = ref(2000);
const pasteMode = ref<'pty' | 'ptyindividual' | 'sendkeys' | 'sendkeysindividual'>('pty');
const spawnCommand = ref('');
const resumeCommand = ref('');
const continueCommand = ref('');
const renameCommand = ref('');
const handoffCommand = ref('');

interface SeqItem { label: string; sequence: string }
const promptItems = ref<SeqItem[]>([]);

/* ── Section collapse state ─────────────────────────────────────────────── */

const sessionExpanded = ref(false);
const syntaxHelpExpanded = ref(false);
const syntaxHelpText = getSequenceSyntaxHelpText();

/* ── Modal title ────────────────────────────────────────────────────────── */

const title = computed(() =>
  props.mode === 'add' ? 'Add CLI Type' : `Edit CLI Type: ${props.editKey}`,
);

/* ── Modal stack integration ────────────────────────────────────────────── */

const modalStack = useModalStack();

watch(() => props.visible, (v) => {
  if (v) {
    initForm();
    modalStack.push({ id: MODAL_ID, handler: handleButton });
  } else {
    modalStack.pop(MODAL_ID);
  }
}, { immediate: true });

function handleButton(button: string): boolean {
  if (button === 'B') {
    emit('cancel');
    emit('update:visible', false);
    return true;
  }
  return true; // swallow all gamepad input while modal is open
}

/* ── Form initialisation ────────────────────────────────────────────────── */

function initForm(): void {
  const d = props.initialData;
  name.value = d.name ?? '';
  command.value = d.command ?? '';
  args.value = d.args ?? '';
  initialPromptDelay.value = d.initialPromptDelay ?? 2000;
  pasteMode.value = d.pasteMode ?? 'pty';
  spawnCommand.value = d.spawnCommand ?? '';
  resumeCommand.value = d.resumeCommand ?? '';
  continueCommand.value = d.continueCommand ?? '';
  renameCommand.value = d.renameCommand ?? '';
  handoffCommand.value = d.handoffCommand ?? '';
  promptItems.value = Array.isArray(d.initialPrompt)
    ? d.initialPrompt.map(item => ({
        label: typeof item?.label === 'string' ? item.label : '',
        sequence: typeof item?.sequence === 'string' ? item.sequence : '',
      }))
    : [];
}

/* ── Prompt items helpers ───────────────────────────────────────────────── */

function addPromptItem(): void {
  promptItems.value.push({ label: '', sequence: '' });
}

function removePromptItem(index: number): void {
  promptItems.value.splice(index, 1);
}

/* ── Save / Cancel ──────────────────────────────────────────────────────── */

function onSave(): void {
  emit('save', {
    name: name.value,
    command: command.value,
    args: args.value,
    initialPromptDelay: initialPromptDelay.value,
    pasteMode: pasteMode.value,
    spawnCommand: spawnCommand.value,
    resumeCommand: resumeCommand.value,
    continueCommand: continueCommand.value,
    renameCommand: renameCommand.value,
    handoffCommand: handoffCommand.value,
    _promptItems: [...promptItems.value],
  });
  emit('update:visible', false);
}

function onCancel(): void {
  emit('cancel');
  emit('update:visible', false);
}

/* ── Tab trapping — cycle focus within the modal ───────────────────────── */

const FOCUSABLE = 'input, select, textarea, button, [tabindex]:not([tabindex="-1"])';

function onKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Tab') return;
  const modal = document.querySelector('.tool-editor-modal');
  if (!modal) return;
  const els = Array.from(modal.querySelectorAll(FOCUSABLE)) as HTMLElement[];
  if (els.length === 0) return;

  e.preventDefault();
  e.stopPropagation();

  const active = document.activeElement as HTMLElement | null;
  const idx = active ? els.indexOf(active) : -1;
  let next: number;
  if (e.shiftKey) {
    next = idx <= 0 ? els.length - 1 : idx - 1;
  } else {
    next = idx >= els.length - 1 ? 0 : idx + 1;
  }
  els[next]?.focus();
}

defineExpose({ handleButton });
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="modal-overlay modal--visible"
      role="dialog"
      :aria-label="title"
      @keydown="onKeydown"
    >
      <div class="modal tool-editor-modal">
        <!-- Header -->
        <div class="modal-header">
          <h3 class="modal-title">{{ title }}</h3>
          <button class="te-close-btn" title="Close" @click="onCancel">✕</button>
        </div>

        <!-- Body -->
        <div class="modal-body">
          <!-- ═══ Basic ═══ -->
          <fieldset class="te-section">
            <legend class="te-section__legend">Basic</legend>
            <div class="te-grid-2col">
              <div class="te-field">
                <label for="te-name">Name</label>
                <input
                  id="te-name"
                  v-model="name"
                  type="text"
                  placeholder="e.g. Claude Code"
                  class="te-input"
                />
              </div>
              <div class="te-field">
                <label for="te-command">Command</label>
                <input
                  id="te-command"
                  v-model="command"
                  type="text"
                  placeholder="e.g. claude"
                  class="te-input"
                />
              </div>
            </div>
            <div class="te-field">
              <label for="te-args">Args</label>
              <input
                id="te-args"
                v-model="args"
                type="text"
                placeholder="e.g. --no-update-check"
                class="te-input"
              />
            </div>
          </fieldset>

          <!-- ═══ Session Management (collapsed by default) ═══ -->
          <fieldset class="te-section">
            <legend
              class="te-section__legend te-section__legend--collapsible"
              @click="sessionExpanded = !sessionExpanded"
            >
              {{ sessionExpanded ? '▾' : '▸' }} Session Management
            </legend>
            <div v-if="sessionExpanded" class="te-section__body">
              <div class="te-field">
                <label for="te-spawn">Spawn Command</label>
                <input
                  id="te-spawn"
                  v-model="spawnCommand"
                  type="text"
                  placeholder="Template for spawning new sessions"
                  class="te-input te-input--mono"
                />
              </div>
              <div class="te-field">
                <label for="te-resume">Resume Command</label>
                <input
                  id="te-resume"
                  v-model="resumeCommand"
                  type="text"
                  placeholder="Template for resuming sessions"
                  class="te-input te-input--mono"
                />
              </div>
              <div class="te-field">
                <label for="te-continue">Continue Command</label>
                <input
                  id="te-continue"
                  v-model="continueCommand"
                  type="text"
                  placeholder="Template for continuing sessions"
                  class="te-input te-input--mono"
                />
              </div>
              <div class="te-field">
                <label for="te-rename">Rename Command</label>
                <input
                  id="te-rename"
                  v-model="renameCommand"
                  type="text"
                  placeholder="Template for renaming sessions"
                  class="te-input te-input--mono"
                />
              </div>
              <div class="te-field">
                <label for="te-handoff">Handoff Command</label>
                <input
                  id="te-handoff"
                  v-model="handoffCommand"
                  type="text"
                  placeholder="Template for handoff between sessions"
                  class="te-input te-input--mono"
                />
              </div>
            </div>
          </fieldset>

          <!-- ═══ Behavior ═══ -->
          <fieldset class="te-section">
            <legend class="te-section__legend">Behavior</legend>
            <div class="te-grid-2col">
              <div class="te-field">
                <label for="te-paste-mode">Paste Mode</label>
                <select id="te-paste-mode" v-model="pasteMode" class="te-select">
                  <option value="pty">PTY — bulk write to stdin</option>
                  <option value="ptyindividual">PTY Individual — char-by-char to stdin (for Ink/Copilot CLI)</option>
                  <option value="sendkeys">SendKeys — OS-level batch keystrokes (robotjs)</option>
                  <option value="sendkeysindividual">SendKeys Individual — OS-level char-by-char (robotjs)</option>
                </select>
              </div>
              <div class="te-field">
                <label for="te-delay">Initial Prompt Delay (ms)</label>
                <input
                  id="te-delay"
                  v-model.number="initialPromptDelay"
                  type="number"
                  min="0"
                  step="100"
                  class="te-input"
                />
              </div>
            </div>
          </fieldset>

          <!-- ═══ Initial Prompts ═══ -->
          <fieldset class="te-section te-section--prompts">
            <legend class="te-section__legend">Initial Prompts</legend>
            <div class="te-prompts-list">
              <div
                v-for="(item, idx) in promptItems"
                :key="idx"
                class="te-prompt-item"
              >
                <div class="te-prompt-item__header">
                  <input
                    type="text"
                    class="te-input te-input--sm"
                    placeholder="Label, e.g. commit"
                    :value="item.label"
                    @input="item.label = ($event.target as HTMLInputElement).value"
                  />
                  <button
                    type="button"
                    class="btn btn--small btn--danger"
                    title="Remove"
                    @click="removePromptItem(idx)"
                  >✕</button>
                </div>
                <textarea
                  class="sequence-textarea"
                  placeholder="Sequence, e.g. use skill(commit){Enter}"
                  :value="item.sequence"
                  rows="2"
                  @input="item.sequence = ($event.target as HTMLTextAreaElement).value"
                />
              </div>
            </div>
            <button
              type="button"
              class="btn btn--secondary sequence-list-add"
              @click="addPromptItem"
            >+ Add Item</button>
            <div class="te-syntax-help">
              <button
                type="button"
                class="te-syntax-help__toggle"
                @click="syntaxHelpExpanded = !syntaxHelpExpanded"
              >{{ syntaxHelpExpanded ? '▾' : '▸' }} Syntax Reference</button>
              <pre v-if="syntaxHelpExpanded" class="te-syntax-help__content">{{ syntaxHelpText }}</pre>
            </div>
          </fieldset>
        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <button class="btn btn--secondary" @click="onCancel">Cancel</button>
          <button class="btn btn--primary" @click="onSave">Save</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ── Modal size override ────────────────────────────────────────────────── */

.tool-editor-modal {
  max-width: 720px;
  max-height: 90vh;
}

.tool-editor-modal .modal-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

/* ── Close button ───────────────────────────────────────────────────────── */

.te-close-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: var(--font-size-lg);
  cursor: pointer;
  padding: var(--spacing-xs);
  line-height: 1;
  transition: color 0.15s;
}

.te-close-btn:hover {
  color: var(--text-primary);
}

/* ── Sections ───────────────────────────────────────────────────────────── */

.te-section {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--spacing-md);
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.te-section__legend {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--accent);
  padding: 0 var(--spacing-xs);
  user-select: none;
}

.te-section__legend--collapsible {
  cursor: pointer;
  transition: color 0.15s;
}

.te-section__legend--collapsible:hover {
  color: var(--accent-hover);
}

.te-section__body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

/* ── Two-column grid ────────────────────────────────────────────────────── */

.te-grid-2col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-sm);
}

/* ── Field layout ───────────────────────────────────────────────────────── */

.te-field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.te-field label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  font-weight: 500;
}

/* ── Input / Select ─────────────────────────────────────────────────────── */

.te-input,
.te-select {
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  color: var(--text-primary);
  font-size: var(--font-size-md);
  font-family: inherit;
  width: 100%;
}

.te-input:focus,
.te-select:focus {
  border-color: var(--accent);
  outline: none;
}

.te-input--mono {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: var(--font-size-sm);
}

.te-input--sm {
  font-size: 11px;
  padding: var(--spacing-xs) var(--spacing-sm);
}

/* ── Prompts section (resizable) ────────────────────────────────────────── */

.te-section--prompts .te-prompts-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  max-height: 240px;
  overflow-y: auto;
  resize: vertical;
  min-height: 60px;
  padding-right: var(--spacing-xs);
}

.te-prompt-item {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm);
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
}

.te-prompt-item__header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.te-prompt-item__header .te-input--sm {
  flex: 1;
}

/* ── Syntax help ────────────────────────────────────────────────────────── */

.te-syntax-help {
  margin-top: var(--spacing-xs);
}

.te-syntax-help__toggle {
  font-size: 0.75rem;
  cursor: pointer;
  color: var(--text-secondary);
  background: none;
  border: none;
  padding: 2px 0;
  user-select: none;
}

.te-syntax-help__toggle:hover {
  color: var(--text-primary);
}

.te-syntax-help__content {
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
