<script setup lang="ts">
/**
 * ArtifactViewer.vue — right-docked master/detail artifact panel.
 *
 * Master: a collapsible index rail (search + sort + Today/Earlier groups,
 * unread dots, hover-delete). Detail: the selected artifact rendered to
 * sanitized HTML with a version bar (‹ › + dropdown + older-version banner).
 * Footer: Open externally / Export… / Copy reference / Delete.
 * Header: title + count + pop-out + close.
 *
 * Supports manual artifact creation: text notes, file attachments via
 * file picker / drag-and-drop / clipboard paste. Images render inline
 * via helm-img://; binary files show a metadata card with shell-open.
 *
 * The panel is bound to a single session via the `sessionId` prop; the shared
 * useArtifactViewer composable is told which session is active so a snap-out
 * window can render its own instance without cross-talk.
 */
import { computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useArtifactViewer } from '../../composables/useArtifactViewer.js';
import { useToast } from '../../composables/useToast.js';
import { renderArtifact } from '../../artifacts/render-artifact.js';
import { buildArtifactDocument, OPEN_URL_MESSAGE } from '../../artifacts/build-artifact-document.js';
import { formatHelmRef } from '../../lib/helm-ref.js';
import { artifactsClient, systemClient } from '../../ipc/clients.js';
import { clipboardFileInput } from '../../artifacts/clipboard-file.js';
import type { Artifact } from '../../../src/types/artifact.js';

const props = defineProps<{ sessionId: string }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'pop-out'): void;
}>();

const viewer = useArtifactViewer();
const { addToast } = useToast();

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

/** HTML artifacts render as their own isolated document, not inline. */
const isHtml = computed(() => selected.value?.kind === 'html');

// Markdown only: sanitized inline HTML for v-html. Empty for HTML artifacts,
// which keeps the mermaid watcher below correct without a second condition.
const renderedHtml = computed(() => {
  const a = selected.value;
  const v = shownVersion.value;
  if (!a || !v || isHtml.value) return '';
  return renderArtifact(a.kind, v.content);
});

// ── HTML artifacts: isolated document ───────────────────────────────────────

// Built in the renderer (DOMParser lives here), staged in main, then loaded by
// URL. It must be a real scheme rather than srcdoc: a local-scheme document
// inherits the embedder's CSP, and this window's `script-src 'self'` would
// silently stop the artifact's own scripts from ever running.
const frameSrc = ref('');
const frameRef = ref<HTMLIFrameElement | null>(null);

watch([selected, shownVersion], async () => {
  if (!isHtml.value || !shownVersion.value) {
    frameSrc.value = '';
    return;
  }
  const doc = buildArtifactDocument(shownVersion.value.content);
  const nonce = await artifactsClient.artifactPrepareRender(doc);
  frameSrc.value = `helm-artifact://doc/?k=${encodeURIComponent(nonce)}`;
}, { immediate: true });

/**
 * Links inside the frame are inert (sandbox blocks navigation, CSP blocks
 * loads), so the frame reports clicks here instead — same external-open
 * behaviour as the markdown path.
 *
 * The frame has an opaque origin, so `event.origin` is the string "null" and is
 * useless as a gate; identity of the sending window is the real check.
 */
function onFrameMessage(e: MessageEvent): void {
  if (e.source !== frameRef.value?.contentWindow) return;
  const data = e.data as { type?: string; url?: string } | null;
  if (data?.type !== OPEN_URL_MESSAGE) return;
  const url = data.url ?? '';
  if (/^https?:\/\//i.test(url)) void systemClient.systemOpenExternalUrl(url);
}

// ── Mermaid diagrams ────────────────────────────────────────────────────────
const docRef = ref<HTMLElement | null>(null);
let mermaidReady = false;

async function renderMermaid(): Promise<void> {
  const root = docRef.value;
  if (!root) return;
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('pre.mermaid:not([data-processed])'));
  if (nodes.length === 0) return;
  try {
    const mermaid = (await import('mermaid')).default;
    if (!mermaidReady) {
      mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' });
      mermaidReady = true;
    }
    await mermaid.run({ nodes });
  } catch (err) {
    console.error('[ArtifactViewer] mermaid render failed', err);
  }
}

watch(renderedHtml, () => { void nextTick(renderMermaid); });

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

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

interface RailRow { kind: 'header' | 'item'; label?: string; artifact?: Artifact }

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

/** Kind badge label: IMG for image-based markdown, BIN for binary, otherwise MD/HTML. */
function kindLabel(a: Artifact): string {
  if (a.source === 'manual') {
    const content = a.versions[a.versions.length - 1]?.content ?? '';
    if (content.startsWith('![')) return 'IMG';
    if (content.includes('Open in system viewer')) return 'BIN';
  }
  return a.kind === 'markdown' ? 'MD' : 'HTML';
}

const count = computed(() => artifacts.value.length);

// ── Actions ────────────────────────────────────────────────────────────────

function onSelect(id: string): void { viewer.select(id); }
function onExport(): void { if (selectedId.value) void viewer.export(selectedId.value); }

// Opens the version currently on screen (Export, by contrast, always writes the
// latest). The failure reason is shown inline rather than swallowed — some
// systems have no application registered for .md.
const openError = ref<string | null>(null);
async function onOpenExternal(): Promise<void> {
  const id = selectedId.value;
  if (!id) return;
  openError.value = null;
  const result = await viewer.openExternal(id, shownVersion.value?.version);
  if (!result.success) openError.value = result.error ?? 'Could not open externally';
}

// Footer delete is guarded by an inline confirm so it can't be a one-click accident.
const confirmDelete = ref(false);
function onConfirmDelete(): void {
  const id = selectedId.value;
  confirmDelete.value = false;
  if (id) void viewer.remove(id);
}
watch(selectedId, () => { confirmDelete.value = false; openError.value = null; });

async function onCopyRef(): Promise<void> {
  const a = selected.value;
  if (!a) return;
  try {
    await navigator.clipboard.writeText(formatHelmRef('artifact', { label: a.title, id: a.id }));
    addToast({ message: 'Reference copied', type: 'success' });
  } catch {
    addToast({ message: 'Copy failed', type: 'error' });
  }
}

/**
 * Intercept clicks on links inside the rendered artifact. The content is
 * AI-authored (untrusted) and lives in the privileged window, so we never
 * let a link navigate the app itself.
 */
function onDocClick(e: MouseEvent): void {
  const anchor = (e.target as HTMLElement | null)?.closest('a');
  if (!anchor) return;
  e.preventDefault();
  const href = anchor.getAttribute('href') ?? '';
  if (/^https?:\/\//i.test(href)) void systemClient.systemOpenExternalUrl(href);
}

// ── Manual creation: New button + dropdown ─────────────────────────────────

const showCreateMenu = ref(false);

function onCreateTextNote(): void {
  showCreateMenu.value = false;
  isCreatingText.value = true;
  newTextTitle.value = '';
  newTextContent.value = '';
}

async function onCreateFromClipboard(): Promise<void> {
  showCreateMenu.value = false;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      // Prefer a file-like representation when a clipboard item has both an
      // image/binary type and text/plain (common for copied screenshots).
      const fileType = item.types.find(type => type !== 'text/plain');
      if (fileType) {
        await createArtifactFromBlob(await item.getType(fileType));
        return;
      }
      if (!item.types.includes('text/plain')) continue;
      const text = await (await item.getType('text/plain')).text();
      if (text.trim()) {
        isCreatingText.value = true;
        newTextTitle.value = 'Pasted note';
        newTextContent.value = text;
      }
      return;
    }
    addToast({ message: 'No supported clipboard item', type: 'error' });
  } catch {
    addToast({ message: 'Could not read clipboard', type: 'error' });
  }
}

// ── Manual creation: text note editor ──────────────────────────────────────

const isCreatingText = ref(false);
const newTextTitle = ref('');
const newTextContent = ref('');

async function onSaveTextNote(): Promise<void> {
  const title = newTextTitle.value.trim() || 'Untitled note';
  const content = newTextContent.value;
  if (!content.trim()) return;
  const artifact = await viewer.createTextArtifact(title, content);
  if (artifact) {
    isCreatingText.value = false;
    newTextTitle.value = '';
    newTextContent.value = '';
    addToast({ message: 'Note created', type: 'success' });
  } else {
    addToast({ message: 'Failed to create note', type: 'error' });
  }
}

function onCancelTextNote(): void {
  isCreatingText.value = false;
  newTextTitle.value = '';
  newTextContent.value = '';
}

// ── Manual creation: file attach (file picker) ──────────────────────────────

async function onAttachFile(): Promise<void> {
  const artifact = await viewer.attachFile();
  if (artifact) {
    addToast({ message: 'File attached', type: 'success' });
  } else if (artifact === null) {
    // User cancelled the dialog — no toast needed
  } else {
    addToast({ message: 'Failed to attach file', type: 'error' });
  }
}

// ── Manual creation: paste handler (clipboard files and binary) ────────────

async function handlePaste(e: ClipboardEvent): Promise<void> {
  // Let editable controls keep their native paste behaviour.
  if (isCreatingText.value || isEditablePasteTarget(e.target)) return;

  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (!file) continue;
    e.preventDefault();
    e.stopPropagation();
    void createArtifactFromBlob(file, file.name);
    return;
  }
}

function isEditablePasteTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

async function createArtifactFromBlob(blob: Blob, filename?: string): Promise<void> {
  try {
    const input = await clipboardFileInput(blob, filename);
    const artifact = await viewer.createFileArtifact(input);
    if (artifact) {
      addToast({ message: input.contentType.startsWith('image/') ? 'Image pasted' : 'Clipboard file added', type: 'success' });
    } else {
      addToast({ message: 'Failed to add clipboard file', type: 'error' });
    }
  } catch {
    addToast({ message: 'Failed to process clipboard file', type: 'error' });
  }
}

// ── Manual creation: drag-and-drop ────────────────────────────────────────

const isDragOver = ref(false);

function onDragOver(e: DragEvent): void {
  if (e.dataTransfer?.types.includes('Files')) {
    e.preventDefault();
    isDragOver.value = true;
  }
}

function onDragLeave(): void {
  isDragOver.value = false;
}

async function onDrop(e: DragEvent): Promise<void> {
  e.preventDefault();
  isDragOver.value = false;
  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      await viewer.createFileArtifact(await clipboardFileInput(file, file.name));
    } catch {
      addToast({ message: `Failed to drop ${file.name}`, type: 'error' });
    }
  }
  if (files.length === 1) {
    addToast({ message: 'File added', type: 'success' });
  } else {
    addToast({ message: `${files.length} files added`, type: 'success' });
  }
}

// ── Inline title rename ────────────────────────────────────────────────────

const isRenaming = ref(false);
const renameTitle = ref('');

function onStartRename(): void {
  if (!selected.value) return;
  renameTitle.value = selected.value.title;
  isRenaming.value = true;
}

async function onCommitRename(): Promise<void> {
  const trimmed = renameTitle.value.trim();
  if (!trimmed || !selectedId.value) {
    isRenaming.value = false;
    return;
  }
  const success = await viewer.renameArtifact(selectedId.value, trimmed);
  isRenaming.value = false;
  if (!success) addToast({ message: 'Rename failed', type: 'error' });
}

// ── Session binding / lifecycle ────────────────────────────────────────────

onMounted(() => {
  viewer.ensureSubscribed();
  void viewer.setActiveSession(props.sessionId);
  void nextTick(renderMermaid);
  window.addEventListener('message', onFrameMessage);
});

onUnmounted(() => {
  window.removeEventListener('message', onFrameMessage);
});

watch(() => props.sessionId, (id) => { void viewer.setActiveSession(id); });
</script>

<template>
  <div class="artifact-panel" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop" @paste="handlePaste">
    <!-- Drop overlay -->
    <div v-if="isDragOver" class="ap-drop-overlay">
      <span class="ap-drop-icon">📎</span>
      <span class="ap-drop-label">Drop file to create artifact</span>
      <span class="ap-drop-sub">Images, documents, or any file</span>
    </div>

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
            <div class="ap-new-row">
              <div class="ap-create-dropdown">
                <button class="ap-btn-new" @click="showCreateMenu = !showCreateMenu">+ New ▾</button>
                <div v-if="showCreateMenu" class="dropdown-menu">
                  <button class="dropdown-item" @click="onCreateTextNote">📝 Text note</button>
                  <button class="dropdown-item" @click="onCreateFromClipboard">📋 Paste from clipboard</button>
                </div>
              </div>
              <button class="ap-btn-attach" title="Pick a file to attach" @click="onAttachFile">📎</button>
            </div>
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
                    <span
                      class="ap-kind"
                      :class="{
                        'ap-kind--md': kindLabel(row.artifact!) === 'MD',
                        'ap-kind--html': kindLabel(row.artifact!) === 'HTML',
                        'ap-kind--img': kindLabel(row.artifact!) === 'IMG',
                        'ap-kind--bin': kindLabel(row.artifact!) === 'BIN',
                      }"
                    >{{ kindLabel(row.artifact!) }}</span>
                    <span v-if="row.artifact!.source === 'manual'" class="ap-src">manual</span>
                    <span class="ap-vcount">v{{ row.artifact!.versions.length }}</span>
                    <span>{{ relativeTime(row.artifact!.updatedAt) }}</span>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- DETAIL -->
      <div class="ap-detail">
        <!-- Text note creation editor -->
        <template v-if="isCreatingText">
          <div class="ap-v-bar">
            <input
              v-model="newTextTitle"
              class="ap-create-title-input"
              placeholder="Note title…"
              autofocus
              @keydown.enter="onSaveTextNote"
              @keydown.escape="onCancelTextNote"
            />
            <span class="ap-v-spacer"></span>
            <button class="ap-btn" @click="onCancelTextNote">Cancel</button>
            <button class="ap-btn ap-btn--primary" :disabled="!newTextContent.trim()" @click="onSaveTextNote">💾 Save</button>
          </div>
          <textarea
            v-model="newTextContent"
            class="ap-create-body"
            placeholder="Write your note here…&#10;&#10;Supports **markdown** formatting."
            autofocus
          ></textarea>
        </template>

        <!-- Artifact view -->
        <template v-else-if="selected">
          <div class="ap-v-bar">
            <input
              v-if="isRenaming"
              v-model="renameTitle"
              class="ap-rename-input"
              @blur="onCommitRename"
              @keydown.enter="onCommitRename"
              @keydown.escape="isRenaming = false"
              autofocus
            />
            <span v-else class="ap-d-name ap-d-name--renameable" title="Double-click to rename" @dblclick="onStartRename">{{ selected.title }}</span>
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

          <div class="ap-body" :class="{ 'ap-body--frame': isHtml }">
            <!-- HTML artifacts: opaque-origin document, sandboxed on top. Scripts
                 run but cannot reach the app DOM, the preload bridge, or the network. -->
            <iframe
              v-if="isHtml"
              ref="frameRef"
              class="ap-frame"
              :src="frameSrc"
              sandbox="allow-scripts"
              referrerpolicy="no-referrer"
            ></iframe>
            <div v-else class="ap-doc" ref="docRef" v-html="renderedHtml" @click="onDocClick"></div>
          </div>
        </template>

        <!-- Empty state -->
        <div v-else class="ap-detail-empty">
          <p>No artifact selected.</p>
          <p class="ap-detail-empty-sub">
            Create notes, paste content, or drag files here.<br>
            AI-authored artifacts also appear here.
          </p>
          <button class="ap-btn ap-btn--primary" @click="showCreateMenu = true">+ New artifact</button>
        </div>

        <!-- Footer -->
        <div v-if="!isCreatingText" class="ap-foot">
          <button class="ap-btn" title="Open this version in your default app" :disabled="!selected" @click="onOpenExternal">⧉ Open externally</button>
          <button class="ap-btn" title="Save to a location you pick" :disabled="!selected" @click="onExport">⭳ Export…</button>
          <button class="ap-btn" title="Copy a reference an AI can resolve" :disabled="!selected" @click="onCopyRef">📋 Copy reference</button>
          <span v-if="openError" class="ap-foot-error">{{ openError }}</span>
          <span class="ap-grow"></span>
          <template v-if="confirmDelete">
            <span class="ap-foot-confirm">Delete?</span>
            <button class="ap-btn ap-btn--danger" title="Confirm delete" @click="onConfirmDelete">✓ Yes</button>
            <button class="ap-btn" title="Cancel" @click="confirmDelete = false">✕</button>
          </template>
          <button v-else class="ap-btn ap-btn--danger" title="Delete this artifact" :disabled="!selected" @click="confirmDelete = true">🗑 Delete</button>
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
  position: relative;
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

/* New + Attach row */
.ap-new-row { display: flex; gap: 6px; }
.ap-btn-new { flex: 1; font-size: 0.76rem; padding: 6px 10px; border-radius: 5px; border: 1px solid var(--accent); background: rgba(79,208,139,0.12); color: var(--accent); cursor: pointer; font-weight: 600; font-family: inherit; display: flex; align-items: center; justify-content: center; gap: 4px; }
.ap-btn-new:hover { background: rgba(79,208,139,0.22); }
.ap-btn-attach { font-size: 0.76rem; padding: 6px 10px; border-radius: 5px; border: 1px solid var(--border); background: var(--bg-tertiary); color: var(--text-primary); cursor: pointer; font-family: inherit; }
.ap-btn-attach:hover { border-color: var(--accent); color: var(--accent); }

/* Create dropdown */
.ap-create-dropdown { position: relative; }
.dropdown-menu { position: absolute; top: 100%; left: 0; right: 0; z-index: 50; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; margin-top: 4px; padding: 4px; box-shadow: 0 6px 20px rgba(0,0,0,0.5); }
.dropdown-item { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 4px; font-size: 0.76rem; color: var(--text-primary); cursor: pointer; border: none; background: none; width: 100%; text-align: left; font-family: inherit; }
.dropdown-item:hover { background: rgba(79,208,139,0.12); color: var(--accent); }

.ap-search { display: flex; align-items: center; gap: 6px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 6px; padding: 5px 8px; }
.ap-search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--focus); }
.ap-search input { flex: 1; min-width: 0; background: none; border: none; outline: none; color: var(--text-primary); font-size: 0.78rem; font-family: inherit; }
.ap-mag { color: var(--text-dim); font-size: 0.78rem; }
.ap-sort { display: flex; align-items: center; gap: 6px; font-size: 0.7rem; color: var(--text-secondary); }
.ap-sort select { flex: 1; background: var(--bg-primary); color: var(--text-secondary); border: 1px solid var(--border); border-radius: 5px; padding: 3px 6px; font-size: 0.7rem; font-family: inherit; color-scheme: dark; }
.ap-sort select option { background: var(--bg-secondary); color: var(--text-primary); }

.ap-rail-list { flex: 1; overflow-y: auto; padding: 4px 6px 8px; }
.ap-empty { font-size: 0.74rem; color: var(--text-dim); padding: 12px 8px; }
.ap-grp-h { font-size: 0.64rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); padding: 8px 6px 4px; position: sticky; top: 0; background: var(--bg-secondary); }
.ap-item { display: flex; gap: 7px; align-items: flex-start; padding: 7px 8px; border-radius: 7px; border: 1px solid transparent; cursor: pointer; margin-bottom: 2px; }
.ap-item:hover { background: var(--bg-tertiary); }
.ap-item--active { background: rgba(79, 208, 139, 0.07); border-color: var(--accent); }
.ap-dot { width: 7px; height: 7px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; background: transparent; }
.ap-item--unread .ap-dot { background: var(--accent); }
.ap-it-body { flex: 1; min-width: 0; }
.ap-it-title { font-size: 0.8rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ap-it-meta { font-size: 0.66rem; color: var(--text-secondary); display: flex; gap: 6px; align-items: center; margin-top: 1px; }
.ap-kind { font-size: 0.58rem; padding: 0 5px; border-radius: 3px; background: var(--bg-tertiary); }
.ap-kind--md { color: var(--accent); }
.ap-kind--html { color: var(--blue, #6c8cff); }
.ap-kind--img { color: #a78bfa; }
.ap-kind--bin { color: #ffb347; }
.ap-vcount { color: var(--text-dim); }
.ap-src { color: var(--text-dim); font-size: 0.58rem; font-style: italic; }

/* detail */
.ap-detail { flex: 1; display: flex; flex-direction: column; min-width: 0; background: var(--bg-primary); }
.ap-v-bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border); background: var(--bg-secondary); }
.ap-d-name { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ap-d-name--renameable:hover { color: var(--accent); cursor: text; }
.ap-v-spacer { flex: 1; }
.ap-v-step { width: 24px; height: 24px; display: grid; place-items: center; border-radius: 4px; border: 1px solid var(--border); color: var(--text-secondary); font-size: 0.8rem; }
.ap-v-step:hover { border-color: var(--accent); color: var(--accent); }
.ap-v-sel { display: flex; align-items: center; border-radius: 5px; border: 1px solid var(--border); background: var(--bg-primary); }
.ap-v-sel select { background: none; border: none; outline: none; color: var(--text-primary); font-size: 0.74rem; padding: 4px 9px; font-family: inherit; color-scheme: dark; }
.ap-v-sel select option { background: var(--bg-secondary); color: var(--text-primary); }

.ap-v-old { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: rgba(108, 140, 255, 0.09); border-bottom: 1px solid #24304f; font-size: 0.72rem; color: #aeb9ff; }
.ap-restore { margin-left: auto; font-size: 0.68rem; color: var(--accent); border: 1px solid #1e3d2b; border-radius: 4px; padding: 3px 9px; background: none; }

.ap-body { flex: 1; overflow: auto; padding: 16px 18px; }
/* HTML artifacts own their whole viewport and scroll inside the frame. */
.ap-body--frame { overflow: hidden; padding: 0; }
.ap-frame { width: 100%; height: 100%; border: 0; display: block; background: var(--bg-primary); }
.ap-detail-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; }
.ap-detail-empty-sub { color: var(--text-dim); font-size: 0.74rem; text-align: center; line-height: 1.5; }

/* text creation editor */
.ap-create-title-input { flex: 1; min-width: 0; background: var(--bg-primary); border: 1px solid var(--accent); border-radius: 4px; padding: 5px 8px; color: var(--text-primary); font-size: 0.82rem; font-family: inherit; outline: none; box-shadow: 0 0 0 3px var(--focus); }
.ap-create-body { flex: 1; background: var(--bg-secondary); border: none; border-top: 1px solid var(--border); padding: 16px 18px; color: var(--text-primary); font-size: 0.82rem; font-family: inherit; outline: none; resize: none; line-height: 1.6; }
.ap-create-body:focus { box-shadow: inset 0 0 0 2px rgba(79,208,139,0.1); }

/* rename input */
.ap-rename-input { flex: 1; min-width: 0; background: var(--bg-primary); border: 1px solid var(--accent); border-radius: 4px; padding: 2px 6px; color: var(--text-primary); font-size: 0.82rem; font-family: inherit; outline: none; box-shadow: 0 0 0 3px var(--focus); }

/* drop overlay */
.ap-drop-overlay { position: absolute; inset: 0; z-index: 40; background: rgba(79,208,139,0.08); border: 2px dashed var(--accent); border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; pointer-events: none; }
.ap-drop-icon { font-size: 2rem; }
.ap-drop-label { font-size: 0.9rem; color: var(--accent); font-weight: 600; }
.ap-drop-sub { font-size: 0.74rem; color: var(--text-secondary); }

/* rendered document */
.ap-doc :deep(h1), .ap-doc :deep(h2) { font-size: 1.05rem; margin: 0 0 10px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
.ap-doc :deep(h3) { font-size: 0.9rem; margin: 16px 0 6px; color: var(--accent); }
.ap-doc :deep(p) { font-size: 0.82rem; line-height: 1.6; color: #cfcfcf; margin: 6px 0; }
.ap-doc :deep(ul), .ap-doc :deep(ol) { margin: 6px 0; padding-left: 20px; }
.ap-doc :deep(li) { font-size: 0.82rem; line-height: 1.55; color: #cfcfcf; margin: 3px 0; }
.ap-doc :deep(code) { background: var(--bg-tertiary); padding: 1px 6px; border-radius: 3px; font-family: Consolas, monospace; font-size: 0.76rem; color: var(--accent); }
.ap-doc :deep(pre) { background: var(--bg-tertiary); padding: 10px 12px; border-radius: 6px; overflow: auto; }
.ap-doc :deep(pre code) { background: none; padding: 0; }
.ap-doc :deep(pre.mermaid) { background: transparent; padding: 8px 0; text-align: center; overflow-x: auto; }
.ap-doc :deep(pre.mermaid svg) { max-width: 100%; height: auto; }
.ap-doc :deep(table) { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 0.76rem; }
.ap-doc :deep(th), .ap-doc :deep(td) { border: 1px solid var(--border); padding: 5px 9px; text-align: left; }
.ap-doc :deep(th) { background: var(--bg-tertiary); color: var(--text-secondary); }
.ap-doc :deep(a) { color: var(--blue, #6c8cff); }
.ap-doc :deep(img) { max-width: 100%; border-radius: 6px; border: 1px solid var(--border); }

/* footer */
.ap-foot { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-top: 1px solid var(--border); }
.ap-btn { font-size: 0.76rem; padding: 6px 12px; border-radius: 5px; border: 1px solid var(--border); background: var(--bg-tertiary); color: var(--text-primary); display: inline-flex; gap: 6px; align-items: center; }
.ap-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.ap-btn:disabled { opacity: 0.4; cursor: default; }
.ap-btn--primary { border-color: var(--accent); background: rgba(79,208,139,0.12); color: var(--accent); font-weight: 600; }
.ap-btn--primary:hover:not(:disabled) { background: rgba(79,208,139,0.22); }
.ap-btn--danger:hover:not(:disabled) { border-color: var(--red-border, #c55); color: var(--red, #ff6666); }
.ap-btn { cursor: pointer; font-family: inherit; }
.ap-foot-confirm { font-size: 0.74rem; color: var(--text-primary); }
.ap-foot-error { font-size: 0.74rem; color: var(--red, #ff6666); }
.ap-grow { flex: 1; }
</style>
