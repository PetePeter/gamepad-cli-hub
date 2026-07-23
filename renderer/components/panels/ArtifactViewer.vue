<script setup lang="ts">
/**
 * ArtifactViewer.vue — right-docked master/detail artifact panel.
 *
 * Master: a collapsible index rail (search + sort + Today/Earlier groups,
 * unread dots, hover-delete). Detail: the selected artifact rendered to
 * sanitized HTML with a version bar (‹ › + dropdown + older-version banner).
 * Footer: Export… / Delete / Clear all. Header: title + count + pop-out + close.
 *
 * The panel is bound to a single session via the `sessionId` prop; the shared
 * useArtifactViewer composable is told which session is active so a snap-out
 * window can render its own instance without cross-talk.
 */
import { computed, onMounted, watch } from 'vue';
import { useArtifactViewer } from '../../composables/useArtifactViewer.js';
import { renderArtifact } from '../../artifacts/render-artifact.js';
import { systemClient } from '../../ipc/clients.js';
import type { Artifact } from '../../../src/types/artifact.js';

const props = defineProps<{ sessionId: string }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'pop-out'): void;
}>();

const viewer = useArtifactViewer();

// Local rail controls.
import { ref } from 'vue';
type SortMode = 'new' | 'upd' | 'az';
const query = ref('');
const sortMode = ref<SortMode>('new');

const {
  artifacts,
  selectedId,
  selected,
  selectedVersion,
  railCollapsed,
  unread,
} = viewer;

// ── Version helpers ────────────────────────────────────────────────────────

/** The version being shown: pinned selection, else the latest. */
const shownVersion = computed(() => {
  const a = selected.value;
  if (!a || a.versions.length === 0) return null;
  if (selectedVersion.value == null) return a.versions[a.versions.length - 1];
  return a.versions.find(v => v.version === selectedVersion.value)
    ?? a.versions[a.versions.length - 1];
});

const latestVersionNumber = computed(() => {
  const a = selected.value;
  return a && a.versions.length ? a.versions[a.versions.length - 1].version : 0;
});

const isViewingOlder = computed(() =>
  !!shownVersion.value && shownVersion.value.version !== latestVersionNumber.value,
);

const renderedHtml = computed(() => {
  const a = selected.value;
  const v = shownVersion.value;
  if (!a || !v) return '';
  return renderArtifact(a.kind, v.content);
});

function stepVersion(delta: number): void {
  const a = selected.value;
  if (!a) return;
  const current = shownVersion.value?.version ?? latestVersionNumber.value;
  const idx = a.versions.findIndex(v => v.version === current);
  const nextIdx = idx + delta;
  if (nextIdx < 0 || nextIdx >= a.versions.length) return;
  viewer.setVersion(a.versions[nextIdx].version);
}

// ── Rail list (filter → sort → group) ──────────────────────────────────────

function matches(a: Artifact, q: string): boolean {
  if (!q) return true;
  return a.title.toLowerCase().includes(q) || a.kind.includes(q);
}

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  const rows = artifacts.value.filter(a => matches(a, q));
  const sorted = [...rows];
  if (sortMode.value === 'az') {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sortMode.value === 'new') {
    sorted.sort((a, b) => b.createdAt - a.createdAt);
  } else {
    sorted.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  return sorted;
});

/** Start of local "today" in epoch ms — anything on/after is grouped Today. */
function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

interface RailRow { kind: 'header' | 'item'; label?: string; artifact?: Artifact }

/** Flatten into header + item rows; A–Z sort suppresses the date grouping. */
const railRows = computed<RailRow[]>(() => {
  const rows: RailRow[] = [];
  const today = startOfToday();
  let lastGroup: string | null = null;
  const grouped = sortMode.value !== 'az';
  for (const a of filtered.value) {
    if (grouped) {
      const group = a.updatedAt >= today ? 'Today' : 'Earlier';
      if (group !== lastGroup) {
        lastGroup = group;
        rows.push({ kind: 'header', label: group });
      }
    }
    rows.push({ kind: 'item', artifact: a });
  }
  return rows;
});

function relativeTime(ms: number): string {
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60) return 'now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const count = computed(() => artifacts.value.length);

// ── Actions ────────────────────────────────────────────────────────────────

function onSelect(id: string): void { viewer.select(id); }
function onDeleteItem(id: string): void { void viewer.remove(id); }
function onDeleteSelected(): void { if (selectedId.value) void viewer.remove(selectedId.value); }
function onClearAll(): void { void viewer.clearAll(props.sessionId); }
function onExport(): void { if (selectedId.value) void viewer.export(selectedId.value); }

/**
 * Intercept clicks on links inside the rendered artifact. The content is
 * AI-authored and lives in the privileged window, so we never let a link
 * navigate the app itself — http/https links open in the OS browser via
 * shell.openExternal, everything else is inert. (render-artifact already strips
 * js:/data:/file: hrefs; this is the second half of that defence.)
 */
function onDocClick(e: MouseEvent): void {
  const anchor = (e.target as HTMLElement | null)?.closest('a');
  if (!anchor) return;
  e.preventDefault();
  const href = anchor.getAttribute('href') ?? '';
  if (/^https?:\/\//i.test(href)) void systemClient.systemOpenExternalUrl(href);
}

// ── Session binding / lifecycle ────────────────────────────────────────────

onMounted(() => {
  viewer.ensureSubscribed();
  void viewer.setActiveSession(props.sessionId);
});

watch(() => props.sessionId, (id) => { void viewer.setActiveSession(id); });
</script>

<template>
  <div class="artifact-panel">
    <div class="ap-head">
      <span class="ap-title">📄 Artifacts</span>
      <span class="ap-count">{{ count }} · session-scoped</span>
      <span class="ap-spacer"></span>
      <button class="ap-ico" title="Pop out with terminal" @click="emit('pop-out')">⧉</button>
      <button class="ap-ico" title="Close panel" @click="emit('close')">✕</button>
    </div>

    <div class="ap-main">
      <!-- MASTER: index rail -->
      <div class="ap-rail" :class="{ 'ap-rail--collapsed': railCollapsed }">
        <div class="ap-rail-collapse" :title="railCollapsed ? 'Expand list' : 'Collapse list'" @click="viewer.toggleRail()">
          {{ railCollapsed ? '›' : '‹' }}
        </div>
        <div v-show="!railCollapsed" class="ap-rail-inner">
          <div class="ap-rail-tools">
            <label class="ap-search">
              <span class="ap-mag">🔍</span>
              <input v-model="query" placeholder="Search artifacts…" />
            </label>
            <div class="ap-sort">
              <span>Sort</span>
              <select v-model="sortMode">
                <option value="new">Newest</option>
                <option value="upd">Recently updated</option>
                <option value="az">A–Z</option>
              </select>
            </div>
          </div>
          <div class="ap-rail-list">
            <div v-if="artifacts.length === 0" class="ap-empty">No artifacts yet.</div>
            <template v-for="(row, i) in railRows" :key="row.kind === 'header' ? 'h-' + row.label + i : row.artifact!.id">
              <div v-if="row.kind === 'header'" class="ap-grp-h">{{ row.label }}</div>
              <div
                v-else
                class="ap-item"
                :class="{ 'ap-item--active': row.artifact!.id === selectedId, 'ap-item--unread': unread.has(row.artifact!.id) }"
                @click="onSelect(row.artifact!.id)"
              >
                <span class="ap-dot"></span>
                <div class="ap-it-body">
                  <div class="ap-it-title">{{ row.artifact!.title }}</div>
                  <div class="ap-it-meta">
                    <span class="ap-kind" :class="row.artifact!.kind === 'markdown' ? 'ap-kind--md' : 'ap-kind--html'">
                      {{ row.artifact!.kind === 'markdown' ? 'MD' : 'HTML' }}
                    </span>
                    <span class="ap-vcount">v{{ row.artifact!.versions.length }}</span>
                    <span>{{ relativeTime(row.artifact!.updatedAt) }}</span>
                  </div>
                </div>
                <button class="ap-it-del" title="Delete" @click.stop="onDeleteItem(row.artifact!.id)">🗑</button>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- DETAIL -->
      <div class="ap-detail">
        <template v-if="selected">
          <div class="ap-v-bar">
            <span class="ap-d-name">{{ selected.title }}</span>
            <span class="ap-v-spacer"></span>
            <button class="ap-v-step" title="Older" @click="stepVersion(-1)">‹</button>
            <label class="ap-v-sel" title="Version">
              <select
                :value="shownVersion ? shownVersion.version : latestVersionNumber"
                @change="viewer.setVersion(Number(($event.target as HTMLSelectElement).value))"
              >
                <option v-for="v in selected.versions" :key="v.version" :value="v.version">
                  v{{ v.version }} of {{ selected.versions.length }}
                </option>
              </select>
            </label>
            <button class="ap-v-step" title="Newer" @click="stepVersion(1)">›</button>
          </div>

          <div v-if="isViewingOlder" class="ap-v-old">
            <span>👁 Viewing v{{ shownVersion!.version }} — not the latest.</span>
            <button class="ap-restore" @click="viewer.jumpToLatest()">Jump to latest ›</button>
          </div>

          <div class="ap-body">
            <!-- renderedHtml is always DOMPurify-sanitized in render-artifact.ts;
                 onDocClick keeps AI-authored links from navigating the app window. -->
            <div class="ap-doc" v-html="renderedHtml" @click="onDocClick"></div>
          </div>
        </template>
        <div v-else class="ap-detail-empty">
          <p>No artifact selected.</p>
          <p class="ap-detail-empty-sub">AI-authored artifacts for this session appear here.</p>
        </div>

        <div class="ap-foot">
          <button class="ap-btn" title="Save to a location you pick" :disabled="!selected" @click="onExport">⭳ Export…</button>
          <button class="ap-btn ap-btn--danger" title="Delete this artifact" :disabled="!selected" @click="onDeleteSelected">🗑 Delete</button>
          <span class="ap-grow"></span>
          <button class="ap-btn ap-btn--danger" title="Delete every artifact in this session" :disabled="count === 0" @click="onClearAll">Clear all</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.artifact-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border);
  min-width: 0;
  overflow: hidden;
}

/* header */
.ap-head { display: flex; align-items: center; gap: 8px; padding: 11px 12px; border-bottom: 1px solid var(--border); }
.ap-title { font-size: 0.95rem; font-weight: 600; }
.ap-count { font-size: 0.72rem; color: var(--text-secondary); }
.ap-spacer { flex: 1; }
.ap-ico { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 5px; border: 1px solid transparent; color: var(--text-secondary); font-size: 0.95rem; }
.ap-ico:hover { border-color: var(--border); color: var(--text-primary); background: var(--bg-tertiary); }

.ap-main { flex: 1; display: flex; min-height: 0; }

/* index rail */
.ap-rail { width: 214px; flex-shrink: 0; display: flex; flex-direction: column; border-right: 1px solid var(--border); background: var(--bg-secondary); }
.ap-rail--collapsed { width: 30px; }
.ap-rail-collapse { display: flex; align-items: center; justify-content: center; height: 30px; border-bottom: 1px solid var(--border); color: var(--text-dim); font-size: 0.8rem; cursor: pointer; }
.ap-rail-collapse:hover { color: var(--accent); }
.ap-rail-inner { flex: 1; display: flex; flex-direction: column; min-height: 0; }

.ap-rail-tools { padding: 8px; display: flex; flex-direction: column; gap: 6px; border-bottom: 1px solid var(--border); }
.ap-search { display: flex; align-items: center; gap: 6px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 6px; padding: 5px 8px; }
.ap-search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--focus); }
.ap-search input { flex: 1; min-width: 0; background: none; border: none; outline: none; color: var(--text-primary); font-size: 0.78rem; font-family: inherit; }
.ap-mag { color: var(--text-dim); font-size: 0.78rem; }
.ap-sort { display: flex; align-items: center; gap: 6px; font-size: 0.7rem; color: var(--text-secondary); }
.ap-sort select { flex: 1; background: var(--bg-primary); color: var(--text-secondary); border: 1px solid var(--border); border-radius: 5px; padding: 3px 6px; font-size: 0.7rem; font-family: inherit; }

.ap-rail-list { flex: 1; overflow-y: auto; padding: 4px 6px 8px; }
.ap-empty { font-size: 0.74rem; color: var(--text-dim); padding: 12px 8px; }
.ap-grp-h { font-size: 0.64rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); padding: 8px 6px 4px; position: sticky; top: 0; background: var(--bg-secondary); }
.ap-item { display: flex; gap: 7px; align-items: flex-start; padding: 7px 8px; border-radius: 7px; border: 1px solid transparent; cursor: pointer; margin-bottom: 2px; }
.ap-item:hover { background: var(--bg-tertiary); }
.ap-item:hover .ap-it-del { opacity: 1; }
.ap-item--active { background: rgba(79, 208, 139, 0.07); border-color: var(--accent); }
.ap-dot { width: 7px; height: 7px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; background: transparent; }
.ap-item--unread .ap-dot { background: var(--accent); }
.ap-it-body { flex: 1; min-width: 0; }
.ap-it-title { font-size: 0.8rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ap-it-meta { font-size: 0.66rem; color: var(--text-secondary); display: flex; gap: 6px; align-items: center; margin-top: 1px; }
.ap-kind { font-size: 0.58rem; padding: 0 5px; border-radius: 3px; background: var(--bg-tertiary); }
.ap-kind--md { color: var(--accent); }
.ap-kind--html { color: var(--blue, #6c8cff); }
.ap-vcount { color: var(--text-dim); }
.ap-it-del { opacity: 0; color: var(--text-dim); font-size: 0.8rem; margin-top: 2px; background: none; border: none; }
.ap-it-del:hover { color: var(--red, #ff6666); }

/* detail */
.ap-detail { flex: 1; display: flex; flex-direction: column; min-width: 0; background: var(--bg-primary); }
.ap-v-bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border); background: var(--bg-secondary); }
.ap-d-name { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ap-v-spacer { flex: 1; }
.ap-v-step { width: 24px; height: 24px; display: grid; place-items: center; border-radius: 4px; border: 1px solid var(--border); color: var(--text-secondary); font-size: 0.8rem; }
.ap-v-step:hover { border-color: var(--accent); color: var(--accent); }
.ap-v-sel { display: flex; align-items: center; border-radius: 5px; border: 1px solid var(--border); background: var(--bg-primary); }
.ap-v-sel select { background: none; border: none; outline: none; color: var(--text-primary); font-size: 0.74rem; padding: 4px 9px; font-family: inherit; }

.ap-v-old { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: rgba(108, 140, 255, 0.09); border-bottom: 1px solid #24304f; font-size: 0.72rem; color: #aeb9ff; }
.ap-restore { margin-left: auto; font-size: 0.68rem; color: var(--accent); border: 1px solid #1e3d2b; border-radius: 4px; padding: 3px 9px; background: none; }

.ap-body { flex: 1; overflow: auto; padding: 16px 18px; }
.ap-detail-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: var(--text-secondary); font-size: 0.82rem; }
.ap-detail-empty-sub { color: var(--text-dim); font-size: 0.74rem; }

/* rendered document */
.ap-doc :deep(h1), .ap-doc :deep(h2) { font-size: 1.05rem; margin: 0 0 10px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
.ap-doc :deep(h3) { font-size: 0.9rem; margin: 16px 0 6px; color: var(--accent); }
.ap-doc :deep(p) { font-size: 0.82rem; line-height: 1.6; color: #cfcfcf; margin: 6px 0; }
.ap-doc :deep(ul), .ap-doc :deep(ol) { margin: 6px 0; padding-left: 20px; }
.ap-doc :deep(li) { font-size: 0.82rem; line-height: 1.55; color: #cfcfcf; margin: 3px 0; }
.ap-doc :deep(code) { background: var(--bg-tertiary); padding: 1px 6px; border-radius: 3px; font-family: Consolas, monospace; font-size: 0.76rem; color: var(--accent); }
.ap-doc :deep(pre) { background: var(--bg-tertiary); padding: 10px 12px; border-radius: 6px; overflow: auto; }
.ap-doc :deep(pre code) { background: none; padding: 0; }
.ap-doc :deep(table) { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 0.76rem; }
.ap-doc :deep(th), .ap-doc :deep(td) { border: 1px solid var(--border); padding: 5px 9px; text-align: left; }
.ap-doc :deep(th) { background: var(--bg-tertiary); color: var(--text-secondary); }
.ap-doc :deep(a) { color: var(--blue, #6c8cff); }

/* footer */
.ap-foot { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-top: 1px solid var(--border); }
.ap-btn { font-size: 0.76rem; padding: 6px 12px; border-radius: 5px; border: 1px solid var(--border); background: var(--bg-tertiary); color: var(--text-primary); display: inline-flex; gap: 6px; align-items: center; }
.ap-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.ap-btn:disabled { opacity: 0.4; cursor: default; }
.ap-btn--danger:hover:not(:disabled) { border-color: var(--red-border, #c55); color: var(--red, #ff6666); }
.ap-grow { flex: 1; }
</style>
