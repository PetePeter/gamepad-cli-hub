/**
 * Settings screen — Tools panel (CLI type CRUD, Game Bar toggle).
 */

import { state } from '../state.js';
import {
  logEvent,
  showFormModal,
  createSequenceSyntaxHelp,
} from '../utils.js';
import { loadSessions } from './sessions.js';

// Circular import — safe: all usages are inside event handlers, not at module-evaluation time.
import { loadSettingsScreen } from './settings.js';

// ============================================================================
// State
// ============================================================================

/** Tracks whether Game Bar was toggled this session so we can show a restart warning. */
let gameBarToggled = false;

// ============================================================================
// Types
// ============================================================================

interface PromptItem { label: string; sequence: string }

// ============================================================================
// Tools Panel
// ============================================================================

export async function renderToolsPanel(): Promise<void> {
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

  const command = value.command || '';

  item.innerHTML = `
    <div class="settings-list-item__info">
      <span class="settings-list-item__name">${value.name || key}</span>
      <span class="settings-list-item__detail">${command ? `→ ${command}` : '(no command)'}</span>
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

/** Create an inline CRUD editor for initial prompt items. Mutates `items` in place. */
function createInitialPromptItemsEditor(items: PromptItem[]): HTMLElement {
  const container = document.createElement('div');
  container.className = 'prompt-items-editor';

  // Hide the sibling text input that showFormModal creates for this field
  setTimeout(() => {
    const input = container.previousElementSibling;
    if (input instanceof HTMLElement && input.tagName === 'INPUT') input.style.display = 'none';
  }, 0);

  const list = document.createElement('div');
  list.className = 'sequence-list-items';
  container.appendChild(list);

  function renderItems(): void {
    list.innerHTML = '';
    items.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'sequence-list-row';
      row.style.flexDirection = 'column';
      row.style.alignItems = 'stretch';

      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.alignItems = 'center';
      header.style.gap = '6px';

      const labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.placeholder = 'Label';
      labelInput.value = item.label;
      labelInput.style.flex = '1';
      labelInput.style.fontSize = '12px';
      labelInput.addEventListener('input', () => { items[index].label = labelInput.value; });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn btn--small btn--danger';
      removeBtn.textContent = '✕';
      removeBtn.title = 'Remove';
      removeBtn.addEventListener('click', () => { items.splice(index, 1); renderItems(); });

      header.appendChild(labelInput);
      header.appendChild(removeBtn);

      const seqInput = document.createElement('textarea');
      seqInput.className = 'sequence-textarea';
      seqInput.placeholder = 'Sequence, e.g. /allow-all{Enter}';
      seqInput.value = item.sequence;
      seqInput.rows = 2;
      seqInput.style.fontSize = '11px';
      seqInput.addEventListener('input', () => { items[index].sequence = seqInput.value; });

      row.appendChild(header);
      row.appendChild(seqInput);
      list.appendChild(row);
    });
  }

  renderItems();

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn--secondary sequence-list-add';
  addBtn.textContent = '+ Add Prompt Item';
  addBtn.addEventListener('click', () => {
    items.push({ label: '', sequence: '' });
    renderItems();
  });
  container.appendChild(addBtn);

  container.appendChild(createSequenceSyntaxHelp());

  return container;
}

async function showAddCliTypeForm(): Promise<void> {
  const items: PromptItem[] = [];
  const itemsEditor = createInitialPromptItemsEditor(items);

  const result = await showFormModal('Add CLI Type', [
    { key: 'name', label: 'Name', placeholder: 'e.g. Claude Code' },
    { key: 'command', label: 'Command', placeholder: 'e.g. claude, python' },
    { key: '_promptItems', label: 'Initial Prompt Items', type: 'text', defaultValue: '', afterElement: itemsEditor },
    { key: 'initialPromptDelay', label: 'Initial Prompt Delay (ms)', type: 'text', defaultValue: '2000', placeholder: 'e.g. 2000' },
  ]);

  if (!result) return;

  const name = result.name?.trim();
  if (!name) {
    logEvent('Add CLI type: name is required');
    return;
  }

  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const command = result.command?.trim() || '';
  const validItems = items.filter(i => i.sequence.trim());
  const initialPromptDelay = parseInt(result.initialPromptDelay || '0', 10) || 0;

  const addResult = await window.gamepadCli.toolsAddCliType(key, name, command, validItems, initialPromptDelay);
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
  const existingItems: PromptItem[] = Array.isArray(value.initialPrompt)
    ? value.initialPrompt.map((i: any) => ({ label: i.label || '', sequence: i.sequence || '' }))
    : [];
  const items: PromptItem[] = [...existingItems.map(i => ({ ...i }))];
  const itemsEditor = createInitialPromptItemsEditor(items);

  const result = await showFormModal(`Edit CLI Type: ${key}`, [
    { key: 'name', label: 'Name', defaultValue: value.name || key },
    { key: 'command', label: 'Command', defaultValue: value.command || '' },
    { key: '_promptItems', label: 'Initial Prompt Items', type: 'text', defaultValue: '', afterElement: itemsEditor },
    { key: 'initialPromptDelay', label: 'Initial Prompt Delay (ms)', type: 'text', defaultValue: String(value.initialPromptDelay ?? 0), placeholder: 'e.g. 2000' },
  ]);

  if (!result) return;

  const command = result.command?.trim() || '';
  const validItems = items.filter(i => i.sequence.trim());
  const initialPromptDelay = parseInt(result.initialPromptDelay || '0', 10) || 0;

  const updateResult = await window.gamepadCli.toolsUpdateCliType(key, result.name, command, validItems, initialPromptDelay);
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
