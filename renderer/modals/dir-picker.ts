/**
 * Directory picker modal — lets user choose a working directory before spawning.
 */

/** Dir-picker modal state — co-located with its only consumer. */
export interface DirPickerState {
  visible: boolean;
  items: Array<{ name: string; path: string }>;
  selectedIndex: number;
  cliType: string;
}

export const dirPickerState: DirPickerState = {
  visible: false,
  items: [],
  selectedIndex: 0,
  cliType: '',
};

import { logEvent, getCliDisplayName } from '../utils.js';
import { doSpawn } from '../screens/sessions.js';

// ============================================================================
// Show / Hide
// ============================================================================

export function showDirPicker(cliType: string, dirs: Array<{ name: string; path: string }>): void {
  dirPickerState.visible = true;
  dirPickerState.items = dirs;
  dirPickerState.selectedIndex = 0;
  dirPickerState.cliType = cliType;

  const modal = document.getElementById('dirPickerModal');
  if (!modal) return;

  const title = modal.querySelector('.modal-title');
  if (title) title.textContent = `Select directory for ${getCliDisplayName(cliType)}`;

  renderDirPickerList();
  modal.classList.add('modal--visible');
  modal.setAttribute('aria-hidden', 'false');
}

export function hideDirPicker(): void {
  dirPickerState.visible = false;
  const modal = document.getElementById('dirPickerModal');
  if (modal) {
    modal.classList.remove('modal--visible');
    modal.setAttribute('aria-hidden', 'true');
  }
}

// ============================================================================
// Render
// ============================================================================

function renderDirPickerList(): void {
  const list = document.getElementById('dirPickerList');
  if (!list) return;

  list.innerHTML = '';

  dirPickerState.items.forEach((dir, index) => {
    const item = document.createElement('div');
    item.className = 'dir-picker-item focusable';
    if (index === dirPickerState.selectedIndex) {
      item.classList.add('dir-picker-item--selected');
    }
    item.tabIndex = 0;
    item.innerHTML = `
      <span class="dir-picker-item__name">${dir.name}</span>
      <span class="dir-picker-item__path">${dir.path}</span>
    `;
    item.addEventListener('click', () => selectDirAndSpawn(index));
    list.appendChild(item);
  });

  // Focus the selected item
  const selectedItem = list.children[dirPickerState.selectedIndex] as HTMLElement;
  selectedItem?.focus();
}

// ============================================================================
// Selection
// ============================================================================

async function selectDirAndSpawn(index: number): Promise<void> {
  const dir = dirPickerState.items[index];
  if (!dir) return;

  hideDirPicker();
  await doSpawn(dirPickerState.cliType, dir.path);
}

// ============================================================================
// Gamepad Button Handler
// ============================================================================

export function handleDirPickerButton(button: string): void {
  switch (button) {
    case 'Up':
      dirPickerState.selectedIndex = Math.max(0, dirPickerState.selectedIndex - 1);
      renderDirPickerList();
      break;
    case 'Down':
      dirPickerState.selectedIndex = Math.min(dirPickerState.items.length - 1, dirPickerState.selectedIndex + 1);
      renderDirPickerList();
      break;
    case 'A':
      selectDirAndSpawn(dirPickerState.selectedIndex);
      break;
    case 'B':
      hideDirPicker();
      logEvent('Spawn cancelled');
      break;
  }
}
