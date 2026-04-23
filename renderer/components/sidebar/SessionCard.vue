<script setup lang="ts">
/**
 * SessionCard.vue — Single session card with activity dot, state, badges, timer, rename.
 *
 * Replaces the imperative createSessionCard() in sessions-render.ts with a reactive
 * template. Props drive all rendering — no manual DOM updates needed.
 */
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue';
import { getActivityColor } from '../../state-colors.js';

// --- Types ---

export interface SessionCardSession {
  id: string;
  name: string;
  cliType: string;
  title?: string;
  cliSessionName?: string;
}

export type SessionCardFocusColumn = 0 | 1 | 2 | 3 | 4;

export interface SessionCardProps {
  session: SessionCardSession;
  navIndex: number;
  sessionState: string;
  activityLevel: string;
  displayName: string;
  draftCount: number;
  elapsedText: string;
  workingPlanLabel: string;
  workingPlanTooltip: string;
  isActive: boolean;
  isFocused: boolean;
  focusColumn: SessionCardFocusColumn;
  isEditing: boolean;
  isHiddenFromOverview: boolean;
  scheduledAt?: string | null;
  isSnappedOut?: boolean;
}

// --- Constants ---

const STATE_LABELS: Record<string, string> = {
  implementing: '🔨 Implementing',
  waiting: '⏳ Waiting',
  planning: '🧠 Planning',
  completed: '🎉 Completed',
  idle: '💤 Idle',
};

const STATES = ['implementing', 'waiting', 'planning', 'completed', 'idle'];

// --- Props & Emits ---

const props = defineProps<SessionCardProps>();

const emit = defineEmits<{
  click: [sessionId: string];
  rename: [sessionId: string];
  commitRename: [sessionId: string, newName: string];
  cancelRename: [];
  close: [sessionId: string, displayName: string];
  stateChange: [sessionId: string, newState: string];
  toggleOverview: [sessionId: string];
  cancelSchedule: [sessionId: string];
}>();

// --- Local state ---

const cardEl = ref<HTMLDivElement | null>(null);
const renameValue = ref('');
const renameInput = ref<HTMLInputElement | null>(null);
const showStateDropdown = ref(false);

const openDropdown = () => { showStateDropdown.value = true; };
const closeDropdown = () => { showStateDropdown.value = false; };

onMounted(() => {
  cardEl.value?.addEventListener('open-state-dropdown', openDropdown);
  cardEl.value?.addEventListener('close-state-dropdown', closeDropdown);
});

onUnmounted(() => {
  cardEl.value?.removeEventListener('open-state-dropdown', openDropdown);
  cardEl.value?.removeEventListener('close-state-dropdown', closeDropdown);
});

// Auto-focus rename input when editing begins
watch(() => props.isEditing, async (editing) => {
  if (editing) {
    renameValue.value = props.session.name;
    await nextTick();
    renameInput.value?.focus();
    renameInput.value?.select();
  }
});

// --- Computed ---

const dotColor = computed(() => getActivityColor(props.activityLevel));
const stateLabel = computed(() => STATE_LABELS[props.sessionState] || '💤 Idle');
const eyeIcon = computed(() => props.isHiddenFromOverview ? '👁‍🗨' : '👁');
const eyeTitle = computed(() => props.isHiddenFromOverview ? 'Show in overview' : 'Hide from overview');
const metaText = computed(() => {
  const title = props.session.title?.trim();
  return title && title !== props.displayName ? title : '';
});

// Column focus helpers
function colClass(col: number): string {
  return props.isFocused && props.focusColumn === col ? 'card-col-focused' : '';
}

// --- Handlers ---

function onRenameKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    emit('commitRename', props.session.id, renameValue.value);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    emit('cancelRename');
  }
}

function selectState(s: string): void {
  showStateDropdown.value = false;
  emit('stateChange', props.session.id, s);
}

</script>

<template>
  <div
    ref="cardEl"
    class="session-card"
    :class="{ active: isActive, focused: isFocused, 'snapped-out': isSnappedOut }"
    :data-session-id="session.id"
    :data-nav-index="navIndex"
    @click="emit('click', session.id)"
  >
    <!-- Line 1: top row -->
    <div class="session-top-row">
      <span class="session-activity-dot" :style="{ background: dotColor }" />
      <span v-if="isSnappedOut" class="snap-indicator" title="Snapped out">📤</span>

      <button
        class="session-state-btn"
        :class="colClass(1)"
        @click.stop="showStateDropdown = !showStateDropdown"
      >
        {{ stateLabel }}
      </button>

      <!-- State dropdown -->
      <div v-if="showStateDropdown" class="session-state-dropdown">
        <button
          v-for="s in STATES"
          :key="s"
          class="session-state-option"
          :class="{ active: s === sessionState }"
          @click.stop="selectState(s)"
        >
          {{ STATE_LABELS[s] || s }}
        </button>
      </div>

      <!-- Draft badge -->
      <span v-if="draftCount > 0" class="draft-badge">📝{{ draftCount }}</span>

      <span style="flex: 1" />

      <span class="session-timer">{{ elapsedText }}</span>

      <!-- Rename button (hidden when editing) -->
      <button
        v-if="!isEditing"
        class="session-rename"
        :class="colClass(2)"
        title="Rename session"
        @click.stop="emit('rename', session.id)"
      >
        ✎
      </button>

      <!-- Eye toggle -->
      <button
        class="session-overview-toggle"
        :class="colClass(3)"
        :title="eyeTitle"
        @click.stop="emit('toggleOverview', session.id)"
      >
        {{ eyeIcon }}
      </button>

      <!-- Close button -->
      <button
        class="session-close"
        :class="colClass(4)"
        :title="`Close ${displayName}`"
        @click.stop="emit('close', session.id, displayName)"
      >
        ✕
      </button>
    </div>

    <!-- Line 2: name (editable or display) -->
    <div class="session-name-line">
      <template v-if="isEditing">
        <input
          ref="renameInput"
          v-model="renameValue"
          class="session-rename-input"
          type="text"
          maxlength="50"
          placeholder="Enter name..."
          @keydown="onRenameKeydown"
        />
        <button class="session-rename-save" title="Save (Enter)" @click.stop="emit('commitRename', session.id, renameValue)">✓</button>
        <button class="session-rename-cancel" title="Cancel (Escape)" @click.stop="emit('cancelRename')">×</button>
      </template>
      <template v-else>
        <span class="session-name" @click.stop="emit('rename', session.id)">{{ displayName }}</span>
        <span
          v-if="workingPlanLabel"
          class="session-working-plan"
          :title="workingPlanTooltip"
        >
          {{ workingPlanLabel }}
        </span>
      </template>
    </div>

    <!-- Line 3: terminal title meta -->
    <span v-if="metaText" class="session-meta" :title="metaText">
      {{ metaText }}
    </span>

    <!-- Line 4: pending schedule chip -->
    <div v-if="scheduledAt" class="session-schedule-chip">
      <span>⏰ {{ scheduledAt }}</span>
      <button
        class="session-schedule-cancel"
        title="Cancel scheduled resume"
        @click.stop="emit('cancelSchedule', session.id)"
      >×</button>
    </div>
  </div>
</template>
