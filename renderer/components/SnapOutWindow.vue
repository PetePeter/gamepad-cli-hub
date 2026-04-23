<script setup lang="ts">
/**
 * SnapOutWindow.vue — Full terminal view for a snapped-out session.
 *
 * Includes chip bar (drafts/plans), terminal, action bar, context menu
 * with snap-back, and draft/plan editor support.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { TerminalView } from '../terminal/terminal-view.js';
import { useKeyboardRelay } from '../composables/useKeyboardRelay.js';
import { useChipBarStore } from '../stores/chip-bar.js';
import { deliverBulkText } from '../paste-handler.js';
import { showDraftEditor, initDraftEditor } from '../drafts/draft-editor.js';
import { contextMenu } from '../stores/modal-bridge.js';
import { state } from '../state.js';
import { getCliDisplayName } from '../utils.js';
import ChipBar from './chips/ChipBar.vue';
import ChipActionBar from './chips/ChipActionBar.vue';
import ContextMenu from './modals/ContextMenu.vue';
import EscProtectionModal from './modals/EscProtectionModal.vue';

const props = defineProps<{
  sessionId: string;
}>();

const containerRef = ref<HTMLElement | null>(null);
let view: TerminalView | null = null;
let unsubData: (() => void) | null = null;
let unsubExit: (() => void) | null = null;
let unsubSessionUpdated: (() => void) | null = null;
const sessionInfo = ref<any | null>(null);

// Chip bar store
const chipBarStore = useChipBarStore();

const chipBarDrafts = computed(() =>
  chipBarStore.drafts.map((draft) => ({
    id: draft.id,
    title: draft.label,
  })),
);
const chipBarPlans = computed(() => chipBarStore.plans);
const chipBarHasPills = computed(() =>
  chipBarDrafts.value.length > 0 || chipBarPlans.value.length > 0,
);
const chipActionBarVisible = computed(() =>
  chipBarHasPills.value || chipBarStore.actions.length > 0,
);

// Context menu state
const contextMenuVisible = ref(false);
const contextMenuHasSelection = ref(false);
const contextMenuSelectedText = ref('');

async function getEscProtectionEnabled(): Promise<boolean> {
  try {
    return await window.gamepadCli.configGetEscProtectionEnabled();
  } catch (error) {
    console.error('Failed to get ESC protection setting for snapped-out window:', error);
    return true;
  }
}

useKeyboardRelay({
  getActiveSessionId: () => props.sessionId,
  getEscProtectionEnabled,
});

function getFolderLabel(workingDir?: string): string {
  if (!workingDir) return 'No Folder';
  const parts = workingDir.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] || workingDir;
}

function updateWindowTitle(): void {
  if (!sessionInfo.value) {
    document.title = 'Snapped Out';
    return;
  }
  const cliLabel = getCliDisplayName(sessionInfo.value.cliType || '') || sessionInfo.value.cliType || 'Unknown CLI';
  document.title = `${sessionInfo.value.name} - ${cliLabel} - ${getFolderLabel(sessionInfo.value.workingDir)}`;
}

onMounted(async () => {
  if (!containerRef.value) return;

  // Get session info and populate state.sessions so chip bar can resolve workingDir
  const sessions = await window.gamepadCli.sessionGetAll();
  const session = sessions.find((s: any) => s.id === props.sessionId);
  if (session) {
    sessionInfo.value = session;
    // Populate state.sessions so loadPlans() can find workingDir
    const existingIndex = state.sessions.findIndex(s => s.id === props.sessionId);
    if (existingIndex >= 0) {
      state.sessions[existingIndex] = session;
    } else {
      state.sessions.push(session);
    }
    // Set active session for chip bar and draft editor
    state.activeSessionId = props.sessionId;
    updateWindowTitle();
  }

  // Initialize draft editor DOM (appends to #mainArea or body)
  initDraftEditor();

  // Create terminal view (no PTY spawn — PTY already exists)
  view = new TerminalView({
    sessionId: props.sessionId,
    container: containerRef.value,
    onData: (data) => {
      window.gamepadCli?.ptyWrite(props.sessionId, data);
    },
    onScrollInput: (data) => {
      window.gamepadCli?.ptyScrollInput?.(props.sessionId, data);
    },
    onResize: (cols, rows) => {
      window.gamepadCli?.ptyResize(props.sessionId, cols, rows);
    },
    onTitleChange: (title) => {
      if (sessionInfo.value) {
        sessionInfo.value = { ...sessionInfo.value, title };
      }
      updateWindowTitle();
    },
  });

  // Subscribe to PTY data routed to this window
  unsubData = window.gamepadCli.onPtyData((sessionId: string, data: string) => {
    if (sessionId === props.sessionId) {
      view?.write(data);
    }
  });

  unsubExit = window.gamepadCli.onPtyExit((sessionId: string, _exitCode: number) => {
    if (sessionId === props.sessionId) {
      view?.write('\r\n\x1b[33m[Process exited]\x1b[0m\r\n');
    }
  });

  unsubSessionUpdated = window.gamepadCli.onSessionUpdated?.((updatedSession: any) => {
    if (updatedSession?.id !== props.sessionId) return;
    sessionInfo.value = updatedSession;
    const existingIndex = state.sessions.findIndex(s => s.id === props.sessionId);
    if (existingIndex >= 0) {
      state.sessions[existingIndex] = updatedSession;
    } else {
      state.sessions.push(updatedSession);
    }
    updateWindowTitle();
  }) ?? null;

  // Fit and focus
  view.fit();
  view.focus();

  // Force a resize to prompt CLI redraw (xterm.js starts blank)
  setTimeout(() => {
    view?.fit();
    const dims = (view as any)?.getDimensions?.();
    if (dims) {
      window.gamepadCli?.ptyResize(props.sessionId, dims.cols, dims.rows);
    }
  }, 100);

  // Load chip bar data for this session
  await chipBarStore.refresh(props.sessionId);

  // Handle window resize
  const handleResize = () => {
    view?.fit();
  };
  window.addEventListener('resize', handleResize);

  // Right-click context menu
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

  // ESC key to dismiss context menu
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (contextMenuVisible.value) {
        e.preventDefault();
        contextMenuVisible.value = false;
      }
    }
  };
  window.addEventListener('keydown', handleKeydown);

  onUnmounted(() => {
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('keydown', handleKeydown);
    containerRef.value?.removeEventListener('contextmenu', handleContextMenu);
  });
});

onUnmounted(() => {
  unsubData?.();
  unsubExit?.();
  unsubSessionUpdated?.();
  view?.dispose();
  view = null;
});

// Chip bar handlers
function onChipBarDraftClick(draftId: string): void {
  chipBarStore.openDraft(draftId);
}

function onChipBarPlanClick(planId: string): void {
  void chipBarStore.openPlan(planId);
}

function onChipBarNewDraft(): void {
  chipBarStore.openNewDraft();
}

function onChipBarAction(sequence: string): void {
  void chipBarStore.triggerAction(sequence);
}

// Context menu action handler
async function onContextMenuAction(action: string): Promise<void> {
  contextMenuVisible.value = false;
  switch (action) {
    case 'copy': {
      const text = view?.getSelection() ?? '';
      if (text) navigator.clipboard.writeText(text);
      break;
    }
    case 'paste':
      navigator.clipboard.readText().then((text) => {
        if (text) void deliverBulkText(props.sessionId, text);
      });
      break;
    case 'editor': {
      const { showEditorPopup } = await import('../editor/editor-popup.js');
      showEditorPopup((text) => {
        void deliverBulkText(props.sessionId, text);
      });
      break;
    }
    case 'snap-back':
      try {
        await window.gamepadCli.sessionSnapBack(props.sessionId);
      } catch (error) {
        console.error('Failed to snap back:', error);
      }
      break;
    case 'drafts': {
      const { showDraftSubmenu } = await import('../modals/draft-submenu.js');
      const drafts = await window.gamepadCli.draftList(props.sessionId);
      showDraftSubmenu(drafts, {
        onNewDraft: () => showDraftEditor(props.sessionId),
        onApply: (draft) => {
          if (draft.text) void deliverBulkText(props.sessionId, draft.text);
          void window.gamepadCli.draftDelete(draft.id);
        },
        onEdit: (draft) => showDraftEditor(props.sessionId, draft),
        onDelete: (draft) => window.gamepadCli.draftDelete(draft.id),
      });
      break;
    }
  }
}

function onContextMenuCancel(): void {
  contextMenuVisible.value = false;
}
</script>

<template>
  <div class="snap-out-window" id="mainArea">
    <ChipBar
      :drafts="chipBarDrafts"
      :plan-chips="chipBarPlans"
      :actions="[]"
      :visible="true"
      :show-new-draft="false"
      @draft-click="onChipBarDraftClick"
      @plan-chip-click="onChipBarPlanClick"
      @new-draft="onChipBarNewDraft"
      @action-click="onChipBarAction"
    />
    
    <div ref="containerRef" class="snap-out-terminal"></div>
    
    <div v-if="chipActionBarVisible" class="chip-action-dock">
      <ChipActionBar
        :actions="chipBarStore.actions"
        :show-new-draft="true"
        @new-draft="onChipBarNewDraft"
        @action-click="onChipBarAction"
      />
    </div>
    
    <ContextMenu
      v-model:visible="contextMenuVisible"
      :has-selection="contextMenuHasSelection"
      :has-active-session="true"
      :has-sequences="false"
      :has-drafts="chipBarDrafts.length > 0"
      :is-snapped-out="true"
      :mode="'mouse'"
      :mouse-x="contextMenu.mouseX"
      :mouse-y="contextMenu.mouseY"
      @action="onContextMenuAction"
      @cancel="onContextMenuCancel"
    />
    <EscProtectionModal />
  </div>
</template>

<style scoped>
.snap-out-window {
  width: 100vw;
  height: 100vh;
  background: #0a0a0a;
  display: flex;
  flex-direction: column;
}

.snap-out-terminal {
  flex: 1;
  min-height: 0;
  position: relative;
  z-index: 1;
}

.chip-action-dock {
  border-top: 1px solid #333;
  background: #1a1a1a;
  position: relative;
  z-index: 10;
}
</style>
