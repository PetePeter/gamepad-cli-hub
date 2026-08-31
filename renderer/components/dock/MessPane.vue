<script setup lang="ts">
import EmptyState from '../common/EmptyState.vue';
import FilterChip from '../common/FilterChip.vue';
import PanelHeader from '../common/PanelHeader.vue';
import { useMessPane } from '../../composables/useMessPane.js';

const {
  appState,
  entries,
  filters,
  hasMore,
  loading,
  loadOlder,
  projectId,
  projectName,
  resolveLabel,
  isTargetUnread,
  scroller,
  senderOptions,
  visibleEntries,
} = useMessPane();

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
</script>

<template>
  <section class="mess-pane" aria-label="Mess project conversation">
    <PanelHeader title="Mess" icon="🍽" :subtitle="projectName ?? 'No active project'">
      <template #toolbar>
        <div class="mess-filters">
          <label class="mess-filter-select">
            <span>Sender</span>
            <select v-model="filters.senderId" aria-label="Filter by sender">
              <option value="">Any</option>
              <option v-for="sender in senderOptions" :key="sender.id" :value="sender.id">{{ sender.label }}</option>
            </select>
          </label>
          <FilterChip v-model:state="filters.broadcast" label="Broadcast" />
          <FilterChip v-model:state="filters.unread" label="Unread" />
        </div>
      </template>
    </PanelHeader>

    <EmptyState v-if="!projectId" title="No active project" hint="Select a session to observe its Mess conversation." icon="🍽" />
    <div v-else :ref="scroller" class="mess-history" aria-live="polite">
      <EmptyState v-if="loading && !entries.length" title="Loading Mess" loading />
      <EmptyState v-else-if="!visibleEntries.length" title="No messages" hint="Project coordination messages will appear here." icon="🍽" />
      <template v-else>
        <button v-if="hasMore" type="button" class="mess-older" @click="loadOlder">Older</button>
        <article
          v-for="entry in visibleEntries"
          :key="entry.id"
          class="mess-row"
          :class="{ 'mess-row--closed-sender': !appState.sessions.some(session => session.id === entry.fromSessionId) }"
        >
          <time class="mess-row__time" :datetime="new Date(entry.createdAt).toISOString()">{{ formatTime(entry.createdAt) }}</time>
          <div class="mess-row__content">
            <div class="mess-row__address">
              <span class="mess-row__sender">{{ resolveLabel(entry.fromSessionId, entry.fromLabelSnapshot) }}</span>
              <span aria-hidden="true">→</span>
              <span v-if="!entry.toSessionId" class="mess-row__all">all</span>
              <span v-else>{{ resolveLabel(entry.toSessionId, entry.toLabelSnapshot) }}</span>
              <span v-if="entry.toSessionId && isTargetUnread(entry)" class="mess-row__badge">not picked up</span>
              <span v-if="entry.toSessionId && !appState.sessions.some(session => session.id === entry.toSessionId)" class="mess-row__closed">session closed</span>
            </div>
            <p class="mess-row__body">{{ entry.text }}</p>
          </div>
        </article>
      </template>
    </div>
  </section>
</template>

<style scoped>
.mess-pane { display: flex; flex-direction: column; min-width: 0; min-height: 0; height: 100%; background: var(--bg-primary); }
.mess-filters { display: flex; align-items: center; flex-wrap: wrap; gap: var(--spacing-sm); }
.mess-filter-select { display: inline-flex; align-items: center; gap: var(--spacing-xs); color: var(--text-secondary); font-size: var(--font-size-sm); }
.mess-filter-select select { min-width: 120px; padding: 3px 6px; }
.mess-history { flex: 1; min-height: 0; overflow: auto; padding: var(--spacing-sm) var(--spacing-md); }
.mess-older { display: block; margin: 0 auto var(--spacing-sm); padding: var(--spacing-xs) var(--spacing-md); color: var(--info); font-size: var(--font-size-sm); }
.mess-older:hover { background: var(--bg-hover); }
.mess-row { display: grid; grid-template-columns: 54px minmax(0, 1fr); gap: var(--spacing-sm); padding: var(--spacing-sm); border-radius: var(--radius-sm); }
.mess-row:hover { background: var(--bg-hover); }
.mess-row__time { color: var(--text-dim); font-size: var(--font-size-xs); padding-top: 2px; }
.mess-row__content { min-width: 0; }
.mess-row__address { display: flex; align-items: center; flex-wrap: wrap; gap: var(--spacing-xs); color: var(--info); font-size: var(--font-size-sm); }
.mess-row__sender { color: var(--accent); }
.mess-row__all { border: 1px dashed var(--info); padding: 0 var(--spacing-xs); }
.mess-row__body { margin-top: var(--spacing-xs); color: var(--text-primary); white-space: pre-wrap; overflow-wrap: anywhere; }
.mess-row__badge { padding: 1px var(--spacing-xs); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--status-blocked) 18%, transparent); color: var(--status-blocked); font-size: var(--font-size-xs); }
.mess-row__closed, .mess-row--closed-sender .mess-row__sender { color: var(--text-dim); }
</style>
