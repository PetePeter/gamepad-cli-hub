/**
 * Context menu modal — right-click / gamepad context actions for embedded terminals.
 *
 * Provides Copy, Paste, New Session, New Session with Selection, and Cancel.
 * Triggered via right-click on the terminal area or a gamepad context-menu binding.
 */

import { logEvent, toDirection } from '../utils.js';
import { getTerminalManager } from '../main.js';
import { attachModalKeyboard } from './modal-base.js';
import { setPendingContextText, spawnNewSession } from '../screens/sessions.js';
import { showQuickSpawn } from './quick-spawn.js';
import { state } from '../state.js';

// ============================================================================
// State
// ============================================================================

export interface ContextMenuState {
  visible: boolean;
  selectedIndex: number;
  selectedText: string;
  hasSelection: boolean;
  sourceSessionId: string;
  mode: 'mouse' | 'gamepad';
}

export const contextMenuState: ContextMenuState = {
  visible: false,
  selectedIndex: 0,
  selectedText: '',
  hasSelection: false,
  sourceSessionId: '',
  mode: 'gamepad',
};

// ============================================================================
// Menu items definition
// ============================================================================

interface MenuItem {
  action: string;
  label: string;
  icon: string;
  enabledWhen: () => boolean;
}

const MENU_ITEMS: MenuItem[] = [
  { action: 'copy', label: 'Copy', icon: '📋', enabledWhen: () => contextMenuState.hasSelection },
  { action: 'paste', label: 'Paste', icon: '📥', enabledWhen: () => true },
  { action: 'new-session', label: 'New Session', icon: '➕', enabledWhen: () => true },
  { action: 'new-session-with-selection', label: 'New Session with Selection', icon: '📋➕', enabledWhen: () => contextMenuState.hasSelection },
  { action: 'cancel', label: 'Cancel', icon: '', enabledWhen: () => true },
];

// Keyboard shortcut cleanup
let cleanupKeyboard: (() => void) | null = null;

// ============================================================================
// Show / Hide
// ============================================================================

export function showContextMenu(x: number, y: number, sessionId: string, mode: 'mouse' | 'gamepad'): void {
  const tm = getTerminalManager();
  const view = tm?.getActiveView() ?? null;

  const selectedText = view?.getSelection() ?? '';
  const hasSelection = view?.hasSelection() ?? false;

  contextMenuState.visible = true;
  contextMenuState.selectedText = selectedText;
  contextMenuState.hasSelection = hasSelection;
  contextMenuState.sourceSessionId = sessionId;
  contextMenuState.mode = mode;

  // Start on the first enabled item
  contextMenuState.selectedIndex = findNextEnabledIndex(-1, 'down');

  const overlay = document.getElementById('contextMenuOverlay');
  const menu = document.getElementById('contextMenu');
  if (!overlay || !menu) return;

  renderContextMenu();

  // Position the menu
  if (mode === 'gamepad') {
    menu.classList.add('context-menu--centered');
    menu.style.left = '';
    menu.style.top = '';
  } else {
    menu.classList.remove('context-menu--centered');
    // Clamp to viewport
    const menuWidth = 260;
    const menuHeight = 200;
    const clampedX = Math.min(x, window.innerWidth - menuWidth);
    const clampedY = Math.min(y, window.innerHeight - menuHeight);
    menu.style.left = `${clampedX}px`;
    menu.style.top = `${clampedY}px`;
  }

  overlay.classList.add('modal--visible');
  overlay.setAttribute('aria-hidden', 'false');

  // Attach keyboard shortcuts
  cleanupKeyboard?.();
  cleanupKeyboard = attachModalKeyboard({
    onAccept: () => executeSelectedItem(),
    onCancel: () => hideContextMenu(),
  });

  logEvent('Context menu opened');
}

export function hideContextMenu(): void {
  contextMenuState.visible = false;

  cleanupKeyboard?.();
  cleanupKeyboard = null;

  const overlay = document.getElementById('contextMenuOverlay');
  if (overlay) {
    overlay.classList.remove('modal--visible');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

// ============================================================================
// Render
// ============================================================================

function renderContextMenu(): void {
  const menu = document.getElementById('contextMenu');
  if (!menu) return;

  const items = menu.querySelectorAll('.context-menu-item');
  items.forEach((el, index) => {
    const htmlEl = el as HTMLElement;
    const menuItem = MENU_ITEMS[index];
    if (!menuItem) return;

    const enabled = menuItem.enabledWhen();
    htmlEl.classList.toggle('context-menu-item--selected', index === contextMenuState.selectedIndex);
    htmlEl.classList.toggle('context-menu-item--disabled', !enabled);
  });
}

// ============================================================================
// Navigation helpers
// ============================================================================

/** Find the next enabled menu item index in a given direction, wrapping around. */
function findNextEnabledIndex(fromIndex: number, direction: 'up' | 'down'): number {
  const step = direction === 'down' ? 1 : -1;
  const count = MENU_ITEMS.length;
  let idx = fromIndex;

  for (let i = 0; i < count; i++) {
    idx = ((idx + step) % count + count) % count;
    if (MENU_ITEMS[idx].enabledWhen()) return idx;
  }
  return fromIndex; // all disabled — stay put
}

// ============================================================================
// Gamepad button handler
// ============================================================================

export function handleContextMenuButton(button: string): void {
  const dir = toDirection(button);

  if (dir === 'up') {
    contextMenuState.selectedIndex = findNextEnabledIndex(contextMenuState.selectedIndex, 'up');
    renderContextMenu();
    return;
  }
  if (dir === 'down') {
    contextMenuState.selectedIndex = findNextEnabledIndex(contextMenuState.selectedIndex, 'down');
    renderContextMenu();
    return;
  }

  switch (button) {
    case 'A':
      executeSelectedItem();
      break;
    case 'B':
      hideContextMenu();
      break;
  }
}

// ============================================================================
// Execute selected menu action
// ============================================================================

async function executeSelectedItem(): Promise<void> {
  const item = MENU_ITEMS[contextMenuState.selectedIndex];
  if (!item || !item.enabledWhen()) return;

  switch (item.action) {
    case 'copy': {
      if (contextMenuState.selectedText) {
        await navigator.clipboard.writeText(contextMenuState.selectedText);
        logEvent('Copied to clipboard');
      }
      hideContextMenu();
      break;
    }
    case 'paste': {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          const tm = getTerminalManager();
          const activeId = tm?.getActiveSessionId();
          if (activeId) {
            window.gamepadCli?.ptyWrite(activeId, text);
            logEvent('Pasted from clipboard');
          }
        }
      } catch (err) {
        console.error('[ContextMenu] Paste failed:', err);
        logEvent('Paste failed');
      }
      hideContextMenu();
      break;
    }
    case 'new-session': {
      hideContextMenu();
      showSpawnGridFromContext();
      break;
    }
    case 'new-session-with-selection': {
      hideContextMenu();
      showSpawnGridFromContext(contextMenuState.selectedText);
      break;
    }
    case 'cancel': {
      hideContextMenu();
      break;
    }
  }
}

// ============================================================================
// Spawn helper — open quick-spawn CLI type picker
// ============================================================================

function showSpawnGridFromContext(contextText?: string): void {
  setPendingContextText(contextText ?? null);

  // Resolve defaults from the active session
  const activeSession = state.sessions.find(s => s.id === state.activeSessionId);
  const preselectedCliType = activeSession?.cliType;
  const preselectedPath = activeSession?.workingDir;

  const cliTypes = state.availableSpawnTypes;
  if (cliTypes.length === 0) {
    logEvent('Quick spawn: no CLI types configured');
    return;
  }

  showQuickSpawn(cliTypes, (selectedCliType) => {
    spawnNewSession(selectedCliType, preselectedPath);
    logEvent(contextText ? 'New session with selection' : 'New session from context menu');
  }, preselectedCliType);
}

// ============================================================================
// Click handlers — wired once at init
// ============================================================================

export function initContextMenuClickHandlers(): void {
  const menu = document.getElementById('contextMenu');
  if (!menu) return;

  const items = menu.querySelectorAll('.context-menu-item');
  items.forEach((el, index) => {
    el.addEventListener('click', () => {
      const menuItem = MENU_ITEMS[index];
      if (!menuItem || !menuItem.enabledWhen()) return;
      contextMenuState.selectedIndex = index;
      executeSelectedItem();
    });
  });

  // Close on overlay click (outside menu)
  const overlay = document.getElementById('contextMenuOverlay');
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) {
      hideContextMenu();
    }
  });
}
