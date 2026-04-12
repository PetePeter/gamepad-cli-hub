/**
 * Draft submenu — shows list of drafts for the active session.
 * Opened from the context menu "Drafts" item.
 * Provides: New Draft, and per-draft actions (Apply / Edit / Delete).
 */

import { logEvent, toDirection, escapeHtml } from '../utils.js';
import { attachModalKeyboard } from './modal-base.js';
import { state } from '../state.js';

// ============================================================================
// Draft Submenu State
// ============================================================================

interface DraftSubmenuState {
  visible: boolean;
  selectedIndex: number;
  drafts: Array<{ id: string; label: string; text: string }>;
}

export const draftSubmenuState: DraftSubmenuState = {
  visible: false,
  selectedIndex: 0,
  drafts: [],
};

let cleanupKeyboard: (() => void) | null = null;

// ============================================================================
// Show / Hide
// ============================================================================

export async function showDraftSubmenu(): Promise<void> {
  if (!state.activeSessionId) return;

  const drafts = await window.gamepadCli?.draftList(state.activeSessionId) ?? [];
  draftSubmenuState.drafts = drafts;
  draftSubmenuState.visible = true;
  draftSubmenuState.selectedIndex = 0;

  renderDraftSubmenu();

  const overlay = document.getElementById('draftSubmenuOverlay');
  if (!overlay) return;
  overlay.classList.add('modal--visible');
  overlay.setAttribute('aria-hidden', 'false');

  cleanupKeyboard?.();
  cleanupKeyboard = attachModalKeyboard({
    mode: 'selection',
    onAccept: () => executeSubmenuItem(),
    onCancel: () => hideDraftSubmenu(),
    onArrowUp: () => {
      const total = 1 + draftSubmenuState.drafts.length;
      draftSubmenuState.selectedIndex = (draftSubmenuState.selectedIndex - 1 + total) % total;
      renderDraftSubmenu();
    },
    onArrowDown: () => {
      const total = 1 + draftSubmenuState.drafts.length;
      draftSubmenuState.selectedIndex = (draftSubmenuState.selectedIndex + 1) % total;
      renderDraftSubmenu();
    },
  });

  logEvent('Draft submenu opened');
}

export function hideDraftSubmenu(): void {
  draftSubmenuState.visible = false;

  cleanupKeyboard?.();
  cleanupKeyboard = null;

  const overlay = document.getElementById('draftSubmenuOverlay');
  if (overlay) {
    overlay.classList.remove('modal--visible');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

export function isDraftSubmenuVisible(): boolean {
  return draftSubmenuState.visible;
}

// ============================================================================
// Render
// ============================================================================

function renderDraftSubmenu(): void {
  const menu = document.getElementById('draftSubmenu');
  if (!menu) return;

  menu.innerHTML = '';

  // "New Draft" item — always first
  const newItem = document.createElement('div');
  newItem.className = 'context-menu-item';
  if (draftSubmenuState.selectedIndex === 0) newItem.classList.add('context-menu-item--selected');
  newItem.innerHTML = '<span class="item-icon">➕</span><span class="item-text">New Draft</span>';
  newItem.addEventListener('click', () => {
    draftSubmenuState.selectedIndex = 0;
    executeSubmenuItem();
  });
  menu.appendChild(newItem);

  // Separator (only if drafts exist)
  if (draftSubmenuState.drafts.length > 0) {
    const sep = document.createElement('div');
    sep.className = 'context-menu-separator';
    menu.appendChild(sep);
  }

  // Existing drafts
  draftSubmenuState.drafts.forEach((draft, i) => {
    const item = document.createElement('div');
    item.className = 'context-menu-item';
    if (draftSubmenuState.selectedIndex === i + 1) item.classList.add('context-menu-item--selected');
    const truncLabel = draft.label.length > 30 ? draft.label.substring(0, 27) + '…' : draft.label;
    item.innerHTML = `<span class="item-icon">📝</span><span class="item-text">${escapeHtml(truncLabel)}</span>`;
    item.addEventListener('click', () => {
      draftSubmenuState.selectedIndex = i + 1;
      executeSubmenuItem();
    });
    menu.appendChild(item);
  });

  // Scroll selected into view
  const selected = menu.querySelector('.context-menu-item--selected') as HTMLElement | null;
  if (selected?.scrollIntoView) {
    selected.scrollIntoView({ block: 'nearest' });
  }
}

// ============================================================================
// Execute
// ============================================================================

async function executeSubmenuItem(): Promise<void> {
  if (draftSubmenuState.selectedIndex === 0) {
    // New Draft
    hideDraftSubmenu();
    const { showDraftEditor } = await import('../drafts/draft-editor.js');
    showDraftEditor(state.activeSessionId!);
  } else {
    // Existing draft — show action picker
    const draftIndex = draftSubmenuState.selectedIndex - 1;
    const draft = draftSubmenuState.drafts[draftIndex];
    if (draft) {
      hideDraftSubmenu();
      await showDraftActionPicker(draft);
    }
  }
}

// ============================================================================
// Gamepad button handler
// ============================================================================

export function handleDraftSubmenuButton(button: string): void {
  const dir = toDirection(button);

  if (dir === 'up') {
    const total = 1 + draftSubmenuState.drafts.length;
    draftSubmenuState.selectedIndex = (draftSubmenuState.selectedIndex - 1 + total) % total;
    renderDraftSubmenu();
    return;
  }
  if (dir === 'down') {
    const total = 1 + draftSubmenuState.drafts.length;
    draftSubmenuState.selectedIndex = (draftSubmenuState.selectedIndex + 1) % total;
    renderDraftSubmenu();
    return;
  }

  switch (button) {
    case 'A':
      executeSubmenuItem();
      break;
    case 'B':
      hideDraftSubmenu();
      break;
  }
}

// ============================================================================
// Click handlers — wired once at init
// ============================================================================

export function initDraftSubmenuClickHandlers(): void {
  const overlay = document.getElementById('draftSubmenuOverlay');
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) {
      hideDraftSubmenu();
    }
  });
}

// ============================================================================
// Draft Action Picker (Apply / Edit / Delete / Cancel)
// ============================================================================

interface DraftActionState {
  visible: boolean;
  selectedIndex: number;
  draft: { id: string; label: string; text: string } | null;
}

export const draftActionState: DraftActionState = {
  visible: false,
  selectedIndex: 0,
  draft: null,
};

const DRAFT_ACTIONS = ['Apply', 'Edit', 'Delete', 'Cancel'] as const;

let cleanupActionKeyboard: (() => void) | null = null;

export async function showDraftActionPicker(draft: { id: string; label: string; text: string }): Promise<void> {
  draftActionState.visible = true;
  draftActionState.selectedIndex = 0;
  draftActionState.draft = draft;

  renderDraftActions();

  const overlay = document.getElementById('draftActionOverlay');
  if (!overlay) return;
  overlay.classList.add('modal--visible');
  overlay.setAttribute('aria-hidden', 'false');

  cleanupActionKeyboard?.();
  cleanupActionKeyboard = attachModalKeyboard({
    mode: 'selection',
    onAccept: () => executeDraftAction(),
    onCancel: () => hideDraftActionPicker(),
    onArrowUp: () => {
      draftActionState.selectedIndex = (draftActionState.selectedIndex - 1 + DRAFT_ACTIONS.length) % DRAFT_ACTIONS.length;
      renderDraftActions();
    },
    onArrowDown: () => {
      draftActionState.selectedIndex = (draftActionState.selectedIndex + 1) % DRAFT_ACTIONS.length;
      renderDraftActions();
    },
  });

  logEvent(`Draft action picker: ${draft.label}`);
}

export function hideDraftActionPicker(): void {
  draftActionState.visible = false;
  draftActionState.draft = null;

  cleanupActionKeyboard?.();
  cleanupActionKeyboard = null;

  const overlay = document.getElementById('draftActionOverlay');
  if (overlay) {
    overlay.classList.remove('modal--visible');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

export function isDraftActionVisible(): boolean {
  return draftActionState.visible;
}

function renderDraftActions(): void {
  const menu = document.getElementById('draftActionMenu');
  if (!menu) return;

  menu.innerHTML = '';

  // Show draft label as header
  if (draftActionState.draft) {
    const header = document.createElement('div');
    header.className = 'context-menu-item context-menu-item--disabled';
    header.innerHTML = `<span class="item-icon">📝</span><span class="item-text" style="font-weight:600">${escapeHtml(draftActionState.draft.label)}</span>`;
    menu.appendChild(header);

    const sep = document.createElement('div');
    sep.className = 'context-menu-separator';
    menu.appendChild(sep);
  }

  const icons = ['▶️', '✏️', '🗑️', ''];
  DRAFT_ACTIONS.forEach((action, i) => {
    const item = document.createElement('div');
    item.className = 'context-menu-item';
    if (action === 'Cancel') item.classList.add('context-menu-item--cancel');
    if (i === draftActionState.selectedIndex) item.classList.add('context-menu-item--selected');
    item.innerHTML = `<span class="item-icon">${icons[i]}</span><span class="item-text">${action}</span>`;
    item.addEventListener('click', () => {
      draftActionState.selectedIndex = i;
      executeDraftAction();
    });
    menu.appendChild(item);
  });
}

async function executeDraftAction(): Promise<void> {
  const draft = draftActionState.draft;
  if (!draft) return;

  const action = DRAFT_ACTIONS[draftActionState.selectedIndex];

  switch (action) {
    case 'Apply': {
      hideDraftActionPicker();
      const { executeSequence } = await import('../bindings.js');
      await executeSequence(draft.text);
      await window.gamepadCli?.draftDelete(draft.id);
      const { refreshDraftStrip } = await import('../drafts/draft-strip.js');
      await refreshDraftStrip(state.activeSessionId);
      logEvent(`Draft applied: ${draft.label}`);
      break;
    }
    case 'Edit': {
      hideDraftActionPicker();
      const { showDraftEditor } = await import('../drafts/draft-editor.js');
      showDraftEditor(state.activeSessionId!, draft);
      break;
    }
    case 'Delete': {
      hideDraftActionPicker();
      await window.gamepadCli?.draftDelete(draft.id);
      const { refreshDraftStrip } = await import('../drafts/draft-strip.js');
      await refreshDraftStrip(state.activeSessionId);
      logEvent(`Draft deleted: ${draft.label}`);
      break;
    }
    case 'Cancel': {
      hideDraftActionPicker();
      break;
    }
  }
}

// ============================================================================
// Draft Action gamepad button handler
// ============================================================================

export function handleDraftActionButton(button: string): void {
  const dir = toDirection(button);

  if (dir === 'up') {
    draftActionState.selectedIndex = (draftActionState.selectedIndex - 1 + DRAFT_ACTIONS.length) % DRAFT_ACTIONS.length;
    renderDraftActions();
    return;
  }
  if (dir === 'down') {
    draftActionState.selectedIndex = (draftActionState.selectedIndex + 1) % DRAFT_ACTIONS.length;
    renderDraftActions();
    return;
  }

  switch (button) {
    case 'A':
      executeDraftAction();
      break;
    case 'B':
      hideDraftActionPicker();
      break;
  }
}

// ============================================================================
// Draft Action click handlers — wired once at init
// ============================================================================

export function initDraftActionClickHandlers(): void {
  const overlay = document.getElementById('draftActionOverlay');
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) {
      hideDraftActionPicker();
    }
  });
}
