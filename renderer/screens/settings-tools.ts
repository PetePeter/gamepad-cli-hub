/**
 * Settings screen — Tools panel (CLI type CRUD).
 */

import { state } from '../state.js';
import {
  logEvent,
  showFormModal,
} from '../utils.js';
import { loadSessions } from './sessions.js';
import { initConfigCache } from '../bindings.js';

// Circular import — safe: all usages are inside event handlers, not at module-evaluation time.
import { loadSettingsScreen } from './settings.js';

// ============================================================================
// Types
// ============================================================================

interface PromptItem { label: string; sequence: string }

/** Safely parse prompt items from a JSON string. Returns only items with non-empty sequence. */
function parsePromptItems(raw: string): PromptItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: any) => ({
        label: typeof item?.label === 'string' ? item.label : '',
        sequence: typeof item?.sequence === 'string' ? item.sequence : '',
      }))
      .filter((i: PromptItem) => i.sequence.trim());
  } catch { return []; }
}

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
        delete state.cliBindingsCache[key];
        delete state.cliSequencesCache[key];
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
  const result = await showFormModal('Add CLI Type', [
    { key: 'name', label: 'Name', placeholder: 'e.g. Claude Code' },
    { key: 'command', label: 'Command', placeholder: 'e.g. claude, python' },
    { key: '_promptItems', label: 'Initial Prompt Items', type: 'sequence-items', defaultValue: '[]', showLabels: false },
    { key: 'initialPromptDelay', label: 'Initial Prompt Delay (ms)', type: 'text', defaultValue: '2000', placeholder: 'e.g. 2000' },
    { key: 'handoffCommand', label: 'Handoff Command', placeholder: 'Command sent on pipeline handoff (e.g. go implement it\\r)' },
    { key: 'renameCommand', label: 'Rename Command', placeholder: 'Name session for resume (use {cliSessionName})' },
    { key: 'spawnCommand', label: 'Spawn Command', placeholder: 'Fresh spawn with session UUID (e.g. claude --session-id {cliSessionName})' },
    { key: 'resumeCommand', label: 'Resume Command', placeholder: 'Resume by UUID (e.g. claude --resume={cliSessionName})' },
    { key: 'continueCommand', label: 'Continue Command', placeholder: 'Resume most recent session (e.g. claude --continue)' },
    { key: 'pasteMode', label: 'Paste Mode', type: 'select', defaultValue: 'pty', options: [
        { value: 'pty', label: 'PTY (default)' },
        { value: 'sendkeys', label: 'SendKeys (OS keystrokes)' },
        { value: 'sendkeysindividual', label: 'SendKeys Individual (interactive CLIs)' },
      ] },
  ]);

  if (!result) return;

  const name = result.name?.trim();
  if (!name) {
    logEvent('Add CLI type: name is required');
    return;
  }

  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const command = result.command?.trim() || '';
  const validItems = parsePromptItems(result._promptItems);
  const initialPromptDelay = parseInt(result.initialPromptDelay || '0', 10) || 0;
  const options = buildCommandOptions(result);

  const addResult = await window.gamepadCli.toolsAddCliType(key, name, command, validItems, initialPromptDelay, options);
  if (addResult.success) {
    logEvent(`Added CLI type: ${key}`);
    state.cliTypes = await window.gamepadCli.configGetCliTypes();
    state.availableSpawnTypes = state.cliTypes;
    await initConfigCache();
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

  const result = await showFormModal(`Edit CLI Type: ${key}`, [
    { key: 'name', label: 'Name', defaultValue: value.name || key },
    { key: 'command', label: 'Command', defaultValue: value.command || '' },
    { key: '_promptItems', label: 'Initial Prompt Items', type: 'sequence-items', defaultValue: JSON.stringify(existingItems), showLabels: false },
    { key: 'initialPromptDelay', label: 'Initial Prompt Delay (ms)', type: 'text', defaultValue: String(value.initialPromptDelay ?? 0), placeholder: 'e.g. 2000' },
    { key: 'handoffCommand', label: 'Handoff Command', defaultValue: value.handoffCommand || '', placeholder: 'Command sent on pipeline handoff (e.g. go implement it\\r)' },
    { key: 'renameCommand', label: 'Rename Command', defaultValue: value.renameCommand || '', placeholder: 'Name session for resume (use {cliSessionName})' },
    { key: 'spawnCommand', label: 'Spawn Command', defaultValue: value.spawnCommand || '', placeholder: 'Fresh spawn with session UUID (e.g. claude --session-id {cliSessionName})' },
    { key: 'resumeCommand', label: 'Resume Command', defaultValue: value.resumeCommand || '', placeholder: 'Resume by UUID (e.g. claude --resume={cliSessionName})' },
    { key: 'continueCommand', label: 'Continue Command', defaultValue: value.continueCommand || '', placeholder: 'Resume most recent session (e.g. claude --continue)' },
    { key: 'pasteMode', label: 'Paste Mode', type: 'select', defaultValue: value.pasteMode || 'pty', options: [
        { value: 'pty', label: 'PTY (default)' },
        { value: 'sendkeys', label: 'SendKeys (OS keystrokes)' },
        { value: 'sendkeysindividual', label: 'SendKeys Individual (interactive CLIs)' },
      ] },
  ]);

  if (!result) return;

  const command = result.command?.trim() || '';
  const validItems = parsePromptItems(result._promptItems);
  const initialPromptDelay = parseInt(result.initialPromptDelay || '0', 10) || 0;
  const options = buildCommandOptions(result);

  const updateResult = await window.gamepadCli.toolsUpdateCliType(key, result.name, command, validItems, initialPromptDelay, options);
  if (updateResult.success) {
    logEvent(`Updated CLI type: ${key}`);
    state.cliTypes = await window.gamepadCli.configGetCliTypes();
    state.availableSpawnTypes = state.cliTypes;
    await initConfigCache();
    loadSessions();
    loadSettingsScreen();
  } else {
    logEvent('Failed to update CLI type');
  }
}

/** Build the optional command fields from form result. Empty string = clear, undefined = no change. */
function buildCommandOptions(result: Record<string, string>): { handoffCommand?: string; renameCommand?: string; spawnCommand?: string; resumeCommand?: string; continueCommand?: string; pasteMode?: 'pty' | 'sendkeys' | 'sendkeysindividual' } | undefined {
  const fields = ['handoffCommand', 'renameCommand', 'spawnCommand', 'resumeCommand', 'continueCommand'] as const;
  const opts: Record<string, string> = {};
  let hasAny = false;
  for (const field of fields) {
    const val = result[field];
    if (val !== undefined) {
      opts[field] = val.trim();
      hasAny = true;
    }
  }
  if (result.pasteMode === 'pty' || result.pasteMode === 'sendkeys' || result.pasteMode === 'sendkeysindividual') {
    (opts as any).pasteMode = result.pasteMode;
    hasAny = true;
  }
  return hasAny ? opts as any : undefined;
}
