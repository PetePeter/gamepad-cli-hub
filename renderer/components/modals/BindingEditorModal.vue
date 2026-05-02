<script setup lang="ts">
/**
 * Binding editor modal — complex form for editing gamepad button bindings.
 *
 * Action types: keyboard, voice, scroll, context-menu, sequence-list, new-draft.
 * Each action type renders different parameter fields.
 */
import { ref, watch, computed } from 'vue';
import { FORM_KEYS, useModalStack } from '../../composables/useModalStack.js';
import { useFocusTrap } from '../../composables/useFocusTrap.js';
import { getCliDisplayName } from '../../utils.js';
import { state } from '../../state.js';
import PromptTextarea from '../common/PromptTextarea.vue';

const MODAL_ID = 'binding-editor';

const ACTION_TYPES = [
  { value: 'keyboard', label: 'Keyboard sequence' },
  { value: 'voice', label: 'Voice key' },
  { value: 'scroll', label: 'Scroll' },
  { value: 'context-menu', label: 'Context menu' },
  { value: 'sequence-list', label: 'Sequence list' },
  { value: 'new-draft', label: 'New draft' },
] as const;

interface Binding {
  action: string;
  sequence?: string;
  key?: string;
  mode?: string;
  target?: string;
  direction?: string;
  lines?: number;
  items?: Array<{ label: string; sequence: string }>;
  sequenceGroup?: string;
}

const props = defineProps<{
  visible: boolean;
  buttonName: string;
  cliType: string;
  binding: Binding | null;
}>();

const emit = defineEmits<{
  (e: 'save', binding: Binding): void;
  (e: 'cancel'): void;
  (e: 'update:visible', value: boolean): void;
}>();

const actionType = ref('keyboard');
const sequence = ref('');
const voiceKey = ref('');
const voiceMode = ref('tap');
const voiceTarget = ref('');
const scrollDirection = ref('up');
const scrollLines = ref(5);
const sequenceListSource = ref<'group' | 'inline'>('inline');
const sequenceGroup = ref('');
const sequenceItems = ref<Array<{ label: string; sequence: string }>>([]);
const modalStack = useModalStack();
const overlayRef = ref<HTMLElement | null>(null);
const { onKeydown } = useFocusTrap(overlayRef);

watch(() => props.visible, (v) => {
  if (v) {
    // Populate from existing binding
    const b = props.binding;
    actionType.value = b?.action ?? 'keyboard';
    sequence.value = b?.sequence ?? '';
    voiceKey.value = b?.key ?? '';
    voiceMode.value = b?.mode ?? 'tap';
    voiceTarget.value = b?.target ?? '';
    scrollDirection.value = b?.direction ?? 'up';
    scrollLines.value = b?.lines ?? 5;
    sequenceListSource.value = b?.sequenceGroup ? 'group' : 'inline';
    sequenceGroup.value = b?.sequenceGroup ?? '';
    sequenceItems.value = (b?.items ?? []).map(item => ({
      label: item.label ?? '',
      sequence: item.sequence ?? '',
    }));
    modalStack.push({ id: MODAL_ID, handler: handleButton, interceptKeys: FORM_KEYS });
  } else {
    modalStack.pop(MODAL_ID);
  }
}, { immediate: true });

function handleButton(button: string): boolean {
  if (button === 'A') {
    onSave();
    return true;
  }
  if (button === 'B') {
    emit('cancel');
    emit('update:visible', false);
    return true;
  }
  return true; // swallow
}

function onSave(): void {
  const binding: Binding = { action: actionType.value };
  switch (actionType.value) {
    case 'keyboard':
      binding.sequence = sequence.value;
      break;
    case 'voice':
      binding.key = voiceKey.value;
      binding.mode = voiceMode.value;
      if (voiceTarget.value) binding.target = voiceTarget.value;
      break;
    case 'scroll':
      binding.direction = scrollDirection.value;
      binding.lines = scrollLines.value;
      break;
    case 'sequence-list':
      if (sequenceListSource.value === 'group' && sequenceGroup.value) {
        binding.sequenceGroup = sequenceGroup.value;
      } else {
        binding.items = sequenceItems.value
          .map(item => ({ label: item.label.trim(), sequence: item.sequence }))
          .filter(item => item.sequence.trim().length > 0);
      }
      break;
  }
  emit('save', binding);
  emit('update:visible', false);
}

function onCancel(): void {
  emit('cancel');
  emit('update:visible', false);
}

const title = computed(() =>
  `${props.buttonName} — ${getCliDisplayName(props.cliType)}`,
);

const availableSequenceGroups = computed(() => {
  const groups = state.cliSequencesCache[props.cliType] ?? {};
  return Object.entries(groups).map(([name, items]) => ({
    name,
    count: Array.isArray(items) ? items.length : 0,
  }));
});

watch(availableSequenceGroups, (groups) => {
  if (sequenceListSource.value !== 'group') return;
  if (!sequenceGroup.value && groups[0]) sequenceGroup.value = groups[0].name;
  if (sequenceGroup.value && !groups.some(group => group.name === sequenceGroup.value)) {
    sequenceGroup.value = groups[0]?.name ?? '';
  }
});

function addSequenceItem(): void {
  sequenceItems.value.push({ label: '', sequence: '' });
}

function removeSequenceItem(index: number): void {
  sequenceItems.value.splice(index, 1);
}

defineExpose({ handleButton });
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="overlayRef"
      class="modal-overlay modal--visible"
      role="dialog"
      aria-label="Edit binding"
      @keydown="onKeydown"
    >
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">{{ title }}</h3>
        </div>
        <div class="modal-body" id="bindingEditorForm">
          <!-- Button name (read-only) -->
          <div class="binding-editor-field">
            <label>Button</label>
            <input type="text" :value="buttonName" readonly class="form-input" />
          </div>

          <!-- Action type -->
          <div class="binding-editor-field">
            <label for="be-action">Action</label>
            <select id="be-action" v-model="actionType" class="form-select">
              <option v-for="at in ACTION_TYPES" :key="at.value" :value="at.value">
                {{ at.label }}
              </option>
            </select>
          </div>

          <!-- Keyboard params -->
          <template v-if="actionType === 'keyboard'">
            <div class="binding-editor-field">
              <PromptTextarea
                id="be-sequence"
                v-model="sequence"
                label="Sequence"
                placeholder="{Send}, text, {Ctrl+C}"
                :rows="3"
              />
            </div>
          </template>

          <!-- Voice params -->
          <template v-if="actionType === 'voice'">
            <div class="binding-editor-field">
              <label for="be-key">Key</label>
              <input id="be-key" v-model="voiceKey" type="text" placeholder="F1" class="form-input" />
            </div>
            <div class="binding-editor-field">
              <label for="be-mode">Mode</label>
              <select id="be-mode" v-model="voiceMode" class="form-select">
                <option value="tap">Tap</option>
                <option value="hold">Hold</option>
              </select>
            </div>
            <div class="binding-editor-field">
              <label for="be-target">Target</label>
              <select id="be-target" v-model="voiceTarget" class="form-select">
                <option value="">OS (default)</option>
                <option value="terminal">Terminal (PTY)</option>
              </select>
            </div>
          </template>

          <!-- Scroll params -->
          <template v-if="actionType === 'scroll'">
            <div class="binding-editor-field">
              <label for="be-direction">Direction</label>
              <select id="be-direction" v-model="scrollDirection" class="form-select">
                <option value="up">Up</option>
                <option value="down">Down</option>
              </select>
            </div>
            <div class="binding-editor-field">
              <label for="be-lines">Lines</label>
              <input id="be-lines" v-model.number="scrollLines" type="number" min="1" max="50" class="form-input" />
            </div>
          </template>

          <!-- Sequence list params -->
          <template v-if="actionType === 'sequence-list'">
            <div class="binding-editor-field">
              <label>Source</label>
              <div class="sequence-source-toggle">
                <label>
                  <input v-model="sequenceListSource" type="radio" value="group" />
                  Sequence group
                </label>
                <label>
                  <input v-model="sequenceListSource" type="radio" value="inline" />
                  Inline items
                </label>
              </div>
            </div>

            <div v-if="sequenceListSource === 'group'" class="binding-editor-field">
              <label for="be-sequence-group">Group</label>
              <select id="be-sequence-group" v-model="sequenceGroup" class="form-select">
                <option value="" disabled>
                  {{ availableSequenceGroups.length === 0 ? 'No sequence groups configured' : 'Select group...' }}
                </option>
                <option v-for="group in availableSequenceGroups" :key="group.name" :value="group.name">
                  {{ group.name }} ({{ group.count }} item{{ group.count !== 1 ? 's' : '' }})
                </option>
              </select>
            </div>

            <div v-if="sequenceListSource === 'inline'" class="binding-editor-field">
              <label>Inline Items</label>
              <div class="sequence-list-editor">
                <div v-for="(item, idx) in sequenceItems" :key="idx" class="sequence-list-editor__item">
                  <div class="sequence-list-editor__header">
                    <input
                      v-model="item.label"
                      type="text"
                      class="form-input"
                      placeholder="Label, e.g. Clear"
                    />
                    <button type="button" class="btn btn--small btn--danger" title="Remove" @click="removeSequenceItem(idx)">✕</button>
                  </div>
                  <PromptTextarea
                    v-model="item.sequence"
                    placeholder="Sequence, e.g. /clear{Enter}"
                    :rows="2"
                    :min-rows="2"
                    :max-rows="8"
                  />
                </div>
              </div>
              <button type="button" class="btn btn--secondary sequence-list-add" @click="addSequenceItem">+ Add Item</button>
            </div>
          </template>

          <!-- Context menu / new-draft — no extra params -->
          <template v-if="actionType === 'context-menu' || actionType === 'new-draft'">
            <div class="binding-editor-field">
              <span class="form-help">No additional parameters needed.</span>
            </div>
          </template>
        </div>

        <div class="modal-footer">
          <button class="btn" @click="onCancel">Cancel</button>
          <button class="btn btn--primary" @click="onSave">Save</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
