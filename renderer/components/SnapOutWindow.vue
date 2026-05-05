<script setup lang="ts">
/**
 * SnapOutWindow.vue — Full terminal view for a snapped-out session.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { TerminalView } from '../terminal/terminal-view.js';
import { useKeyboardRelay } from '../composables/useKeyboardRelay.js';
import { useChipBarStore } from '../stores/chip-bar.js';
import { deliverBulkText, deliverViaClipboardPaste } from '../paste-handler.js';
import { deliverPromptSequence } from '../sequence-delivery.js';
import { contextMenu } from '../stores/modal-bridge.js';
import { state } from '../state.js';
import { getCliDisplayName } from '../utils.js';
import ChipBar from './chips/ChipBar.vue';
import ChipActionBar from './chips/ChipActionBar.vue';
import ContextMenu from './modals/ContextMenu.vue';
import EscProtectionModal from './modals/EscProtectionModal.vue';
import DraftEditor from './panels/DraftEditor.vue';
import {
  setDraftEditorOpener as setChipBarDraftEditorOpener,
  setPlanEditorOpener as setChipBarPlanEditorOpener,
} from '../stores/chip-bar.js';
import {
  setDraftEditorOpener as setLegacyDraftEditorOpener,
  setPlanEditorOpener as setLegacyPlanEditorOpener,
  setDraftEditorCloser as setLegacyDraftEditorCloser,
  setDraftEditorVisibilityChecker as setLegacyDraftEditorVisibilityChecker,
  setDraftEditorButtonHandler as setLegacyDraftEditorButtonHandler,
  setPlanChangesChecker as setLegacyPlanChangesChecker,
} from '../drafts/draft-editor.js';
import { saveDraftWithStableId } from '../drafts/draft-save.js';

const props = defineProps<{ sessionId: string }>();
const containerRef = ref<HTMLElement | null>(null);
let view: TerminalView | null = null;
let unsubData: (() => void) | null = null;
let unsubExit: (() => void) | null = null;
let unsubSessionUpdated: (() => void) | null = null;
const sessionInfo = ref<any | null>(null);

const draftEditorVisible = ref(false);
const draftEditorMode = ref<'draft' | 'plan'>('draft');
const draftEditorSessionId = ref('');
const draftEditorDraftId = ref<string | null>(null);
const draftEditorLabel = ref('');
const draftEditorText = ref('');
const draftEditorPlanStatus = ref<import('../../src/types/plan.js').PlanStatus>('planning');
const draftEditorPlanStateInfo = ref('');
const draftEditorPlanCallbacks = ref<import('./panels/DraftEditor.vue').PlanCallbacks | null>(null);
const draftEditorRef = ref<InstanceType<typeof DraftEditor> | null>(null);

const chipBarStore = useChipBarStore();
const chipBarDrafts = computed(() => chipBarStore.drafts.map((draft) => ({ id: draft.id, title: draft.label })));
const chipBarPlans = computed(() => chipBarStore.plans);
const chipBarHasPills = computed(() => chipBarDrafts.value.length > 0 || chipBarPlans.value.length > 0);
const chipActionBarVisible = computed(() => chipBarHasPills.value || chipBarStore.actions.length > 0);

const contextMenuVisible = ref(false);
const contextMenuHasSelection = ref(false);
const contextMenuSelectedText = ref('');

async function getEscProtectionEnabled(): Promise<boolean> {
  try { return await window.gamepadCli.configGetEscProtectionEnabled(); }
  catch (error) { console.error('Failed to get ESC protection setting for snapped-out window:', error); return true; }
}

useKeyboardRelay({ getActiveSessionId: () => props.sessionId, getEscProtectionEnabled });

function getFolderLabel(workingDir?: string): string {
  if (!workingDir) return 'No Folder';
  const parts = workingDir.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] || workingDir;
}

function updateWindowTitle(): void {
  if (!sessionInfo.value) { document.title = 'Snapped Out'; return; }
  const cliLabel = getCliDisplayName(sessionInfo.value.cliType || '') || sessionInfo.value.cliType || 'Unknown CLI';
  document.title = `${sessionInfo.value.name} - ${cliLabel} - ${getFolderLabel(sessionInfo.value.workingDir)}`;
}

function openDraftEditor(sessionId: string, draft?: { id: string; label: string; text: string }) {
  draftEditorMode.value = 'draft';
  draftEditorSessionId.value = sessionId;
  draftEditorDraftId.value = draft?.id ?? null;
  draftEditorLabel.value = draft?.label ?? '';
  draftEditorText.value = draft?.text ?? '';
  draftEditorPlanCallbacks.value = null;
  draftEditorVisible.value = true;
}

function closeDraftEditor() {
  draftEditorPlanCallbacks.value?.onClose?.();
  draftEditorVisible.value = false;
}

async function onDraftSave(payload: { label: string; text: string }): Promise<void> {
  const sessionId = draftEditorSessionId.value;
  const draftId = draftEditorDraftId.value;
  try {
    const savedDraftId = await saveDraftWithStableId(window.gamepadCli, sessionId, draftId, payload);
    if (!draftId && savedDraftId) draftEditorDraftId.value = savedDraftId;
  } catch (err) {
    console.error('[SnapOut] Failed to save draft:', err);
  }
  await chipBarStore.refresh(sessionId);
}

async function onDraftApply(payload: { label: string; text: string }): Promise<void> {
  const sessionId = draftEditorSessionId.value;
  const draftId = draftEditorDraftId.value;
  closeDraftEditor();
  if (payload.text && sessionId) {
    try {
      await deliverPromptSequence(sessionId, payload.text);
    } catch (err) {
      console.error('[SnapOut] Failed to apply draft:', err);
    }
  }
  if (draftId) {
    try { await window.gamepadCli?.draftDelete(draftId); }
    catch (err) { console.error('[SnapOut] Failed to delete draft after apply:', err); }
  }
  await chipBarStore.refresh(sessionId);
}

async function onDraftDelete(): Promise<void> {
  const sessionId = draftEditorSessionId.value;
  const draftId = draftEditorDraftId.value;
  closeDraftEditor();
  if (draftId) {
    try { await window.gamepadCli?.draftDelete(draftId); }
    catch (err) { console.error('[SnapOut] Failed to delete draft:', err); }
  }
  await chipBarStore.refresh(sessionId);
}

function onDraftClose(): void { closeDraftEditor(); }

onMounted(async () => {
  if (!containerRef.value) return;
  const sessions = await window.gamepadCli.sessionGetAll();
  const session = sessions.find((s: any) => s.id === props.sessionId);
  if (session) {
    sessionInfo.value = session;
    const existingIndex = state.sessions.findIndex(s => s.id === props.sessionId);
    if (existingIndex >= 0) state.sessions[existingIndex] = session;
    else state.sessions.push(session);
    state.activeSessionId = props.sessionId;
    updateWindowTitle();
  }

  view = new TerminalView({
    sessionId: props.sessionId,
    container: containerRef.value,
    onData: (data) => { window.gamepadCli?.ptyWrite(props.sessionId, data); },
    onScrollInput: (data) => { window.gamepadCli?.ptyScrollInput?.(props.sessionId, data); },
    onResize: (cols, rows) => { window.gamepadCli?.ptyResize(props.sessionId, cols, rows); },
    onTitleChange: (title) => { if (sessionInfo.value) sessionInfo.value = { ...sessionInfo.value, title }; updateWindowTitle(); },
  });

  unsubData = window.gamepadCli.onPtyData((sessionId: string, data: string) => { if (sessionId === props.sessionId) view?.write(data); });
  unsubExit = window.gamepadCli.onPtyExit((sessionId: string) => { if (sessionId === props.sessionId) view?.write('\r\n\x1b[33m[Process exited]\x1b[0m\r\n'); });
  unsubSessionUpdated = window.gamepadCli.onSessionUpdated?.((updatedSession: any) => {
    if (updatedSession?.id !== props.sessionId) return;
    sessionInfo.value = updatedSession;
    const existingIndex = state.sessions.findIndex(s => s.id === props.sessionId);
    if (existingIndex >= 0) state.sessions[existingIndex] = updatedSession;
    else state.sessions.push(updatedSession);
    updateWindowTitle();
  }) ?? null;

  let fitDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedFit = () => {
    if (fitDebounceTimer !== null) clearTimeout(fitDebounceTimer);
    fitDebounceTimer = setTimeout(() => { fitDebounceTimer = null; view?.fit(); }, 50);
  };

  requestAnimationFrame(() => { requestAnimationFrame(() => { view?.fit(); view?.focus(); }); });
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => debouncedFit()) : null;
  if (resizeObserver && containerRef.value) resizeObserver.observe(containerRef.value);
  const handleResize = () => debouncedFit();
  window.addEventListener('resize', handleResize);
  await chipBarStore.refresh(props.sessionId);

  setLegacyDraftEditorOpener(openDraftEditor);
  setLegacyPlanEditorOpener(() => {});
  setLegacyDraftEditorCloser(closeDraftEditor);
  setLegacyDraftEditorVisibilityChecker(() => draftEditorVisible.value && draftEditorRef.value !== null);
  setLegacyDraftEditorButtonHandler((button: string) => { draftEditorRef.value?.handleButton(button); });
  setLegacyPlanChangesChecker(() => draftEditorRef.value?.hasUnsavedChanges?.() ?? false);
  setChipBarDraftEditorOpener(openDraftEditor);
  setChipBarPlanEditorOpener(() => {});

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    contextMenuSelectedText.value = view?.getSelection() ?? '';
    contextMenuHasSelection.value = view?.hasSelection() ?? false;
    contextMenu.visible = true;
    contextMenu.mode = 'mouse';
    contextMenu.mouseX = e.clientX;
    contextMenu.mouseY = e.clientY;
    contextMenu.selectedText = contextMenuSelectedText.value;
    contextMenu.hasSelection = contextMenuHasSelection.value;
    contextMenu.sourceSessionId = props.sessionId;
    contextMenuVisible.value = true;
  };
  containerRef.value.addEventListener('contextmenu', handleContextMenu);

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && contextMenuVisible.value) {
      e.preventDefault();
      contextMenuVisible.value = false;
    }
  };
  window.addEventListener('keydown', handleKeydown);

  onUnmounted(() => {
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('keydown', handleKeydown);
    containerRef.value?.removeEventListener('contextmenu', handleContextMenu);
    resizeObserver?.disconnect();
  });
});

onUnmounted(() => {
  unsubData?.();
  unsubExit?.();
  unsubSessionUpdated?.();
  view?.dispose();
  view = null;
});

function onChipBarDraftClick(draftId: string): void { chipBarStore.openDraft(draftId); }
function onChipBarPlanClick(planId: string): void { void chipBarStore.openPlan(planId); }
function onChipBarNewDraft(): void { chipBarStore.openNewDraft(); }
function onChipBarAction(sequence: string): void { void chipBarStore.triggerAction(sequence); }

async function onContextMenuAction(action: string): Promise<void> {
  contextMenuVisible.value = false;
  switch (action) {
    case 'copy': {
      const text = view?.getSelection() ?? '';
      if (text) navigator.clipboard.writeText(text);
      break;
    }
    case 'paste':
      navigator.clipboard.readText().then((text) => { if (text) void deliverBulkText(props.sessionId, text); });
      break;
    case 'editor': {
      const { showEditorPopup } = await import('../editor/editor-popup.js');
      showEditorPopup((text) => { void deliverPromptSequence(props.sessionId, text); });
      break;
    }
    case 'snap-back':
      try { await window.gamepadCli.sessionSnapBack(props.sessionId); }
      catch (error) { console.error('Failed to snap back:', error); }
      break;
    case 'drafts': {
      const { showDraftSubmenu } = await import('../modals/draft-submenu.js');
      const drafts = await window.gamepadCli.draftList(props.sessionId);
      showDraftSubmenu(drafts, {
        onNewDraft: () => openDraftEditor(props.sessionId),
        onApply: (draft) => {
          if (draft.text) void deliverPromptSequence(props.sessionId, draft.text);
          void window.gamepadCli.draftDelete(draft.id);
        },
        onEdit: (draft) => openDraftEditor(props.sessionId, draft),
        onDelete: (draft) => window.gamepadCli.draftDelete(draft.id),
      });
      break;
    }
  }
}

function onContextMenuCancel(): void { contextMenuVisible.value = false; }
</script>

<template>
  <div class="snap-out-window" id="mainArea">
    <ChipBar :drafts="chipBarDrafts" :plan-chips="chipBarPlans" :actions="[]" :visible="true" :show-new-draft="false" @draft-click="onChipBarDraftClick" @plan-chip-click="onChipBarPlanClick" @new-draft="onChipBarNewDraft" @action-click="onChipBarAction" />
    <DraftEditor v-if="draftEditorVisible" ref="draftEditorRef" :visible="draftEditorVisible" :mode="draftEditorMode" :session-id="draftEditorSessionId" :draft-id="draftEditorDraftId" :initial-label="draftEditorLabel" :initial-text="draftEditorText" :plan-status="draftEditorPlanStatus" :plan-state-info="draftEditorPlanStateInfo" :plan-callbacks="draftEditorPlanCallbacks" @save="onDraftSave" @apply="onDraftApply" @delete="onDraftDelete" @close="onDraftClose" />
    <div ref="containerRef" class="snap-out-terminal"></div>
    <div v-if="chipActionBarVisible" class="chip-action-dock"><ChipActionBar :actions="chipBarStore.actions" :show-new-draft="true" @new-draft="onChipBarNewDraft" @action-click="onChipBarAction" /></div>
    <ContextMenu v-model:visible="contextMenuVisible" :has-selection="contextMenuHasSelection" :has-active-session="true" :has-sequences="false" :has-drafts="chipBarDrafts.length > 0" :is-snapped-out="true" :mode="'mouse'" :mouse-x="contextMenu.mouseX" :mouse-y="contextMenu.mouseY" @action="onContextMenuAction" @cancel="onContextMenuCancel" />
    <EscProtectionModal />
  </div>
</template>

<style scoped>
.snap-out-window { width: 100vw; height: 100vh; background: #0a0a0a; display: flex; flex-direction: column; }
.snap-out-terminal { flex: 1; min-height: 0; position: relative; overflow: hidden; z-index: 1; }
.chip-action-dock { border-top: 1px solid #333; background: #1a1a1a; position: relative; z-index: 10; }
</style>
