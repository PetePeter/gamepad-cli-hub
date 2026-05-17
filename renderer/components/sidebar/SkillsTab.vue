<script setup lang="ts">
import { computed, ref, watch } from 'vue';

export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  aiAmendable: boolean;
}

export interface SkillDraft {
  id: string;
  name: string;
  description: string;
  body: string;
  aiAmendable: boolean;
}

const props = defineProps<{
  skills: SkillSummary[];
  draft: SkillDraft;
}>();

const emit = defineEmits<{
  select: [id: string];
  new: [];
  save: [draft: SkillDraft];
  delete: [id: string];
}>();

const localDraft = ref<SkillDraft>({ ...props.draft });

watch(() => props.draft, (draft) => {
  localDraft.value = { ...draft };
}, { deep: true });

const selectedId = computed(() => localDraft.value.id);
const canDelete = computed(() => Boolean(localDraft.value.id));
const saveLabel = computed(() => localDraft.value.id ? 'Save Skill' : 'Create Skill');

function onSave(): void {
  emit('save', { ...localDraft.value });
}
</script>

<template>
  <div class="settings-skills-panel">
    <div class="settings-skills-list">
      <div class="settings-list">
        <button
          v-for="skill in skills"
          :key="skill.id"
          class="settings-list-item settings-skill-item focusable"
          :class="{ 'settings-skill-item--active': skill.id === selectedId }"
          @click="emit('select', skill.id)"
        >
          <div class="settings-list-item__info">
            <span class="settings-list-item__name">{{ skill.name }}</span>
            <span class="settings-list-item__detail">{{ skill.description }}</span>
          </div>
          <span class="settings-skill-badge" :class="{ 'settings-skill-badge--open': skill.aiAmendable }">
            {{ skill.aiAmendable ? 'AI amend' : 'protected' }}
          </span>
        </button>
      </div>

      <div v-if="skills.length === 0" class="tools-empty">
        No skills configured.
      </div>

      <div class="settings-tool-actions">
        <button class="focusable" @click="emit('new')">
          + New Skill
        </button>
      </div>
    </div>

    <div class="settings-skill-editor">
      <div class="field-group">
        <label class="field-label">Name</label>
        <input
          v-model="localDraft.name"
          class="field-input focusable"
          type="text"
        />
      </div>

      <div class="field-group">
        <label class="field-label">Description</label>
        <textarea
          v-model="localDraft.description"
          class="field-input focusable"
          rows="3"
        />
      </div>

      <div class="field-group">
        <label class="field-label">Body</label>
        <textarea
          v-model="localDraft.body"
          class="field-input focusable settings-skill-body"
          rows="12"
        />
      </div>

      <label class="settings-skill-checkbox">
        <input
          v-model="localDraft.aiAmendable"
          type="checkbox"
          class="focusable"
        />
        <span>
          <strong>Allow AI to amend this skill</strong>
          <small>Unchecked skills are protected from MCP updates.</small>
        </span>
      </label>

      <p class="settings-form__hint">
        Skills are always read fresh from disk; AI amendments are visible on the next session_info call.
      </p>

      <div class="settings-tool-actions">
        <button class="focusable" @click="onSave">
          {{ saveLabel }}
        </button>
        <button
          class="focusable danger"
          :disabled="!canDelete"
          @click="emit('delete', localDraft.id)"
        >
          Delete
        </button>
      </div>
    </div>
  </div>
</template>
