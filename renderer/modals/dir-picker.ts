/**
 * Directory picker modal — lets user choose a working directory before spawning.
 */

import { state } from '../state.js';
import { logEvent, getCliDisplayName } from '../utils.js';
import { doSpawn } from '../screens/sessions.js';

// ============================================================================
// Show / Hide
// ============================================================================

export function showDirPicker(cliType: string, dirs: Array<{ name: string; path: string }>): void {
  state.dirPickerVisible = true;
  state.dirPickerItems = dirs;
  state.dirPickerSelectedIndex = 0;
  state.dirPickerCliType = cliType;

  const modal = document.getElementById('dirPickerModal');
  if (!modal) return;

  const title = modal.querySelector('.modal-title');
  if (title) title.textContent = `Select directory for ${getCliDisplayName(cliType)}`;

  renderDirPickerList();
  modal.classList.add('modal--visible');
  modal.setAttribute('aria-hidden', 'false');
}

export function hideDirPicker(): void {
  state.dirPickerVisible = false;
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

  state.dirPickerItems.forEach((dir, index) => {
    const item = document.createElement('div');
    item.className = 'dir-picker-item focusable';
    if (index === state.dirPickerSelectedIndex) {
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
  const selectedItem = list.children[state.dirPickerSelectedIndex] as HTMLElement;
  selectedItem?.focus();
}

// ============================================================================
// Selection
// ============================================================================

async function selectDirAndSpawn(index: number): Promise<void> {
  const dir = state.dirPickerItems[index];
  if (!dir) return;

  hideDirPicker();
  await doSpawn(state.dirPickerCliType, dir.path);
}

// ============================================================================
// Gamepad Button Handler
// ============================================================================

export function handleDirPickerButton(button: string): void {
  switch (button) {
    case 'Up':
      state.dirPickerSelectedIndex = Math.max(0, state.dirPickerSelectedIndex - 1);
      renderDirPickerList();
      break;
    case 'Down':
      state.dirPickerSelectedIndex = Math.min(state.dirPickerItems.length - 1, state.dirPickerSelectedIndex + 1);
      renderDirPickerList();
      break;
    case 'A':
      selectDirAndSpawn(state.dirPickerSelectedIndex);
      break;
    case 'B':
      hideDirPicker();
      logEvent('Spawn cancelled');
      break;
  }
}
