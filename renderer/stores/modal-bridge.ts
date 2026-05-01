/**
 * Modal bridge — reactive state shared between legacy show*() callers and Vue modal components.
 *
 * Legacy modules set bridge state instead of manipulating DOM.
 * App.vue binds to bridge state in its template.
 * Vue modal components push/pop useModalStack() when visibility changes.
 *
 * Callbacks are stored separately from reactive state to avoid Vue proxy overhead.
 */

import { reactive } from 'vue';

// ============================================================================
// Close Confirm
// ============================================================================

export const closeConfirm = reactive({
  visible: false,
  sessionId: '',
  sessionName: '',
  draftCount: 0,
});

let _closeConfirmOnConfirm: ((sessionId: string) => void) | null = null;
export function setCloseConfirmCallback(cb: ((sessionId: string) => void) | null): void { _closeConfirmOnConfirm = cb; }
export function getCloseConfirmCallback(): ((sessionId: string) => void) | null { return _closeConfirmOnConfirm; }

// ============================================================================
// Context Menu
// ============================================================================

export const contextMenu = reactive({
  visible: false,
  mode: 'gamepad' as 'mouse' | 'gamepad',
  mouseX: 0,
  mouseY: 0,
  selectedText: '',
  hasSelection: false,
  sourceSessionId: '',
});

// ============================================================================
// Plan Delete Confirm
// ============================================================================

export const planDeleteConfirm = reactive({
  visible: false,
  planTitle: '',
});

let _planDeleteOnConfirm: (() => void) | null = null;
export function setPlanDeleteCallback(cb: (() => void) | null): void { _planDeleteOnConfirm = cb; }
export function getPlanDeleteCallback(): (() => void) | null { return _planDeleteOnConfirm; }

// ============================================================================
// Clear Done Plans Confirm
// ============================================================================

export const clearDonePlans = reactive({
  visible: false,
  count: 0,
  dirName: '',
});

let _clearDonePlansOnConfirm: (() => void) | null = null;
export function setClearDonePlansCallback(cb: (() => void) | null): void { _clearDonePlansOnConfirm = cb; }
export function getClearDonePlansCallback(): (() => void) | null { return _clearDonePlansOnConfirm; }

// ============================================================================
// Sequence Picker
// ============================================================================

export const sequencePicker = reactive({
  visible: false,
  items: [] as Array<{ label: string; sequence: string }>,
});

let _sequencePickerOnSelect: ((sequence: string) => void) | null = null;
export function setSequencePickerCallback(cb: ((sequence: string) => void) | null): void { _sequencePickerOnSelect = cb; }
export function getSequencePickerCallback(): ((sequence: string) => void) | null { return _sequencePickerOnSelect; }

// ============================================================================
// Quick Spawn
// ============================================================================

export const quickSpawn = reactive({
  visible: false,
  preselectedCliType: undefined as string | undefined,
});

let _quickSpawnOnSelect: ((cliType: string) => void) | null = null;
export function setQuickSpawnCallback(cb: ((cliType: string) => void) | null): void { _quickSpawnOnSelect = cb; }
export function getQuickSpawnCallback(): ((cliType: string) => void) | null { return _quickSpawnOnSelect; }
export function openQuickSpawn(
  onSelect: (cliType: string) => void,
  preselectedCliType?: string,
): void {
  quickSpawn.visible = true;
  quickSpawn.preselectedCliType = preselectedCliType;
  setQuickSpawnCallback(onSelect);
}
export function closeQuickSpawn(): void {
  quickSpawn.visible = false;
  quickSpawn.preselectedCliType = undefined;
  setQuickSpawnCallback(null);
}

// ============================================================================
// Dir Picker
// ============================================================================

export const dirPicker = reactive({
  visible: false,
  cliType: '',
  items: [] as Array<{ name: string; path: string }>,
  preselectedPath: undefined as string | undefined,
});
export function openDirPicker(
  cliType: string,
  items: Array<{ name: string; path: string }>,
  preselectedPath?: string,
): void {
  dirPicker.visible = true;
  dirPicker.cliType = cliType;
  dirPicker.items = [...items];
  dirPicker.preselectedPath = preselectedPath;
}
export function closeDirPicker(): void {
  dirPicker.visible = false;
  dirPicker.cliType = '';
  dirPicker.items = [];
  dirPicker.preselectedPath = undefined;
}

// ============================================================================
// Draft Submenu
// ============================================================================

export const draftSubmenu = reactive({
  visible: false,
  items: [] as Array<{ id: string; label: string; text: string }>,
});

// ============================================================================
// Form Modal
// ============================================================================

export const formModal = reactive({
  visible: false,
  title: '',
  fields: [] as Array<{
    key: string;
    label: string;
    defaultValue?: string;
    placeholder?: string;
    type?: 'text' | 'select' | 'textarea' | 'checkbox' | 'sequence-items';
    options?: Array<{ label: string; value: string }>;
    browse?: boolean;
    showLabels?: boolean;
  }>,
});

let _formModalResolve: ((values: Record<string, string> | null) => void) | null = null;
export function setFormModalResolve(cb: ((values: Record<string, string> | null) => void) | null): void { _formModalResolve = cb; }
export function getFormModalResolve(): ((values: Record<string, string> | null) => void) | null { return _formModalResolve; }

// ============================================================================
// Editor Popup
// ============================================================================

export const editorPopup = reactive({
  visible: false,
  initialText: '',
});

let _editorPopupOnSend: ((text: string) => void) | null = null;
let _editorPopupResolve: (() => void) | null = null;
export function setEditorPopupCallbacks(
  onSend: ((text: string) => void) | null,
  resolve: (() => void) | null,
): void {
  _editorPopupOnSend = onSend;
  _editorPopupResolve = resolve;
}
export function getEditorPopupOnSend(): ((text: string) => void) | null { return _editorPopupOnSend; }
export function getEditorPopupResolve(): (() => void) | null { return _editorPopupResolve; }

// ============================================================================
// Tool Editor
// ============================================================================

export interface ToolEditorEnvEntry {
  name: string;
  value: string;
  mode?: 'replace' | 'append' | 'prepend';
}

export interface ToolEditorBridgeData {
  name: string;
  env: Array<ToolEditorEnvEntry>;
  initialPromptDelay: number;
  pasteMode: 'pty' | 'ptyindividual' | 'sendkeys' | 'sendkeysindividual' | 'clippaste';
  spawnCommand: string;
  resumeCommand: string;
  continueCommand: string;
  renameCommand: string;
  handoffCommand: string;
  helmInitialPrompt: boolean;
  helmPreambleForInterSession?: boolean;
  submitSuffix: string;
  initialPrompt: Array<{ label: string; sequence: string }>;
}

const EMPTY_TOOL_DATA: ToolEditorBridgeData = {
  name: '', env: [], initialPromptDelay: 2000,
  pasteMode: 'pty', spawnCommand: '', resumeCommand: '', continueCommand: '',
  renameCommand: '', handoffCommand: '', helmInitialPrompt: false, helmPreambleForInterSession: true,
  submitSuffix: '\\r', initialPrompt: [],
};

export const toolEditor = reactive({
  visible: false,
  mode: 'add' as 'add' | 'edit',
  editKey: '',
  initialData: { ...EMPTY_TOOL_DATA } as ToolEditorBridgeData,
});

let _toolEditorOnSave: ((values: any) => void) | null = null;
export function setToolEditorCallback(cb: ((values: any) => void) | null): void { _toolEditorOnSave = cb; }
export function getToolEditorCallback(): ((values: any) => void) | null { return _toolEditorOnSave; }

export function resetToolEditorData(): ToolEditorBridgeData { return { ...EMPTY_TOOL_DATA }; }

export function buildToolEditorOptions(values: Record<string, any>): {
  env?: ToolEditorEnvEntry[];
  handoffCommand?: string;
  renameCommand?: string;
  spawnCommand?: string;
  resumeCommand?: string;
  continueCommand?: string;
  helmInitialPrompt?: boolean;
  helmPreambleForInterSession?: boolean;
  pasteMode?: 'pty' | 'ptyindividual' | 'sendkeys' | 'sendkeysindividual' | 'clippaste';
  submitSuffix?: string;
} {
  const fields = ['handoffCommand', 'renameCommand', 'spawnCommand', 'resumeCommand', 'continueCommand'] as const;
  const options: Record<string, string> = {};
  for (const field of fields) {
    options[field] = typeof values[field] === 'string' ? values[field].trim() : '';
  }
  const env = Array.isArray(values.env)
    ? values.env
        .map((item: any) => ({
          name: typeof item?.name === 'string' ? item.name.trim() : '',
          value: typeof item?.value === 'string' ? item.value : '',
          ...(item.mode === 'append' || item.mode === 'prepend' ? { mode: item.mode } : {}),
        }))
        .filter((item: ToolEditorEnvEntry) => item.name.length > 0)
    : [];
  const pasteMode = values.pasteMode;
  return {
    ...options,
    env,
    helmInitialPrompt: Boolean(values.helmInitialPrompt),
    helmPreambleForInterSession: values.helmPreambleForInterSession !== false,
    submitSuffix: typeof values.submitSuffix === 'string' ? values.submitSuffix : '\\r',
    ...(pasteMode === 'pty' || pasteMode === 'ptyindividual' || pasteMode === 'sendkeys' || pasteMode === 'sendkeysindividual' || pasteMode === 'clippaste'
      ? { pasteMode }
      : {}),
  };
}

// ============================================================================
// Guard helper — check if ANY bridge modal is visible (for race condition guard)
// ============================================================================

export function isAnyBridgeModalVisible(): boolean {
  // Import inside function to avoid circular dependency
  const { useEscProtection } = require('../composables/useEscProtection.js');
  const escProtection = useEscProtection();

  return closeConfirm.visible || contextMenu.visible || planDeleteConfirm.visible ||
    clearDonePlans.visible || sequencePicker.visible || quickSpawn.visible || dirPicker.visible ||
    draftSubmenu.visible || formModal.visible || editorPopup.visible || toolEditor.visible ||
    escProtection.isProtecting.value;
}

