/**
 * Settings screen — Chipbar Actions panel (quick-action button CRUD).
 */

import { state } from '../state.js';
import {
  logEvent,
  showFormModal,
} from '../utils.js';
import { useChipBarStore } from '../stores/chip-bar.js';

// Circular import — safe: all usages are inside event handlers, not at module-evaluation time.
import { loadSettingsScreen } from './settings.js';
import { CHIPBAR_TEMPLATE_DEFINITIONS } from '../drafts/chipbar-templates.js';

// ============================================================================
// Chipbar Actions Panel
// ============================================================================

export async function renderChipbarActionsPanel(): Promise<void> {
  const container = document.getElementById('bindingsDisplay');
  if (!container || !window.gamepadCli) return;

  const actionBar = document.getElementById('bindingActionBar');
  if (actionBar) actionBar.innerHTML = '';

  container.innerHTML = '';

  let chipbarData: { actions: Array<{ label: string; sequence: string }>; inboxDir: string };
  try {
    chipbarData = await window.gamepadCli.configGetChipbarActions();
  } catch {
    container.innerHTML = '<p style="color: var(--text-dim);">Failed to load chipbar actions config</p>';
    return;
  }

  const panel = document.createElement('div');
  panel.className = 'settings-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'settings-panel__header';
  header.innerHTML = `<span class="settings-panel__title">Chip Bar Actions</span>`;

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn--primary btn--sm focusable';
  addBtn.tabIndex = 0;
  addBtn.textContent = '+ Add Action';
  addBtn.addEventListener('click', () => showAddChipbarActionForm());
  header.appendChild(addBtn);
  panel.appendChild(header);

  // Help section
  const helpDiv = document.createElement('div');
  helpDiv.className = 'settings-help';
  const templateList = CHIPBAR_TEMPLATE_DEFINITIONS
    .map(def => `<li><code>${def.token}</code> → ${def.description}</li>`)
    .join('');
  helpDiv.innerHTML = `
    <p><strong>Chip Bar Actions</strong> are global quick-action buttons that appear in the chipbar below every terminal.</p>
    <p><strong>Global actions shown for every CLI.</strong></p>
    <p><strong>Template expansions:</strong></p>
    <ul class="settings-help__list">${templateList}</ul>
    <p><strong>Installer-safe paths:</strong> <code>{inboxDir}</code> and <code>{plansDir}</code> resolve from the app's writable config directory, so they keep working in packaged installs.</p>
    <p><strong>Sequence syntax:</strong> Use {Enter}, {Ctrl+C}, {Wait 500}, etc. — same as gamepad bindings, and token matching is case-insensitive.</p>
  `;
  panel.appendChild(helpDiv);

  // Actions list
  const list = document.createElement('div');
  list.className = 'settings-list';
  list.id = 'chipbarActionsList';

  const actions = chipbarData?.actions || [];
  actions.forEach((action, index) => {
    list.appendChild(createChipbarActionItem(action, index, actions.length));
  });

  if (actions.length === 0) {
    list.innerHTML = '<p style="color: var(--text-dim); padding: var(--spacing-md);">No chip bar actions configured</p>';
  }

  panel.appendChild(list);
  container.appendChild(panel);
}

function createChipbarActionItem(action: { label: string; sequence: string }, index: number, total: number): HTMLElement {
  const item = document.createElement('div');
  item.className = 'settings-list-item';
  item.dataset.actionIndex = index.toString();

  const sequencePreview = action.sequence.length > 50 ? action.sequence.slice(0, 47) + '...' : action.sequence;

  item.innerHTML = `
    <div class="settings-list-item__info">
      <span class="settings-list-item__name">${action.label}</span>
      <span class="settings-list-item__detail">${sequencePreview}</span>
    </div>
  `;

  const actions = document.createElement('div');
  actions.className = 'settings-list-item__actions';

  // Up button (disabled for first item)
  const upBtn = document.createElement('button');
  upBtn.className = 'btn btn--ghost btn--sm focusable';
  upBtn.tabIndex = index === 0 ? -1 : 0;
  upBtn.textContent = '↑';
  upBtn.title = 'Move up';
  upBtn.disabled = index === 0;
  if (index > 0) {
    upBtn.addEventListener('click', () => moveChipbarAction(index, index - 1));
  }
  actions.appendChild(upBtn);

  // Down button (disabled for last item)
  const downBtn = document.createElement('button');
  downBtn.className = 'btn btn--ghost btn--sm focusable';
  downBtn.tabIndex = index === total - 1 ? -1 : 0;
  downBtn.textContent = '↓';
  downBtn.title = 'Move down';
  downBtn.disabled = index === total - 1;
  if (index < total - 1) {
    downBtn.addEventListener('click', () => moveChipbarAction(index, index + 1));
  }
  actions.appendChild(downBtn);

  const editBtn = document.createElement('button');
  editBtn.className = 'btn btn--secondary btn--sm focusable';
  editBtn.tabIndex = 0;
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => showEditChipbarActionForm(index, action));
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
      await deleteChipbarAction(index);
      logEvent(`Deleted chip bar action: ${action.label}`);
      loadSettingsScreen();
    } catch (error) {
      console.error('Delete chip bar action failed:', error);
      logEvent(`Failed to delete action: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  });
  actions.appendChild(deleteBtn);

  item.appendChild(actions);
  return item;
}

async function showAddChipbarActionForm(): Promise<void> {
  const result = await showFormModal('Add Chip Bar Action', [
    { 
      key: 'label', 
      label: 'Label', 
      required: true,
      placeholder: 'e.g. 💾 Save Plan',
      help: 'Button label shown in the chipbar (emojis recommended)' 
    },
    { 
      key: 'sequence', 
      label: 'Sequence', 
      type: 'textarea', 
      required: true,
      placeholder: 'e.g. Write exactly one JSON file into {inboxDir}/ and do not write it anywhere else.{Enter}',
      help: 'Sequence to send when clicked. Use {Enter}, {Ctrl+C}, and template expansions like {cwd}, {sessionName}, or installer-safe {inboxDir}.'
    },
  ]);

  if (!result) return;

  const label = result.label?.trim();
  const sequence = result.sequence?.trim();

  if (!label || !sequence) {
    logEvent('Add chip bar action: label and sequence are required');
    return;
  }

  try {
    await addChipbarAction({ label, sequence });
    logEvent(`Added chip bar action: ${label}`);
    loadSettingsScreen();
  } catch (error) {
    console.error('Add chip bar action failed:', error);
    logEvent(`Failed to add action: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

async function showEditChipbarActionForm(index: number, existing: { label: string; sequence: string }): Promise<void> {
  const result = await showFormModal(`Edit Chip Bar Action: ${existing.label}`, [
    { 
      key: 'label', 
      label: 'Label', 
      required: true,
      defaultValue: existing.label,
      help: 'Button label shown in the chipbar'
    },
    { 
      key: 'sequence', 
      label: 'Sequence', 
      type: 'textarea', 
      required: true,
      defaultValue: existing.sequence,
      help: 'Sequence to send when clicked. Use {Enter}, template expansions like {cwd}, and installer-safe {inboxDir}.'
    },
  ]);

  if (!result) return;

  const label = result.label?.trim() || existing.label;
  const sequence = result.sequence?.trim() || existing.sequence;

  if (!label || !sequence) {
    logEvent('Edit chip bar action: label and sequence are required');
    return;
  }

  try {
    await updateChipbarAction(index, { label, sequence });
    logEvent(`Updated chip bar action: ${label}`);
    loadSettingsScreen();
  } catch (error) {
    console.error('Update chip bar action failed:', error);
    logEvent(`Failed to update action: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

async function addChipbarAction(action: { label: string; sequence: string }): Promise<void> {
  const chipbarData = await window.gamepadCli.configGetChipbarActions();
  const updatedActions = [...chipbarData.actions, action];
  const result = await window.gamepadCli.configSetChipbarActions(updatedActions);
  if (!result.success) {
    throw new Error(result.error || 'Failed to add chip bar action');
  }
  
  // Invalidate cache to ensure chipbar refreshes with new actions
  useChipBarStore().invalidateActions();
  void useChipBarStore().refresh();
}

async function updateChipbarAction(index: number, action: { label: string; sequence: string }): Promise<void> {
  const chipbarData = await window.gamepadCli.configGetChipbarActions();
  const updatedActions = [...chipbarData.actions];
  updatedActions[index] = action;
  const result = await window.gamepadCli.configSetChipbarActions(updatedActions);
  if (!result.success) {
    throw new Error(result.error || 'Failed to update chip bar action');
  }
  
  // Invalidate cache to ensure chipbar refreshes with updated actions
  useChipBarStore().invalidateActions();
  void useChipBarStore().refresh();
}

async function deleteChipbarAction(index: number): Promise<void> {
  const chipbarData = await window.gamepadCli.configGetChipbarActions();
  const updatedActions = chipbarData.actions.filter((_, i) => i !== index);
  const result = await window.gamepadCli.configSetChipbarActions(updatedActions);
  if (!result.success) {
    throw new Error(result.error || 'Failed to delete chip bar action');
  }
  
  // Invalidate cache to ensure chipbar refreshes without deleted action
  useChipBarStore().invalidateActions();
  void useChipBarStore().refresh();
}

async function moveChipbarAction(fromIndex: number, toIndex: number): Promise<void> {
  const chipbarData = await window.gamepadCli.configGetChipbarActions();
  const actions = [...chipbarData.actions];
  
  // Move the action
  const [movedAction] = actions.splice(fromIndex, 1);
  actions.splice(toIndex, 0, movedAction);
  
  const result = await window.gamepadCli.configSetChipbarActions(actions);
  if (!result.success) {
    throw new Error(result.error || 'Failed to reorder chip bar action');
  }
  
  logEvent(`Moved chip bar action from position ${fromIndex + 1} to ${toIndex + 1}`);
  loadSettingsScreen();
  
  // Invalidate cache to ensure chipbar refreshes with new order
  useChipBarStore().invalidateActions();
  void useChipBarStore().refresh();
}
