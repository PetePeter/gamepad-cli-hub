/**
 * Settings screen — profile management tab (CRUD, rendering).
 */

import { state } from '../state.js';
import {
  logEvent,
  updateProfileDisplay,
  showFormModal,
} from '../utils.js';
import { initConfigCache } from '../bindings.js';
import { loadSessions } from './sessions.js';
import { getTerminalManager } from '../runtime/terminal-provider.js';

// Circular import — safe: all usages are inside event handlers, not at module-evaluation time.
import { loadSettingsScreen } from './settings.js';

// ============================================================================
// Profiles Panel
// ============================================================================

export async function renderProfilesPanel(): Promise<void> {
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
        const tm = getTerminalManager();
        const sessionCount = tm?.getCount() ?? 0;

        if (sessionCount > 0) {
          const result = await showFormModal('Switch Profile', [{
            key: 'action',
            label: `${sessionCount} terminal(s) are open. What should happen?`,
            type: 'select',
            options: [
              { value: 'keep', label: 'Keep sessions open' },
              { value: 'close', label: 'Close all sessions' },
            ],
            defaultValue: 'keep',
          }]);
          if (!result) return; // cancelled

          if (result.action === 'close' && tm) {
            tm.dispose();
            state.sessions = [];
            state.activeSessionId = null;
          }
        }

        await window.gamepadCli.profileSwitch(name);
        state.cliTypes = await window.gamepadCli.configGetCliTypes();
        state.availableSpawnTypes = state.cliTypes;
        await initConfigCache();
        updateProfileDisplay();
        logEvent(`Profile: ${name}`);
        loadSettingsScreen();
        loadSessions();
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

  // General Settings section (below profiles)
  const generalPanel = document.createElement('div');
  generalPanel.className = 'settings-panel';
  generalPanel.style.marginTop = 'var(--spacing-md)';

  const generalHeader = document.createElement('div');
  generalHeader.className = 'settings-panel__header';
  generalHeader.innerHTML = `<span class="settings-panel__title">General Settings</span>`;
  generalPanel.appendChild(generalHeader);

  const generalList = document.createElement('div');
  generalList.className = 'settings-list';

  // Notifications toggle
  const notifItem = document.createElement('div');
  notifItem.className = 'settings-list-item';
  const notifEnabled = await window.gamepadCli.configGetNotifications();
  notifItem.innerHTML = `
    <div class="settings-list-item__info">
      <span class="settings-list-item__name">🔔 Notifications</span>
      <span class="settings-list-item__detail">Toast notifications when a CLI finishes work</span>
    </div>
  `;
  const notifActions = document.createElement('div');
  notifActions.className = 'settings-list-item__actions';
  const notifToggle = document.createElement('button');
  notifToggle.className = `btn btn--sm focusable ${notifEnabled ? 'btn--primary' : 'btn--secondary'}`;
  notifToggle.tabIndex = 0;
  notifToggle.textContent = notifEnabled ? 'ON' : 'OFF';
  notifToggle.addEventListener('click', async () => {
    const current = await window.gamepadCli.configGetNotifications();
    await window.gamepadCli.configSetNotifications(!current);
    logEvent(`Notifications: ${!current ? 'ON' : 'OFF'}`);
    loadSettingsScreen();
  });
  notifActions.appendChild(notifToggle);
  notifItem.appendChild(notifActions);
  generalList.appendChild(notifItem);

  generalPanel.appendChild(generalList);
  container.appendChild(generalPanel);
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
