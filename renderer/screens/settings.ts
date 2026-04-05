/**
 * Settings screen — tab switching orchestrator, state management, directories tab, public API.
 *
 * Sub-modules (imported below) handle individual tabs:
 * - settings-bindings.ts  — global + per-CLI binding tabs
 * - settings-profiles.ts  — profile management tab
 * - settings-tools.ts     — Tools panel (CLI type CRUD)
 */

import { state } from '../state.js';
import {
  logEvent,
  showScreen,
  navigateFocus,
  getCliDisplayName,
  showFormModal,
  createBrowseButton,
  toDirection,
} from '../utils.js';
import { renderBindingsDisplay, renderSequenceGroups } from './settings-bindings.js';
import { renderProfilesPanel } from './settings-profiles.js';
import { renderToolsPanel } from './settings-tools.js';

// ============================================================================
// Main entry
// ============================================================================

export async function loadSettingsScreen(): Promise<void> {
  try {
    const cliTypes = state.cliTypes.length > 0
      ? state.cliTypes
      : (window.gamepadCli ? await window.gamepadCli.configGetCliTypes() : []);

    renderSettingsTabs(cliTypes);

    if (state.settingsTab === 'profiles') {
      await renderProfilesPanel();
    } else if (state.settingsTab === 'tools') {
      await renderToolsPanel();
    } else if (state.settingsTab === 'directories') {
      await renderDirectoriesPanel();
    } else {
      let bindings = state.cliBindingsCache[state.settingsTab];
      if (!bindings && window.gamepadCli) {
        bindings = await window.gamepadCli.configGetBindings(state.settingsTab);
        if (bindings) state.cliBindingsCache[state.settingsTab] = bindings;
      }
      await renderBindingsDisplay(bindings || {}, `${getCliDisplayName(state.settingsTab)} Bindings`);
      await renderSequenceGroups(state.settingsTab);
    }
  } catch (error) {
    console.error('Failed to load settings screen:', error);
  }
}

// ============================================================================
// Gamepad Button Handler
// ============================================================================

export function handleSettingsScreenButton(button: string): boolean {
  const dir = toDirection(button);
  if (dir) {
    switch (dir) {
      case 'left':  navigateSettingsTab(-1); return true;
      case 'right': navigateSettingsTab(1);  return true;
      case 'up':    navigateFocus(-1);       return true;
      case 'down':  navigateFocus(1);        return true;
    }
  }
  switch (button) {
    case 'B':
      showScreen('sessions');
      return true;
    case 'A':
      activateSettingsFocused();
      return true;
    default:
      return false;
  }
}

function navigateSettingsTab(direction: number): void {
  const allTabs = ['profiles', ...state.cliTypes, 'tools', 'directories'];
  const currentIndex = allTabs.indexOf(state.settingsTab);
  let nextIndex = currentIndex + direction;
  if (nextIndex < 0) nextIndex = allTabs.length - 1;
  if (nextIndex >= allTabs.length) nextIndex = 0;
  state.settingsTab = allTabs[nextIndex];
  loadSettingsScreen();
}

function activateSettingsFocused(): void {
  const active = document.activeElement as HTMLElement;
  if (active?.classList.contains('focusable')) {
    active.click();
  }
}

// ============================================================================
// Tab Bar
// ============================================================================

function renderSettingsTabs(cliTypes: string[]): void {
  const container = document.getElementById('settingsTabs');
  if (!container) return;

  container.innerHTML = '';

  const allTabs = [
    { key: 'profiles', label: '👤 Profiles' },
    ...cliTypes.map(ct => ({ key: ct, label: getCliDisplayName(ct) })),
    { key: 'tools', label: '🔧 Tools' },
    { key: 'directories', label: '📁 Dirs' },
  ];

  allTabs.forEach(tab => {
    const btn = document.createElement('button');
    btn.className = 'settings-tab focusable';
    if (tab.key === state.settingsTab) {
      btn.classList.add('settings-tab--active');
    }
    btn.tabIndex = 0;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', (tab.key === state.settingsTab).toString());
    btn.textContent = tab.label;
    btn.addEventListener('click', () => {
      state.settingsTab = tab.key;
      loadSettingsScreen();
    });
    container.appendChild(btn);
  });
}

// ============================================================================
// Directories Panel
// ============================================================================

async function renderDirectoriesPanel(): Promise<void> {
  const container = document.getElementById('bindingsDisplay');
  if (!container || !window.gamepadCli) return;

  const actionBar = document.getElementById('bindingActionBar');
  if (actionBar) actionBar.innerHTML = '';

  container.innerHTML = '';

  let dirs: Array<{ name: string; path: string }>;
  try {
    dirs = await window.gamepadCli.configGetWorkingDirs();
  } catch {
    container.innerHTML = '<p style="color: var(--text-dim);">Failed to load directories</p>';
    return;
  }

  const panel = document.createElement('div');
  panel.className = 'settings-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'settings-panel__header';
  header.innerHTML = `<span class="settings-panel__title">Working Directories</span>`;

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn--primary btn--sm focusable';
  addBtn.tabIndex = 0;
  addBtn.textContent = '+ Add Directory';
  addBtn.addEventListener('click', () => showAddDirectoryForm(panel));
  header.appendChild(addBtn);
  panel.appendChild(header);

  // Directories list
  const list = document.createElement('div');
  list.className = 'settings-list';
  list.id = 'directoriesList';

  if (dirs.length === 0) {
    list.innerHTML = '<p style="color: var(--text-dim); padding: var(--spacing-md);">No working directories configured</p>';
  } else {
    dirs.forEach((dir, index) => {
      list.appendChild(createDirectoryItem(dir, index));
    });
  }

  panel.appendChild(list);
  container.appendChild(panel);
}

function createDirectoryItem(dir: { name: string; path: string }, index: number): HTMLElement {
  const item = document.createElement('div');
  item.className = 'settings-list-item';

  item.innerHTML = `
    <div class="settings-list-item__info">
      <span class="settings-list-item__name">${dir.name}</span>
      <span class="settings-list-item__detail">${dir.path}</span>
    </div>
  `;

  const actions = document.createElement('div');
  actions.className = 'settings-list-item__actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'btn btn--secondary btn--sm focusable';
  editBtn.tabIndex = 0;
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => showEditDirectoryPrompt(dir, index));
  actions.appendChild(editBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn--danger btn--sm focusable';
  deleteBtn.tabIndex = 0;
  deleteBtn.textContent = 'Delete';
  let dirConfirmPending = false;
  deleteBtn.addEventListener('click', async () => {
    if (!dirConfirmPending) {
      deleteBtn.textContent = 'Confirm?';
      dirConfirmPending = true;
      setTimeout(() => { if (dirConfirmPending) { deleteBtn.textContent = 'Delete'; dirConfirmPending = false; } }, 3000);
      return;
    }
    dirConfirmPending = false;
    try {
      const result = await window.gamepadCli.configRemoveWorkingDir(index);
      if (result.success) {
        logEvent(`Deleted directory: ${dir.name}`);
        loadSettingsScreen();
      }
    } catch (error) {
      console.error('Delete directory failed:', error);
    }
  });
  actions.appendChild(deleteBtn);

  item.appendChild(actions);
  return item;
}

function showAddDirectoryForm(panel: HTMLElement): void {
  panel.querySelector('#addDirForm')?.remove();

  const form = document.createElement('div');
  form.className = 'settings-form';
  form.id = 'addDirForm';
  form.innerHTML = `
    <span class="settings-form__title">Add Directory</span>
    <div class="settings-form__field">
      <label>Name</label>
      <input type="text" id="newDirName" placeholder="e.g. My Project" class="focusable" tabindex="0" />
    </div>
    <div class="settings-form__field">
      <label>Path</label>
      <div class="settings-form__input-wrap">
        <input type="text" id="newDirPath" placeholder="e.g. C:\\projects\\my-project" class="focusable" tabindex="0" />
      </div>
    </div>
    <div class="settings-form__row">
      <button class="btn btn--primary btn--sm focusable" tabindex="0" id="saveNewDirBtn">Save</button>
      <button class="btn btn--secondary btn--sm focusable" tabindex="0" id="cancelNewDirBtn">Cancel</button>
    </div>
  `;

  const headerEl = panel.querySelector('.settings-panel__header');
  if (headerEl && headerEl.nextSibling) {
    panel.insertBefore(form, headerEl.nextSibling);
  } else {
    panel.appendChild(form);
  }

  const pathInput = form.querySelector('#newDirPath') as HTMLInputElement;
  const nameInput = form.querySelector('#newDirName') as HTMLInputElement;
  const browseBtn = createBrowseButton(pathInput, nameInput);
  browseBtn.className = 'settings-form__browse-btn focusable';
  browseBtn.tabIndex = 0;
  pathInput.parentElement!.appendChild(browseBtn);

  document.getElementById('saveNewDirBtn')?.addEventListener('click', async () => {
    const name = (document.getElementById('newDirName') as HTMLInputElement).value.trim();
    const dirPath = (document.getElementById('newDirPath') as HTMLInputElement).value.trim();

    if (!name || !dirPath) {
      logEvent('Add directory: name and path are required');
      return;
    }

    const result = await window.gamepadCli.configAddWorkingDir(name, dirPath);
    if (result.success) {
      logEvent(`Added directory: ${name}`);
      loadSettingsScreen();
    } else {
      logEvent('Failed to add directory');
    }
  });

  document.getElementById('cancelNewDirBtn')?.addEventListener('click', () => {
    form.remove();
  });

  (document.getElementById('newDirName') as HTMLInputElement)?.focus();
}

async function showEditDirectoryPrompt(dir: { name: string; path: string }, index: number): Promise<void> {
  const result = await showFormModal('Edit Directory', [
    { key: 'name', label: 'Name', defaultValue: dir.name },
    { key: 'path', label: 'Path', defaultValue: dir.path, browse: true },
  ]);

  if (!result) return;

  const updateResult = await window.gamepadCli.configUpdateWorkingDir(index, result.name, result.path);
  if (updateResult.success) {
    logEvent(`Updated directory: ${result.name}`);
    loadSettingsScreen();
  } else {
    logEvent('Failed to update directory');
  }
}
