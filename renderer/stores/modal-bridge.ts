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

// ============================================================================
// Dir Picker
// ============================================================================

export const dirPicker = reactive({
  visible: false,
  cliType: '',
  items: [] as Array<{ name: string; path: string }>,
  preselectedPath: undefined as string | undefined,
});

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
    type?: 'text' | 'select' | 'textarea' | 'checkbox';
    options?: Array<{ label: string; value: string }>;
    browse?: boolean;
  }>,
});

let _formModalResolve: ((values: Record<string, string> | null) => void) | null = null;
export function setFormModalResolve(cb: ((values: Record<string, string> | null) => void) | null): void { _formModalResolve = cb; }
export function getFormModalResolve(): ((values: Record<string, string> | null) => void) | null { return _formModalResolve; }

// ============================================================================
// Guard helper — check if ANY bridge modal is visible (for race condition guard)
// ============================================================================

export function isAnyBridgeModalVisible(): boolean {
  return closeConfirm.visible || contextMenu.visible || planDeleteConfirm.visible ||
    sequencePicker.visible || quickSpawn.visible || dirPicker.visible ||
    draftSubmenu.visible || formModal.visible;
}
