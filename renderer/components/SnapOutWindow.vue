<script setup lang="ts">
/**
 * SnapOutWindow.vue — Full terminal view for a snapped-out session.
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { TerminalView } from '../terminal/terminal-view.js';
import { fitAndSyncPty } from '../terminal/fit-and-sync-pty.js';
import { useTerminalKeys } from '../composables/useTerminalKeys.js';
import { slotToIndex } from '../composables/useNumberAccelerator.js';
import { registerKeyHandler } from '../keyboard/router.js';
import { createNumberKeyHandlers } from '../keyboard/handlers/number-keys.js';
import { installSinglePaneKeyRouter } from '../keyboard/install.js';
import { PANE_TERMINAL } from '../dock-types.js';
import { useAppStore } from '../stores/app.js';
import { useChipBarStore } from '../stores/chip-bar.js';
import { deliverBulkText, deliverViaClipboardPaste } from '../paste-handler.js';
import { deliverPromptSequence } from '../sequence-delivery.js';
import { contextMenu, promptTree, hidePromptTree } from '../stores/modal-bridge.js';
import { useEditorPopupStore } from '../stores/editor-popup.js';
import { usePromptApplyFlow } from '../composables/usePromptApplyFlow.js';
import { useModalKeyboardBridge } from '../composables/useModalKeyboardBridge.js';
import EditorPopup from './modals/EditorPopup.vue';
import PromptTreeModal from './modals/PromptTreeModal.vue';
import { loadStoredSessions } from '../session-store.js';
import { getCliDisplayName } from '../utils.js';
import TerminalChips from './chips/TerminalChips.vue';
import ContextMenu from './modals/ContextMenu.vue';
import EscProtectionModal from './modals/EscProtectionModal.vue';
import DraftEditor from './panels/DraftEditor.vue';
import {
  setPlanEditorOpener as setChipBarPlanEditorOpener,
} from '../stores/chip-bar.js';
import {
  setDraftEditorOpener as setDraftEditorCompatibilityOpener,
  setPlanEditorOpener as setPlanEditorCompatibilityOpener,
  setDraftEditorCloser as setDraftEditorCompatibilityCloser,
  setDraftEditorVisibilityChecker as setDraftEditorCompatibilityVisibilityChecker,
  setDraftEditorButtonHandler as setDraftEditorCompatibilityButtonHandler,
  setPlanChangesChecker as setPlanCompatibilityChangesChecker,
} from '../stores/draft-editor-registry.js';
import { saveDraftWithStableId } from '../drafts/draft-save.js';
import { configClient, draftsClient, eventsClient, sessionsClient, terminalClient } from '../ipc/clients.js';

const props = defineProps<{ sessionId: string }>();
const containerRef = ref<HTMLElement | null>(null);
let view: TerminalView | null = null;
let unsubData: (() => void) | null = null;
let unsubExit: (() => void) | null = null;
let unsubSessionUpdated: (() => void) | null = null;
let cancelFit: (() => void) | null = null;
let fitDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let terminalReleased = false;
const sessionInfo = ref<any | null>(null);
const appStore = useAppStore();
const editorPopupStore = useEditorPopupStore();
const { handler: handleModalKeyboardBridge } = useModalKeyboardBridge();
// Prompt-template apply flow — same picker → editor → deliver path as the main
// window (shared composable, no duplicated logic). Popout always targets its
// own session.
const { openPromptPicker, handlePromptTreeSelect } = usePromptApplyFlow(() => props.sessionId);

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

const contextMenuVisible = ref(false);
const contextMenuHasSelection = ref(false);
const contextMenuSelectedText = ref('');

async function getEscProtectionEnabled(): Promise<boolean> {
  try { return await configClient.configGetEscProtectionEnabled(); }
  catch (error) { console.error('Failed to get ESC protection setting for snapped-out window:', error); return true; }
}

useTerminalKeys({ getActiveSessionId: () => props.sessionId, getEscProtectionEnabled });

// Ctrl+<n>: ask the main window to focus the Nth session wherever it lives.
// Alt+<n>: fire the Nth chip action for this popped-out session.
// Resolution is async (round-trip to the main window), so Ctrl+<n> is always
// consumed here — it is reserved for navigation in a popout and must never
// leak a digit into the terminal, even when the slot maps to nothing.
const numberKeyHandlers = createNumberKeyHandlers({
  jumpToSession: (slot) => { void sessionsClient.sessionRequestFocusSlot(slot); return true; },
  fireChipAction: (slot) => {
    const action = chipBarStore.actions[slotToIndex(slot)];
    if (!action) return false;
    void chipBarStore.triggerAction(action.sequence);
    return true;
  },
});

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
    const savedDraftId = await saveDraftWithStableId(draftsClient, sessionId, draftId, payload);
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
    try { await draftsClient.draftDelete(draftId); }
    catch (err) { console.error('[SnapOut] Failed to delete draft after apply:', err); }
  }
  await chipBarStore.refresh(sessionId);
}

async function onDraftDelete(): Promise<void> {
  const sessionId = draftEditorSessionId.value;
  const draftId = draftEditorDraftId.value;
  closeDraftEditor();
  if (draftId) {
    try { await draftsClient.draftDelete(draftId); }
    catch (err) { console.error('[SnapOut] Failed to delete draft:', err); }
  }
  await chipBarStore.refresh(sessionId);
}

function onDraftClose(): void { closeDraftEditor(); }

onMounted(async () => {
  if (!containerRef.value) return;
  const sessions = await loadStoredSessions();
  const session = sessions.find((s: any) => s.id === props.sessionId);
  if (session) {
    sessionInfo.value = session;
    appStore.upsertSession(session);
    appStore.setActiveSessionId(props.sessionId);
    updateWindowTitle();
  }

  const attachResult = await terminalClient.terminalAttach?.(props.sessionId);
  if (attachResult && !attachResult.success) {
    console.error('[SnapOut] Failed to attach terminal ownership:', attachResult.error);
    try { await sessionsClient.sessionSnapBack(props.sessionId); }
    catch (error) { console.error('[SnapOut] Failed to recover after attach failure:', error); }
    return;
  }

  // Register the output listener before constructing xterm. The PTY can emit
  // while the child is attaching; replay from the main process covers prior
  // output and this short queue covers the handoff race.
  const pendingOutput: string[] = [];
  unsubData = eventsClient.onPtyData((sessionId: string, data: string) => {
    if (sessionId !== props.sessionId) return;
    if (view) view.write(data);
    else pendingOutput.push(data);
  });

  view = new TerminalView({
    sessionId: props.sessionId,
    container: containerRef.value,
    onData: (data) => { terminalClient.ptyWrite?.(props.sessionId, data); },
    onScrollInput: (data) => { terminalClient.ptyScrollInput?.(props.sessionId, data); },
    onResize: (cols, rows) => { terminalClient.ptyResize?.(props.sessionId, cols, rows); },
    onTitleChange: (title) => { if (sessionInfo.value) sessionInfo.value = { ...sessionInfo.value, title }; updateWindowTitle(); },
  });

  if (attachResult?.replay) view.write(attachResult.replay);
  for (const data of pendingOutput) view.write(data);
  pendingOutput.length = 0;
  unsubExit = eventsClient.onPtyExit((sessionId: string) => { if (sessionId === props.sessionId) view?.write('\r\n\x1b[33m[Process exited]\x1b[0m\r\n'); });
  unsubSessionUpdated = eventsClient.onSessionUpdated?.((updatedSession: any) => {
    if (updatedSession?.id !== props.sessionId) return;
    sessionInfo.value = updatedSession;
    appStore.upsertSession(updatedSession);
    updateWindowTitle();
  }) ?? null;

  const syncFit = () => {
    if (!view) return;
    cancelFit?.();
    cancelFit = fitAndSyncPty(
      props.sessionId,
      view,
      (id, cols, rows) => terminalClient.ptyResize?.(id, cols, rows),
    );
  };
  const debouncedFit = () => {
    if (fitDebounceTimer !== null) clearTimeout(fitDebounceTimer);
    fitDebounceTimer = setTimeout(() => { fitDebounceTimer = null; syncFit(); }, 50);
  };

  syncFit();
  view.focus();
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => debouncedFit()) : null;
  if (resizeObserver && containerRef.value) resizeObserver.observe(containerRef.value);
  const handleResize = () => debouncedFit();
  window.addEventListener('resize', handleResize);
  await chipBarStore.refresh(props.sessionId);

  setDraftEditorCompatibilityOpener(openDraftEditor);
  setPlanEditorCompatibilityOpener(() => {});
  setDraftEditorCompatibilityCloser(closeDraftEditor);
  setDraftEditorCompatibilityVisibilityChecker(() => draftEditorVisible.value && draftEditorRef.value !== null);
  setDraftEditorCompatibilityButtonHandler((button: string) => { draftEditorRef.value?.handleButton(button); });
  setPlanCompatibilityChangesChecker(() => draftEditorRef.value?.hasUnsavedChanges?.() ?? false);
  setChipBarPlanEditorOpener(() => {});

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    contextMenuSelectedText.value = view?.getSelection() ?? '';
    contextMenuHasSelection.value = view?.hasSelection() ?? false;
    contextMenu.visible = true;
    contextMenu.selectedText = contextMenuSelectedText.value;
    contextMenu.hasSelection = contextMenuHasSelection.value;
    contextMenu.sourceSessionId = props.sessionId;
    contextMenuVisible.value = true;
  };
  containerRef.value.addEventListener('contextmenu', handleContextMenu);

  // This window is nothing but a terminal, so its one pane is always focused
  // and visible. The modal bridge registers at `modal` scope, which is what
  // guarantees an open picker outranks the terminal without a listener race.
  const unregisterModalBridge = registerKeyHandler({
    id: 'modal-stack-bridge',
    scope: 'modal',
    handle: (ctx) => handleModalKeyboardBridge(ctx.event),
  });
  const unregisterNumberKeys = numberKeyHandlers.map(registerKeyHandler);
  const uninstallRouter = installSinglePaneKeyRouter(PANE_TERMINAL, () => props.sessionId);

  onUnmounted(() => {
    window.removeEventListener('resize', handleResize);
    unregisterModalBridge();
    for (const unregister of unregisterNumberKeys) unregister();
    uninstallRouter();
    containerRef.value?.removeEventListener('contextmenu', handleContextMenu);
    resizeObserver?.disconnect();
    if (fitDebounceTimer !== null) clearTimeout(fitDebounceTimer);
    fitDebounceTimer = null;
    cancelFit?.();
    cancelFit = null;
  });
});

onUnmounted(() => {
  terminalReleased = true;
  unsubData?.();
  unsubExit?.();
  unsubSessionUpdated?.();
  view?.dispose();
  view = null;
});


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
    case 'prompts':
      void openPromptPicker();
      break;
    case 'snap-back':
      try {
        if (!terminalReleased) {
          await terminalClient.terminalDetach?.(props.sessionId);
          terminalReleased = true;
        }
        await sessionsClient.sessionSnapBack(props.sessionId);
      }
      catch (error) { console.error('Failed to snap back:', error); }
      break;
  }
}

function onContextMenuCancel(): void { contextMenuVisible.value = false; }
</script>

<template>
  <div class="snap-out-window" id="mainArea">
    <DraftEditor v-if="draftEditorVisible" ref="draftEditorRef" :visible="draftEditorVisible" :mode="draftEditorMode" :session-id="draftEditorSessionId" :draft-id="draftEditorDraftId" :initial-label="draftEditorLabel" :initial-text="draftEditorText" :plan-status="draftEditorPlanStatus" :plan-state-info="draftEditorPlanStateInfo" :plan-callbacks="draftEditorPlanCallbacks" @save="onDraftSave" @apply="onDraftApply" @delete="onDraftDelete" @close="onDraftClose" />
    <div class="snap-out-body">
      <div ref="containerRef" class="snap-out-terminal"></div>
    </div>
    <TerminalChips />
    <ContextMenu v-model:visible="contextMenuVisible" :has-selection="contextMenuHasSelection" :has-active-session="true" :has-sequences="false" :has-drafts="false" :is-snapped-out="true" @action="onContextMenuAction" @cancel="onContextMenuCancel" />
    <PromptTreeModal
      v-model:visible="promptTree.visible"
      :tree="promptTree.tree"
      @select="handlePromptTreeSelect"
      @cancel="hidePromptTree()"
    />
    <EditorPopup
      :visible="editorPopupStore.visible"
      :initial-text="editorPopupStore.initialText"
      :has-prefill="editorPopupStore.hasPrefill"
      :select-node-id="editorPopupStore.selectNodeId"
      @update:visible="editorPopupStore.setVisible"
      @send="editorPopupStore.handleSend"
      @close="editorPopupStore.handleClose"
    />
    <EscProtectionModal />
  </div>
</template>

<style scoped>
.snap-out-window { width: 100vw; height: 100vh; background: #0a0a0a; display: flex; flex-direction: column; }
.snap-out-body { flex: 1; min-height: 0; display: flex; flex-direction: row; }
.snap-out-terminal { flex: 1; min-width: 0; min-height: 0; position: relative; overflow: hidden; z-index: 1; }
</style>
