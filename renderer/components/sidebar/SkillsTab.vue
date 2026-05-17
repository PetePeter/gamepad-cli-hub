<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  aiAmendable: boolean;
  allProjects: boolean;
  projectIds: string[];
  type?: string;
  source?: 'user' | 'system';
}

export interface SkillDraft {
  id: string;
  name: string;
  description: string;
  body: string;
  aiAmendable: boolean;
  allProjects: boolean;
  projectIds: string[];
  type?: string;
  source?: 'user' | 'system';
}

export interface SkillProject {
  id: string;
  name: string;
  canonicalPath: string;
}

const props = defineProps<{
  skills: SkillSummary[];
  draft: SkillDraft;
  projects: SkillProject[];
}>();

const emit = defineEmits<{
  select: [id: string];
  new: [];
  save: [draft: SkillDraft];
  delete: [id: string];
  clone: [id: string];
}>();

const localDraft = ref<SkillDraft>({ ...props.draft });

// Originals — used to detect unsaved changes
const origName = ref(props.draft.name);
const origDescription = ref(props.draft.description);
const origBody = ref(props.draft.body);
const origAiAmendable = ref(props.draft.aiAmendable);
const origAllProjects = ref(props.draft.allProjects);
const origProjectIds = ref([...props.draft.projectIds]);

const hydratingFromProps = ref(false);
const saveStatus = ref<'clean' | 'unsaved' | 'saving' | 'saved'>('clean');
const autoSaveTimer = ref<ReturnType<typeof setTimeout> | null>(null);

watch(() => props.draft, (draft) => {
  hydratingFromProps.value = true;
  localDraft.value = { ...draft };
  origName.value = draft.name;
  origDescription.value = draft.description;
  origBody.value = draft.body;
  origAiAmendable.value = draft.aiAmendable;
  origAllProjects.value = draft.allProjects;
  origProjectIds.value = [...draft.projectIds];
  saveStatus.value = 'clean';
  if (autoSaveTimer.value) { clearTimeout(autoSaveTimer.value); autoSaveTimer.value = null; }
  nextTick(() => { hydratingFromProps.value = false; });
}, { deep: true });

const hasUnsavedChanges = computed(() =>
  localDraft.value.name !== origName.value ||
  localDraft.value.description !== origDescription.value ||
  localDraft.value.body !== origBody.value ||
  localDraft.value.aiAmendable !== origAiAmendable.value ||
  localDraft.value.allProjects !== origAllProjects.value ||
  JSON.stringify(localDraft.value.projectIds) !== JSON.stringify(origProjectIds.value),
);

const saveStatusText = computed(() =>
  ({ unsaved: '● Unsaved', saving: '◑ Saving…', saved: '✓ Saved' }[saveStatus.value] ?? ''),
);

watch(localDraft, () => {
  if (hydratingFromProps.value) return;
  if (saveStatus.value === 'clean' || saveStatus.value === 'saved') saveStatus.value = 'unsaved';
  scheduleAutoSave();
}, { deep: true, flush: 'post' });

function scheduleAutoSave(): void {
  if (autoSaveTimer.value) clearTimeout(autoSaveTimer.value);
  autoSaveTimer.value = setTimeout(() => {
    autoSaveTimer.value = null;
    if (hasUnsavedChanges.value) doAutoSave();
  }, 500);
}

function doAutoSave(): void {
  if (isSystemSkill.value || !localDraft.value.name.trim()) return;
  saveStatus.value = 'saving';
  emit('save', { ...localDraft.value });
  origName.value = localDraft.value.name;
  origDescription.value = localDraft.value.description;
  origBody.value = localDraft.value.body;
  origAiAmendable.value = localDraft.value.aiAmendable;
  origAllProjects.value = localDraft.value.allProjects;
  origProjectIds.value = [...localDraft.value.projectIds];
  saveStatus.value = 'saved';
  setTimeout(() => { if (saveStatus.value === 'saved') saveStatus.value = 'clean'; }, 2000);
}

const selectedId = computed(() => localDraft.value.id);
const canDelete = computed(() => Boolean(localDraft.value.id));
const saveLabel = computed(() => localDraft.value.id ? 'Save Skill' : 'Create Skill');
const isSystemSkill = computed(() => localDraft.value.source === 'system');
const canEdit = computed(() => !isSystemSkill.value && Boolean(localDraft.value.id));
const canClone = computed(() => isSystemSkill.value && Boolean(localDraft.value.type));
const selectedProjects = computed(() => {
  if (localDraft.value.allProjects) return [{ id: '__all__', name: 'All projects' }];
  const names = new Map(props.projects.map((project) => [project.id, project.name || project.canonicalPath]));
  return localDraft.value.projectIds.map((id) => ({ id, name: names.get(id) || id }));
});

function onSave(): void {
  if (autoSaveTimer.value) { clearTimeout(autoSaveTimer.value); autoSaveTimer.value = null; }
  emit('save', { ...localDraft.value });
  origName.value = localDraft.value.name;
  origDescription.value = localDraft.value.description;
  origBody.value = localDraft.value.body;
  origAiAmendable.value = localDraft.value.aiAmendable;
  origAllProjects.value = localDraft.value.allProjects;
  origProjectIds.value = [...localDraft.value.projectIds];
  saveStatus.value = 'saved';
  setTimeout(() => { if (saveStatus.value === 'saved') saveStatus.value = 'clean'; }, 2000);
}

function selectAllProjects(): void {
  localDraft.value.allProjects = true;
  localDraft.value.projectIds = [];
}

function toggleProject(projectId: string): void {
  const selected = new Set(localDraft.value.projectIds);
  if (selected.has(projectId)) selected.delete(projectId);
  else selected.add(projectId);
  localDraft.value.projectIds = [...selected];
  localDraft.value.allProjects = localDraft.value.projectIds.length === 0;
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
          <span class="settings-skill-badge" :class="{
            'settings-skill-badge--open': skill.aiAmendable,
            'settings-skill-badge--system': skill.source === 'system'
          }">
            {{ skill.source === 'system' ? 'system' : (skill.aiAmendable ? 'AI amend' : 'protected') }}
          </span>
          <span class="settings-skill-scope">
            {{ skill.allProjects ? 'all projects' : `${skill.projectIds.length} project${skill.projectIds.length === 1 ? '' : 's'}` }}
          </span>
        </button>
      </div>

      <div v-if="skills.length === 0" class="tools-empty">
        No skills configured.
      </div>

      <div class="settings-tool-actions">
        <button class="btn btn--secondary btn--sm focusable" @click="emit('new')">
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
          :disabled="isSystemSkill"
        />
      </div>

      <div class="field-group">
        <label class="field-label">When to trigger</label>
        <textarea
          v-model="localDraft.description"
          class="field-input focusable"
          rows="3"
          :disabled="isSystemSkill"
        />
      </div>

      <div class="field-group">
        <label class="field-label">Body</label>
        <textarea
          v-model="localDraft.body"
          class="field-input focusable settings-skill-body"
          rows="12"
          :disabled="isSystemSkill"
        />
      </div>

      <div class="field-group">
        <label class="field-label">Projects</label>
        <div class="settings-skill-project-picker">
          <button
            type="button"
            class="settings-skill-project-option focusable"
            :class="{ 'settings-skill-project-option--selected': localDraft.allProjects }"
            :disabled="isSystemSkill"
            @click="selectAllProjects"
          >
            All projects
          </button>
          <button
            v-for="project in projects"
            :key="project.id"
            type="button"
            class="settings-skill-project-option focusable"
            :class="{ 'settings-skill-project-option--selected': localDraft.projectIds.includes(project.id) && !localDraft.allProjects }"
            :disabled="isSystemSkill"
            @click="toggleProject(project.id)"
          >
            {{ project.name || project.canonicalPath }}
          </button>
        </div>
        <div class="settings-skill-project-chips">
          <span
            v-for="project in selectedProjects"
            :key="project.id"
            class="settings-skill-project-chip"
          >
            {{ project.name }}
          </span>
        </div>
      </div>

      <label class="settings-skill-checkbox">
        <input
          v-model="localDraft.aiAmendable"
          type="checkbox"
          class="focusable"
          :disabled="isSystemSkill"
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
        <button v-if="canClone" class="btn btn--secondary focusable" @click="emit('clone', localDraft.id)">
          Clone as Override
        </button>
        <button
          v-else
          class="btn btn--primary focusable"
          @click="onSave"
          :disabled="isSystemSkill"
        >
          {{ saveLabel }}
        </button>
        <button
          class="btn btn--danger focusable"
          v-if="!isSystemSkill"
          :disabled="!canDelete"
          @click="emit('delete', localDraft.id)"
        >
          Delete
        </button>
        <span v-if="saveStatusText" class="skill-save-status">{{ saveStatusText }}</span>
      </div>
    </div>
  </div>
</template>
