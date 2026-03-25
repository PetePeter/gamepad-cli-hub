/**
 * Settings screen — profiles, bindings, tools, and directories tabs.
 */

import { state } from '../state.js';
import {
  logEvent,
  showScreen,
  navigateFocus,
  getCliDisplayName,
  formatBindingDetails,
  updateProfileDisplay,
  showFormModal,
  toDirection,
} from '../utils.js';
import { initConfigCache } from '../bindings.js';
import { loadSessions } from './sessions.js';
import { openBindingEditor } from '../modals/binding-editor.js';

// ============================================================================
// Constants
// ============================================================================

const ALL_BUTTONS = ['A', 'B', 'X', 'Y', 'DPadUp', 'DPadDown', 'DPadLeft', 'DPadRight', 'LeftBumper', 'RightBumper', 'LeftTrigger', 'RightTrigger', 'LeftStick', 'RightStick', 'Sandwich', 'Back', 'Xbox', 'LeftStickUp', 'LeftStickDown', 'LeftStickLeft', 'LeftStickRight', 'RightStickUp', 'RightStickDown', 'RightStickLeft', 'RightStickRight'] as const;

/** Tracks whether Game Bar was toggled this session so we can show a restart warning. */
let gameBarToggled = false;

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
    } else if (state.settingsTab === 'global') {
      const bindings = state.globalBindings
        || (window.gamepadCli ? await window.gamepadCli.configGetGlobalBindings() : {});
      renderBindingsDisplay(bindings || {}, 'Global Bindings');
    } else if (state.settingsTab === 'tools') {
      await renderToolsPanel();
    } else if (state.settingsTab === 'directories') {
      await renderDirectoriesPanel();
    } else if (state.settingsTab === 'status') {
      renderStatusPanel();
    } else {
      const bindings = state.cliBindingsCache[state.settingsTab]
        || (window.gamepadCli ? await window.gamepadCli.configGetBindings(state.settingsTab) : null);
      renderBindingsDisplay(bindings || {}, `${getCliDisplayName(state.settingsTab)} Bindings`);
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
  const allTabs = ['profiles', 'global', ...state.cliTypes, 'tools', 'directories', 'status'];
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
    { key: 'global', label: '🎮 Global' },
    ...cliTypes.map(ct => ({ key: ct, label: getCliDisplayName(ct) })),
    { key: 'tools', label: '🔧 Tools' },
    { key: 'directories', label: '📁 Dirs' },
    { key: 'status', label: '📊 Status' },
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
// Bindings Display (Global + CLI tabs)
// ============================================================================

function renderBindingsDisplay(bindings: Record<string, any>, _label: string): void {
  const container = document.getElementById('bindingsDisplay');
  if (!container) return;

  container.innerHTML = '';

  // Render "Add Binding" button into the action bar
  const actionBar = document.getElementById('bindingActionBar');
  if (actionBar) {
    actionBar.innerHTML = '';
    const mappedButtons = Object.keys(bindings);
    const unmappedButtons = ALL_BUTTONS.filter(b => !mappedButtons.includes(b));
    if (unmappedButtons.length > 0) {
      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn--primary focusable';
      addBtn.tabIndex = 0;
      addBtn.textContent = '+ Add Binding';
      addBtn.addEventListener('click', () => {
        showAddBindingPicker(unmappedButtons);
      });
      actionBar.appendChild(addBtn);
    }
  }

  const entries = Object.entries(bindings);
  if (entries.length === 0) {
    container.innerHTML = '<p style="color: var(--text-dim);">No bindings configured</p>';
  }

  entries.forEach(([button, binding]) => {
    const card = document.createElement('div');
    card.className = 'binding-card focusable';
    card.tabIndex = 0;

    const actionType = binding.action || 'unknown';
    const details = formatBindingDetails(binding);

    // Build header as flex row: button name | action badge | spacer | delete
    const header = document.createElement('div');
    header.className = 'binding-card__header';

    const btnName = document.createElement('span');
    btnName.className = 'binding-card__button';
    btnName.textContent = button;
    header.appendChild(btnName);

    const badge = document.createElement('span');
    badge.className = 'binding-card__action-badge';
    badge.textContent = actionType;
    header.appendChild(badge);

    // Delete button — inline in the header row
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'binding-card__delete btn btn--danger btn--sm focusable';
    deleteBtn.tabIndex = 0;
    deleteBtn.textContent = '✕';
    deleteBtn.title = `Remove ${button} binding`;
    let confirmPending = false;
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirmPending) {
        deleteBtn.textContent = '?';
        deleteBtn.title = 'Click again to confirm deletion';
        confirmPending = true;
        setTimeout(() => { if (confirmPending) { deleteBtn.textContent = '✕'; deleteBtn.title = `Remove ${button} binding`; confirmPending = false; } }, 3000);
        return;
      }
      confirmPending = false;
      try {
        const cliType = state.settingsTab === 'global' ? null : state.settingsTab;
        const result = await window.gamepadCli.configRemoveBinding(button, cliType);
        if (result.success) {
          logEvent(`Removed binding: ${button}`);
          if (cliType === null && state.globalBindings) {
            delete state.globalBindings[button];
          } else if (cliType && state.cliBindingsCache[cliType]) {
            delete state.cliBindingsCache[cliType][button];
          }
          loadSettingsScreen();
        }
      } catch (error) {
        console.error('Remove binding failed:', error);
      }
    });
    header.appendChild(deleteBtn);

    const detailsEl = document.createElement('div');
    detailsEl.className = 'binding-card__details';
    detailsEl.textContent = details;

    card.appendChild(header);
    card.appendChild(detailsEl);

    // Click card to edit (but not on delete button)
    card.style.cursor = 'pointer';
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.binding-card__delete')) return;
      const cliType = state.settingsTab === 'global' ? null : state.settingsTab;
      openBindingEditor(button, cliType, { ...binding });
    });

    container.appendChild(card);
  });

  // Show global bindings as reference on CLI-specific tabs
  if (state.settingsTab !== 'global' && state.settingsTab !== 'profiles'
      && state.settingsTab !== 'tools' && state.settingsTab !== 'directories') {
    const globalBindings = state.globalBindings || {};
    const globalEntries = Object.entries(globalBindings);
    if (globalEntries.length > 0) {
      const divider = document.createElement('div');
      divider.className = 'global-bindings-divider';
      divider.textContent = 'Global Bindings (inherited)';
      container.appendChild(divider);

      globalEntries.forEach(([button, binding]: [string, any]) => {
        const isOverridden = bindings.hasOwnProperty(button);
        const card = document.createElement('div');
        card.className = 'binding-card binding-card--global';
        if (isOverridden) card.classList.add('binding-card--overridden');

        const actionType = binding.action || 'unknown';
        const details = formatBindingDetails(binding);

        const header = document.createElement('div');
        header.className = 'binding-card__header';

        const btnName = document.createElement('span');
        btnName.className = 'binding-card__button';
        btnName.textContent = button;
        header.appendChild(btnName);

        const badge = document.createElement('span');
        badge.className = 'binding-card__action-badge';
        badge.textContent = actionType;
        header.appendChild(badge);

        if (isOverridden) {
          const overrideTag = document.createElement('span');
          overrideTag.className = 'binding-card__override-tag';
          overrideTag.textContent = 'overridden';
          header.appendChild(overrideTag);
        }

        const detailsEl = document.createElement('div');
        detailsEl.className = 'binding-card__details';
        detailsEl.textContent = details;

        card.appendChild(header);
        card.appendChild(detailsEl);
        container.appendChild(card);
      });
    }
  }
}

function showAddBindingPicker(unmappedButtons: readonly string[]): void {
  const container = document.getElementById('bindingsDisplay');
  if (!container) return;

  // Remove any existing picker
  const existing = container.querySelector('.binding-picker');
  if (existing) { existing.remove(); return; }

  const picker = document.createElement('div');
  picker.className = 'binding-picker';

  const title = document.createElement('p');
  title.style.color = 'var(--text-secondary)';
  title.style.marginBottom = '8px';
  title.textContent = 'Select a button to bind:';
  picker.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'binding-picker__grid';

  unmappedButtons.forEach(button => {
    const btn = document.createElement('button');
    btn.className = 'btn btn--secondary btn--sm focusable';
    btn.tabIndex = 0;
    btn.textContent = button;
    btn.addEventListener('click', () => {
      const cliType = state.settingsTab === 'global' ? null : state.settingsTab;
      openBindingEditor(button, cliType, { action: 'keyboard', keys: [] });
    });
    grid.appendChild(btn);
  });

  picker.appendChild(grid);
  container.appendChild(picker);

  // Focus first button in picker
  const firstBtn = grid.querySelector('.focusable') as HTMLElement;
  if (firstBtn) firstBtn.focus();
}

// ============================================================================
// Profiles Panel
// ============================================================================

async function renderProfilesPanel(): Promise<void> {
  const container = document.getElementById('bindingsDisplay');
  if (!container || !window.gamepadCli) return;

  const actionBar = document.getElementById('bindingActionBar');
  if (actionBar) actionBar.innerHTML = '';

  container.innerHTML = '';

  const profiles = await window.gamepadCli.profileList();
  const active = await window.gamepadCli.profileGetActive();

  const panel = document.createElement('div');
  panel.className = 'settings-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'settings-panel__header';
  header.innerHTML = `<span class="settings-panel__title">Binding Profiles</span>`;

  const createBtn = document.createElement('button');
  createBtn.className = 'btn btn--primary btn--sm focusable';
  createBtn.tabIndex = 0;
  createBtn.textContent = '+ Create Profile';
  createBtn.addEventListener('click', () => showCreateProfilePrompt(profiles));
  header.appendChild(createBtn);
  panel.appendChild(header);

  // Profile list
  const list = document.createElement('div');
  list.className = 'settings-list';

  profiles.forEach(name => {
    const item = document.createElement('div');
    const isActive = name === active;
    item.className = `settings-list-item${isActive ? ' settings-list-item--active' : ''}`;

    item.innerHTML = `
      <div class="settings-list-item__info">
        <span class="settings-list-item__name">${name}${isActive ? '<span class="settings-list-item__badge">Active</span>' : ''}</span>
      </div>
    `;

    const actions = document.createElement('div');
    actions.className = 'settings-list-item__actions';

    if (!isActive) {
      const switchBtn = document.createElement('button');
      switchBtn.className = 'btn btn--primary btn--sm focusable';
      switchBtn.tabIndex = 0;
      switchBtn.textContent = 'Switch';
      switchBtn.addEventListener('click', async () => {
        await window.gamepadCli.profileSwitch(name);
        await initConfigCache();
        updateProfileDisplay();
        logEvent(`Profile: ${name}`);
        loadSettingsScreen();
      });
      actions.appendChild(switchBtn);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn--danger btn--sm focusable';
    deleteBtn.tabIndex = 0;
    deleteBtn.textContent = 'Delete';
    deleteBtn.disabled = name === 'default';
    if (name !== 'default') {
      let confirmPending = false;
      deleteBtn.addEventListener('click', async () => {
        if (!confirmPending) {
          deleteBtn.textContent = 'Confirm?';
          confirmPending = true;
          setTimeout(() => { if (confirmPending) { deleteBtn.textContent = 'Delete'; confirmPending = false; } }, 3000);
          return;
        }
        confirmPending = false;
        try {
          const result = await window.gamepadCli.profileDelete(name);
          if (result.success) {
            logEvent(`Deleted profile: ${name}`);
            loadSettingsScreen();
          }
        } catch (error) {
          console.error('Delete profile failed:', error);
        }
      });
    }
    actions.appendChild(deleteBtn);

    item.appendChild(actions);
    list.appendChild(item);
  });

  panel.appendChild(list);
  container.appendChild(panel);
}

async function showCreateProfilePrompt(existingProfiles: string[]): Promise<void> {
  const result = await showFormModal('Create Profile', [
    { key: 'name', label: 'Profile Name', placeholder: 'e.g. my-profile' },
    { key: 'copyFrom', label: 'Copy from', type: 'select', options: [
      { value: '', label: '(None — start empty)' },
      ...existingProfiles.map(p => ({ value: p, label: p })),
    ] },
  ]);

  if (!result || !result.name) return;

  try {
    const createResult = await window.gamepadCli.profileCreate(result.name, result.copyFrom || undefined);
    if (createResult.success) {
      logEvent(`Created profile: ${result.name}`);
      loadSettingsScreen();
    } else {
      logEvent('Profile creation failed');
    }
  } catch (error) {
    console.error('Failed to create profile:', error);
    logEvent(`Profile create error: ${error}`);
  }
}

// ============================================================================
// Tools Panel
// ============================================================================

async function renderToolsPanel(): Promise<void> {
  const container = document.getElementById('bindingsDisplay');
  if (!container || !window.gamepadCli) return;

  const actionBar = document.getElementById('bindingActionBar');
  if (actionBar) actionBar.innerHTML = '';

  container.innerHTML = '';

  let toolsData: any;
  try {
    toolsData = await window.gamepadCli.toolsGetAll();
  } catch {
    container.innerHTML = '<p style="color: var(--text-dim);">Failed to load tools config</p>';
    return;
  }

  const panel = document.createElement('div');
  panel.className = 'settings-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'settings-panel__header';
  header.innerHTML = `<span class="settings-panel__title">CLI Types</span>`;

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn--primary btn--sm focusable';
  addBtn.tabIndex = 0;
  addBtn.textContent = '+ Add CLI Type';
  addBtn.addEventListener('click', () => showAddCliTypeForm());
  header.appendChild(addBtn);
  panel.appendChild(header);

  // CLI Types list
  const cliTypes = toolsData?.cliTypes || {};
  const list = document.createElement('div');
  list.className = 'settings-list';
  list.id = 'toolsList';

  Object.entries(cliTypes).forEach(([key, value]: [string, any]) => {
    list.appendChild(createCliTypeItem(key, value));
  });

  if (Object.keys(cliTypes).length === 0) {
    list.innerHTML = '<p style="color: var(--text-dim); padding: var(--spacing-md);">No CLI types configured</p>';
  }

  panel.appendChild(list);

  // Game Bar toggle
  const systemCard = document.createElement('div');
  systemCard.className = 'settings-panel';
  systemCard.style.marginTop = 'var(--spacing-lg)';

  const systemHeader = document.createElement('div');
  systemHeader.className = 'settings-panel__header';
  systemHeader.innerHTML = `<span class="settings-panel__title">System</span>`;
  systemCard.appendChild(systemHeader);

  const gameBarRow = document.createElement('div');
  gameBarRow.className = 'settings-list-item';
  gameBarRow.style.display = 'flex';
  gameBarRow.style.justifyContent = 'space-between';
  gameBarRow.style.alignItems = 'center';

  const gameBarLabel = document.createElement('div');
  gameBarLabel.innerHTML = `
    <div style="font-weight: 500;">Xbox Game Bar</div>
    <div style="font-size: var(--font-size-sm); color: var(--text-dim);">
      Disable to free the Guide button for gamepad use
    </div>
  `;
  gameBarRow.appendChild(gameBarLabel);

  const gameBarBtn = document.createElement('button');
  gameBarBtn.className = 'btn btn--sm focusable';
  gameBarBtn.tabIndex = 0;
  gameBarBtn.textContent = 'Loading...';
  gameBarBtn.disabled = true;
  gameBarRow.appendChild(gameBarBtn);
  systemCard.appendChild(gameBarRow);

  if (gameBarToggled) {
    const warning = document.createElement('p');
    warning.className = 'settings-warning';
    warning.textContent = '\u26A1 Restart Windows for changes to take effect';
    systemCard.appendChild(warning);
  }

  // Fetch current state
  (async () => {
    try {
      const enabled = await window.gamepadCli.systemGetGameBarEnabled();
      if (enabled === null) {
        gameBarBtn.textContent = 'Unknown';
        return;
      }
      gameBarBtn.disabled = false;
      gameBarBtn.textContent = enabled ? 'Enabled' : 'Disabled';
      gameBarBtn.classList.add(enabled ? 'btn--danger' : 'btn--success');
      gameBarBtn.addEventListener('click', async () => {
        gameBarBtn.disabled = true;
        gameBarBtn.textContent = 'Updating...';
        const result = await window.gamepadCli.systemSetGameBarEnabled(!enabled);
        if (result.success) {
          gameBarToggled = true;
          loadSettingsScreen();
        } else {
          gameBarBtn.textContent = 'Error';
          gameBarBtn.disabled = false;
        }
      });
    } catch {
      gameBarBtn.textContent = 'Error';
    }
  })();

  panel.appendChild(systemCard);

  container.appendChild(panel);
}

function createCliTypeItem(key: string, value: any): HTMLElement {
  const item = document.createElement('div');
  item.className = 'settings-list-item';
  item.dataset.cliKey = key;

  const terminal = value.terminal || 'wt';
  const terminalLabels: Record<string, string> = { wt: 'Windows Terminal', cmd: 'CMD', pwsh: 'PowerShell', custom: 'Custom' };
  const terminalLabel = terminalLabels[terminal] || terminal;
  const command = value.command || '';

  item.innerHTML = `
    <div class="settings-list-item__info">
      <span class="settings-list-item__name">${value.name || key}</span>
      <span class="settings-list-item__detail">${terminalLabel}${command ? ` → ${command}` : ''}</span>
    </div>
  `;

  const actions = document.createElement('div');
  actions.className = 'settings-list-item__actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'btn btn--secondary btn--sm focusable';
  editBtn.tabIndex = 0;
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => showEditCliTypeForm(key, value));
  actions.appendChild(editBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn--danger btn--sm focusable';
  deleteBtn.tabIndex = 0;
  deleteBtn.textContent = 'Delete';
  let deleteConfirmPending = false;
  deleteBtn.addEventListener('click', async () => {
    if (!deleteConfirmPending) {
      deleteBtn.textContent = 'Confirm?';
      deleteConfirmPending = true;
      setTimeout(() => {
        if (deleteConfirmPending) {
          deleteBtn.textContent = 'Delete';
          deleteConfirmPending = false;
        }
      }, 3000);
      return;
    }
    deleteConfirmPending = false;
    try {
      const result = await window.gamepadCli.toolsRemoveCliType(key);
      if (result.success) {
        logEvent(`Deleted CLI type: ${key}`);
        state.cliTypes = await window.gamepadCli.configGetCliTypes();
        state.availableSpawnTypes = state.cliTypes;
        loadSessions();
        loadSettingsScreen();
      } else {
        logEvent(`Failed to delete: ${result.error || 'unknown error'}`);
      }
    } catch (error) {
      console.error('Delete CLI type failed:', error);
    }
  });
  actions.appendChild(deleteBtn);

  item.appendChild(actions);
  return item;
}

async function showAddCliTypeForm(): Promise<void> {
  const terminalOptions = [
    { value: 'wt', label: 'Windows Terminal' },
    { value: 'cmd', label: 'CMD' },
    { value: 'pwsh', label: 'PowerShell' },
    { value: 'custom', label: 'Custom' },
  ];

  const result = await showFormModal('Add CLI Type', [
    { key: 'name', label: 'Name', placeholder: 'e.g. Claude Code' },
    { key: 'terminal', label: 'Terminal', type: 'select', options: terminalOptions, defaultValue: 'wt' },
    { key: 'command', label: 'Command', placeholder: 'e.g. claude, python' },
  ]);

  if (!result) return;

  const name = result.name?.trim();
  if (!name) {
    logEvent('Add CLI type: name is required');
    return;
  }

  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const terminal = result.terminal || 'wt';
  const command = result.command?.trim() || '';

  const addResult = await window.gamepadCli.toolsAddCliType(key, name, terminal, command);
  if (addResult.success) {
    logEvent(`Added CLI type: ${key}`);
    state.cliTypes = await window.gamepadCli.configGetCliTypes();
    state.availableSpawnTypes = state.cliTypes;
    loadSessions();
    loadSettingsScreen();
  } else {
    logEvent('Failed to add CLI type');
  }
}

async function showEditCliTypeForm(key: string, value: any): Promise<void> {
  const terminalOptions = [
    { value: 'wt', label: 'Windows Terminal' },
    { value: 'cmd', label: 'CMD' },
    { value: 'pwsh', label: 'PowerShell' },
    { value: 'custom', label: 'Custom' },
  ];

  const result = await showFormModal(`Edit CLI Type: ${key}`, [
    { key: 'name', label: 'Name', defaultValue: value.name || key },
    { key: 'terminal', label: 'Terminal', type: 'select', options: terminalOptions, defaultValue: value.terminal || 'wt' },
    { key: 'command', label: 'Command', defaultValue: value.command || '' },
  ]);

  if (!result) return;

  const terminal = result.terminal || 'wt';
  const command = result.command?.trim() || '';

  const updateResult = await window.gamepadCli.toolsUpdateCliType(key, result.name, terminal, command);
  if (updateResult.success) {
    logEvent(`Updated CLI type: ${key}`);
    state.cliTypes = await window.gamepadCli.configGetCliTypes();
    state.availableSpawnTypes = state.cliTypes;
    loadSessions();
    loadSettingsScreen();
  } else {
    logEvent('Failed to update CLI type');
  }
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
    <div class="settings-form__row">
      <div class="settings-form__field">
        <label>Name</label>
        <input type="text" id="newDirName" placeholder="e.g. My Project" class="focusable" tabindex="0" />
      </div>
      <div class="settings-form__field">
        <label>Path</label>
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
    { key: 'path', label: 'Path', defaultValue: dir.path },
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

// ============================================================================
// Status Panel (merged from former status screen)
// ============================================================================

function renderStatusPanel(): void {
  const container = document.getElementById('bindingsDisplay');
  if (!container) return;

  const actionBar = document.getElementById('bindingActionBar');
  if (actionBar) actionBar.innerHTML = '';

  container.innerHTML = '';

  const panel = document.createElement('div');
  panel.className = 'settings-panel';

  // Gamepad status card
  const gamepadCard = document.createElement('div');
  gamepadCard.className = 'settings-readonly-card';
  gamepadCard.innerHTML = `
    <div class="settings-readonly-card__title">🎮 Gamepad</div>
    <div class="settings-readonly-card__content">
      <p>Connected: <strong>${document.getElementById('statusGamepadConnected')?.textContent || 'No'}</strong></p>
      <p>Last Button: <strong>${document.getElementById('statusLastButton')?.textContent || '-'}</strong></p>
    </div>
  `;
  panel.appendChild(gamepadCard);

  // Sessions status card
  const sessionsCard = document.createElement('div');
  sessionsCard.className = 'settings-readonly-card';
  sessionsCard.style.marginTop = 'var(--spacing-sm)';
  sessionsCard.innerHTML = `
    <div class="settings-readonly-card__title">📋 Sessions</div>
    <div class="settings-readonly-card__content">
      <p>Active: <strong>${document.getElementById('statusActiveSessions')?.textContent || '0'}</strong></p>
      <p>Total: <strong>${document.getElementById('statusTotalSessions')?.textContent || '0'}</strong></p>
    </div>
  `;
  panel.appendChild(sessionsCard);

  // Event log
  const logCard = document.createElement('div');
  logCard.className = 'settings-readonly-card';
  logCard.style.marginTop = 'var(--spacing-sm)';

  const logTitle = document.createElement('div');
  logTitle.className = 'settings-readonly-card__title';
  logTitle.textContent = '📝 Recent Events';
  logCard.appendChild(logTitle);

  const logContent = document.createElement('div');
  logContent.style.cssText = 'max-height: 200px; overflow-y: auto; font-family: monospace; font-size: 11px;';

  // Copy current event log entries from hidden placeholder
  const sourceLog = document.getElementById('eventLog');
  if (sourceLog) {
    logContent.innerHTML = sourceLog.innerHTML;
  }
  logCard.appendChild(logContent);

  panel.appendChild(logCard);
  container.appendChild(panel);
}
